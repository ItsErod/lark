export type DownloadScope = "voice" | "all";
export type OriginalAction = "both" | "open" | "download";

const SIZE_KEYS = ["width", "height", "size", "format"];

export function downloadScope(value: unknown): DownloadScope {
  return value === "all" ? "all" : "voice";
}

export function originalAction(value: unknown): OriginalAction {
  if (value === "open" || value === "download") return value;
  return "both";
}

export function downloadName(name: string, fallback = "download"): string {
  const clean = name.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || fallback;
}

export function nameFromUrl(url: string, fallback: string): string {
  try {
    const leaf = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return downloadName(leaf, fallback);
  } catch {
    return downloadName(fallback, "download");
  }
}

export function voiceMessageName(name: string): boolean {
  return /voice[-_ ]?message/i.test(name) || /\.(ogg|opus)$/i.test(name);
}

/** Voice messages are audio. "All" also covers the other attachment kinds. */
export function offerDownload(kind: string, name: string, scope: DownloadScope): boolean {
  if (scope === "all") return kind === "audio" || kind === "video" || kind === "file" || kind === "image";
  return kind === "audio" || voiceMessageName(name);
}

/**
 * Full-size image URL. Discord's media proxy adds width and height for the
 * preview. Those are removed. The host and the expiry query stay, so a signed
 * link still works.
 */
export function originalImageUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const discord = host === "cdn.discordapp.com" || host === "media.discordapp.net";
  const imagePath = /\.(png|jpe?g|gif|webp|avif)$/i.test(parsed.pathname);
  if (!discord && !imagePath) return null;
  for (const key of SIZE_KEYS) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function originalLabel(action: OriginalAction): string {
  if (action === "download") return "Download";
  if (action === "open") return "Full size";
  return "Original";
}
