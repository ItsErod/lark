/** Copy an emoji or sticker onto a server the user manages. The host performs the upload. */

export const MANAGE_EXPRESSIONS = 1n << 30n;
export const CREATE_EXPRESSIONS = 1n << 43n;
export const ADMINISTRATOR = 1n << 3n;
const MAX_EMOJI_BYTES = 256 * 1024;
const MAX_STICKER_BYTES = 512 * 1024;

export function canCloneTo(access: { owner: boolean; permissions: string } | null | undefined): boolean {
  if (!access) return false;
  if (access.owner) return true;
  let bits = 0n;
  try {
    bits = BigInt(access.permissions || "0");
  } catch {
    return false;
  }
  if (bits < 0n) return false;
  return (bits & ADMINISTRATOR) !== 0n || (bits & MANAGE_EXPRESSIONS) !== 0n || (bits & CREATE_EXPRESSIONS) !== 0n;
}

export function cloneTargets(
  guilds: readonly { id: string; name: string }[],
  access: Readonly<Record<string, { owner: boolean; permissions: string } | undefined>>,
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const guild of guilds) {
    if (!canCloneTo(access[guild.id])) continue;
    out.push({ id: guild.id, name: guild.name });
    if (out.length >= 40) break;
  }
  return out;
}

export function discordMedia(url: string): { kind: "emoji" | "sticker"; id: string; animated: boolean } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.hostname !== "cdn.discordapp.com" && parsed.hostname !== "media.discordapp.net") return null;
  const emoji = /^\/emojis\/(\d{5,22})\.(gif|webp|png)$/.exec(parsed.pathname);
  if (emoji) return { kind: "emoji", id: emoji[1], animated: emoji[2] === "gif" };
  const sticker = /^\/stickers\/(\d{5,22})\.(gif|png|webp)$/.exec(parsed.pathname);
  if (sticker) return { kind: "sticker", id: sticker[1], animated: sticker[2] === "gif" };
  return null;
}

export function emojiName(raw: string): string | null {
  const name = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
  if (name.length < 2) return null;
  return name;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function emojiCloneBody(name: string, bytes: Uint8Array, animated: boolean): { name: string; image: string } | { error: string } {
  const clean = emojiName(name);
  if (!clean) return { error: "That emoji needs a name of 2 to 32 letters." };
  if (!bytes.length || bytes.length > MAX_EMOJI_BYTES) return { error: "Emoji files have to be under 256 KB." };
  const mime = animated ? "image/gif" : "image/png";
  return { name: clean, image: `data:${mime};base64,${bytesToBase64(bytes)}` };
}

export function stickerCloneRequest(
  guildId: string,
  name: string,
  bytes: Uint8Array,
  animated: boolean,
): { request: Record<string, unknown> } | { error: string } {
  if (!/^\d{5,22}$/.test(guildId)) return { error: "Pick a server you manage." };
  const clean = emojiName(name);
  if (!clean) return { error: "That sticker needs a name of 2 to 32 letters." };
  if (!bytes.length || bytes.length > MAX_STICKER_BYTES) return { error: "Sticker files have to be under 512 KB." };
  return {
    request: {
      op: "create_sticker",
      guildId,
      body: { name: clean, description: "Added from another server", tags: "smile" },
      fileName: animated ? "sticker.gif" : "sticker.png",
      fileMime: animated ? "image/gif" : "image/png",
      fileBase64: bytesToBase64(bytes),
    },
  };
}
