import { describe, expect, it } from "vitest";
import { bytesFromBase64, clipBehaviorNote, CLIP_HOTKEY, clipsDirHint } from "./clip";
import { defaultConfig } from "./config";
import { shortcutConflicts } from "./shortcuts";

describe("clips", () => {
  it("documents a local rolling buffer and does not promise an upload", () => {
    for (const os of ["macos", "windows", "linux"] as const) {
      const note = clipBehaviorNote(os);
      expect(note).toContain("30 seconds");
      expect(note).toContain("screen share");
      expect(note).toContain("Game Mode");
      expect(note).toContain("clips folder");
      expect(note).toContain("MP4");
      expect(note).toContain("H.264");
      expect(note).toContain("AAC");
      expect(note).toContain("moov");
      expect(note).toContain("5 frames");
      expect(note).toContain("960");
      expect(note).toContain("8 MB");
      expect(note).toContain("Nothing is uploaded");
      expect(note).toContain("no system replay");
      expect(note).toContain("not while the rolling buffer");
    }
    expect(clipBehaviorNote("macos")).toContain("Screen Recording");
    expect(clipBehaviorNote("macos")).toContain("VideoToolbox");
    expect(clipBehaviorNote("windows")).toContain("GDI");
    expect(clipBehaviorNote("windows")).toContain("Media Foundation");
    expect(clipBehaviorNote("windows")).not.toContain("Screen Recording");
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
