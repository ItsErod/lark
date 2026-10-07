export interface CachedPage {
  channelId: string;
  messages: { id: string }[];
}

/**
 * Channels to warm while the user reads `current`.
 * Neighbors come first, then recent channels that are not already loaded.
 */
export function prefetchChannelIds(
  current: string,
  order: readonly string[],
  recent: readonly string[],
  loaded: ReadonlySet<string>,
  limit = 3,
): string[] {
  const index = order.indexOf(current);
  const seeds = [order[index - 1], order[index + 1], ...recent];
  const out: string[] = [];
  const cap = Math.max(0, limit);
  for (const id of seeds) {
    if (!id || id === current || loaded.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

export function rememberPage(pages: CachedPage[], page: CachedPage, max = 40): CachedPage[] {
  const next = pages.filter((item) => item.channelId !== page.channelId);
  next.push({
    channelId: page.channelId,
    messages: page.messages.slice(-max),
  });
  return next.slice(-30);
}
