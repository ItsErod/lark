import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import {
  ACTIVITIES,
  DISCORD_SPEAK_GREEN,
  activityInviteBody,
  clampStageTopic,
  isStageChannel,
  messagePreview,
  raiseHand,
  signalBars,
  signalLabel,
  speakColor,
  speakingMotion,
  stageGroups,
  stageTiles,
  startStageBody,
  visibleCallTiles,
  voiceBadges,
  watchEmbedUrl,
  watchVideoId,
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
      member({ id: "1", name: "Ethan", self: true, video: true, sharing: true, streamLabel: "LIVE" }),
    ]);
    expect(tiles.map((tile) => `${tile.kind}:${tile.name}`)).toEqual([
      "screen:Ethan's screen",
      "video:Ethan",
      "avatar:Jonah",
      "avatar:Maya",
    ]);
    expect(tiles[0]).toMatchObject({ userId: "1", speaking: false, mixable: false, badge: "LIVE" });
    expect(tiles[1].badge).toBeUndefined();
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

  it("treats kind stage and raw type 13 as a stage channel", () => {
    expect(isStageChannel({ kind: "voice", discordType: 13 })).toBe(true);
    expect(isStageChannel({ kind: "stage" })).toBe(true);
    expect(isStageChannel({ kind: "voice", discordType: 2 })).toBe(false);
    const groups = stageGroups([
      { userId: "1", name: "Ethan", avatarUrl: null, suppressed: false, requestToSpeak: false, self: true, speaking: true },
      { userId: "2", name: "Maya", avatarUrl: null, suppressed: true, requestToSpeak: true, self: false, speaking: false },
      { userId: "3", name: "Jonah", avatarUrl: null, suppressed: true, requestToSpeak: false, self: false, speaking: false },
    ]);
    expect(groups.speakers.map((person) => person.name)).toEqual(["Ethan"]);
    expect(groups.requests.map((person) => person.name)).toEqual(["Maya"]);
    expect(groups.audience.map((person) => person.name)).toEqual(["Jonah"]);
    expect(raiseHand(true, "2026-10-12T18:00:00.000Z")).toEqual({
      requestToSpeakTimestamp: "2026-10-12T18:00:00.000Z",
      suppressed: true,
    });
    expect(raiseHand(false, "2026-10-12T18:00:00.000Z").requestToSpeakTimestamp).toBeNull();
    expect(clampStageTopic("  hello\nstage  ")).toBe("hello stage");
    expect(startStageBody("100000000000000026", "Town hall")).toEqual({
      channel_id: "100000000000000026",
      topic: "Town hall",
      privacy_level: 2,
    });
  });

  it("launches Watch Together from a YouTube link and hides non-video tiles", () => {
    expect(ACTIVITIES[0].name).toBe("Watch Together");
    expect(activityInviteBody(ACTIVITIES[0].id)).toMatchObject({ target_type: 2, target_application_id: ACTIVITIES[0].id });
    expect(activityInviteBody("nope")).toBeNull();
    expect(watchVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(watchVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(watchVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(watchEmbedUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    const tiles = [
      { kind: "avatar", self: false },
      { kind: "video", self: false },
      { kind: "avatar", self: true },
    ];
    expect(visibleCallTiles(tiles, false).map((tile) => tile.kind)).toEqual(["video", "avatar"]);
    expect(visibleCallTiles(tiles, true)).toHaveLength(3);
    expect(messagePreview("  hello   there  ")).toBe("hello there");
  });
});
