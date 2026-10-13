/**
 * Local usage counts. The file stays in localStorage on this device.
 * Nothing here is sent, and the module is loaded only after a real event
 * or when the stats page opens.
 */

export const STATS_KEY = "lark.stats.v1";
export const STATS_OFF_KEY = "lark.stats.off";

const SPAN_CAP_MS = 6 * 60 * 60 * 1000;
const DAY_KEEP = 90;
const PLACE_KEEP = 64;
const GAME_KEEP = 32;
const SAVE_MS = 400;

export type StatKind = "focus" | "message" | "voice" | "speak" | "game" | "clip";

export interface StatNote {
  t: number;
  kind: StatKind;
  id?: string;
  name?: string;
  place?: string;
  scope?: string;
  on?: 0 | 1;
}

interface PlaceUse {
  name: string;
  place: string;
  scope: string;
  opens: number;
  ms: number;
  messages: number;
  voiceMs: number;
  speakMs: number;
}

interface DayUse {
  messages: number;
  voiceMs: number;
  speakMs: number;
  clips: number;
  larkMs: number;
}

interface StatsFile {
  v: 1;
  messages: number;
  clips: number;
  voiceMs: number;
  speakMs: number;
  larkMs: number;
  places: Record<string, PlaceUse>;
  games: Record<string, number>;
  days: Record<string, DayUse>;
}

export interface StatsView {
  collecting: boolean;
  messages: number;
  clips: number;
  voiceMs: number;
  speakMs: number;
  larkMs: number;
  days: { day: string; larkMs: number; messages: number; voiceMs: number }[];
  games: { name: string; ms: number }[];
  voicePlaces: { name: string; place: string; voiceMs: number; speakMs: number }[];
  servers: { name: string; ms: number }[];
  channels: { name: string; place: string; ms: number; messages: number }[];
  dms: { name: string; ms: number; messages: number }[];
}

interface Clock {
  id: string;
  name: string;
  place: string;
  scope: string;
  since: number;
}

let storageRef: Storage | null = null;
let file: StatsFile | null = null;
let focus: Clock | null = null;
let voice: Clock | null = null;
let speakSince = 0;
let game: { name: string; since: number } | null = null;
let larkSince = 0;
let clockTimer = 0;
let saveTimer = 0;
let clockArmed = false;
let creditedBoot = false;

export function useStatsStorage(next: Storage | null) {
  storageRef = next;
  file = null;
}

export function resetStatsModule() {
  file = null;
  focus = null;
  voice = null;
  speakSince = 0;
  game = null;
  larkSince = 0;
  creditedBoot = false;
  clockArmed = false;
  if (clockTimer && typeof window !== "undefined") window.clearInterval(clockTimer);
  if (saveTimer && typeof window !== "undefined") window.clearTimeout(saveTimer);
  clockTimer = 0;
  saveTimer = 0;
}

export function collecting(): boolean {
  try {
    return bin().getItem(STATS_OFF_KEY) !== "1";
  } catch {
    return false;
  }
}

export function setCollecting(on: boolean) {
  try {
    bin().setItem(STATS_OFF_KEY, on ? "0" : "1");
  } catch {
    return;
  }
  if (!on) {
    const now = Date.now();
    closeFocus(now);
    closeVoice(now);
    closeSpeak(now);
    closeGame(now);
    closeLark(now);
    stopClock();
    saveNow();
    return;
  }
  ensureClock();
}

export function clearStats() {
  const now = Date.now();
  closeFocus(now);
  closeVoice(now);
  closeSpeak(now);
  closeGame(now);
  closeLark(now);
  file = blank();
  focus = null;
  voice = null;
  speakSince = 0;
  game = null;
  larkSince = 0;
  saveNow();
  if (collecting() && visible()) larkSince = Date.now();
}

export function noteAll(notes: readonly StatNote[], boot = 0) {
  if (!collecting() || !notes.length) return;
  const book = data();
  if (!creditedBoot && boot > 0 && visible()) {
    creditedBoot = true;
    const start = notes[0]?.t ?? Date.now();
    addLark(book, start, Math.min(SPAN_CAP_MS, Math.max(0, start - boot)));
  }
  for (const note of notes) apply(book, note);
  ensureClock();
  scheduleSave();
}

export function statsView(now = Date.now()): StatsView {
  const book = data();
  const places = Object.values(book.places);
  const servers = new Map<string, number>();
  for (const place of places) {
    if (place.scope === "dm" || place.scope === "group") continue;
    const name = place.place || "Server";
    servers.set(name, (servers.get(name) ?? 0) + place.ms + place.voiceMs);
  }
  return {
    collecting: collecting(),
    messages: book.messages,
    clips: book.clips,
    voiceMs: book.voiceMs,
    speakMs: book.speakMs,
    larkMs: book.larkMs,
    days: dayWindow(book, now),
    games: Object.entries(book.games)
      .map(([name, ms]) => ({ name, ms }))
      .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
      .slice(0, 8),
    voicePlaces: places
      .filter((place) => place.voiceMs > 0 || place.speakMs > 0)
      .sort((a, b) => b.voiceMs - a.voiceMs || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((place) => ({ name: place.name, place: place.place, voiceMs: place.voiceMs, speakMs: place.speakMs })),
    servers: [...servers.entries()]
      .map(([name, ms]) => ({ name, ms }))
      .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
      .slice(0, 8),
    channels: places
      .filter((place) => place.scope !== "dm" && place.scope !== "group" && place.scope !== "voice")
      .sort((a, b) => b.messages - a.messages || b.ms - a.ms || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((place) => ({ name: place.name, place: place.place, ms: place.ms, messages: place.messages })),
    dms: places
      .filter((place) => place.scope === "dm" || place.scope === "group")
      .sort((a, b) => b.messages - a.messages || b.ms - a.ms || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((place) => ({ name: place.name, ms: place.ms, messages: place.messages })),
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function apply(book: StatsFile, note: StatNote) {
  const t = Number.isFinite(note.t) ? note.t : Date.now();
  if (note.kind === "focus" && note.id) {
    closeFocus(t);
    focus = clockFrom(note, t);
    const place = touch(book, note);
    place.opens += 1;
    return;
  }
  if (note.kind === "message" && note.id) {
    const place = touch(book, note);
    place.messages += 1;
    book.messages += 1;
    day(book, t).messages += 1;
    return;
  }
  if (note.kind === "voice") {
    if (note.on === 1 && note.id) {
      if (!voice || voice.id !== note.id) {
        closeVoice(t);
        voice = clockFrom(note, t);
      }
      return;
    }
    closeSpeak(t);
    closeVoice(t);
    return;
  }
  if (note.kind === "speak") {
    if (note.on === 1) {
      if (!speakSince) speakSince = t;
      return;
    }
    closeSpeak(t);
    return;
  }
  if (note.kind === "game") {
    const name = label(note.name, "");
    if (note.on === 1 && name) {
      if (game && game.name !== name) closeGame(t);
      if (!game) game = { name, since: t };
      return;
    }
    closeGame(t);
    return;
  }
  if (note.kind === "clip") {
    book.clips += 1;
    day(book, t).clips += 1;
  }
}

function clockFrom(note: StatNote, t: number): Clock {
  return {
    id: note.id || "",
    name: label(note.name, "Channel"),
    place: label(note.place, ""),
    scope: note.scope || "text",
    since: t,
  };
}

function closeFocus(t: number) {
  if (!focus) return;
  const span = spanMs(focus.since, t);
  if (span > 0) touch(data(), { id: focus.id, name: focus.name, place: focus.place, scope: focus.scope }).ms += span;
  focus = null;
}

function closeVoice(t: number) {
  if (!voice) return;
  const span = spanMs(voice.since, t);
  if (span > 0) {
    const book = data();
    const place = touch(book, { id: voice.id, name: voice.name, place: voice.place, scope: "voice" });
    place.voiceMs += span;
    book.voiceMs += span;
    day(book, t).voiceMs += span;
  }
  voice = null;
}

function closeSpeak(t: number) {
  if (!speakSince) return;
  const span = spanMs(speakSince, t);
  speakSince = 0;
  if (span <= 0) return;
  const book = data();
  book.speakMs += span;
  day(book, t).speakMs += span;
  if (voice) touch(book, { id: voice.id, name: voice.name, place: voice.place, scope: "voice" }).speakMs += span;
}

function closeGame(t: number) {
  if (!game) return;
  const span = spanMs(game.since, t);
  const name = game.name;
  game = null;
  if (span <= 0 || !name) return;
  const book = data();
  book.games[name] = (book.games[name] ?? 0) + span;
  pruneGames(book, name);
}

function closeLark(t: number) {
  if (!larkSince) return;
  addLark(data(), t, spanMs(larkSince, t));
  larkSince = 0;
}

function addLark(book: StatsFile, t: number, span: number) {
  if (span <= 0) return;
  book.larkMs += span;
  day(book, t).larkMs += span;
}

function spanMs(since: number, t: number): number {
  return Math.min(SPAN_CAP_MS, Math.max(0, t - since));
}

function touch(book: StatsFile, note: { id?: string; name?: string; place?: string; scope?: string }): PlaceUse {
  const id = note.id || "unknown";
  const current = book.places[id] ?? {
    name: label(note.name, "Channel"),
    place: label(note.place, ""),
    scope: note.scope || "text",
    opens: 0,
    ms: 0,
    messages: 0,
    voiceMs: 0,
    speakMs: 0,
  };
  if (note.name) current.name = label(note.name, current.name);
  if (note.place) current.place = label(note.place, current.place);
  if (note.scope) current.scope = note.scope;
  book.places[id] = current;
  prunePlaces(book, id);
  return current;
}

function day(book: StatsFile, t: number): DayUse {
  const key = dayKey(t);
  const current = book.days[key] ?? { messages: 0, voiceMs: 0, speakMs: 0, clips: 0, larkMs: 0 };
  book.days[key] = current;
  const keys = Object.keys(book.days).sort();
  while (keys.length > DAY_KEEP) {
    const drop = keys.shift();
    if (drop) delete book.days[drop];
  }
  return current;
}

function dayWindow(book: StatsFile, now: number): { day: string; larkMs: number; messages: number; voiceMs: number }[] {
  const out: { day: string; larkMs: number; messages: number; voiceMs: number }[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let index = 13; index >= 0; index -= 1) {
    const when = new Date(start);
    when.setDate(start.getDate() - index);
    const key = dayKey(when.getTime());
    const row = book.days[key];
    out.push({
      day: key,
      larkMs: row?.larkMs ?? 0,
      messages: row?.messages ?? 0,
      voiceMs: row?.voiceMs ?? 0,
    });
  }
  return out;
}

function prunePlaces(book: StatsFile, keepId: string) {
  const ids = Object.keys(book.places);
  if (ids.length <= PLACE_KEEP) return;
  const drop = ids.filter((id) => id !== keepId);
  drop.sort((a, b) => weight(book.places[a]) - weight(book.places[b]));
  for (const id of drop.slice(0, ids.length - PLACE_KEEP)) delete book.places[id];
}

function weight(place: PlaceUse): number {
  return place.ms + place.voiceMs + place.messages * 1000;
}

function pruneGames(book: StatsFile, keepName: string) {
  const names = Object.keys(book.games);
  if (names.length <= GAME_KEEP) return;
  const drop = names.filter((name) => name !== keepName);
  drop.sort((a, b) => book.games[a] - book.games[b]);
  for (const name of drop.slice(0, names.length - GAME_KEEP)) delete book.games[name];
}

function dayKey(t: number): string {
  const date = new Date(t);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayNum}`;
}

function label(value: string | undefined, fallback: string): string {
  const clean = (value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return clean || fallback;
}

function blank(): StatsFile {
  return { v: 1, messages: 0, clips: 0, voiceMs: 0, speakMs: 0, larkMs: 0, places: {}, games: {}, days: {} };
}

function data(): StatsFile {
  if (file) return file;
  file = load();
  return file;
}

function load(): StatsFile {
  try {
    const raw = bin().getItem(STATS_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<StatsFile>;
    if (parsed.v !== 1) return blank();
    return {
      v: 1,
      messages: num(parsed.messages),
      clips: num(parsed.clips),
      voiceMs: num(parsed.voiceMs),
      speakMs: num(parsed.speakMs),
      larkMs: num(parsed.larkMs),
      places: parsed.places && typeof parsed.places === "object" ? parsed.places : {},
      games: parsed.games && typeof parsed.games === "object" ? parsed.games : {},
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch {
    return blank();
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function saveNow() {
  if (!file) return;
  try {
    bin().setItem(STATS_KEY, JSON.stringify(file));
  } catch {
    /* full or blocked storage stays on the device; skip this write */
  }
}

function scheduleSave() {
  if (typeof window === "undefined") {
    saveNow();
    return;
  }
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    saveNow();
  }, SAVE_MS);
}

function ensureClock() {
  if (typeof window === "undefined" || !collecting()) return;
  if (!clockArmed) {
    clockArmed = true;
    document.addEventListener("visibilitychange", () => {
      if (!collecting()) return;
      if (visible()) {
        if (!larkSince) larkSince = Date.now();
        return;
      }
      closeLark(Date.now());
      saveNow();
    });
    window.addEventListener("pagehide", () => {
      const now = Date.now();
      closeFocus(now);
      closeVoice(now);
      closeSpeak(now);
      closeGame(now);
      closeLark(now);
      saveNow();
    });
  }
  if (visible() && !larkSince) larkSince = Date.now();
  if (clockTimer) return;
  clockTimer = window.setInterval(() => {
    if (!collecting() || !visible() || !larkSince) return;
    const now = Date.now();
    const span = Math.min(60_000, Math.max(0, now - larkSince));
    larkSince = now;
    addLark(data(), now, span);
    scheduleSave();
  }, 15_000);
}

function stopClock() {
  if (clockTimer && typeof window !== "undefined") window.clearInterval(clockTimer);
  clockTimer = 0;
}

function visible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

function bin(): Storage {
  if (storageRef) return storageRef;
  return localStorage;
}
