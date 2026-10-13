import type { PerfSample } from "./perf";
import { linkQuality, participantsIn, type LinkQuality, type VoiceRoster } from "./voice";

export const VOICE_HUD_LIMIT = 8;

export interface VoiceHudPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
}

export interface VoiceHudSession {
  guildId: string;
  channelId: string;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
  muted: boolean;
  deafened: boolean;
  selfId: string;
}

export interface VoiceHudFrame {
  inCall: boolean;
  channel: string;
  status: VoiceHudSession["status"] | "idle";
  selfMuted: boolean;
  selfDeafened: boolean;
  people: VoiceHudPerson[];
  extra: number;
}

export interface VoiceHudView extends VoiceHudFrame {
  /** Voice roster is showing in the shared HUD window. */
  enabled: boolean;
  /** RAM, CPU, and FPS strip in that same window. */
  perf: boolean;
  stats: PerfSample | null;
  opacity: number;
  clickThrough: boolean;
  /** Round-trip voice ping. Null until the voice server answers. */
  pingMs?: number | null;
  /** Front-most game, when detection has a name. */
  game?: string;
}

/** Status on the HUD bar. Deafen is its own word so it is not shown as mute. */
export function hudStatus(view: Pick<VoiceHudFrame, "inCall" | "status" | "selfMuted" | "selfDeafened">): string {
  if (!view.inCall) return "Not in a call";
  if (view.status === "connecting") return "Connecting";
  if (view.status === "reconnecting") return "Reconnecting";
  if (view.selfDeafened) return "Deafened";
  if (view.selfMuted) return "Muted";
  return "Live";
}

/** Ping and quality for the HUD. Empty until a ping exists, so the line stays out of the way. */
export function hudLinkLine(pingMs: number | null | undefined): { text: string; quality: LinkQuality | "" } {
  if (typeof pingMs !== "number" || !Number.isFinite(pingMs) || pingMs < 0) return { text: "", quality: "" };
  const ms = Math.max(0, Math.round(pingMs));
  const quality = linkQuality(ms);
  return { text: quality ? `${ms} ms · ${quality}` : `${ms} ms`, quality };
}

const idle = (): VoiceHudFrame => ({
  inCall: false,
  channel: "",
  status: "idle",
  selfMuted: false,
  selfDeafened: false,
  people: [],
  extra: 0,
});

/** Same roster the channel list and voice panel already use. */
export function voiceHudFrame(roster: VoiceRoster, session: VoiceHudSession | null): VoiceHudFrame {
  if (!session?.channelId) return idle();
  const people = participantsIn(roster, session.guildId, session.channelId).map((person) => {
    const self = person.userId === session.selfId;
    const deafened = self ? session.deafened || person.selfDeaf || person.serverDeaf : person.selfDeaf || person.serverDeaf;
    const local = !self && person.localMuted;
    const muted = deafened || local || (self ? session.muted || person.selfMute || person.serverMute : person.selfMute || person.serverMute);
    return {
      userId: person.userId,
      name: person.name,
      avatarUrl: person.avatarUrl,
      speaking: Boolean(person.speaking) && !muted,
      muted,
      deafened,
    };
  });
  people.sort((a, b) => {
    if (a.userId === session.selfId) return -1;
    if (b.userId === session.selfId) return 1;
    return Number(b.speaking) - Number(a.speaking) || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);
  });
  return {
    inCall: true,
    channel: session.name,
    status: session.status,
    selfMuted: session.muted || session.deafened,
    selfDeafened: session.deafened,
    people: people.slice(0, VOICE_HUD_LIMIT),
    extra: Math.max(0, people.length - VOICE_HUD_LIMIT),
  };
}
