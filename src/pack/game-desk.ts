/** Game desks: timers, posts, and public profile links. Nothing reads a game process. */

export const DESK_TOOLS = ["session", "lfg", "build", "callouts", "crew", "stats"] as const;
export type DeskTool = (typeof DESK_TOOLS)[number];
export const STAT_KINDS = ["steam", "overwatch", "card"] as const;
export type StatKind = (typeof STAT_KINDS)[number];

const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface DeskStats {
  kinds: StatKind[];
  label: string;
  placeholder: string;
  hint: string;
  fields: string[];
}

export interface GameCatalog {
  game: string;
  nameEditable: boolean;
  tools: DeskTool[];
  roles: string[];
  modes: string[];
  sizes: string[];
  slots: string[];
  callouts: string[];
  stats: DeskStats | null;
}

export interface DeskSettings {
  gameName: string;
  role: string;
  mode: string;
  size: string;
  note: string;
  slots: string[];
  callouts: string;
  crew: string;
  statKind: StatKind | "";
  statId: string;
  statLines: string;
  sessionStart: number;
  presence: boolean;
  presenceReplace: boolean;
}

export interface ProfileTarget {
  url: string;
  label: string;
}

export interface SteamCard {
  name: string;
  state: string;
  memberSince: string;
  url: string;
}

export function emptyDesk(): DeskSettings {
  return {
    gameName: "",
    role: "",
    mode: "",
    size: "",
    note: "",
    slots: [],
    callouts: "",
    crew: "",
    statKind: "",
    statId: "",
    statLines: "",
    sessionStart: 0,
    presence: false,
    presenceReplace: false,
  };
}

export function readCatalog(source: string): GameCatalog | null {
  try {
    const read = new Function(
      `"use strict";
       ${source}
       if (typeof catalog !== "function") return null;
       const value = catalog();
       return value && typeof value === "object" ? value : null;`,
    ) as () => unknown;
    return sanitizeCatalog(read());
  } catch {
    return null;
  }
}

export function sanitizeCatalog(value: unknown): GameCatalog | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tools = cleanTools(record.tools);
  if (!tools.length) return null;
  const game = clip(record.game, 40) || "Session";
  return {
    game,
    nameEditable: record.nameEditable === true,
    tools,
    roles: cleanList(record.roles, 8, 24),
    modes: cleanList(record.modes, 8, 24),
    sizes: cleanSizes(record.sizes),
    slots: cleanList(record.slots, 6, 24),
    callouts: cleanList(record.callouts, 24, 48),
    stats: tools.includes("stats") ? cleanStats(record.stats) : null,
  };
}

export function sanitizeDesk(value: unknown, now = Date.now()): DeskSettings {
  const base = emptyDesk();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  base.gameName = clip(record.gameName, 40);
  base.role = clip(record.role, 24);
  base.mode = clip(record.mode, 24);
  base.size = cleanSizes([record.size])[0] ?? "";
  base.note = clip(record.note, 140);
  base.slots = Array.isArray(record.slots) ? record.slots.map((item) => clip(item, 40)).filter(Boolean).slice(0, 6) : [];
  base.callouts = lines(record.callouts, 24, 48);
  base.crew = lines(record.crew, 12, 48);
  base.statKind = STAT_KINDS.includes(record.statKind as StatKind) ? (record.statKind as StatKind) : "";
  base.statId = clip(record.statId, 200);
  base.statLines = lines(record.statLines, 8, 80);
  base.presence = record.presence === true;
  base.presenceReplace = record.presenceReplace === true;
  const start = typeof record.sessionStart === "number" && Number.isFinite(record.sessionStart) ? record.sessionStart : 0;
  base.sessionStart = start > 0 && start <= now && now - start <= MAX_SESSION_MS ? start : 0;
  return base;
}

export function sanitizeDesks(value: unknown, now = Date.now()): Record<string, DeskSettings> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, DeskSettings> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SLUG.test(id)) continue;
    out[id] = sanitizeDesk(raw, now);
    if (Object.keys(out).length >= 12) break;
  }
  return out;
}

export function displayName(catalog: GameCatalog, desk: DeskSettings): string {
  if (catalog.nameEditable && desk.gameName.trim()) return desk.gameName.trim();
  return catalog.game;
}

export function sessionClock(start: number, now: number): string {
  if (!start || start > now) return "";
  const sec = Math.min(MAX_SESSION_MS / 1000, Math.floor((now - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function sessionStatusLine(game: string, start: number, now: number): string {
  if (!start || start > now) return "";
  const mins = Math.floor((now - start) / 60_000);
  const label = mins < 1 ? "just started" : mins === 1 ? "1m" : `${mins}m`;
  const name = game.trim() || "Session";
  const line = name.toLowerCase() === "session" ? `Session · ${label}` : `${name} · ${label}`;
  return line.slice(0, 128);
}

export function canReplaceSession(current: string, previous: string, replace: boolean): boolean {
  if (replace) return true;
  const custom = current.trim();
  if (!custom) return true;
  return Boolean(previous) && custom === previous;
}

export function setSession(
  desks: Record<string, DeskSettings>,
  id: string,
  running: boolean,
  now: number,
): Record<string, DeskSettings> {
  const next: Record<string, DeskSettings> = {};
  for (const [key, desk] of Object.entries(desks)) next[key] = { ...desk, sessionStart: 0 };
  const current = next[id] ?? emptyDesk();
  next[id] = { ...current, sessionStart: running ? now : 0 };
  return next;
}

export function lfgText(game: string, desk: DeskSettings): string {
  const linesOut = [`LFG · ${game}`];
  if (desk.role) linesOut.push(`Role: ${desk.role}`);
  if (desk.mode) linesOut.push(`Mode: ${desk.mode}`);
  if (desk.size) linesOut.push(`Squad: ${desk.size}`);
  if (desk.note) linesOut.push(desk.note);
  return linesOut.join("\n").slice(0, 500);
}

export function buildText(game: string, slots: readonly string[], desk: DeskSettings): string {
  const linesOut = [`Build · ${game}`];
  slots.forEach((slot, index) => {
    const value = desk.slots[index]?.trim();
    if (value) linesOut.push(`${slot}: ${value}`);
  });
  if (linesOut.length === 1) return "";
  return linesOut.join("\n").slice(0, 500);
}

export function crewText(game: string, desk: DeskSettings): string {
  const people = desk.crew.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!people.length) return "";
  return [`Crew · ${game}`, ...people, "Reply with ready."].join("\n").slice(0, 500);
}

export function calloutChoices(catalog: GameCatalog, desk: DeskSettings): string[] {
  const extra = desk.callouts.split("\n").map((line) => line.trim()).filter((line) => line.length > 1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...catalog.callouts, ...extra]) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= 24) break;
  }
  return out;
}

export function statsCard(game: string, desk: DeskSettings, profile?: SteamCard | null, link?: string): string {
  const linesOut = [`Stats · ${game}`];
  if (profile?.name) linesOut.push(profile.name);
  if (profile?.state) linesOut.push(`Steam · ${profile.state}`);
  if (profile?.memberSince) linesOut.push(`Member since ${profile.memberSince}`);
  for (const line of desk.statLines.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) linesOut.push(trimmed);
  }
  const url = profile?.url || link || "";
  if (url) linesOut.push(url);
  if (linesOut.length === 1) return "";
  return linesOut.join("\n").slice(0, 500);
}

export function steamPageUrl(id: string): string | null {
  const raw = id.trim();
  if (/^7656119\d{10}$/.test(raw)) return `https://steamcommunity.com/profiles/${raw}`;
  if (/^[A-Za-z0-9_-]{2,32}$/.test(raw)) return `https://steamcommunity.com/id/${raw}`;
  return null;
}

export function steamXmlUrl(id: string): string | null {
  const page = steamPageUrl(id);
  return page ? `${page}?xml=1` : null;
}

export function overwatchUrl(input: string): string | null {
  const raw = input.trim();
  if (raw.length < 32 || raw.length > 200) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  if (url.hostname !== "overwatch.blizzard.com") return null;
  if (url.search || url.hash) return null;
  const path = url.pathname;
  if (path.includes("..") || path.includes("//") || path.includes("\\")) return null;
  if (!/^\/[a-z]{2}-[a-z]{2}\/career\/[A-Za-z0-9|_-]{8,80}\/?$/.test(path)) return null;
  const pathname = path.endsWith("/") ? path : `${path}/`;
  return `https://overwatch.blizzard.com${pathname}`;
}

export function profileTarget(kind: string, id: string): ProfileTarget | null {
  if (kind === "steam") {
    const url = steamPageUrl(id);
    return url ? { url, label: "Steam" } : null;
  }
  if (kind === "overwatch") {
    const url = overwatchUrl(id);
    return url ? { url, label: "Overwatch" } : null;
  }
  return null;
}

export function parseSteamProfile(xml: string, url: string): SteamCard | null {
  if (!xml || xml.length > 65_536 || !xml.includes("<profile>")) return null;
  const page = url.split("?")[0];
  if (!page.startsWith("https://steamcommunity.com/id/") && !page.startsWith("https://steamcommunity.com/profiles/")) return null;
  const name = xmlTag(xml, "steamID");
  if (!name) return null;
  return {
    name: plain(name, 64),
    state: plain(xmlTag(xml, "onlineState"), 24),
    memberSince: plain(xmlTag(xml, "memberSince"), 40),
    url: page,
  };
}

export function activeStatKind(catalog: GameCatalog, desk: DeskSettings): StatKind {
  const kinds = catalog.stats?.kinds ?? [];
  if (desk.statKind && kinds.includes(desk.statKind)) return desk.statKind;
  return kinds[0] ?? "card";
}

export function deskActions(pluginId: string, catalog: GameCatalog, desk: DeskSettings): { id: string; label: string }[] {
  const name = displayName(catalog, desk);
  const out: { id: string; label: string }[] = [];
  if (catalog.tools.includes("session")) {
    out.push({ id: `${pluginId}:session`, label: desk.sessionStart ? `${name} · stop session` : `${name} · start session` });
  }
  if (catalog.tools.includes("lfg")) out.push({ id: `${pluginId}:lfg`, label: `${name} · LFG` });
  if (catalog.tools.includes("build")) out.push({ id: `${pluginId}:build`, label: `${name} · build` });
  if (catalog.tools.includes("callouts")) {
    for (const line of calloutChoices(catalog, desk).slice(0, 8)) {
      out.push({ id: `${pluginId}:callout:${encodeURIComponent(line)}`, label: `${name} · ${line}` });
    }
  }
  if (catalog.tools.includes("crew")) out.push({ id: `${pluginId}:crew`, label: `${name} · crew` });
  if (catalog.tools.includes("stats")) out.push({ id: `${pluginId}:stats`, label: `${name} · stats` });
  return out;
}

function cleanTools(value: unknown): DeskTool[] {
  if (!Array.isArray(value)) return [];
  const out: DeskTool[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !DESK_TOOLS.includes(item as DeskTool) || out.includes(item as DeskTool)) continue;
    out.push(item as DeskTool);
  }
  return out;
}

function cleanStats(value: unknown): DeskStats | null {
  if (!value || typeof value !== "object") return { kinds: ["card"], label: "Share card", placeholder: "", hint: "Type the numbers you want to share.", fields: [] };
  const record = value as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds)
    ? record.kinds.filter((item): item is StatKind => typeof item === "string" && STAT_KINDS.includes(item as StatKind))
    : [];
  return {
    kinds: kinds.length ? [...new Set(kinds)] : ["card"],
    label: clip(record.label, 40) || "Stats",
    placeholder: clip(record.placeholder, 80),
    hint: clip(record.hint, 240) || "Nothing is sent until you send the message.",
    fields: cleanList(record.fields, 6, 24),
  };
}

function cleanList(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = clip(item, length);
    if (text.length < 2 || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function cleanSizes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").trim();
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1 || number > 12) continue;
    const label = String(number);
    if (out.includes(label)) continue;
    out.push(label);
    if (out.length >= 6) break;
  }
  return out;
}

function lines(value: unknown, max: number, length: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => line.trim().slice(0, length))
    .filter(Boolean)
    .slice(0, max)
    .join("\n");
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function xmlTag(xml: string, name: string): string {
  const pattern = new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${name}>`);
  const match = pattern.exec(xml);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function plain(value: string, max: number): string {
  return value.replace(/[<>&]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
