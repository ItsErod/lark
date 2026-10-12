const SHOWN = new Set(["text", "voice", "announcement", "forum", "stage", "media", "thread"]);

/** Channels the viewer cannot open. Categories are skipped. */
export function unseenChannels<T extends { id: string; kind: string; position: number; name: string }>(
  channels: readonly T[],
  canSee: (channel: T) => boolean,
): T[] {
  return channels
    .filter((channel) => SHOWN.has(channel.kind) && !canSee(channel))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
