/** One-click mark-read across servers. Discord acks are queued, not burst. */

export interface ReadTarget {
  id: string;
  kind: string;
  direct: boolean;
  muted: boolean;
  pending: number;
}

export interface ReadAck {
  channelId: string;
  messageId: string;
}

const SKIP_KIND = new Set(["category", "voice", "stage"]);
const MAX_ACKS = 500;

export function readAllIds(
  targets: readonly ReadTarget[],
  options: { includeMuted: boolean; includeDms: boolean },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (SKIP_KIND.has(target.kind) || target.pending <= 0) continue;
    if (target.direct && !options.includeDms) continue;
    if (target.muted && !options.includeMuted) continue;
    if (!target.id || seen.has(target.id)) continue;
    seen.add(target.id);
    out.push(target.id);
    if (out.length >= MAX_ACKS) break;
  }
  return out;
}

export function queueAcks(existing: readonly ReadAck[], next: readonly ReadAck[]): ReadAck[] {
  const seen = new Set(existing.map((item) => item.channelId));
  const out = [...existing];
  for (const item of next) {
    if (!item.channelId || !item.messageId || item.messageId.startsWith("local-") || seen.has(item.channelId)) continue;
    seen.add(item.channelId);
    out.push({ channelId: item.channelId, messageId: item.messageId });
    if (out.length >= MAX_ACKS) break;
  }
  return out;
}

/** One Discord ack per call so a read-all click cannot flush the API. */
export function takeAck(queue: readonly ReadAck[]): { next: ReadAck | null; rest: ReadAck[] } {
  if (!queue.length) return { next: null, rest: [] };
  return { next: queue[0], rest: queue.slice(1) };
}

export const READ_ALL_GAP_MS = 400;
