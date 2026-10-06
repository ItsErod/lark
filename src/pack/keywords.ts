export type RuleLevel = "all" | "mentions" | "mute";

export interface ChannelWords {
  words: string[];
  level?: RuleLevel;
}

export function cleanWords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const word = part.trim().slice(0, 40);
    const key = word.toLowerCase();
    if (word.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= 20) break;
  }
  return out;
}

export function wordsFor(global: readonly string[], channels: Readonly<Record<string, ChannelWords>>, channelId: string): string[] {
  const local = channels[channelId]?.words;
  if (local && local.length) return [...local];
  return [...global];
}

export function firstHit(content: string, words: readonly string[]): string | null {
  const hay = content.toLowerCase();
  for (const word of words) {
    const clean = word.trim().toLowerCase();
    if (clean.length > 1 && hay.includes(clean)) return word.trim();
  }
  return null;
}

export function allowKeywordNotify(
  key: string,
  now: number,
  last: Readonly<Record<string, number>>,
  cooldownMs = 60_000,
): { ok: boolean; last: Record<string, number> } {
  const prev = last[key];
  if (prev !== undefined && now - prev < cooldownMs) return { ok: false, last: { ...last } };
  return { ok: true, last: { ...last, [key]: now } };
}

/** Keyword pings fill the gap when a channel is mentions-only and the message does not mention you. */
export function shouldKeywordNotify(input: {
  level: RuleLevel;
  mentionsMe: boolean;
  fromMe: boolean;
  windowFocused: boolean;
  sameChannel: boolean;
  hit: boolean;
  alreadyNotified: boolean;
}): boolean {
  if (!input.hit || input.fromMe || input.alreadyNotified) return false;
  if (input.level === "mute") return false;
  if (input.windowFocused && input.sameChannel) return false;
  if (input.level === "all") return false;
  return !input.mentionsMe;
}
