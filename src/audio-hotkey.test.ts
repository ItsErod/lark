import { describe, expect, it } from "vitest";
import { takeAudioHotkey } from "./audio-hotkey";

describe("HUD mute hotkey", () => {
  it("keeps the first of a global shortcut and a keydown", () => {
    const first = takeAudioHotkey(0, 1_000);
    expect(first).toEqual({ allow: true, at: 1_000 });
    expect(takeAudioHotkey(first.at, 1_100)).toEqual({ allow: false, at: 1_000 });
    expect(takeAudioHotkey(first.at, 1_250)).toEqual({ allow: true, at: 1_250 });
  });
});
