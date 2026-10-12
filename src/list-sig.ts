/** FNV-1a over message fields. Stable for the same list, cheap versus joining every body. */

export interface SigMessage {
  id: string;
  content: string;
  edited?: boolean;
  embeds?: readonly unknown[];
  stickers?: readonly unknown[];
  reactions?: readonly { emoji: string; emojiId?: string | null; count: number; me?: boolean }[];
}

export function messageSignature(list: readonly SigMessage[]): string {
  let hash = 2166136261;
  for (const message of list) {
    hash = mix(hash, message.id);
    hash = mix(hash, message.content);
    hash = mix(hash, message.edited ? "1" : "0");
    hash = mix(hash, String(message.embeds?.length ?? 0));
    hash = mix(hash, String(message.stickers?.length ?? 0));
    const reactions = message.reactions;
    if (reactions) {
      for (const reaction of reactions) {
        hash = mix(hash, reaction.emoji);
        hash = mix(hash, reaction.emojiId ?? "");
        hash = mix(hash, String(reaction.count));
        hash = mix(hash, reaction.me ? "y" : "n");
      }
    }
  }
  return `${list.length}:${hash >>> 0}`;
}

function mix(hash: number, value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.imul(hash ^ 0xff, 16777619);
}
