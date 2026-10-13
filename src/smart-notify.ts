import { bumpsUnread } from "./notify";
import type { NotifyLevel, QuietHours, QuietMode } from "./types";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TOKENISH = /(?:mfa\.[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,})/;
const MAX_LIST = 20;
const MAX_NOTES = 40;

export const MISSED_KEY = "lark.missed.v1";
export const MISSED_SEEN_KEY = "lark.missed.seen.v1";

export function defaultQuiet(): QuietHours {
  return { enabled: false, start: "22:00", end: "07:00", mode: "batch" };
}

export function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function sanitizeQuiet(input: unknown): QuietHours {
  const base = defaultQuiet();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<QuietHours>;
  if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
  if (typeof raw.start === "string" && clockMinutes(raw.start) !== null) base.start = raw.start.trim();
  if (typeof raw.end === "string" && clockMinutes(raw.end) !== null) base.end = raw.end.trim();
  if (raw.mode === "suppress" || raw.mode === "batch") base.mode = raw.mode;
  return base;
}

/** True when the local clock sits inside the configured window. Equal clocks never match. */
export function inQuietHours(quiet: QuietHours, now: Date): boolean {
  if (!quiet.enabled) return false;
  const start = clockMinutes(quiet.start);
  const end = clockMinutes(quiet.end);
  if (start === null || end === null || start === end) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function cleanAlertList(input: unknown): string[] {
  const parts = typeof input === "string" ? input.split(",") : Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const word = part.replace(/[\u0000-\u001f]/g, "").trim();
    const key = word.toLowerCase();
    if (word.length < 2 || word.length > 40 || seen.has(key) || TOKENISH.test(word)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

export interface AlertMatch {
  kind: "keyword" | "person" | null;
  /** An explicit block stopped a keyword or person breakthrough. */
  blocked: boolean;
}

export function matchAlert(input: {
  content: string;
  authorId: string;
  authorName: string;
  channelId: string;
  keywords: readonly string[];
  people: readonly string[];
  blocked: readonly string[];
}): AlertMatch {
  const blocked = new Set(input.blocked.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 1));
  if (blocked.has(input.channelId.trim().toLowerCase())) return { kind: null, blocked: true };
  const authorId = input.authorId.trim().toLowerCase();
  const authorName = input.authorName.trim().toLowerCase();
  if ((authorId && blocked.has(authorId)) || (authorName && blocked.has(authorName))) {
    return { kind: null, blocked: true };
  }
  const keyword = firstKeyword(input.content, input.keywords, blocked);
  if (keyword) return { kind: "keyword", blocked: false };
  if (personListed(authorId, authorName, input.people)) return { kind: "person", blocked: false };
  if (firstKeyword(input.content, input.keywords, new Set())) return { kind: null, blocked: true };
  return { kind: null, blocked: false };
}

function firstKeyword(content: string, keywords: readonly string[], blocked: ReadonlySet<string>): string | null {
  const hay = content.toLowerCase();
  for (const word of keywords) {
    const clean = word.trim().toLowerCase();
    if (clean.length < 2 || blocked.has(clean)) continue;
    if (hay.includes(clean)) return word.trim();
  }
  return null;
}

function personListed(authorId: string, authorName: string, people: readonly string[]): boolean {
  for (const person of people) {
    const clean = person.trim().toLowerCase();
    if (clean.length < 2) continue;
    if (clean === authorId || clean === authorName) return true;
  }
  return false;
}

export type NotifyAction = "send" | "hold" | "skip";

export interface NotifyPlan {
  action: NotifyAction;
  record: boolean;
  reason: "away" | "quiet";
  alert: boolean;
}

/**
 * Desktop delivery for one incoming message.
 * Mentions, direct messages, and unblocked keyword or person matches stay critical.
 * Quiet hours suppress or hold everything else. A mute still blocks ordinary alerts.
 */
export function planNotification(input: {
  fromMe: boolean;
  windowFocused: boolean;
  sameChannel: boolean;
  desktopEnabled: boolean;
  level: NotifyLevel;
  mentionsMe: boolean;
  direct: boolean;
  quiet: boolean;
  quietMode: QuietMode;
  alert: boolean;
  blocked: boolean;
  away: boolean;
}): NotifyPlan {
  const none: NotifyPlan = { action: "skip", record: false, reason: "away", alert: false };
  if (input.fromMe || (input.windowFocused && input.sameChannel)) return none;
  const breakthrough = input.alert && !input.blocked;
  const normal = bumpsUnread(input.level, input.mentionsMe, input.direct);
  if (!normal && !breakthrough) return none;
  const critical = breakthrough || input.mentionsMe || input.direct;
  const away = input.away || !input.windowFocused;
  const record = away || input.quiet;
  const reason = input.quiet ? "quiet" : "away";
  if (!input.desktopEnabled) return { action: "skip", record, reason, alert: breakthrough };
  if (input.quiet && !critical) {
    return {
      action: input.quietMode === "batch" ? "hold" : "skip",
      record: true,
      reason: "quiet",
      alert: false,
    };
  }
  return { action: "send", record, reason, alert: breakthrough };
}

export interface MissedNote {
  id: string;
  channelId: string;
  channel: string;
  author: string;
  preview: string;
  at: number;
  reason: "away" | "quiet";
  held: boolean;
}

export function rememberMissed(list: readonly MissedNote[], note: MissedNote): MissedNote[] {
  const clean = sanitizeNote(note);
  if (!clean) return list.slice(-MAX_NOTES);
  const next = list.filter((item) => item.id !== clean.id);
  next.push(clean);
  return next.slice(-MAX_NOTES);
}

export function dropChannel(list: readonly MissedNote[], channelId: string): MissedNote[] {
  return list.filter((item) => item.channelId !== channelId);
}

export function releaseHeld(list: readonly MissedNote[]): MissedNote[] {
  if (!list.some((item) => item.held)) return list.slice();
  return list.map((item) => (item.held ? { ...item, held: false } : item));
}

export interface DigestLine {
  channelId: string;
  name: string;
  count: number;
}

export function digestLines(notes: readonly MissedNote[]): DigestLine[] {
  const rows = new Map<string, DigestLine>();
  for (const note of notes) {
    const current = rows.get(note.channelId) ?? { channelId: note.channelId, name: note.channel || "Channel", count: 0 };
    current.count += 1;
    if (note.channel) current.name = note.channel;
    rows.set(note.channelId, current);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function digestSummary(notes: readonly MissedNote[]): { title: string; body: string; messages: number; channels: number } {
  const lines = digestLines(notes);
  const messages = notes.length;
  const title = messages === 1 ? "1 message missed" : `${messages} messages missed`;
  const shown = lines.slice(0, 4).map((line) => `${line.name} · ${line.count}`);
  const extra = lines.length > 4 ? ` · +${lines.length - 4} more` : "";
  return {
    title,
    body: `${shown.join(" · ")}${extra}`.slice(0, 180),
    messages,
    channels: lines.length,
  };
}

export function sanitizeMissed(input: unknown): MissedNote[] {
  if (!Array.isArray(input)) return [];
  const out: MissedNote[] = [];
  for (const item of input) {
    const clean = sanitizeNote(item);
    if (clean) out.push(clean);
  }
  return out.slice(-MAX_NOTES);
}

function sanitizeNote(input: unknown): MissedNote | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<MissedNote>;
  const id = clipId(raw.id);
  const channelId = clipId(raw.channelId);
  if (!id || !channelId) return null;
  const channel = clipText(raw.channel, 80) || "Channel";
  const author = clipText(raw.author, 80) || "Someone";
  const preview = clipText(raw.preview, 80) || "Message";
  if (TOKENISH.test(preview) || TOKENISH.test(author) || TOKENISH.test(channel)) return null;
  const at = typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.max(0, Math.round(raw.at)) : 0;
  return {
    id,
    channelId,
    channel,
    author,
    preview,
    at,
    reason: raw.reason === "quiet" ? "quiet" : "away",
    held: Boolean(raw.held),
  };
}

function clipId(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(clean)) return "";
  return clean;
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
