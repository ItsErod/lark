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
  /** Drawn on a screen tile when a caller supplies one. Layout does not invent it. */
  streamLabel?: string;
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
  /** Optional corner label. Screen tiles carry a stream label when one was supplied. */
  badge?: string;
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
    badge: kind === "screen" ? member.streamLabel : undefined,
  };
}

/**
 * Screen and camera tiles lead. Avatar tiles follow, you first, then names.
 * A screen tile is the stream slot (Go Live or a camera share) and drops into
 * the same grid and picture-in-picture containers as a camera tile.
 * A muted person does not get a speaking ring.
 */
/** Discord channel type for a stage. Used when kind 13 is still stored as voice. */
export const STAGE_CHANNEL_TYPE = 13;

export function isStageChannel(channel: { kind?: string | null; discordType?: number | null }): boolean {
  return channel.kind === "stage" || channel.discordType === STAGE_CHANNEL_TYPE;
}

export type StageRole = "speaker" | "audience";

export interface StagePerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
  suppressed: boolean;
  requestToSpeak: boolean;
  self: boolean;
  speaking: boolean;
}

export interface StageGroups {
  speakers: StagePerson[];
  requests: StagePerson[];
  audience: StagePerson[];
}

export function stageGroups(people: readonly StagePerson[]): StageGroups {
  const speakers: StagePerson[] = [];
  const requests: StagePerson[] = [];
  const audience: StagePerson[] = [];
  for (const person of people) {
    if (!person.userId) continue;
    if (!person.suppressed) speakers.push(person);
    else if (person.requestToSpeak) requests.push(person);
    else audience.push(person);
  }
  const byName = (a: StagePerson, b: StagePerson) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);
  speakers.sort(byName);
  requests.sort(byName);
  audience.sort(byName);
  return { speakers, requests, audience };
}

/** Raise hand asks to speak and stays in the audience until a mod invites you up. */
export function raiseHand(raised: boolean, now: string): { requestToSpeakTimestamp: string | null; suppressed: boolean } {
  if (!raised) return { requestToSpeakTimestamp: null, suppressed: true };
  const stamp = now.trim() || new Date(0).toISOString();
  return { requestToSpeakTimestamp: stamp, suppressed: true };
}

export function clampStageTopic(topic: string): string {
  const cleaned = [...topic.trim()].map((ch) => (ch < " " ? " " : ch)).join("").replace(/ +/g, " ").trim();
  return cleaned.slice(0, 120);
}

export function startStageBody(channelId: string, topic: string): { channel_id: string; topic: string; privacy_level: 1 | 2 } {
  return { channel_id: channelId, topic: clampStageTopic(topic), privacy_level: 2 };
}

export interface ActivityApp {
  id: string;
  name: string;
  kind: "watch" | "game";
}

/** Embedded applications Discord ships in the voice activity launcher. Watch Together is first. */
export const ACTIVITIES: readonly ActivityApp[] = [
  { id: "880218394199220334", name: "Watch Together", kind: "watch" },
  { id: "755827207812677713", name: "Poker Night", kind: "game" },
  { id: "832012774040141894", name: "Chess in the Park", kind: "game" },
  { id: "832013003968348200", name: "Checkers in the Park", kind: "game" },
  { id: "832025144389533716", name: "Blazing 8s", kind: "game" },
  { id: "879863686565621790", name: "Letter League", kind: "game" },
  { id: "902271654783242291", name: "Sketch Heads", kind: "game" },
  { id: "903769130790969345", name: "Land-io", kind: "game" },
  { id: "945737671223947305", name: "Putt Party", kind: "game" },
  { id: "947957217959759964", name: "Bobble League", kind: "game" },
];

export function activityById(id: string): ActivityApp | null {
  return ACTIVITIES.find((activity) => activity.id === id) ?? null;
}

/** Embedded-application invite. Target type 2 is an activity. */
export function activityInviteBody(applicationId: string): { max_age: number; max_uses: number; target_type: 2; target_application_id: string } | null {
  const activity = activityById(applicationId);
  if (!activity) return null;
  return { max_age: 86400, max_uses: 0, target_type: 2, target_application_id: activity.id };
}

/** The composer Apps button starts an activity with the same invite the call panel uses. */
export function activityLaunchTarget(applicationId: string, voiceChannelId: string | null | undefined): { channelId: string; applicationId: string } | null {
  const body = activityInviteBody(applicationId);
  if (!body || !voiceChannelId || !/^\d{5,22}$/.test(voiceChannelId)) return null;
  return { channelId: voiceChannelId, applicationId: body.target_application_id };
}

/** YouTube and youtu.be links Watch Together can open. */
export function watchVideoId(url: string): string | null {
  const text = url.trim();
  if (!text || text.length > 200) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[\w-]{6,16}$/.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
  const fromQuery = parsed.searchParams.get("v") ?? "";
  if (/^[\w-]{6,16}$/.test(fromQuery)) return fromQuery;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if ((parts[0] === "embed" || parts[0] === "shorts") && parts[1] && /^[\w-]{6,16}$/.test(parts[1])) return parts[1];
  return null;
}

export function watchEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

/** Hide avatar tiles when the call is set to video participants only. You stay. */
export function visibleCallTiles<T extends { kind: string; self: boolean }>(tiles: readonly T[], showNonVideo: boolean): T[] {
  if (showNonVideo) return [...tiles];
  return tiles.filter((tile) => tile.self || tile.kind === "video" || tile.kind === "screen");
}

export function messagePreview(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return [...text].slice(0, 80).join("");
}

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
