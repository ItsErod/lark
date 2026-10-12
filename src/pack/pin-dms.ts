/** Pin direct-message conversations to the top of the DM list. */

const MAX_PINS = 40;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function cleanPinnedDms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

export function togglePinnedDm(list: readonly string[], channelId: string): string[] {
  if (!ID.test(channelId)) return [...list];
  if (list.includes(channelId)) return list.filter((id) => id !== channelId);
  return [channelId, ...list].slice(0, MAX_PINS);
}

export function orderDms<T extends { id: string; position: number }>(
  dms: readonly T[],
  pinned: readonly string[],
): { pinned: T[]; rest: T[] } {
  const byId = new Map(dms.map((dm) => [dm.id, dm]));
  const pinnedRows: T[] = [];
  const used = new Set<string>();
  for (const id of pinned) {
    const dm = byId.get(id);
    if (!dm || used.has(id)) continue;
    used.add(id);
    pinnedRows.push(dm);
  }
  const rest = dms.filter((dm) => !used.has(dm.id)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return { pinned: pinnedRows, rest };
}
