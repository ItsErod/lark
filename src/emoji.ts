export interface EmojiUse {
  emoji: string;
  count: number;
  last: number;
}

export const EMOJI = ["👍", "🔥", "✅", "👀", "❤️", "😂", "🎉", "😮", "😢", "🙏", "✨", "💯", "🚀", "👏", "😄", "🤔"];

export function frecency(uses: EmojiUse[], now: number): EmojiUse[] {
  return [...uses].sort((a, b) => score(b, now) - score(a, now));
}

export function rememberEmoji(uses: EmojiUse[], emoji: string, now: number): EmojiUse[] {
  const next = uses.filter((item) => item.emoji !== emoji);
  const previous = uses.find((item) => item.emoji === emoji);
  next.push({ emoji, count: (previous?.count ?? 0) + 1, last: now });
  return frecency(next, now).slice(0, 32);
}

function score(item: EmojiUse, now: number): number {
  const ageHours = Math.max(0, now - item.last) / 3_600_000;
  return item.count * 10 - Math.min(ageHours, 48);
}
