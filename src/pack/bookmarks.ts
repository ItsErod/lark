export interface Bookmark {
  messageId: string;
  channelId: string;
  authorName: string;
  excerpt: string;
  savedAt: number;
}

export function toggleBookmark(list: readonly Bookmark[], item: Bookmark): Bookmark[] {
  const exists = list.some((entry) => entry.messageId === item.messageId && entry.channelId === item.channelId);
  if (exists) return list.filter((entry) => !(entry.messageId === item.messageId && entry.channelId === item.channelId));
  const excerpt = item.excerpt.replace(/\s+/g, " ").trim().slice(0, 140);
  const authorName = item.authorName.trim().slice(0, 80) || "Someone";
  return [{ ...item, excerpt, authorName }, ...list].slice(0, 200);
}

export function isBookmarked(list: readonly Bookmark[], channelId: string, messageId: string): boolean {
  return list.some((entry) => entry.channelId === channelId && entry.messageId === messageId);
}
