import { describe, expect, it } from "vitest";
import { applyVoiceState, applyUserMix, hydrateMix, participantsIn, playbackVolume, replaceGuildVoice, setSpeaking, setVolume, type VoiceRoster } from "./voice";

const guild = "100000000000000010";
const booth = "100000000000000026";
const other = "100000000000000099";

describe("voice roster", () => {
  it("shows people already in a channel and drops them when they leave", () => {
    const roster: VoiceRoster = {};
    replaceGuildVoice(roster, guild, [
      { guildId: guild, channelId: booth, userId: "2", name: "Maya", selfMute: true, avatarUrl: "https://cdn.discordapp.com/avatars/2/a.png" },
      { guildId: guild, channelId: booth, userId: "3", name: "Jonah", selfDeaf: true },
      { guildId: guild, channelId: other, userId: "4", name: "Priya" },
    ]);
    expect(participantsIn(roster, guild, booth).map((person) => person.name)).toEqual(["Maya", "Jonah"]);
    expect(participantsIn(roster, guild, booth)[0].selfMute).toBe(true);
    expect(participantsIn(roster, guild, booth)[0].avatarUrl).toContain("avatars/2");
    expect(participantsIn(roster, guild, booth)[1].selfDeaf).toBe(true);
    applyVoiceState(roster, { guildId: guild, channelId: "", userId: "2" });
    expect(participantsIn(roster, guild, booth).map((person) => person.userId)).toEqual(["3"]);
    expect(participantsIn(roster, guild, other)).toHaveLength(1);
  });

  it("moves a person between channels and keeps speaking, volume, and a known name", () => {
    const roster: VoiceRoster = {};
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "3", name: "Jonah", avatarUrl: "https://cdn.example/j.png" });
    setSpeaking(roster, "3", true);
    setVolume(roster, "3", 80);
    applyVoiceState(roster, { guildId: guild, channelId: other, userId: "3", name: "Someone" });
    const moved = participantsIn(roster, guild, other)[0];
    expect(moved.name).toBe("Jonah");
    expect(moved.speaking).toBe(true);
    expect(moved.volume).toBe(80);
    expect(moved.avatarUrl).toContain("cdn.example");
    expect(participantsIn(roster, guild, booth)).toHaveLength(0);
    replaceGuildVoice(roster, guild, [{ guildId: guild, channelId: booth, userId: "3", name: "" }]);
    const kept = participantsIn(roster, guild, booth)[0];
    expect(kept.name).toBe("Jonah");
    expect(kept.speaking).toBe(true);
    expect(kept.sharing).toBe(false);
    expect(kept.volume).toBe(80);
    expect(participantsIn(roster, guild, other)).toHaveLength(0);
  });

  it("keeps a local mute separate from the volume slider", () => {
    const roster: VoiceRoster = {};
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "2", name: "Maya" });
    applyUserMix(roster, "2", { volume: 80, muted: true });
    expect(playbackVolume(80, true)).toBe(0);
    expect(playbackVolume(80, false)).toBe(80);
    const person = participantsIn(roster, guild, booth)[0];
    expect(person.volume).toBe(80);
    expect(person.localMuted).toBe(true);
    replaceGuildVoice(roster, guild, [{ guildId: guild, channelId: other, userId: "2", name: "Someone" }]);
    const moved = participantsIn(roster, guild, other)[0];
    expect(moved.volume).toBe(80);
    expect(moved.localMuted).toBe(true);
    applyVoiceState(roster, { guildId: guild, channelId: other, userId: "2", sharing: true, streamLabel: "LIVE" });
    expect(participantsIn(roster, guild, other)[0]).toMatchObject({ sharing: true, video: false, streamLabel: "LIVE" });
    replaceGuildVoice(roster, guild, [{ guildId: guild, channelId: booth, userId: "2", name: "Maya" }]);
    expect(participantsIn(roster, guild, booth)[0]).toMatchObject({ sharing: true, streamLabel: "LIVE", localMuted: true });
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "2", streamLabel: "" });
    expect(participantsIn(roster, guild, booth)[0].streamLabel).toBeUndefined();
    hydrateMix(roster, { "2": { volume: 40, muted: false } });
    expect(participantsIn(roster, guild, booth)[0]).toMatchObject({ volume: 40, localMuted: false, sharing: true });
  });

  it("keeps a Go Live flag until a voice state clears it", () => {
    const roster: VoiceRoster = {};
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "2", name: "Maya", selfStream: true });
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "2", name: "Maya" });
    expect(participantsIn(roster, guild, booth)[0].sharing).toBe(true);
    replaceGuildVoice(roster, guild, [{ guildId: guild, channelId: booth, userId: "2", name: "Maya" }]);
    expect(participantsIn(roster, guild, booth)[0].sharing).toBe(true);
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "2", name: "Maya", selfStream: false });
    expect(participantsIn(roster, guild, booth)[0].sharing).toBe(false);
  });
});
