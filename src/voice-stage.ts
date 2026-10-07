/** Discord green. The speaking ring uses this until Settings picks another color. */
export const DISCORD_SPEAK_GREEN = "#23a559";

export type VoiceLinkStatus = "connecting" | "connected" | "reconnecting";
export type TileKind = "avatar" | "video" | "screen";
export type RingMotion = "flow" | "static";

export interface StageMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  localMuted: boolean;
  volume: number;
  self: boolean;
  video: boolean;
  sharing: boolean;
}

export interface VoiceBadges {
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
}

export interface StageTile {
  key: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  kind: TileKind;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  localMuted: boolean;
  self: boolean;
  volume: number;
  /** Other people get a volume slider and a local mute. You do not. */
  mixable: boolean;
}

export function speakColor(value: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())) return value.trim().toLowerCase();
  return DISCORD_SPEAK_GREEN;
}

/** Three bars when the call is up. Fewer while it is still coming up. */
export function signalBars(status: VoiceLinkStatus): 1 | 2 | 3 {
  if (status === "connected") return 3;
  if (status === "reconnecting") return 1;
  return 2;
}

export function signalLabel(bars: 1 | 2 | 3): string {
  if (bars >= 3) return "Signal strong";
  if (bars === 2) return "Signal fair";
  return "Signal weak";
}

/** A sweeping ring while someone talks. A solid ring when motion should stay still. */
export function speakingMotion(gameMode: boolean, reducedMotion: boolean): RingMotion {
  return gameMode || reducedMotion ? "static" : "flow";
}

export function voiceBadges(input: {
  speaking: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  localMuted: boolean;
}): VoiceBadges {
  const deafened = input.selfDeaf || input.serverDeaf;
  const muted = deafened || input.localMuted || input.selfMute || input.serverMute;
  return { deafened, muted, speaking: Boolean(input.speaking) && !muted };
}

function tileFrom(member: StageMember, kind: TileKind, label: string): StageTile {
  const badges = voiceBadges(member);
  return {
    key: kind === "avatar" || kind === "video" ? member.id : `${member.id}:${kind}`,
    userId: member.id,
    name: label,
    avatarUrl: member.avatarUrl,
    kind,
    speaking: badges.speaking,
    muted: badges.muted,
    deafened: badges.deafened,
    localMuted: member.localMuted,
    self: member.self,
    volume: member.volume,
    mixable: !member.self,
  };
}

/**
 * Screen and camera tiles lead. Avatar tiles follow, you first, then names.
 * A muted person does not get a speaking ring.
 */
export function stageTiles(members: StageMember[]): StageTile[] {
  const tiles: StageTile[] = [];
  for (const member of members) {
    if (!member.id) continue;
    if (member.sharing) tiles.push(tileFrom(member, "screen", `${member.name}'s screen`));
    tiles.push(tileFrom(member, member.video ? "video" : "avatar", member.name));
  }
  const rank = (kind: TileKind) => (kind === "screen" ? 0 : kind === "video" ? 1 : 2);
  tiles.sort((a, b) => {
    const kind = rank(a.kind) - rank(b.kind);
    if (kind) return kind;
    if (a.self !== b.self) return a.self ? -1 : 1;
    return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
  return tiles;
}
