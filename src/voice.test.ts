import { describe, expect, it } from "vitest";
import {
  applyMoreAction,
  applyUserMix,
  applyVoiceState,
  defaultCallView,
  hydrateMix,
  joinVoiceTarget,
  memberVoiceBody,
  micLevel,
  participantMenu,
  participantsIn,
  playbackVolume,
  readVoicePrefs,
  replaceGuildVoice,
  restingDesk,
  sanitizeInputProfiles,
  selectInputProfile,
  setSpeaking,
  setVolume,
  toggleDeskDeafen,
  toggleDeskMute,
  voiceChannelLink,
  voiceChannelMenu,
  voiceDetailLine,
  voiceLinkDetails,
  writeVoicePrefs,
  type VoiceRoster,
} from "./voice";

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

  it("keeps mute and deafen on the user panel with no call connected", () => {
    let desk = restingDesk();
    desk = toggleDeskMute(desk);
    expect(desk).toEqual({ muted: true, deafened: false });
    desk = toggleDeskDeafen(desk);
    expect(desk).toEqual({ muted: true, deafened: true });
    desk = toggleDeskMute(desk);
    expect(desk).toEqual({ muted: false, deafened: false });
    desk = toggleDeskDeafen(desk);
    expect(desk).toEqual({ muted: true, deafened: true });
    desk = toggleDeskDeafen(desk);
    expect(desk).toEqual({ muted: false, deafened: false });
  });

  it("joins a DM or group by channel id and a stage by raw type 13", () => {
    expect(joinVoiceTarget({ id: "100000000000000042", kind: "dm" }, guild)).toEqual({
      channelId: "100000000000000042",
      guildId: null,
      callKind: "dm",
    });
    expect(joinVoiceTarget({ id: "100000000000000043", kind: "group" }, guild)?.callKind).toBe("group");
    expect(joinVoiceTarget({ id: booth, kind: "voice" }, guild)).toMatchObject({ guildId: guild, callKind: "voice" });
    expect(joinVoiceTarget({ id: booth, kind: "voice", discordType: 13 }, guild)?.callKind).toBe("stage");
    expect(joinVoiceTarget({ id: booth, kind: "stage" }, null)?.callKind).toBe("stage");
    expect(joinVoiceTarget({ id: "  ", kind: "voice" }, guild)).toBeNull();
    expect(joinVoiceTarget({ id: booth, kind: "text" }, guild)).toBeNull();
  });

  it("stores input profiles, a mic meter, and voice server details", () => {
    const profiles = sanitizeInputProfiles([
      { id: "desk", name: "Desk mic", deviceId: "Built-in", mode: "vad", sensitivity: 140 },
      { id: "Desk", name: "Nope", deviceId: "", mode: "ptt", sensitivity: 10 },
      { id: "stage", name: "Stage", deviceId: "Headset", mode: "ptt", sensitivity: 20 },
    ]);
    expect(profiles.map((profile) => profile.id)).toEqual(["desk", "stage"]);
    expect(profiles[0].sensitivity).toBe(100);
    expect(selectInputProfile(profiles, "stage")?.mode).toBe("ptt");
    expect(micLevel([0, 0, 0])).toBe(0);
    expect(micLevel([1, -1, 1, -1])).toBe(100);
    const details = voiceLinkDetails({ pingMs: 42.2, endpoint: "wss://c-ord.discord.gg/?v=8", mode: "aead_aes256_gcm_rtpsize" });
    expect(details.pingMs).toBe(42);
    expect(voiceDetailLine(details, "connected")).toContain("Ping 42 ms");
    expect(voiceDetailLine(details, "connected")).toContain("c-ord.discord.gg");
    expect(voiceDetailLine(details, "connected")).not.toContain("aead_");
  });

  it("lists the voice-channel menu and the participant moderation actions", () => {
    expect(voiceChannelMenu()).toEqual([
      "join-quiet",
      "open-chat",
      "hide-names",
      "invite",
      "edit",
      "duplicate",
      "copy-link",
      "mute",
      "set-status",
    ]);
    expect(voiceChannelLink(guild, booth)).toBe(`https://discord.com/channels/${guild}/${booth}`);
    expect(voiceChannelLink(null, booth)).toContain("/@me/");
    expect(participantMenu()).toContain("server-mute");
    expect(participantMenu()).toContain("move");
    expect(memberVoiceBody("server-mute", { serverMute: false, serverDeaf: false })).toEqual({ mute: true });
    expect(memberVoiceBody("server-deafen", { serverMute: false, serverDeaf: false })).toEqual({ deaf: true, mute: true });
    expect(memberVoiceBody("disconnect", { serverMute: false, serverDeaf: false })).toEqual({ channel_id: null });
    expect(memberVoiceBody("move", { serverMute: false, serverDeaf: false }, other)).toEqual({ channel_id: other });
    const prefs = applyMoreAction(defaultCallView(), "non-video");
    expect(prefs.showNonVideo).toBe(false);
    expect(applyMoreAction(prefs, "fullscreen").fullScreen).toBe(true);
    expect(applyMoreAction(prefs, "grid").grid).toBe(false);
  });

  it("keeps input profiles, echo cancellation, and gain", () => {
    const saved = writeVoicePrefs({
      profiles: [{ id: "desk", name: "Desk", deviceId: "mic-1", mode: "ptt", sensitivity: 30 }],
      profileId: "desk",
      echoCancellation: false,
      agc: true,
      inputVolume: 80,
      outputVolume: 110,
      soundToggles: { honk: false },
    });
    const prefs = readVoicePrefs(saved);
    expect(prefs.profiles).toEqual([{ id: "desk", name: "Desk", deviceId: "mic-1", mode: "ptt", sensitivity: 30 }]);
    expect(prefs.profileId).toBe("desk");
    expect(prefs.echoCancellation).toBe(false);
    expect(prefs.agc).toBe(true);
    expect(prefs.inputVolume).toBe(80);
    expect(prefs.outputVolume).toBe(110);
    expect(readVoicePrefs("not json").echoCancellation).toBe(true);
  });
});
