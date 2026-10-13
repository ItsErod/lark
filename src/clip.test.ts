import { describe, expect, it } from "vitest";
import {
  bytesFromBase64,
  clipBehaviorNote,
  CLIP_FPS_OPTIONS,
  CLIP_HOTKEY,
  CLIP_RESOLUTION_OPTIONS,
  clipsDirHint,
  DEFAULT_CLIP_FPS,
  DEFAULT_CLIP_RESOLUTION,
  sanitizeClipBuffer,
  sanitizeClipFps,
  sanitizeClipResolution,
} from "./clip";
import { defaultConfig } from "./config";
import { shortcutConflicts } from "./shortcuts";

describe("clips", () => {
  it("documents a local rolling buffer and does not promise an upload", () => {
    for (const os of ["macos", "windows", "linux"] as const) {
      const note = clipBehaviorNote(os);
      expect(note).toContain("30 seconds");
      expect(note).toContain("15 seconds");
      expect(note).toContain("2 minutes");
      expect(note).toContain("microphone");
      expect(note).toContain("Overwatch 2");
      expect(note).toContain("Deadlock");
      expect(note).toContain("does not hook");
      expect(note).toContain("gallery");
      expect(note).toContain("Share sends");
      expect(note).toContain("screen share");
      expect(note).toContain("Game Mode");
      expect(note).toContain("clips folder");
      expect(note).toContain("MP4");
      expect(note).toContain("H.264");
      expect(note).toContain("AAC");
      expect(note).toContain("moov");
      expect(note).toContain("1440p");
      expect(note).toContain("60 fps");
      expect(note).toContain("720p");
      expect(note).toContain("1080p");
      expect(note).toContain("2160p");
      expect(note).toContain("120");
      expect(note).toContain("240");
      expect(note).toContain("HEVC is not saved");
      expect(note).toContain("WebView2");
      expect(note).toContain("caps");
      expect(note).toContain("5 frames");
      expect(note).toContain("960");
      expect(note).toContain("10 MB");
      expect(note).toContain("50 MB");
      expect(note).toContain("500 MB");
      expect(note).toContain("always");
      expect(note).toContain("ask");
      expect(note).toContain("never");
      expect(note).not.toContain("refuses a file over 8 MB");
      expect(note).toContain("Nothing is uploaded");
      expect(note).toContain("no system replay");
      expect(note).toContain("packet ring");
      expect(note).not.toContain("not while the rolling buffer");
    }
    expect(clipBehaviorNote("macos")).toContain("Screen Recording");
    expect(clipBehaviorNote("macos")).toContain("VideoToolbox");
    expect(clipBehaviorNote("macos")).toContain("ScreenCaptureKit");
    expect(clipBehaviorNote("windows")).toContain("DXGI");
    expect(clipBehaviorNote("windows")).toContain("Windows Graphics Capture");
    expect(clipBehaviorNote("windows")).toContain("Media Foundation");
    expect(clipBehaviorNote("windows")).not.toContain("Screen Recording");
  });

  it("defaults to 1440p at 60 fps and snaps other values", () => {
    expect(DEFAULT_CLIP_FPS).toBe(60);
    expect(DEFAULT_CLIP_RESOLUTION).toBe(1440);
    expect(CLIP_FPS_OPTIONS).toEqual([60, 120, 240]);
    expect(CLIP_RESOLUTION_OPTIONS).toEqual([720, 1080, 1440, 2160]);
    expect(sanitizeClipFps(240)).toBe(240);
    expect(sanitizeClipFps(90)).toBe(60);
    expect(sanitizeClipResolution(2160)).toBe(2160);
    expect(sanitizeClipResolution(480)).toBe(1440);
    expect(defaultConfig().clips.fps).toBe(60);
    expect(defaultConfig().clips.resolution).toBe(1440);
    expect(defaultConfig().clips.buffer_sec).toBe(30);
    expect(sanitizeClipBuffer(120)).toBe(120);
    expect(sanitizeClipBuffer(45)).toBe(30);
  });

  it("puts clips next to the config directory", () => {
    expect(clipsDirHint("macos")).toBe("~/Library/Application Support/dev.lark.desktop/clips");
    expect(clipsDirHint("windows")).toBe("%APPDATA%\\dev.lark.desktop\\clips");
  });

  it("ships a global clip hotkey that does not collide", () => {
    const shortcuts = defaultConfig().shortcuts;
    expect(shortcuts.save_clip).toBe(CLIP_HOTKEY);
    expect(shortcutConflicts(shortcuts)).toEqual([]);
    expect(defaultConfig().clips.game_capture).toBe(false);
  });

  it("decodes a clip payload", () => {
    expect(Array.from(bytesFromBase64(btoa("AVI")))).toEqual([65, 86, 73]);
  });
});
