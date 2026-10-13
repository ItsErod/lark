import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TILES,
  tileFrames,
  tileOnScreen,
  tilePaused,
  tilesForScope,
  voiceControlLabels,
  voiceDomPlan,
} from "./dashboard-view";

describe("dashboard tiles", () => {
  it("covers chat, voice, share, the activity feed, DMs, PC stats, and friends playing", () => {
    expect([...DASHBOARD_TILES]).toEqual(["chat", "voice", "share", "feed", "dms", "pc", "playing"]);
  });

  it("pauses a tile that is hidden, off screen, or while the board is closed", () => {
    expect(tilePaused({ open: true, hidden: false, onScreen: true })).toBe(false);
    expect(tilePaused({ open: true, hidden: true, onScreen: true })).toBe(true);
    expect(tilePaused({ open: true, hidden: false, onScreen: false })).toBe(true);
    expect(tilePaused({ open: false, hidden: false, onScreen: true })).toBe(true);
  });

  it("treats a tile below the board as off screen", () => {
    expect(tileOnScreen({ top: 0, bottom: 400, height: 400 }, { top: 420, bottom: 560, width: 200 })).toBe(false);
    expect(tileOnScreen({ top: 0, bottom: 400, height: 400 }, { top: 300, bottom: 460, width: 200 })).toBe(true);
    expect(tileOnScreen({ top: 0, bottom: 0, height: 0 }, { top: 0, bottom: 20, width: 20 })).toBe(false);
  });

  it("paints chat before voice so a speaking tick cannot block the transcript", () => {
    expect(tileFrames(["chat", "voice", "share", "feed"])).toEqual({
      now: ["chat", "feed"],
      later: ["voice", "share"],
    });
    expect(tilesForScope("voice", ["chat", "voice", "share", "feed"])).toEqual(["voice", "share"]);
    expect(voiceDomPlan("a", "a", "1:0", "1:1")).toBe("speak");
    expect(voiceDomPlan("a", "b", "1:0", "1:0")).toBe("rebuild");
  });

  it("labels mute, deafen, and leave only while a call is up", () => {
    expect(voiceControlLabels(false, false, false)).toEqual(["Join"]);
    expect(voiceControlLabels(true, true, false)).toEqual(["Unmute", "Deafen", "Leave"]);
  });
});
