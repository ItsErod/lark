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

export interface EchoMessage {
  id: string;
  nonce?: string | null;
}

let echoSerial = 0;

/** Local id shared with Discord as the message nonce. The API keeps 25 characters. */
export function outgoingNonce(now = Date.now()): string {
  echoSerial = (echoSerial + 1) % 1296;
  return `local-${now.toString(36)}-${echoSerial.toString(36)}`.slice(0, 25);
}

/** Same send: snowflake id, or the nonce echoed back onto the gateway copy. */
export function sameOutgoing(a: EchoMessage, b: EchoMessage): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  const left = (a.nonce ?? "").trim();
  const right = (b.nonce ?? "").trim();
  if (left && (left === right || left === b.id)) return true;
  if (right && (right === left || right === a.id)) return true;
  return false;
}

/**
 * Replace the optimistic row when the gateway event or the REST response arrives.
 * A list that already holds both copies collapses to the server message.
 */
export function mergeIncoming<T extends EchoMessage>(list: readonly T[], incoming: T): T[] {
  let placed = false;
  const next: T[] = [];
  for (const item of list) {
    if (!sameOutgoing(item, incoming)) {
      next.push(item);
      continue;
    }
    if (!placed) {
      const nonce = (incoming.nonce ?? "").trim() || (item.nonce ?? "").trim();
      next.push(nonce ? { ...incoming, nonce } : incoming);
      placed = true;
    }
  }
  if (!placed) next.push(incoming);
  return next;
}

export function sameReaction(
  reaction: { emoji: string; emojiId?: string | null },
  emoji: string,
  emojiId?: string | null,
): boolean {
  if (reaction.emojiId || emojiId) return Boolean(emojiId) && reaction.emojiId === emojiId;
  return reaction.emoji === emoji;
}
