export interface ClipStamp {
  name: string;
  modifiedMs: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return cleanId(url.pathname.split("/").filter(Boolean)[0] ?? "");
  if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) return null;
  if (host !== "youtube.com" && host !== "www.youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com" && host !== "www.youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return cleanId(url.searchParams.get("v") ?? "");
  const parts = url.pathname.split("/").filter(Boolean);
  if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1]) return cleanId(parts[1]);
  return null;
}

export function youtubeFromEmbed(embed: { url?: string | null; video?: string | null }): string | null {
  return youtubeId(embed.url ?? "") ?? youtubeId(embed.video ?? "");
}

/** Built only after the viewer asks for the mini player. */
export function youtubePlayerUrl(id: string, muted: boolean): string | null {
  const clean = cleanId(id);
  if (!clean) return null;
  return `https://www.youtube-nocookie.com/embed/${clean}?autoplay=1&mute=${muted ? "1" : "0"}&playsinline=1`;
}

export function pipSize(value: string): "small" | "medium" {
  return value === "medium" ? "medium" : "small";
}

export function pipBox(size: string): { width: number; height: number } {
  return pipSize(size) === "medium" ? { width: 480, height: 270 } : { width: 320, height: 180 };
}

export function pipStart(value: string): "muted" | "sound" {
  return value === "sound" ? "sound" : "muted";
}

export const CLIP_SHARE_KEYS = ["mod+shift+x", "mod+shift+k", "mod+alt+x"] as const;
export type ClipShareKey = (typeof CLIP_SHARE_KEYS)[number];

export function clipShareKey(value: string): ClipShareKey {
  return (CLIP_SHARE_KEYS as readonly string[]).includes(value) ? (value as ClipShareKey) : "mod+shift+x";
}

export function newestClip<T extends ClipStamp>(clips: readonly T[]): T | null {
  let best: T | null = null;
  for (const clip of clips) {
    if (!Number.isFinite(clip.modifiedMs)) continue;
    if (!best || clip.modifiedMs > best.modifiedMs) best = clip;
  }
  return best;
}

function cleanId(id: string): string | null {
  const bare = id.split("?")[0]?.split("&")[0] ?? "";
  return ID.test(bare) ? bare : null;
}
