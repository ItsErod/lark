/** One opt-in reply in a direct message. Not a burst, and not a server. */

export const AWAY_REPLY_MAX = 200;
export const AWAY_REPLY_GAP_MS = 30_000;
const CHANNEL = /^[A-Za-z0-9]{1,32}$/;

export function cleanAwayText(value: string): string {
  return value.trim().slice(0, AWAY_REPLY_MAX);
}

export function sanitizeAwayReplied(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !CHANNEL.test(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

export function awayReplyDecision(input: {
  armed: boolean;
  text: string;
  kind: string;
  authorBot: boolean;
  authorId: string;
  meId: string;
  channelId: string;
  lookingAt: boolean;
  content: string;
  repliedChannels: readonly string[];
  lastSentAt: number;
  now: number;
}): { send: false } | { send: true; text: string } {
  if (!input.armed) return { send: false };
  const text = cleanAwayText(input.text);
  if (!text) return { send: false };
  if (input.kind !== "dm") return { send: false };
  if (input.authorBot || !input.authorId || input.authorId === input.meId) return { send: false };
  if (!CHANNEL.test(input.channelId)) return { send: false };
  if (input.lookingAt) return { send: false };
  if (input.content.trim() === text) return { send: false };
  if (input.repliedChannels.includes(input.channelId)) return { send: false };
  if (!Number.isFinite(input.now) || !Number.isFinite(input.lastSentAt)) return { send: false };
  if (input.now - input.lastSentAt < AWAY_REPLY_GAP_MS) return { send: false };
  return { send: true, text };
}
