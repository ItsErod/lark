import { describe, expect, it } from "vitest";
import { applyVoiceState, applyUserMix, replaceGuildVoice, setSpeaking, type VoiceRoster } from "./voice";
import { voiceHudFrame } from "./voice-hud";

const guild = "100000000000000010";
const booth = "100000000000000026";

function session(patch: { muted?: boolean; deafened?: boolean; selfId?: string } = {}) {
  return {
    guildId: guild,
    channelId: booth,
    name: "Studio booth",
    status: "connected" as const,
    muted: patch.muted ?? false,
    deafened: patch.deafened ?? false,
    selfId: patch.selfId ?? "1",
  };
}

describe("voice HUD", () => {
  it("is idle when you are not in a call", () => {
    const roster: VoiceRoster = {};
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "3", name: "Jonah" });
    expect(voiceHudFrame(roster, null)).toMatchObject({ inCall: false, status: "idle", people: [] });
  });

  it("pins you first and keeps a muted person from looking like they are talking", () => {
    const roster: VoiceRoster = {};
    replaceGuildVoice(roster, guild, [
      { guildId: guild, channelId: booth, userId: "3", name: "Jonah" },
      { guildId: guild, channelId: booth, userId: "2", name: "Maya", selfMute: true },
      { guildId: guild, channelId: booth, userId: "1", name: "Ethan" },
    ]);
    setSpeaking(roster, "3", true);
    setSpeaking(roster, "2", true);
    setSpeaking(roster, "1", true);
    const frame = voiceHudFrame(roster, session({ muted: true }));
    expect(frame.inCall).toBe(true);
    expect(frame.channel).toBe("Studio booth");
    expect(frame.people.map((person) => person.name)).toEqual(["Ethan", "Jonah", "Maya"]);
    expect(frame.people[0]).toMatchObject({ muted: true, speaking: false });
    expect(frame.people[1]).toMatchObject({ speaking: true, muted: false });
    expect(frame.people[2]).toMatchObject({ muted: true, speaking: false });
    expect(frame.selfMuted).toBe(true);
  });

  it("treats deafen as mute and caps the list", () => {
    const roster: VoiceRoster = {};
    const states = Array.from({ length: 10 }, (_, index) => ({
      guildId: guild,
      channelId: booth,
      userId: String(index + 1),
      name: `Person ${String(index + 1).padStart(2, "0")}`,
    }));
    replaceGuildVoice(roster, guild, states);
    setSpeaking(roster, "4", true);
    const frame = voiceHudFrame(roster, session({ selfId: "1", deafened: true }));
    expect(frame.people).toHaveLength(8);
    expect(frame.extra).toBe(2);
    expect(frame.people[0]).toMatchObject({ userId: "1", muted: true, deafened: true, speaking: false });
    expect(frame.people.some((person) => person.userId === "4" && person.speaking)).toBe(true);
    expect(frame.selfDeafened).toBe(true);
  });

  it("treats a local mute as silence on the HUD", () => {
    const roster: VoiceRoster = {};
    applyVoiceState(roster, { guildId: guild, channelId: booth, userId: "3", name: "Jonah" });
    setSpeaking(roster, "3", true);
    applyUserMix(roster, "3", { volume: 100, muted: true });
    const frame = voiceHudFrame(roster, session());
    expect(frame.people.find((person) => person.userId === "3")).toMatchObject({ muted: true, speaking: false });
  });
});
