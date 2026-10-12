/** A message is jumbo when it is only emoji, up to Discord's usual cap. */

const CUSTOM = /<a?:[a-zA-Z0-9_]{2,32}:\d{5,22}>/g;
const EMOJI = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;
const MAX = 27;

export type JumboSize = 32 | 48 | 64 | 96;

export function jumboSize(value: unknown): JumboSize {
  if (value === 32 || value === 48 || value === 64 || value === 96) return value;
  return 48;
}

export function jumboCount(content: string): number {
  let count = 0;
  const stripped = content
    .replace(CUSTOM, () => {
      count += 1;
      return "";
    })
    .replace(EMOJI, () => {
      count += 1;
      return "";
    });
  if (stripped.replace(/\s/g, "")) return 0;
  if (count < 1 || count > MAX) return 0;
  return count;
}

export function isJumbo(content: string): boolean {
  return jumboCount(content) > 0;
}
