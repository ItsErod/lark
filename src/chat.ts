/** Discord groups consecutive messages from the same author for about seven minutes. */
export const GROUP_WINDOW_MS = 7 * 60 * 1000;

export interface GroupCursor {
  authorId: string;
  timestamp: string;
  kind?: string;
}

export function shouldGroup(
  prev: GroupCursor | undefined,
  next: GroupCursor & { reply?: unknown },
  sameDay: boolean,
): boolean {
  if (!prev || !sameDay || next.reply) return false;
  if (isSystem(prev.kind) || isSystem(next.kind)) return false;
  if (!prev.authorId || prev.authorId !== next.authorId) return false;
  const delta = new Date(next.timestamp).getTime() - new Date(prev.timestamp).getTime();
  return delta >= 0 && delta < GROUP_WINDOW_MS;
}

function isSystem(kind?: string): boolean {
  return kind === "join" || kind === "system";
}

export function typingLine(names: string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (!unique.length) return "";
  if (unique.length === 1) return `${unique[0]} is typing`;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]} are typing`;
  return "Several people are typing";
}

export function snowflakeAfter(id: string, earlier: string): boolean {
  if (!/^\d{5,22}$/.test(id) || !/^\d{5,22}$/.test(earlier)) return false;
  try {
    return BigInt(id) > BigInt(earlier);
  } catch {
    return false;
  }
}

/** First message id strictly newer than the last read marker. */
export function firstUnreadId(ids: string[], lastRead?: string | null): string | null {
  if (!lastRead) return null;
  for (const id of ids) {
    if (snowflakeAfter(id, lastRead)) return id;
  }
  return null;
}

export function channelIsBehind(lastMessageId?: string | null, lastReadId?: string | null): boolean {
  if (!lastMessageId || !lastReadId) return false;
  return snowflakeAfter(lastMessageId, lastReadId);
}

export function sameReaction(
  reaction: { emoji: string; emojiId?: string | null },
  emoji: string,
  emojiId?: string | null,
): boolean {
  if (reaction.emojiId || emojiId) return Boolean(emojiId) && reaction.emojiId === emojiId;
  return reaction.emoji === emoji;
}
