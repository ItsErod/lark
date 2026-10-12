import { sortPeople } from "./members";
import type { Person } from "./types";

export const NOTE_LIMIT = 256;
export const NICK_LIMIT = 32;
export const STATUS_LIMIT = 128;

const ACTIVE = new Set(["online", "idle", "dnd"]);

/** Discord notes are short and private to this account. */
export function clampNote(text: string): string {
  return [...text.replaceAll("\0", "")].slice(0, NOTE_LIMIT).join("");
}

export interface FriendGlance {
  activity: string;
  custom: string;
  line: string;
}

/** Activity stays visible when a custom status is also set. */
export function friendGlance(person: Pick<Person, "activity" | "custom">): FriendGlance {
  const activity = person.activity?.trim() ?? "";
  const custom = person.custom?.trim() ?? "";
  const line = activity && custom ? `${activity} · ${custom}` : activity || custom;
  return { activity, custom, line };
}

/** Friends who are online, idle, or in do not disturb and have a game or listen line. */
export function activeFriends(people: Person[], limit = 6): Person[] {
  return sortPeople(people)
    .filter((person) => ACTIVE.has(person.status ?? "offline") && friendGlance(person).activity.length > 0)
    .slice(0, Math.max(0, limit));
}

/** Discord relationship types. 1 friend, 2 blocked, 3 incoming request, 4 outgoing request. */
export type RelationshipKind = "friend" | "blocked" | "incoming" | "outgoing";

export interface ServerTag {
  tag: string;
  guildId?: string;
  badgeUrl?: string | null;
}

export interface RichPresence {
  name: string;
  type: number;
  details?: string;
  state?: string;
  startedAt?: number | null;
  endsAt?: number | null;
  largeImage?: string | null;
  largeText?: string;
  smallImage?: string | null;
  smallText?: string;
  party?: string;
  buttons?: string[];
  live?: boolean;
  applicationId?: string;
}

export interface SocialRelationship {
  id: string;
  kind: RelationshipKind;
  name: string;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  bot?: boolean;
  serverTag?: ServerTag | null;
}

export type FriendTab = "online" | "all" | "pending" | "add";

export type ClearAfter = "never" | "30m" | "1h" | "4h" | "today";

export interface MenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

export interface VoiceSpot {
  guildId: string;
  channelId: string;
  sharing: boolean;
  channelName: string;
}

export interface ActiveCard {
  id: string;
  name: string;
  line: string;
  detail: string;
  elapsed: string;
  tag: string;
  art: string | null;
  live: boolean;
  inVoice: boolean;
  voiceLabel: string;
}

const indexed: SocialRelationship[] = [];

export function relationshipKind(type: number): RelationshipKind | null {
  if (type === 1) return "friend";
  if (type === 2) return "blocked";
  if (type === 3) return "incoming";
  if (type === 4) return "outgoing";
  return null;
}

/** Incoming requests are the Pending badge. Outgoing requests sit on the tab without a count. */
export function pendingFriendCount(list?: { kind: RelationshipKind }[]): number {
  const rows = list ?? indexed;
  return rows.filter((row) => row.kind === "incoming").length;
}

/** Stream A reads this set when deciding whether a message author is blocked. */
export function blockedIds(): ReadonlySet<string> {
  return new Set(indexed.filter((row) => row.kind === "blocked").map((row) => row.id));
}

export function setRelationshipIndex(list: SocialRelationship[]) {
  indexed.splice(0, indexed.length, ...list.filter((row) => row.id && relationshipKindName(row.kind)));
}

function relationshipKindName(kind: string): kind is RelationshipKind {
  return kind === "friend" || kind === "blocked" || kind === "incoming" || kind === "outgoing";
}

export function indexedRelationships(): SocialRelationship[] {
  return indexed.map((row) => ({ ...row }));
}

export function clampNickname(text: string): string {
  return [...text.replaceAll("\0", "").replaceAll("\n", " ")].slice(0, NICK_LIMIT).join("").trim();
}

export function clampStatus(text: string): string {
  return [...text.replaceAll("\0", "").replaceAll("\n", " ")].slice(0, STATUS_LIMIT).join("").trim();
}

/** Discord usernames are lowercase, 2–32, and cannot start or end with a period. */
export function friendUsernameOk(name: string): boolean {
  const text = name.trim();
  if (text.length < 2 || text.length > 32) return false;
  if (text.startsWith(".") || text.endsWith(".") || text.includes("..")) return false;
  return /^[a-z0-9._]+$/.test(text);
}

export function serverTagText(tag: { tag?: string | null } | null | undefined): string {
  const text = tag?.tag?.trim() ?? "";
  if (!text || [...text].length > 4) return "";
  return text;
}

export function friendsForTab(people: Person[], tab: FriendTab): Person[] {
  if (tab === "pending" || tab === "add") return [];
  if (tab === "all") return sortPeople(people);
  return sortPeople(people).filter((person) => ACTIVE.has(person.status ?? "offline"));
}

export function activityVerb(type: number): string {
  if (type === 0) return "Playing";
  if (type === 1) return "Streaming";
  if (type === 2) return "Listening to";
  if (type === 3) return "Watching";
  if (type === 5) return "Competing in";
  return "";
}

export function elapsedLabel(startedAt: number | null | undefined, now: number): string {
  if (!startedAt || startedAt <= 0 || now < startedAt) return "";
  const seconds = Math.floor((now - startedAt) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  const ss = String(remain).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss} elapsed`;
  return `${minutes}:${ss} elapsed`;
}

export function activityHeadline(person: { activity?: string; rich?: RichPresence | null }): string {
  const rich = person.rich;
  if (rich?.name?.trim()) {
    const verb = activityVerb(rich.type);
    const name = rich.name.trim();
    return verb ? `${verb} ${name}` : name;
  }
  return person.activity?.trim() ?? "";
}

/** Rich presence when Discord sent it. The one-line glance stays the fallback. */
export function friendActivityText(person: Pick<Person, "activity" | "custom" | "rich">, now = Date.now()): string {
  const glance = friendGlance(person);
  if (!person.rich?.name?.trim()) return glance.line;
  const bits = [
    activityHeadline(person),
    person.rich.details?.trim(),
    person.rich.state?.trim(),
    person.rich.party?.trim(),
    elapsedLabel(person.rich.startedAt, now),
  ].filter((part): part is string => Boolean(part));
  const line = bits.join(" · ");
  return glance.custom ? `${line} · ${glance.custom}` : line;
}

export function clearAfterAt(choice: ClearAfter, now: number): number | null {
  if (choice === "never") return null;
  if (choice === "30m") return now + 30 * 60 * 1000;
  if (choice === "1h") return now + 60 * 60 * 1000;
  if (choice === "4h") return now + 4 * 60 * 60 * 1000;
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function groupMemberCount(recipientIds: string[], meId: string): number {
  const ids = new Set(recipientIds.filter((id) => Boolean(id)));
  if (meId && !ids.has(meId)) ids.add(meId);
  return ids.size;
}

export function floatPinned<T extends { id: string }>(channels: T[], pinned: ReadonlySet<string>): T[] {
  const top: T[] = [];
  const rest: T[] = [];
  for (const channel of channels) {
    if (pinned.has(channel.id)) top.push(channel);
    else rest.push(channel);
  }
  return [...top, ...rest];
}

export function togglePin(pins: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(pins);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function readPinList(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && /^\d{5,22}$/.test(id)).slice(0, 100);
  } catch {
    return [];
  }
}

export function voiceSpotFor(
  roster: { userId: string; guildId?: string; channelId?: string; sharing?: boolean; channelName?: string }[],
  userId: string,
): VoiceSpot | null {
  const hit = roster.find((person) => person.userId === userId && person.channelId);
  if (!hit?.channelId) return null;
  return {
    guildId: hit.guildId ?? "",
    channelId: hit.channelId,
    sharing: Boolean(hit.sharing),
    channelName: hit.channelName?.trim() || "Voice",
  };
}

export function activeNowCards(
  people: Person[],
  voices: Record<string, VoiceSpot | null>,
  now = Date.now(),
  limit = 9,
): ActiveCard[] {
  const cards: ActiveCard[] = [];
  for (const person of sortPeople(people)) {
    if (!ACTIVE.has(person.status ?? "offline")) continue;
    const voice = voices[person.id] ?? null;
    const line = activityHeadline(person);
    const glance = friendGlance(person);
    if (!line && !voice && !person.rich?.name) continue;
    const live = Boolean(person.rich?.live || voice?.sharing);
    cards.push({
      id: person.id,
      name: person.name,
      line: line || glance.activity || (voice ? "In voice" : ""),
      detail: [person.rich?.details?.trim(), person.rich?.state?.trim(), person.rich?.party?.trim()].filter(Boolean).join(" · "),
      elapsed: elapsedLabel(person.rich?.startedAt, now),
      tag: serverTagText(person.serverTag),
      art: person.rich?.largeImage?.trim() || null,
      live,
      inVoice: Boolean(voice),
      voiceLabel: voice ? voice.channelName : "",
    });
    if (cards.length >= Math.max(0, limit)) break;
  }
  return cards;
}

export function dmContextMenu(options: {
  developerMode: boolean;
  pinned: boolean;
  muted: boolean;
  friend: boolean;
  group: boolean;
}): MenuItem[] {
  const items: MenuItem[] = [
    { id: "read", label: "Mark As Read" },
    { id: "pin", label: options.pinned ? "Unpin" : "Pin" },
    { id: "favorite", label: "Add to Favorites" },
    { id: "profile", label: "Profile" },
    { id: "call", label: "Start a Call" },
    { id: "note", label: "Note" },
    { id: "nick", label: "Friend Nickname" },
    { id: "close", label: "Close DM" },
    { id: "apps", label: "Apps" },
    { id: "invite", label: "Invite to Server" },
  ];
  if (options.group) items.push({ id: "rename", label: "Rename Group" });
  if (options.friend) items.push({ id: "unfriend", label: "Remove Friend", danger: true });
  items.push({ id: "ignore", label: "Ignore", danger: true });
  items.push({ id: "block", label: "Block", danger: true });
  items.push({ id: "mute", label: options.muted ? "Unmute" : "Mute" });
  if (options.developerMode) {
    items.push({ id: "copy-user", label: "Copy User ID" });
    items.push({ id: "copy-channel", label: "Copy Channel ID" });
  }
  return items;
}

export function memberContextMenu(options: { developerMode: boolean; self: boolean }): MenuItem[] {
  const items: MenuItem[] = [{ id: "profile", label: "Profile" }];
  if (!options.self) items.push({ id: "mention", label: "Mention" });
  items.push({ id: "server-profile", label: "Per-server Profile" });
  items.push({ id: "apps", label: "Apps" });
  if (!options.self) items.push({ id: "roles", label: "Roles" }, { id: "mod", label: "Mod View" });
  if (options.developerMode) items.push({ id: "copy-id", label: "Copy ID" });
  return items;
}

/** D owns the flag. Several likely keys are checked so a rename on that side still hides Copy ID until it is on. */
export function developerModeOn(config: unknown): boolean {
  if (config && typeof config === "object") {
    const raw = config as Record<string, unknown>;
    if (typeof raw.developerMode === "boolean") return raw.developerMode;
    if (typeof raw.developer_mode === "boolean") return raw.developer_mode;
    for (const key of ["appearance", "advanced", "privacy"]) {
      const section = raw[key];
      if (!section || typeof section !== "object") continue;
      const view = section as Record<string, unknown>;
      if (typeof view.developerMode === "boolean") return view.developerMode;
      if (typeof view.developer_mode === "boolean") return view.developer_mode;
    }
  }
  const host = globalThis as { larkDeveloperMode?: boolean; __larkDeveloperMode?: boolean };
  return Boolean(host.larkDeveloperMode || host.__larkDeveloperMode);
}

type FavoriteApi = {
  addFavoriteChannel?: (channelId: string) => void;
  addChannel?: (channelId: string) => void;
  add?: (channelId: string) => void;
};

/** B owns the favorites list. Missing helper is a no-op the menu can explain. */
export function requestAddFavorite(channelId: string): "called" | "missing" {
  const api = (globalThis as { larkFavorites?: FavoriteApi }).larkFavorites;
  const fn = api?.addFavoriteChannel ?? api?.addChannel ?? api?.add;
  if (typeof fn !== "function") return "missing";
  try {
    fn(channelId);
    return "called";
  } catch {
    return "missing";
  }
}

/** B owns Mod View. The menu item only opens it. */
export function requestModView(userId: string, guildId: string | null): "called" | "missing" {
  const api = (globalThis as { larkModView?: { open?: (userId: string, guildId: string | null) => void } }).larkModView;
  if (typeof api?.open !== "function") return "missing";
  try {
    api.open(userId, guildId);
    return "called";
  } catch {
    return "missing";
  }
}

export function requestRoleToggle(userId: string, roleId: string, guildId: string | null): "called" | "missing" {
  const api = (globalThis as { larkRoles?: { toggle?: (userId: string, roleId: string, guildId: string | null) => void } }).larkRoles;
  if (typeof api?.toggle !== "function") return "missing";
  try {
    api.toggle(userId, roleId, guildId);
    return "called";
  } catch {
    return "missing";
  }
}
