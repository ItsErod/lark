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

/** How to attach a saved clip. Size follows the account tier, not a fixed 8 MB cap. */
export function clipAttachAction(bytes: number, premiumType: number | null | undefined, mode: CompressMode): FitAction {
  return fitAction(bytes, uploadLimitBytes(premiumType), mode);
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

interface Mp4Box {
  kind: string;
  start: number;
  total: number;
}

/** Why the embedded player cannot start this file. Null means an H.264 faststart MP4. */
export function clipPlaybackBlock(name: string, bytes: Uint8Array): string | null {
  if (/\.avi$/i.test(name) || isAvi(bytes)) {
    return "This clip is an AVI. The player only plays an H.264/AAC MP4.";
  }
  if (bytes.length < 16 || fourcc(bytes, 4) !== "ftyp") {
    return "This clip is not an MP4 the player can open.";
  }
  const boxes = topBoxes(bytes);
  const moov = boxes.find((item) => item.kind === "moov");
  const mdat = boxes.find((item) => item.kind === "mdat");
  if (!moov) return "This clip is missing a moov atom.";
  if (!mdat) return "This clip is missing media data.";
  if (moov.start > mdat.start) {
    return "This clip is missing faststart. The moov atom is after the media, so playback cannot start.";
  }
  const header = bytes.subarray(moov.start, moov.start + moov.total);
  const hevc = indexOfFourcc(header, "hvc1") >= 0 || indexOfFourcc(header, "hev1") >= 0;
  const avc = indexOfFourcc(header, "avc1") >= 0;
  if (hevc && !avc) {
    return "This clip is HEVC. WebView2 cannot play it. New clips are saved as H.264.";
  }
  if (!avc) return "This clip is not H.264, so the player cannot open it.";
  return null;
}

function isAvi(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && fourcc(bytes, 0) === "RIFF" && fourcc(bytes, 8) === "AVI ";
}

function fourcc(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function topBoxes(bytes: Uint8Array): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let cursor = 0;
  while (cursor + 8 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor, 8);
    let total = view.getUint32(0);
    let header = 8;
    if (total === 1 && cursor + 16 <= bytes.length) {
      const wide = new DataView(bytes.buffer, bytes.byteOffset + cursor + 8, 8);
      const big = wide.getUint32(4);
      total = big;
      header = 16;
    }
    if (total < header || cursor + total > bytes.length) break;
    boxes.push({ kind: fourcc(bytes, cursor + 4), start: cursor, total });
    cursor += total;
  }
  return boxes;
}

function indexOfFourcc(bytes: Uint8Array, tag: string): number {
  const needle = [tag.charCodeAt(0), tag.charCodeAt(1), tag.charCodeAt(2), tag.charCodeAt(3)];
  for (let index = 0; index + 4 <= bytes.length; index += 1) {
    if (bytes[index] === needle[0] && bytes[index + 1] === needle[1] && bytes[index + 2] === needle[2] && bytes[index + 3] === needle[3]) {
      return index;
    }
  }
  return -1;
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

/** Gallery title. A detected game stays readable; a bare timestamp is "Saved clip". */
export function clipDisplayTitle(name: string): string {
  const copy = /-trim\.(mp4|avi)$/i.test(name) ? " trim" : /-fit\.(mp4|avi)$/i.test(name) ? " fit" : "";
  let stem = name.replace(/^lark-clip-/i, "").replace(/\.(mp4|avi)$/i, "");
  stem = stem.replace(/-(?:fit|trim)$/i, "");
  if (/^\d{8}-\d{6}Z(?:-\d+)?$/i.test(stem)) stem = "";
  else stem = stem.replace(/-\d{8}-\d{6}Z(?:-\d+)?$/i, "");
  stem = stem.replace(/-+$/g, "");
  if (!stem) return `Saved clip${copy}`;
  const title = stem
    .split("-")
    .filter(Boolean)
    .map((word) => {
      if (/^\d+$/.test(word) || word.length === 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
  return `${title}${copy}`;
}

export interface TrimPreset {
  label: string;
  startSec: number;
  endSec: number;
}

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Short trims for the clips gallery. The full file stays the default range. */
export function trimPresets(durationMs: number): TrimPreset[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const endSec = tenth(durationMs / 1000);
  const presets: TrimPreset[] = [];
  if (endSec > 15) presets.push({ label: "Last 15s", startSec: tenth(endSec - 15), endSec });
  if (endSec > 6) presets.push({ label: "Drop first 5s", startSec: 5, endSec });
  return presets;
}

/** Keep the trim at least a tenth of a second inside the clip. */
export function clampTrim(durationSec: number, startSec: number, endSec: number, moved: "start" | "end"): { startSec: number; endSec: number } {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  let start = Number.isFinite(startSec) ? startSec : 0;
  let end = Number.isFinite(endSec) ? endSec : duration;
  const cap = duration > 0 ? duration : Math.max(end, start, 0.1);
  start = Math.min(Math.max(0, start), cap);
  end = Math.min(Math.max(0, end), cap);
  if (end - start < 0.1) {
    if (moved === "start") start = Math.max(0, end - 0.1);
    else end = Math.min(cap, start + 0.1);
    if (end - start < 0.1) {
      start = 0;
      end = Math.min(cap, Math.max(0.1, cap));
    }
  }
  return { startSec: tenth(start), endSec: tenth(end) };
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
