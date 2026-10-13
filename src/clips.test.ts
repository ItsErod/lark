import { describe, expect, it } from "vitest";
import {
  CLIP_DRAG,
  clampTrim,
  clipAttachAction,
  clipDisplayTitle,
  clipPlaybackBlock,
  compressCopy,
  DEFAULT_UPLOAD_LIMIT,
  demoClips,
  fitAction,
  fittedClipName,
  formatClipBytes,
  formatClipDate,
  formatClipDuration,
  isClipFileName,
  NITRO_LIMIT,
  parseCompressMode,
  renamedClipName,
  trimPresets,
  trimRange,
  uploadLimitBytes,
  videoBitrate,
} from "./clips";
import { defaultConfig, sanitizeConfig } from "./config";
import { commandCatalog, matchCommands } from "./palette";

describe("clip library", () => {
  it("detects Discord upload limits from the Nitro tier", () => {
    expect(uploadLimitBytes(0)).toBe(10 * 1024 * 1024);
    expect(uploadLimitBytes(undefined)).toBe(DEFAULT_UPLOAD_LIMIT);
    expect(uploadLimitBytes(1)).toBe(50 * 1024 * 1024);
    expect(uploadLimitBytes(3)).toBe(50 * 1024 * 1024);
    expect(uploadLimitBytes(2)).toBe(NITRO_LIMIT);
  });

  it("attaches an 8 MB clip and compresses only past the account tier", () => {
    const eight = 8 * 1024 * 1024;
    expect(clipAttachAction(eight, 0, "never")).toBe("send");
    expect(clipAttachAction(eight, 0, "ask")).toBe("send");
    const twelve = 12 * 1024 * 1024;
    expect(clipAttachAction(twelve, 0, "ask")).toBe("ask");
    expect(clipAttachAction(twelve, 0, "always")).toBe("compress");
    expect(clipAttachAction(twelve, 0, "never")).toBe("block");
    expect(clipAttachAction(twelve, 2, "never")).toBe("send");
    const sixty = 60 * 1024 * 1024;
    expect(clipAttachAction(sixty, 1, "always")).toBe("compress");
    expect(clipAttachAction(sixty, 3, "ask")).toBe("ask");
    expect(clipAttachAction(sixty, 2, "never")).toBe("send");
  });

  it("asks, always compresses, or refuses when a clip is over the limit", () => {
    const limit = DEFAULT_UPLOAD_LIMIT;
    expect(fitAction(limit, limit, "ask")).toBe("send");
    expect(fitAction(limit + 1, limit, "ask")).toBe("ask");
    expect(fitAction(limit + 1, limit, "always")).toBe("compress");
    expect(fitAction(limit + 1, limit, "never")).toBe("block");
    expect(parseCompressMode("always")).toBe("always");
    expect(parseCompressMode("nope")).toBe("ask");
  });

  it("picks a bitrate that fits a 30 second clip under 10 MB", () => {
    const rate = videoBitrate(30_000, DEFAULT_UPLOAD_LIMIT);
    const bytes = ((rate + 96_000) * 30) / 8;
    expect(bytes).toBeLessThan(DEFAULT_UPLOAD_LIMIT);
    expect(rate).toBeGreaterThan(1_000_000);
    expect(videoBitrate(1, DEFAULT_UPLOAD_LIMIT)).toBe(8_000_000);
  });

  it("formats the grid fields and keeps fitted names beside the original", () => {
    expect(formatClipDuration(28_000)).toBe("0:28");
    expect(formatClipBytes(18_400_000)).toBe("18 MB");
    expect(formatClipBytes(4_200_000)).toBe("4.0 MB");
    expect(formatClipDate(Date.UTC(2026, 9, 6))).toBe("Oct 6, 2026");
    expect(fittedClipName("lark-clip-demo-booth.mp4")).toBe("lark-clip-demo-booth-fit.mp4");
    expect(renamedClipName("lark-clip-demo-crit.avi", "Boss fight")).toBe("lark-clip-boss-fight.avi");
    expect(renamedClipName("lark-clip-demo.mp4", "!!!")).toBeNull();
    expect(isClipFileName("lark-clip-demo.mp4")).toBe(true);
    expect(isClipFileName("../lark-clip-demo.mp4")).toBe(false);
    expect(CLIP_DRAG).toBe("application/x-lark-clip");
  });

  it("rejects a trim that does not move forward", () => {
    expect(trimRange(12_000, 1, 4)).toEqual({ startMs: 1000, endMs: 4000 });
    expect(trimRange(12_000, 8, 4)).toMatch(/after the start/);
    expect(trimRange(12_000, 20, 22)).toMatch(/past the end/);
    expect(clampTrim(30, 28, 28.05, "end")).toEqual({ startSec: 28, endSec: 28.1 });
    expect(clampTrim(30, 10, 4, "start").endSec).toBeGreaterThan(clampTrim(30, 10, 4, "start").startSec);
  });

  it("titles a clip after the game and offers a short trim", () => {
    expect(clipDisplayTitle("lark-clip-overwatch-2-20261013-040000Z.mp4")).toBe("Overwatch 2");
    expect(clipDisplayTitle("lark-clip-grand-theft-auto-v-20261013-040000Z-2.mp4")).toBe("Grand Theft Auto V");
    expect(clipDisplayTitle("lark-clip-20261013-040000Z.mp4")).toBe("Saved clip");
    expect(clipDisplayTitle("lark-clip-demo-booth.mp4")).toBe("Demo Booth");
    expect(clipDisplayTitle("lark-clip-demo-booth-trim.mp4")).toBe("Demo Booth trim");
    expect(trimPresets(30_000)).toEqual([
      { label: "Last 15s", startSec: 15, endSec: 30 },
      { label: "Drop first 5s", startSec: 5, endSec: 30 },
    ]);
    expect(trimPresets(8_000)).toEqual([{ label: "Drop first 5s", startSec: 5, endSec: 8 }]);
    expect(trimPresets(4_000)).toEqual([]);
  });

  it("shows demo clips with duration, size, and a date, including one over the default limit", () => {
    const clips = demoClips();
    expect(clips.length).toBeGreaterThanOrEqual(3);
    for (const clip of clips) {
      expect(clip.durationMs).toBeGreaterThan(0);
      expect(clip.bytes).toBeGreaterThan(0);
      expect(clip.modifiedMs).toBeGreaterThan(0);
      expect(clip.poster.startsWith("data:image/svg+xml")).toBe(true);
      expect(isClipFileName(clip.name)).toBe(true);
    }
    const over = clips.find((clip) => clip.bytes > DEFAULT_UPLOAD_LIMIT);
    expect(over).toBeTruthy();
    const fitted = compressCopy(over!, DEFAULT_UPLOAD_LIMIT);
    expect(fitted.name).not.toBe(over!.name);
    expect(fitted.bytes).toBeLessThanOrEqual(DEFAULT_UPLOAD_LIMIT);
    expect(clips.some((clip) => clip.name === over!.name)).toBe(true);
  });

  it("plays an H.264 faststart MP4 and refuses AVI, HEVC, and a late moov", () => {
    const playable = mp4({ moov: "moov....avc1", mdatAfter: true });
    expect(clipPlaybackBlock("lark-clip-demo.mp4", playable)).toBeNull();
    expect(clipPlaybackBlock("lark-clip-demo.avi", ascii("RIFF....AVI "))).toMatch(/AVI/);
    expect(clipPlaybackBlock("lark-clip-demo.mp4", mp4({ moov: "moovhvc1....", mdatAfter: true }))).toMatch(/HEVC/);
    expect(clipPlaybackBlock("lark-clip-demo.mp4", mp4({ moov: "moov....avc1", mdatAfter: false }))).toMatch(/faststart/);
    expect(clipPlaybackBlock("lark-clip-demo.mp4", ascii("not a video"))).toMatch(/not an MP4/);
  });

  it("is reachable from the command palette and settings remember the compress mode", () => {
    expect(commandCatalog().some((item) => item.id === "clips")).toBe(true);
    expect(matchCommands("trim", commandCatalog()).some((item) => item.id === "clips")).toBe(true);
    expect(defaultConfig().clips.compress).toBe("ask");
    expect(sanitizeConfig({ clips: { game_capture: true, compress: "always" } }).clips).toEqual({
      game_capture: true,
      compress: "always",
      fps: 60,
      resolution: 1440,
      buffer_sec: 30,
    });
    expect(sanitizeConfig({ clips: { compress: "nope" } }).clips.compress).toBe("ask");
  });
});

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function mp4(options: { moov: string; mdatAfter: boolean }): Uint8Array {
  const ftyp = box("ftyp", ascii("isom"));
  const moov = box("moov", ascii(options.moov));
  const mdat = box("mdat", ascii("frame"));
  const parts = options.mdatAfter ? [ftyp, moov, mdat] : [ftyp, mdat, moov];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return bytes;
}

function box(kind: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(ascii(kind), 4);
  bytes.set(payload, 8);
  return bytes;
}
