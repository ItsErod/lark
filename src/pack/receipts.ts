/** Local read marks. These never become a Discord ack. */

const SNOWFLAKE = /^\d{1,20}$/;
const CHANNEL = /^[A-Za-z0-9]{1,32}$/;

export const MAX_RECEIPT_CHANNELS = 200;

export function snowflake(value: string): boolean {
  return SNOWFLAKE.test(value);
}

function channelOk(value: string): boolean {
  return CHANNEL.test(value);
}

function compareSnowflake(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function newerSnowflake(current: string, incoming: string): string {
  if (!snowflake(incoming)) return snowflake(current) ? current : "";
  if (!snowflake(current)) return incoming;
  return compareSnowflake(incoming, current) > 0 ? incoming : current;
}

/** True when this message is at or before the local cursor. */
export function atOrBefore(cursor: string, messageId: string): boolean {
  if (!snowflake(cursor) || !snowflake(messageId)) return false;
  return compareSnowflake(messageId, cursor) <= 0;
}

export function noteSeen(
  cursors: Readonly<Record<string, string>>,
  channelId: string,
  messageId: string,
): Record<string, string> {
  if (!channelOk(channelId) || !snowflake(messageId)) return { ...cursors };
  const current = cursors[channelId] ?? "";
  const nextId = newerSnowflake(current, messageId);
  if (nextId === current) return { ...cursors };
  const next = { ...cursors, [channelId]: nextId };
  const keys = Object.keys(next);
  if (keys.length <= MAX_RECEIPT_CHANNELS) return next;
  const drop = keys
    .filter((key) => key !== channelId)
    .sort((a, b) => compareSnowflake(next[a] ?? "0", next[b] ?? "0"))[0];
  if (drop) delete next[drop];
  return next;
}

export function sanitizeCursors(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [channelId, messageId] of Object.entries(value as Record<string, unknown>)) {
    if (!channelOk(channelId) || typeof messageId !== "string" || !snowflake(messageId)) continue;
    out[channelId] = messageId;
    if (Object.keys(out).length >= MAX_RECEIPT_CHANNELS) break;
  }
  return out;
}
