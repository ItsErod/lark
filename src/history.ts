import { snowflakeAfter } from "./chat";

/** Newest page Discord is asked for, and the page appended when the reader nears the top. */
export const HISTORY_PAGE = 20;

/** Work that must not run before the message text has painted. */
export const AFTER_MESSAGE_PAINT = ["images", "embeds", "members", "threads", "prefetch"] as const;

export interface HistoryRow {
  id: string;
  nonce?: string | null;
}

/** `GET /channels/{id}/messages?limit=20`, plus `before` when paging upward. */
export function historyPath(channelId: string, before?: string | null): string {
  const base = `/channels/${channelId}/messages?limit=${HISTORY_PAGE}`;
  if (!before) return base;
  return `${base}&before=${before}`;
}

/** The tail of a cached channel: the newest page, not the whole backlog. */
export function initialHistory<T>(messages: readonly T[], limit = HISTORY_PAGE): T[] {
  if (messages.length <= limit) return messages.slice();
  return messages.slice(messages.length - limit);
}

/**
 * Fold a fresh newest-page into what is already on screen.
 * Overlap keeps older rows the reader already paged in. A stale cache with no
 * shared id is replaced. Optimistic rows and anything newer than the page stay.
 */
export function reconcileHistory<T extends HistoryRow>(cached: readonly T[], fresh: readonly T[]): T[] {
  if (!fresh.length) return cached.slice();
  if (!cached.length) return fresh.slice();
  const freshIds = new Set(fresh.map((item) => item.id));
  const newest = fresh[fresh.length - 1].id;
  const oldest = fresh[0].id;
  const overlap = cached.some((item) => freshIds.has(item.id));
  const pending = cached.filter((item) => !freshIds.has(item.id) && isPending(item, fresh, newest));
  if (!overlap) return dedupe([...fresh, ...pending]);
  const older = cached.filter((item) => !freshIds.has(item.id) && snowflakeAfter(oldest, item.id));
  return dedupe([...older, ...fresh, ...pending]);
}

function isPending<T extends HistoryRow>(item: T, fresh: readonly T[], newest: string): boolean {
  const nonce = (item.nonce ?? "").trim();
  if (nonce && fresh.some((row) => (row.nonce ?? "").trim() === nonce || row.id === nonce)) return false;
  if (item.id.startsWith("local-")) return true;
  return snowflakeAfter(item.id, newest);
}

function dedupe<T extends HistoryRow>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
