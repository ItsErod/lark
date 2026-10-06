export interface CachedPage {
  channelId: string;
  messages: { id: string }[];
}

export function rememberPage(pages: CachedPage[], page: CachedPage, max = 40): CachedPage[] {
  const next = pages.filter((item) => item.channelId !== page.channelId);
  next.push({
    channelId: page.channelId,
    messages: page.messages.slice(-max),
  });
  return next.slice(-30);
}
