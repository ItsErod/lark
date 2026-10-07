import type { OsName } from "./types";

/** Discord's upload limit when Nitro is not detected. */
export const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024;
export const NITRO_BASIC_LIMIT = 50 * 1024 * 1024;
export const NITRO_LIMIT = 500 * 1024 * 1024;
const AUDIO_BPS = 96_000;
const MIN_VIDEO_BPS = 64_000;
const MAX_VIDEO_BPS = 8_000_000;

export const CLIP_DRAG = "application/x-lark-clip";

export type CompressMode = "always" | "ask" | "never";
export type FitAction = "send" | "ask" | "compress" | "block";

export interface ClipCard {
  name: string;
  bytes: number;
  modifiedMs: number;
  durationMs: number;
  width: number;
  height: number;
  poster: string;
}

/** 0 none, 1 Nitro Classic, 2 Nitro, 3 Nitro Basic. */
export function uploadLimitBytes(premiumType: number | null | undefined): number {
  if (premiumType === 2) return NITRO_LIMIT;
  if (premiumType === 1 || premiumType === 3) return NITRO_BASIC_LIMIT;
  return DEFAULT_UPLOAD_LIMIT;
}

export function nitroLabel(premiumType: number | null | undefined): string {
  if (premiumType === 2) return "Nitro";
  if (premiumType === 3) return "Nitro Basic";
  if (premiumType === 1) return "Nitro Classic";
  return "this account";
}

export function parseCompressMode(value: unknown): CompressMode {
  if (value === "always" || value === "never" || value === "ask") return value;
  return "ask";
}

export function fitAction(bytes: number, limit: number, mode: CompressMode): FitAction {
  if (bytes <= limit) return "send";
  if (mode === "always") return "compress";
  if (mode === "never") return "block";
  return "ask";
}

/** Video bitrate, in bits per second, aimed under the upload limit. */
export function videoBitrate(durationMs: number, limitBytes: number): number {
  const duration = Math.max(1, durationMs);
  const usable = limitBytes * 0.92 - 32_768;
  if (usable <= 0) return MIN_VIDEO_BPS;
  const total = (usable * 8 * 1000) / duration;
  const video = total - AUDIO_BPS;
  if (video < MIN_VIDEO_BPS) return MIN_VIDEO_BPS;
  if (video > MAX_VIDEO_BPS) return MAX_VIDEO_BPS;
  return Math.round(video);
}

export function formatClipBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function formatClipDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatClipDate(modifiedMs: number): string {
  const date = new Date(modifiedMs);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function isClipFileName(name: string): boolean {
  return /^lark-clip-[A-Za-z0-9.-]{1,100}\.(avi|mp4)$/.test(name) && !name.includes("..");
}

export function clipMime(name: string): string {
  return name.endsWith(".mp4") ? "video/mp4" : "video/x-msvideo";
}

export function fittedClipName(current: string): string {
  const ext = current.endsWith(".mp4") ? ".mp4" : ".avi";
  const stem = current.slice(0, -ext.length).replace(/-fit$/, "");
  return `${stem}-fit.mp4`;
}

export function renamedClipName(current: string, label: string): string | null {
  const ext = current.endsWith(".mp4") ? "mp4" : current.endsWith(".avi") ? "avi" : "";
  if (!ext) return null;
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const name = `lark-clip-${slug}.${ext}`;
  return isClipFileName(name) ? name : null;
}

export function trimRange(durationMs: number, startSec: number, endSec: number): { startMs: number; endMs: number } | string {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return "Enter a start and end.";
  const startMs = Math.round(Math.max(0, startSec) * 1000);
  const endMs = Math.round(endSec * 1000);
  if (endMs <= startMs) return "The end has to be after the start.";
  if (durationMs > 0 && startMs >= durationMs) return "The start is past the end of the clip.";
  return { startMs, endMs: durationMs > 0 ? Math.min(endMs, durationMs) : endMs };
}

export function posterFor(name: string, title: string): string {
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const safe = title.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${hue} 28% 18%)"/><rect x="48" y="48" width="544" height="264" rx="28" fill="hsl(${hue} 32% 28%)"/><circle cx="320" cy="168" r="36" fill="none" stroke="white" stroke-width="8"/><path d="M308 148l36 20-36 20z" fill="white"/><text x="320" y="250" text-anchor="middle" fill="white" font-family="sans-serif" font-size="28">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function demoClips(): ClipCard[] {
  const booth = {
    name: "lark-clip-demo-booth.mp4",
    bytes: 18_400_000,
    modifiedMs: Date.UTC(2026, 9, 6, 15, 42, 0),
    durationMs: 28_000,
    width: 960,
    height: 540,
    poster: "",
  };
  const north = {
    name: "lark-clip-demo-northwind.mp4",
    bytes: 4_200_000,
    modifiedMs: Date.UTC(2026, 9, 3, 2, 11, 0),
    durationMs: 18_000,
    width: 960,
    height: 540,
    poster: "",
  };
  const crit = {
    name: "lark-clip-demo-crit.avi",
    bytes: 6_100_000,
    modifiedMs: Date.UTC(2026, 9, 1, 18, 4, 0),
    durationMs: 12_000,
    width: 960,
    height: 540,
    poster: "",
  };
  return [booth, north, crit].map((clip) => ({
    ...clip,
    poster: posterFor(clip.name, clip.name.replace(/^lark-clip-demo-/, "").replace(/\.(mp4|avi)$/, "")),
  }));
}

export function compressCopy(clip: ClipCard, limit: number): ClipCard {
  const name = fittedClipName(clip.name);
  const bytes = Math.min(clip.bytes, Math.floor(limit * 0.9));
  return { ...clip, name, bytes, poster: posterFor(name, "compressed") };
}

export function limitSentence(os: OsName, premiumType: number): string {
  const limit = formatClipBytes(uploadLimitBytes(premiumType));
  const where = os === "linux" ? "This preview" : "Lark";
  return `${where} uses a ${limit} upload limit for ${nitroLabel(premiumType)}. A clip over that limit can be re-encoded to H.264/AAC MP4. The original stays in the clips folder.`;
}
