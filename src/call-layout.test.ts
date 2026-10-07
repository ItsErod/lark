import { describe, expect, it } from "vitest";
import {
  CALL_STRIP_KEY,
  PIP_GAP,
  PIP_HEIGHT,
  PIP_WIDTH,
  STRIP_HEIGHT,
  callChrome,
  clampSplitRatio,
  dismissCallSurface,
  intersects,
  leadMedia,
  nearestPipCorner,
  pipAnchors,
  pipPoint,
  readPipCorner,
  readSplitRatio,
  readStripOpen,
  stripPeople,
  stripWindow,
  toggleCallHotkey,
  voiceChannelAction,
} from "./call-layout";

describe("call layout", () => {
  it("joins a voice channel without opening the call or leaving the text channel", () => {
    expect(voiceChannelAction({ joinedThisChannel: false, surface: "chat" })).toEqual({ join: true, surface: "chat" });
    expect(voiceChannelAction({ joinedThisChannel: false, surface: "split" })).toEqual({ join: true, surface: "split" });
    expect(callChrome({ inCall: true, surface: "chat", stripOpen: false, hasMedia: false })).toEqual({
      messages: true,
      composer: true,
      grid: "hidden",
      stripPx: 0,
      pip: false,
      members: true,
    });
  });

  it("opens the grid from the channel, the hotkey, or a dismiss back to chat", () => {
    expect(voiceChannelAction({ joinedThisChannel: true, surface: "chat" })).toEqual({ join: false, surface: "split" });
    expect(voiceChannelAction({ joinedThisChannel: true, surface: "split" })).toEqual({ join: false, surface: "chat" });
    expect(voiceChannelAction({ joinedThisChannel: true, surface: "popout" })).toEqual({ join: false, surface: "chat" });
    expect(toggleCallHotkey(true, "chat")).toBe("split");
    expect(toggleCallHotkey(true, "split")).toBe("chat");
    expect(toggleCallHotkey(true, "popout")).toBe("chat");
    expect(toggleCallHotkey(false, "chat")).toBe("chat");
    expect(dismissCallSurface()).toBe("chat");
  });

  it("remembers a collapsed strip as zero height and an expanded strip as one row", () => {
    expect(CALL_STRIP_KEY).toBe("lark.call.strip");
    expect(readStripOpen(null)).toBe(false);
    expect(readStripOpen("0")).toBe(false);
    expect(readStripOpen("1")).toBe(true);
    expect(callChrome({ inCall: true, surface: "chat", stripOpen: false, hasMedia: false }).stripPx).toBe(0);
    expect(callChrome({ inCall: true, surface: "chat", stripOpen: true, hasMedia: false }).stripPx).toBe(STRIP_HEIGHT);
    expect(callChrome({ inCall: false, surface: "chat", stripOpen: true, hasMedia: false }).stripPx).toBe(0);
    const people = stripPeople([
      { id: "2", name: "Maya", self: false, speaking: false },
      { id: "1", name: "Ethan", self: true, speaking: false },
      { id: "3", name: "Jonah", self: false, speaking: true },
    ]);
    expect(people.map((person) => person.name)).toEqual(["Ethan", "Jonah", "Maya"]);
    expect(stripWindow(people, 2)).toEqual({ shown: people.slice(0, 2), extra: 1 });
  });

  it("puts the grid in a split or another window and never in place of the transcript", () => {
    expect(callChrome({ inCall: true, surface: "split", stripOpen: false, hasMedia: true })).toMatchObject({
      messages: true,
      composer: true,
      grid: "split",
      pip: false,
    });
    expect(callChrome({ inCall: true, surface: "popout", stripOpen: true, hasMedia: true })).toMatchObject({
      messages: true,
      composer: true,
      grid: "window",
      pip: false,
      stripPx: STRIP_HEIGHT,
    });
    expect(clampSplitRatio(0)).toBe(0.28);
    expect(clampSplitRatio(0.9)).toBe(0.62);
    expect(clampSplitRatio(Number.NaN)).toBe(0.42);
    expect(readSplitRatio(null)).toBe(0.42);
    expect(readSplitRatio("0.5")).toBe(0.5);
  });

  it("prefers a stream tile for picture-in-picture and keeps it off the composer", () => {
    expect(leadMedia([
      { kind: "avatar", key: "a" },
      { kind: "video", key: "v" },
      { kind: "screen", key: "s" },
    ])).toMatchObject({ kind: "screen", key: "s" });
    expect(leadMedia([{ kind: "avatar", key: "a" }, { kind: "video", key: "v" }])).toMatchObject({ kind: "video" });
    expect(leadMedia([{ kind: "avatar", key: "a" }])).toBeNull();
    expect(callChrome({ inCall: true, surface: "chat", stripOpen: false, hasMedia: true }).pip).toBe(true);
    expect(callChrome({ inCall: true, surface: "split", stripOpen: false, hasMedia: true }).pip).toBe(false);

    const frame = { x: 300, y: 48, width: 760, height: 760 };
    const composer = { x: 300, y: 680, width: 760, height: 120 };
    const size = { width: PIP_WIDTH, height: PIP_HEIGHT };
    expect(readPipCorner(null)).toBe("bottom-right");
    expect(readPipCorner("top-left")).toBe("top-left");
    expect(readPipCorner("middle")).toBe("bottom-right");
    for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
      const point = pipPoint(corner, frame, composer, size);
      const pip = { ...point, width: size.width, height: size.height };
      expect(intersects(pip, composer)).toBe(false);
      expect(pip.y + pip.height).toBeLessThanOrEqual(composer.y - PIP_GAP + 0.01);
      expect(pip.x).toBeGreaterThanOrEqual(frame.x);
      expect(pip.x + pip.width).toBeLessThanOrEqual(frame.x + frame.width);
    }
    const anchors = pipAnchors(frame, composer, size);
    expect(nearestPipCorner({ x: anchors["top-left"].x + 4, y: anchors["top-left"].y + 4 }, anchors)).toBe("top-left");
    expect(nearestPipCorner(anchors["bottom-right"], anchors)).toBe("bottom-right");
  });
});
