import { describe, expect, it } from "vitest";
import { applyVoiceState, participantsIn, replaceGuildVoice, setSpeaking, setVolume, type VoiceRoster } from "./voice";

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
    expect(kept.volume).toBe(80);
    expect(participantsIn(roster, guild, other)).toHaveLength(0);
  });
});
