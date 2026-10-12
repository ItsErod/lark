/** Short-lived REST page cache. Keys are route plus query, never headers. */

export const REST_PAGE_TTL_MS = 15_000;

export interface RestHit<T> {
  at: number;
  value: T;
}

export function readRestCache<T>(store: Map<string, RestHit<T>>, key: string, now: number, ttlMs: number): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (now - hit.at > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function writeRestCache<T>(store: Map<string, RestHit<T>>, key: string, value: T, now: number, max = 40): void {
  if (store.has(key)) store.delete(key);
  store.set(key, { at: now, value });
  while (store.size > max) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
