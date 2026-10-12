export interface VoiceStateInput {
  guildId: string;
  channelId: string;
  userId: string;
  name?: string;
  avatarUrl?: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
  serverMute?: boolean;
  serverDeaf?: boolean;
  /** Camera tile. Omitted leaves the previous value. */
  video?: boolean;
  /** Screen or Go Live tile. Omitted leaves the previous value. */
  sharing?: boolean;
  /** Short label drawn on a stream tile. Empty clears it. Omitted leaves the previous value. */
  streamLabel?: string;
  /** Discord voice-state field. When present, it sets `sharing`. */
  selfStream?: boolean;
  /** Stage audience. Omitted leaves the previous value. */
  suppress?: boolean;
  /** Stage request to speak. Omitted leaves the previous value. */
  requestToSpeak?: boolean;
}

export interface VoiceParticipant {
  guildId: string;
  channelId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  speaking: boolean;
  volume: number;
  /** Silences this person on this computer. Discord is not told. */
  localMuted: boolean;
  video: boolean;
  sharing: boolean;
  streamLabel?: string;
  suppress: boolean;
  requestToSpeak: boolean;
}

export type VoiceRoster = Record<string, VoiceParticipant>;

export function voiceKey(guildId: string, userId: string): string {
  return `${guildId}\n${userId}`;
}

function keepName(incoming: string | undefined, previous: string | undefined): string {
  const next = incoming?.trim() ?? "";
  if (next && next !== "Someone") return next;
  if (previous && previous !== "Someone") return previous;
  return next || previous || "Someone";
}

export function applyVoiceState(roster: VoiceRoster, state: VoiceStateInput): VoiceParticipant | null {
  if (!state.userId) return null;
  const guildId = state.guildId || "";
  const key = voiceKey(guildId, state.userId);
  if (!state.channelId) {
    delete roster[key];
    return null;
  }
  const previous = roster[key];
  const participant: VoiceParticipant = {
    guildId,
    channelId: state.channelId,
    userId: state.userId,
    name: keepName(state.name, previous?.name),
    avatarUrl: state.avatarUrl || previous?.avatarUrl || null,
    selfMute: Boolean(state.selfMute),
    selfDeaf: Boolean(state.selfDeaf),
    serverMute: Boolean(state.serverMute),
    serverDeaf: Boolean(state.serverDeaf),
    speaking: previous?.speaking ?? false,
    volume: previous?.volume ?? 100,
    localMuted: previous?.localMuted ?? false,
    video: state.video ?? previous?.video ?? false,
    sharing: state.selfStream !== undefined ? Boolean(state.selfStream) : (state.sharing ?? previous?.sharing ?? false),
    streamLabel: streamLabel(state.streamLabel, previous?.streamLabel),
    suppress: state.suppress ?? previous?.suppress ?? false,
    requestToSpeak: state.requestToSpeak ?? previous?.requestToSpeak ?? false,
  };
  roster[key] = participant;
  return participant;
}

export function replaceGuildVoice(roster: VoiceRoster, guildId: string, states: VoiceStateInput[]): void {
  const kept = new Map<string, Pick<VoiceParticipant, "speaking" | "volume" | "localMuted" | "name" | "avatarUrl" | "video" | "sharing" | "streamLabel" | "suppress" | "requestToSpeak">>();
  for (const key of Object.keys(roster)) {
    const person = roster[key];
    if (person.guildId !== guildId) continue;
    kept.set(person.userId, {
      speaking: person.speaking,
      volume: person.volume,
      localMuted: person.localMuted,
      name: person.name,
      avatarUrl: person.avatarUrl,
      video: person.video,
      sharing: person.sharing,
      streamLabel: person.streamLabel,
      suppress: person.suppress,
      requestToSpeak: person.requestToSpeak,
    });
    delete roster[key];
  }
  for (const state of states) {
    if (!state.channelId || !state.userId) continue;
    const prior = kept.get(state.userId);
    const participant = applyVoiceState(roster, { ...state, guildId: state.guildId || guildId });
    if (participant && prior) {
      participant.speaking = prior.speaking;
      participant.volume = prior.volume;
      participant.localMuted = prior.localMuted;
      if (!state.name || state.name === "Someone") participant.name = prior.name;
      if (!state.avatarUrl) participant.avatarUrl = prior.avatarUrl;
      if (state.video === undefined) participant.video = prior.video;
      if (state.sharing === undefined && state.selfStream === undefined) participant.sharing = prior.sharing;
      if (state.streamLabel === undefined) participant.streamLabel = prior.streamLabel;
      if (state.suppress === undefined) participant.suppress = prior.suppress;
      if (state.requestToSpeak === undefined) participant.requestToSpeak = prior.requestToSpeak;
    }
  }
}

function streamLabel(value: string | undefined, previous: string | undefined): string | undefined {
  if (value === undefined) return previous;
  const text = value.trim().slice(0, 16);
  return text || undefined;
}

export function participantsIn(roster: VoiceRoster, guildId: string, channelId: string): VoiceParticipant[] {
  return Object.values(roster).filter((person) => person.guildId === guildId && person.channelId === channelId);
}

export function setSpeaking(roster: VoiceRoster, userId: string, speaking: boolean): boolean {
  let changed = false;
  for (const person of Object.values(roster)) {
    if (person.userId !== userId || person.speaking === speaking) continue;
    person.speaking = speaking;
    changed = true;
  }
  return changed;
}

/** Built-in per-user slider. */
export const VOLUME_SLIDER_MAX = 200;
/** Storage ceiling for the volume booster plugin. Playback stays at the slider max until that plugin is on. */
export const VOLUME_BOOST_MAX = 400;

export function setVolume(roster: VoiceRoster, userId: string, volume: number): void {
  const next = playbackVolume(volume, false, VOLUME_BOOST_MAX);
  for (const person of Object.values(roster)) {
    if (person.userId === userId) person.volume = next;
  }
}

export interface UserMix {
  volume: number;
  muted: boolean;
}

/** What the playback mix should use. Local mute forces silence and keeps the slider.
 *  `cap` defaults to the built-in slider. The volume booster plugin may pass 300 or 400. */
export function playbackVolume(volume: number, muted: boolean, cap = VOLUME_SLIDER_MAX): number {
  if (muted) return 0;
  const requested = Number.isFinite(cap) ? Math.round(cap) : VOLUME_SLIDER_MAX;
  const ceiling = Math.min(VOLUME_BOOST_MAX, Math.max(VOLUME_SLIDER_MAX, requested));
  return Math.min(ceiling, Math.max(0, Math.round(volume)));
}

export function applyUserMix(roster: VoiceRoster, userId: string, mix: UserMix): void {
  const volume = playbackVolume(mix.volume, false, VOLUME_BOOST_MAX);
  for (const person of Object.values(roster)) {
    if (person.userId !== userId) continue;
    person.volume = volume;
    person.localMuted = mix.muted;
  }
}

export function hydrateMix(roster: VoiceRoster, levels: Record<string, UserMix>): void {
  for (const [userId, mix] of Object.entries(levels)) applyUserMix(roster, userId, mix);
}

/** Mute and deafen on the user panel. They stay set when no call is connected. */
export interface DeskAudio {
  muted: boolean;
  deafened: boolean;
}

export function restingDesk(): DeskAudio {
  return { muted: false, deafened: false };
}

/** Unmuting clears deafen. Matches the in-call mute control. */
export function toggleDeskMute(desk: DeskAudio): DeskAudio {
  const muted = !desk.muted;
  return { muted, deafened: muted ? desk.deafened : false };
}

/** Deafening mutes. Undeafening unmutes. */
export function toggleDeskDeafen(desk: DeskAudio): DeskAudio {
  const deafened = !desk.deafened;
  return { muted: deafened, deafened };
}

export type CallKind = "voice" | "dm" | "group" | "stage";

export interface JoinTarget {
  channelId: string;
  guildId: string | null;
  callKind: CallKind;
}

/**
 * Guild voice uses the server id. A DM or group call uses the channel id and
 * no guild, which is what `join_voice` already accepts.
 * Stage is a voice join plus the stage layout. Kind `"stage"` or raw type 13.
 */
export function joinVoiceTarget(
  channel: { id: string; kind: string; discordType?: number | null },
  guildId: string | null,
): JoinTarget | null {
  const channelId = channel.id.trim();
  if (!channelId) return null;
  if (channel.kind === "stage" || channel.discordType === 13) {
    return { channelId, guildId: guildId || null, callKind: "stage" };
  }
  if (channel.kind === "dm" || channel.kind === "group") {
    return { channelId, guildId: null, callKind: channel.kind };
  }
  if (channel.kind === "voice") {
    return { channelId, guildId: guildId || null, callKind: "voice" };
  }
  return null;
}

export interface InputProfile {
  id: string;
  name: string;
  deviceId: string;
  mode: "vad" | "ptt";
  sensitivity: number;
}

const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function sanitizeInputProfiles(input: unknown): InputProfile[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: InputProfile[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<InputProfile>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!PROFILE_ID.test(id) || seen.has(id)) continue;
    let name = typeof raw.name === "string" ? [...raw.name.trim()].filter((ch) => ch >= " ").slice(0, 40).join("") : "";
    if (!name) name = "Profile";
    const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.replaceAll("\0", "").trim().slice(0, 128) : "";
    const mode = raw.mode === "ptt" ? "ptt" : "vad";
    const sensitivity = typeof raw.sensitivity === "number" && Number.isFinite(raw.sensitivity)
      ? Math.min(100, Math.max(0, Math.round(raw.sensitivity)))
      : 45;
    seen.add(id);
    out.push({ id, name, deviceId, mode, sensitivity });
    if (out.length >= 8) break;
  }
  return out;
}

export function selectInputProfile(profiles: readonly InputProfile[], id: string): InputProfile | null {
  return profiles.find((profile) => profile.id === id) ?? null;
}

/** RMS of a mono frame, as a 0–100 meter. Silence is 0. A full-scale tone is 100. */
export function micLevel(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (typeof sample !== "number" || !Number.isFinite(sample)) continue;
    energy += sample * sample;
  }
  const rms = Math.sqrt(energy / samples.length);
  return Math.min(100, Math.max(0, Math.round(rms * 100)));
}

export interface VoiceLinkDetails {
  pingMs: number | null;
  endpoint: string;
  mode: string;
}

export function voiceLinkDetails(input: { pingMs?: number | null; endpoint?: string | null; mode?: string | null }): VoiceLinkDetails {
  const ping = typeof input.pingMs === "number" && Number.isFinite(input.pingMs) ? Math.max(0, Math.round(input.pingMs)) : null;
  const endpoint = (input.endpoint ?? "").trim().slice(0, 80);
  const mode = (input.mode ?? "").trim().slice(0, 48);
  return { pingMs: ping, endpoint, mode };
}

export function voiceDetailLine(details: VoiceLinkDetails, status: string): string {
  const ping = details.pingMs === null ? "Ping —" : `Ping ${details.pingMs} ms`;
  const server = details.endpoint ? details.endpoint.replace(/^wss:\/\//, "").replace(/\/.*$/, "") : "Voice server —";
  const mode = details.mode && !details.mode.startsWith("aead_") && !details.mode.startsWith("xsalsa20") ? details.mode : "";
  const state = status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting" : "Connecting";
  return [state, ping, server, mode].filter(Boolean).join(" · ");
}

export const VOICE_CHANNEL_MENU = [
  "join-quiet",
  "open-chat",
  "hide-names",
  "invite",
  "edit",
  "duplicate",
  "copy-link",
  "mute",
  "set-status",
] as const;

export type VoiceChannelMenuAction = (typeof VOICE_CHANNEL_MENU)[number];

export function voiceChannelMenu(): readonly VoiceChannelMenuAction[] {
  return VOICE_CHANNEL_MENU;
}

export function voiceChannelLink(guildId: string | null, channelId: string): string {
  const guild = guildId && /^\d{5,22}$/.test(guildId) ? guildId : "@me";
  const channel = /^\d{5,22}$/.test(channelId) ? channelId : "";
  if (!channel) return "";
  return `https://discord.com/channels/${guild}/${channel}`;
}

export const PARTICIPANT_MENU = [
  "profile",
  "server-mute",
  "server-deafen",
  "pop-out",
  "mod-view",
  "move",
  "disconnect",
] as const;

export type ParticipantMenuAction = (typeof PARTICIPANT_MENU)[number];

export function participantMenu(): readonly ParticipantMenuAction[] {
  return PARTICIPANT_MENU;
}

/** Discord member voice patch. Disconnect and move send `channel_id`. */
export function memberVoiceBody(
  action: "server-mute" | "server-deafen" | "move" | "disconnect",
  current: { serverMute: boolean; serverDeaf: boolean },
  channelId?: string,
): { mute?: boolean; deaf?: boolean; channel_id?: string | null } {
  if (action === "server-mute") return { mute: !current.serverMute };
  if (action === "server-deafen") return { deaf: !current.serverDeaf, mute: current.serverDeaf ? current.serverMute : true };
  if (action === "disconnect") return { channel_id: null };
  const next = (channelId ?? "").trim();
  return { channel_id: next || null };
}

export interface CallViewPrefs {
  showChat: boolean;
  fullScreen: boolean;
  grid: boolean;
  showNonVideo: boolean;
  messagePreviews: boolean;
  hideNames: boolean;
}

export function defaultCallView(): CallViewPrefs {
  return {
    showChat: false,
    fullScreen: false,
    grid: true,
    showNonVideo: true,
    messagePreviews: false,
    hideNames: false,
  };
}

export type MoreAction = "grid" | "non-video" | "previews" | "settings" | "fullscreen";

export const VOICE_PREFS_KEY = "lark.voice.extras.v1";

export interface VoicePrefs {
  profiles: InputProfile[];
  profileId: string;
  echoCancellation: boolean;
  agc: boolean;
  inputVolume: number;
  outputVolume: number;
  soundToggles: unknown;
}

function prefsVolume(value: unknown, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(200, Math.max(0, number));
}

export function readVoicePrefs(raw: string | null): VoicePrefs {
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === "object") parsed = value as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  return {
    profiles: sanitizeInputProfiles(parsed.profiles),
    profileId: typeof parsed.profileId === "string" ? parsed.profileId.trim().slice(0, 41) : "",
    echoCancellation: parsed.echoCancellation !== false,
    agc: parsed.agc !== false,
    inputVolume: prefsVolume(parsed.inputVolume, 100),
    outputVolume: prefsVolume(parsed.outputVolume, 100),
    soundToggles: parsed.soundToggles,
  };
}

export function writeVoicePrefs(prefs: {
  profiles: readonly InputProfile[];
  profileId: string;
  echoCancellation: boolean;
  agc: boolean;
  inputVolume: number;
  outputVolume: number;
  soundToggles: Record<string, boolean>;
}): string {
  return JSON.stringify({
    profiles: sanitizeInputProfiles(prefs.profiles),
    profileId: prefs.profileId,
    echoCancellation: prefs.echoCancellation,
    agc: prefs.agc,
    inputVolume: prefsVolume(prefs.inputVolume, 100),
    outputVolume: prefsVolume(prefs.outputVolume, 100),
    soundToggles: prefs.soundToggles,
  });
}

export function applyMoreAction(prefs: CallViewPrefs, action: MoreAction): CallViewPrefs {
  if (action === "grid") return { ...prefs, grid: !prefs.grid };
  if (action === "non-video") return { ...prefs, showNonVideo: !prefs.showNonVideo };
  if (action === "previews") return { ...prefs, messagePreviews: !prefs.messagePreviews };
  if (action === "fullscreen") return { ...prefs, fullScreen: !prefs.fullScreen };
  return prefs;
}
