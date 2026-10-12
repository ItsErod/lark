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

/** Unicode shortcodes the composer offers after `:`. Custom guild emoji are added at runtime. */
export interface EmojiCandidate {
  name: string;
  glyph?: string;
  id?: string;
  animated?: boolean;
}

export const UNICODE_EMOJI: EmojiCandidate[] = [
  { name: "thumbsup", glyph: "👍" },
  { name: "thumbsdown", glyph: "👎" },
  { name: "heart", glyph: "❤️" },
  { name: "joy", glyph: "😂" },
  { name: "rofl", glyph: "🤣" },
  { name: "sob", glyph: "😭" },
  { name: "cry", glyph: "😢" },
  { name: "fire", glyph: "🔥" },
  { name: "eyes", glyph: "👀" },
  { name: "tada", glyph: "🎉" },
  { name: "100", glyph: "💯" },
  { name: "white_check_mark", glyph: "✅" },
  { name: "x", glyph: "❌" },
  { name: "pray", glyph: "🙏" },
  { name: "clap", glyph: "👏" },
  { name: "rocket", glyph: "🚀" },
  { name: "sparkles", glyph: "✨" },
  { name: "thinking", glyph: "🤔" },
  { name: "smile", glyph: "😄" },
  { name: "grin", glyph: "😁" },
  { name: "slight_smile", glyph: "🙂" },
  { name: "wink", glyph: "😉" },
  { name: "open_mouth", glyph: "😮" },
  { name: "flushed", glyph: "😳" },
  { name: "heart_eyes", glyph: "😍" },
  { name: "skull", glyph: "💀" },
  { name: "wave", glyph: "👋" },
  { name: "ok_hand", glyph: "👌" },
  { name: "raised_hands", glyph: "🙌" },
  { name: "muscle", glyph: "💪" },
  { name: "star", glyph: "⭐" },
  { name: "blue_heart", glyph: "💙" },
  { name: "purple_heart", glyph: "💜" },
  { name: "white_heart", glyph: "🤍" },
  { name: "partying_face", glyph: "🥳" },
  { name: "melting_face", glyph: "🫠" },
  { name: "saluting_face", glyph: "🫡" },
  { name: "warning", glyph: "⚠️" },
  { name: "zzz", glyph: "💤" },
  { name: "coffee", glyph: "☕" },
  { name: "pizza", glyph: "🍕" },
  { name: "beer", glyph: "🍺" },
  { name: "check", glyph: "✔️" },
  { name: "neutral_face", glyph: "😐" },
  { name: "rage", glyph: "😡" },
  { name: "poop", glyph: "💩" },
  { name: "clown", glyph: "🤡" },
  { name: "eyes_see", glyph: "👁️" },
];

let customEmoji: EmojiCandidate[] = [];
let emojiLoader: (() => void) | null = null;
let emojiScope = "";
let emojiReady = "";

export function setCustomEmojis(list: EmojiCandidate[]) {
  customEmoji = list.filter((item) => item.name && item.id);
}

export function bindEmojiLoader(fn: (() => void) | null, scope = "") {
  emojiLoader = fn;
  if (scope !== emojiScope) {
    emojiScope = scope;
    emojiReady = "";
  }
}

/** Ask the host to refresh guild emoji. A repeat for the same server is a no-op. */
export function requestEmojiCatalog() {
  if (!emojiLoader) return;
  if (emojiReady === emojiScope && emojiScope) return;
  emojiReady = emojiScope || "pending";
  emojiLoader();
}

export function emojiCandidates(): EmojiCandidate[] {
  return [...UNICODE_EMOJI, ...customEmoji];
}

export function emojiHits(query: string, limit = 8): { token: string; label: string; hint: string }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const ranked = emojiCandidates().filter((item) => item.name.toLowerCase().includes(needle));
  ranked.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
    return aPrefix - bPrefix || a.name.localeCompare(b.name);
  });
  return ranked.slice(0, limit).map((item) => {
    if (item.id) {
      const token = `<${item.animated ? "a" : ""}:${item.name}:${item.id}>`;
      return { token, label: `:${item.name}:`, hint: "Server emoji" };
    }
    return { token: item.glyph ?? `:${item.name}:`, label: `:${item.name}:`, hint: item.glyph ?? "Emoji" };
  });
}

/** Discord replaces :shortcode: before the message is sent. */
export function expandShortcodes(text: string): string {
  return text.replace(/:([a-zA-Z0-9_]{2,32}):/g, (all, name: string) => {
    const custom = customEmoji.find((item) => item.name === name && item.id);
    if (custom?.id) return `<${custom.animated ? "a" : ""}:${custom.name}:${custom.id}>`;
    const glyph = UNICODE_EMOJI.find((item) => item.name === name)?.glyph;
    return glyph ?? all;
  });
}
