import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import {
  DISCORD_SPEAK_GREEN,
  signalBars,
  signalLabel,
  speakColor,
  speakingMotion,
  stageTiles,
  voiceBadges,
  type StageMember,
} from "./voice-stage";

function member(patch: Partial<StageMember> & Pick<StageMember, "id" | "name">): StageMember {
  return {
    avatarUrl: null,
    speaking: false,
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    localMuted: false,
    volume: 100,
    self: false,
    video: false,
    sharing: false,
    ...patch,
  };
}

describe("voice stage", () => {
  it("leads with screen and camera tiles, then avatars, you first", () => {
    const tiles = stageTiles([
      member({ id: "3", name: "Jonah", speaking: true }),
      member({ id: "2", name: "Maya", selfMute: true, speaking: true, volume: 80, localMuted: false }),
      member({ id: "1", name: "Ethan", self: true, video: true, sharing: true }),
    ]);
    expect(tiles.map((tile) => `${tile.kind}:${tile.name}`)).toEqual([
      "screen:Ethan's screen",
      "video:Ethan",
      "avatar:Jonah",
      "avatar:Maya",
    ]);
    expect(tiles[0]).toMatchObject({ userId: "1", speaking: false, mixable: false });
    expect(tiles[2]).toMatchObject({ speaking: true, muted: false, mixable: true, volume: 100 });
    expect(tiles[3]).toMatchObject({ speaking: false, muted: true, volume: 80, mixable: true });
  });

  it("treats deafen and a local mute as silence", () => {
    expect(voiceBadges({
      speaking: true,
      selfMute: false,
      selfDeaf: true,
      serverMute: false,
      serverDeaf: false,
      localMuted: false,
    })).toEqual({ speaking: false, muted: true, deafened: true });
    expect(voiceBadges({
      speaking: true,
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      localMuted: true,
    })).toEqual({ speaking: false, muted: true, deafened: false });
    const tiles = stageTiles([
      member({ id: "4", name: "Priya", speaking: true, serverDeaf: true }),
      member({ id: "2", name: "Maya", speaking: true, localMuted: true, volume: 40 }),
    ]);
    expect(tiles.find((tile) => tile.userId === "4")).toMatchObject({ deafened: true, muted: true, speaking: false });
    expect(tiles.find((tile) => tile.userId === "2")).toMatchObject({ localMuted: true, muted: true, speaking: false, volume: 40 });
  });

  it("maps the call status onto signal bars", () => {
    expect(signalBars("connected")).toBe(3);
    expect(signalBars("connecting")).toBe(2);
    expect(signalBars("reconnecting")).toBe(1);
    expect(signalLabel(3)).toBe("Signal strong");
    expect(signalLabel(1)).toBe("Signal weak");
  });

  it("sweeps the ring unless Game Mode or reduced motion is on", () => {
    expect(speakingMotion(false, false)).toBe("flow");
    expect(speakingMotion(true, false)).toBe("static");
    expect(speakingMotion(false, true)).toBe("static");
  });

  it("keeps a hex speaking color and falls back to Discord green", () => {
    expect(speakColor("#C46B4A")).toBe("#c46b4a");
    expect(speakColor("red")).toBe(DISCORD_SPEAK_GREEN);
    expect(speakColor("#fff")).toBe(DISCORD_SPEAK_GREEN);
    expect(speakColor(null)).toBe(DISCORD_SPEAK_GREEN);
    const config = sanitizeConfig({ voice: { speak_color: "#C46B4A" } });
    expect(config.voice.speak_color).toBe("#c46b4a");
    expect(sanitizeConfig({ voice: { speak_color: "nope" } }).voice.speak_color).toBe(DISCORD_SPEAK_GREEN);
    expect(sanitizeConfig({}).voice.speak_color).toBe(DISCORD_SPEAK_GREEN);
  });
});
