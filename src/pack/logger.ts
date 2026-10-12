import type { RawMessage } from "../types";

/** One earlier version of a message, kept on this device. */
export interface LogEdit {
  content: string;
  at: number;
}

/** A message the logger has seen edited or deleted. */
export interface LogEntry {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  timestamp: string;
  content: string;
  deleted: boolean;
  edits: LogEdit[];
}

export interface LogSnapshot {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  timestamp: string;
  content: string;
}

export interface LogView {
  deleted: boolean;
  history: string[];
}

const MAX_ENTRIES = 200;
const MAX_EDITS = 8;
const MAX_CONTENT = 2000;

export function recordEdit(log: LogEntry[], message: LogSnapshot, previous: string, next: string, now: number): LogEntry[] {
  const before = clip(previous);
  const after = clip(next);
  if (!usable(message) || !before || before === after) return log;
  const current = findLog(log, message.channelId, message.id);
  const edits = pushEdit(current?.edits ?? [], before, now);
  const entry: LogEntry = {
    ...(current ?? blank(message, after)),
    authorName: clipName(message.authorName),
    content: after,
    edits,
  };
  return place(log, entry);
}

export function recordDelete(log: LogEntry[], message: LogSnapshot, now: number): LogEntry[] {
  if (!usable(message)) return log;
  const current = findLog(log, message.channelId, message.id);
  if (current?.deleted) return log;
  const content = clip(message.content) || current?.content || "";
  const entry: LogEntry = {
    ...(current ?? blank(message, content)),
    authorName: clipName(message.authorName),
    content,
    deleted: true,
    edits: current?.edits ?? [],
  };
  if (!entry.timestamp) entry.timestamp = new Date(now).toISOString();
  return place(log, entry);
}

export function findLog(log: readonly LogEntry[], channelId: string, messageId: string): LogEntry | undefined {
  return log.find((entry) => entry.channelId === channelId && entry.id === messageId);
}

export function logView(entry: LogEntry | undefined, showDeleted: boolean, showEdits: boolean): LogView | null {
  if (!entry) return null;
  const deleted = Boolean(showDeleted && entry.deleted);
  const history = showEdits ? entry.edits.map((edit) => edit.content) : [];
  if (!deleted && !history.length) return null;
  return { deleted, history };
}

/** Put deleted messages back into the visible list without writing them into the live page. */
export function overlayDeletes(live: readonly RawMessage[], log: readonly LogEntry[], channelId: string): RawMessage[] {
  const ids = new Set(live.map((message) => message.id));
  const ghosts = log.filter((entry) => entry.channelId === channelId && entry.deleted && !ids.has(entry.id));
  if (!ghosts.length) return live as RawMessage[];
  const merged = [...live];
  const sorted = [...ghosts].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  for (const ghost of sorted) {
    const raw = ghostMessage(ghost);
    const at = merged.findIndex((message) => message.timestamp > ghost.timestamp || (message.timestamp === ghost.timestamp && message.id > ghost.id));
    if (at < 0) merged.push(raw);
    else merged.splice(at, 0, raw);
  }
  return merged;
}

export function ghostMessage(entry: LogEntry): RawMessage {
  return {
    id: entry.id,
    channelId: entry.channelId,
    authorId: entry.authorId,
    authorName: entry.authorName,
    content: entry.content,
    timestamp: entry.timestamp,
    edited: entry.edits.length > 0,
    kind: "default",
  };
}

export function sanitizeLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return [];
  const out: LogEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<LogEntry>;
    if (typeof record.id !== "string" || typeof record.channelId !== "string") continue;
    const id = record.id.trim().slice(0, 40);
    const channelId = record.channelId.trim().slice(0, 40);
    if (!id || !channelId) continue;
    const key = `${channelId}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const edits = sanitizeEdits(record.edits);
    out.push({
      id,
      channelId,
      authorId: typeof record.authorId === "string" ? record.authorId.slice(0, 40) : "",
      authorName: clipName(typeof record.authorName === "string" ? record.authorName : "Someone"),
      timestamp: typeof record.timestamp === "string" ? record.timestamp.slice(0, 40) : "",
      content: clip(typeof record.content === "string" ? record.content : ""),
      deleted: record.deleted === true,
      edits,
    });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

function sanitizeEdits(value: unknown): LogEdit[] {
  if (!Array.isArray(value)) return [];
  const out: LogEdit[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<LogEdit>;
    if (typeof record.content !== "string") continue;
    const content = clip(record.content);
    if (!content) continue;
    const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : 0;
    out.push({ content, at });
    if (out.length >= MAX_EDITS) break;
  }
  return out;
}

function blank(message: LogSnapshot, content: string): LogEntry {
  return {
    id: message.id.slice(0, 40),
    channelId: message.channelId.slice(0, 40),
    authorId: message.authorId.slice(0, 40),
    authorName: clipName(message.authorName),
    timestamp: message.timestamp.slice(0, 40),
    content,
    deleted: false,
    edits: [],
  };
}

function place(log: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  const rest = log.filter((item) => item.id !== entry.id || item.channelId !== entry.channelId);
  return [...rest, entry].slice(-MAX_ENTRIES);
}

function pushEdit(edits: readonly LogEdit[], content: string, now: number): LogEdit[] {
  if (edits[edits.length - 1]?.content === content) return [...edits];
  return [...edits, { content, at: now }].slice(-MAX_EDITS);
}

function usable(message: LogSnapshot): boolean {
  return Boolean(message.id && message.channelId && message.id.length <= 40 && message.channelId.length <= 40);
}

function clip(value: string): string {
  return value.replace(/\s+$/g, "").slice(0, MAX_CONTENT);
}

function clipName(value: string): string {
  const name = value.trim();
  return (name || "Someone").slice(0, 80);
}
