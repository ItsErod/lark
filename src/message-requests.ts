/**
 * Message requests and the spam inbox for 1:1 DMs from people who are not friends.
 * Discord's client routes are tried first. A thrown fetch falls back to this list.
 */
import { snowflakeOk } from "./threads";

export interface MessageRequest {
  id: string;
  name: string;
  preview: string;
  spam: boolean;
  userId?: string | null;
}

export interface MessageRequestDm {
  id: string;
  name: string;
  kind: string;
  recipientIds?: string[];
  preview?: string;
}

const held = new Set<string>();

export function isHeldRequest(channelId: string): boolean {
  return held.has(channelId);
}

export function heldRequestIds(): string[] {
  return [...held];
}

export function replaceHeldRequests(ids: Iterable<string>): void {
  held.clear();
  for (const id of ids) {
    if (id) held.add(id);
  }
}

export function releaseHeldRequest(channelId: string): void {
  held.delete(channelId);
}

/**
 * 1:1 DMs whose other person is not a friend and not blocked.
 * `off` stays a message request. `non_friends` and `everyone` land in spam.
 */
export function localMessageRequests(input: {
  dms: readonly MessageRequestDm[];
  friendIds: Iterable<string>;
  blockedIds: Iterable<string>;
  meId: string;
  spamFilter?: string | null;
}): MessageRequest[] {
  const friends = new Set(input.friendIds);
  const blocked = new Set(input.blockedIds);
  const filter = input.spamFilter || "non_friends";
  const spam = filter === "non_friends" || filter === "everyone";
  const rows: MessageRequest[] = [];
  for (const dm of input.dms) {
    if (dm.kind !== "dm" || !snowflakeOk(dm.id)) continue;
    const other = (dm.recipientIds ?? []).find((id) => snowflakeOk(id) && id !== input.meId);
    if (!other || friends.has(other) || blocked.has(other)) continue;
    rows.push({
      id: dm.id,
      name: dm.name.trim() || "Someone",
      preview: (dm.preview ?? "").trim(),
      spam,
      userId: other,
    });
  }
  return rows;
}

/** Accept an array or `{ message_requests | channels | spam }`. An empty array is authoritative. */
export function messageRequestsFromPayload(payload: unknown, spam: boolean): MessageRequest[] {
  const rows: MessageRequest[] = [];
  for (const item of requestArray(payload)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = text(raw.id) || text(raw.channelId) || text(raw.channel_id);
    if (!snowflakeOk(id)) continue;
    const recipient = firstRecipient(raw);
    const name = recipientName(recipient) || text(raw.name) || "Someone";
    const preview = previewOf(raw);
    const flagged = bool(raw.is_spam) ?? bool(raw.spam) ?? spam;
    const userId = recipient ? text(recipient.id) : text(raw.userId) || text(raw.user_id);
    rows.push({
      id,
      name,
      preview,
      spam: flagged,
      userId: snowflakeOk(userId) ? userId : null,
    });
  }
  return rows;
}

export function mergeMessageRequests(rows: readonly MessageRequest[]): MessageRequest[] {
  const byId = new Map<string, MessageRequest>();
  for (const row of rows) {
    const prior = byId.get(row.id);
    if (!prior || (row.spam && !prior.spam)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function messageRequestGroups(rows: readonly MessageRequest[]): { requests: MessageRequest[]; spam: MessageRequest[] } {
  return {
    requests: rows.filter((row) => !row.spam),
    spam: rows.filter((row) => row.spam),
  };
}

function requestArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as Record<string, unknown>;
  for (const key of ["message_requests", "messageRequests", "channels", "spam"]) {
    if (Array.isArray(raw[key])) return raw[key] as unknown[];
  }
  return [];
}

function firstRecipient(raw: Record<string, unknown>): Record<string, unknown> | null {
  const list = raw.recipients;
  if (Array.isArray(list)) {
    const first = list.find((item) => item && typeof item === "object");
    if (first && typeof first === "object") return first as Record<string, unknown>;
  }
  const one = raw.recipient;
  if (one && typeof one === "object") return one as Record<string, unknown>;
  return null;
}

function recipientName(recipient: Record<string, unknown> | null): string {
  if (!recipient) return "";
  return text(recipient.global_name) || text(recipient.globalName) || text(recipient.username) || text(recipient.name);
}

function previewOf(raw: Record<string, unknown>): string {
  for (const key of ["last_message", "lastMessage", "message"]) {
    const message = raw[key];
    if (message && typeof message === "object") {
      const content = text((message as Record<string, unknown>).content);
      if (content) return content.slice(0, 140);
    }
  }
  return (text(raw.content) || text(raw.preview)).slice(0, 140);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return "";
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
