/** Cells for the custom-status emoji grid. Server emoji stay out unless Nitro allows them. */

export interface ServerEmoji {
  id: string;
  name: string;
  animated?: boolean;
}

export interface StatusEmojiCell {
  /** Button label. A glyph for Unicode, a shortcode name for a server emoji. */
  label: string;
  name: string;
  id: string | null;
  animated: boolean;
}

const SNOWFLAKE = /^\d{5,22}$/;

export function statusEmojiCells(input: {
  unicode: readonly string[];
  recent: readonly string[];
  server: readonly ServerEmoji[];
  allowServer: boolean;
  query: string;
  unicodeLimit?: number;
  serverLimit?: number;
}): StatusEmojiCell[] {
  const needle = input.query.trim().toLowerCase();
  const unicodeLimit = input.unicodeLimit ?? 16;
  const serverLimit = input.serverLimit ?? 48;
  const ranked = input.recent.filter((emoji) => emoji && !emoji.includes(":"));
  const glyphs = [...ranked, ...input.unicode.filter((emoji) => !ranked.includes(emoji))];
  const cells: StatusEmojiCell[] = [];
  for (const glyph of glyphs) {
    if (needle && !glyph.toLowerCase().includes(needle)) continue;
    cells.push({ label: glyph, name: glyph, id: null, animated: false });
    if (cells.length >= unicodeLimit) break;
  }
  if (!input.allowServer) return cells;
  let serverCount = 0;
  for (const emoji of input.server) {
    const name = emoji.name.trim();
    const id = emoji.id.trim();
    if (!name || !SNOWFLAKE.test(id)) continue;
    if (needle && !name.toLowerCase().includes(needle)) continue;
    cells.push({ label: name, name, id, animated: Boolean(emoji.animated) });
    serverCount += 1;
    if (serverCount >= serverLimit) break;
  }
  return cells;
}

/** Gateway fields for one picked cell. A server emoji keeps its id. */
export function statusEmojiPayload(cell: Pick<StatusEmojiCell, "name" | "id" | "animated">): {
  name: string;
  id: string | null;
  animated: boolean;
} {
  const name = [...cell.name].filter((ch) => ch >= " " && ch !== "\u007f").slice(0, 32).join("").trim();
  const id = cell.id && SNOWFLAKE.test(cell.id) ? cell.id : null;
  return { name, id, animated: Boolean(id && cell.animated) };
}
