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
  };
  roster[key] = participant;
  return participant;
}

export function replaceGuildVoice(roster: VoiceRoster, guildId: string, states: VoiceStateInput[]): void {
  const kept = new Map<string, Pick<VoiceParticipant, "speaking" | "volume" | "localMuted" | "name" | "avatarUrl">>();
  for (const key of Object.keys(roster)) {
    const person = roster[key];
    if (person.guildId !== guildId) continue;
    kept.set(person.userId, {
      speaking: person.speaking,
      volume: person.volume,
      localMuted: person.localMuted,
      name: person.name,
      avatarUrl: person.avatarUrl,
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
    }
  }
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

export function setVolume(roster: VoiceRoster, userId: string, volume: number): void {
  const next = Math.min(200, Math.max(0, Math.round(volume)));
  for (const person of Object.values(roster)) {
    if (person.userId === userId) person.volume = next;
  }
}

export interface UserMix {
  volume: number;
  muted: boolean;
}

/** What the playback mix should use. Local mute forces silence and keeps the slider. */
export function playbackVolume(volume: number, muted: boolean): number {
  if (muted) return 0;
  return Math.min(200, Math.max(0, Math.round(volume)));
}

export function applyUserMix(roster: VoiceRoster, userId: string, mix: UserMix): void {
  const volume = playbackVolume(mix.volume, false);
  for (const person of Object.values(roster)) {
    if (person.userId !== userId) continue;
    person.volume = volume;
    person.localMuted = mix.muted;
  }
}

export function hydrateMix(roster: VoiceRoster, levels: Record<string, UserMix>): void {
  for (const [userId, mix] of Object.entries(levels)) applyUserMix(roster, userId, mix);
}
