import type { NotifyLevel } from "./types";

/** Discord links. Purchases stay on Discord. */
export const DISCORD_LINKS = {
  help: "https://support.discord.com/hc",
  nitro: "https://discord.com/nitro",
  shop: "https://discord.com/shop",
  quests: "https://discord.com/quests",
  discovery: "https://discord.com/discovery",
  apps: "https://discord.com/application-directory",
  boost: "https://discord.com/shop",
} as const;

export const VIEW_CHANNEL = 1n << 10n;
export const ADMINISTRATOR = 1n << 3n;

export interface MenuEntry {
  id: string;
  label: string;
  danger?: boolean;
  hint?: string;
  children?: MenuEntry[];
}

export interface OverwriteBits {
  id: string;
  kind: number;
  allow: string;
  deny: string;
}

export interface IdName {
  id: string;
  name: string;
}

const NOTIFY: NotifyLevel[] = ["all", "mentions", "mute"];

export function channelLink(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

export function serverLink(guildId: string): string {
  return `https://discord.com/channels/${guildId}`;
}

export function bitsOf(value: string | number | undefined | null): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return BigInt(Math.trunc(value));
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function formatBits(bits: bigint): string {
  return bits < 0n ? "0" : bits.toString();
}

export function hasPerm(bits: bigint, flag: bigint): boolean {
  if ((bits & ADMINISTRATOR) !== 0n) return true;
  return (bits & flag) === flag;
}

export function togglePerm(bits: bigint, flag: bigint, on: boolean): bigint {
  return on ? bits | flag : bits & ~flag;
}

/** A channel you can see that @everyone cannot. */
export function channelIsPrivate(guildId: string, overwrites: OverwriteBits[] | undefined): boolean {
  const everyone = overwrites?.find((overwrite) => overwrite.kind === 0 && overwrite.id === guildId);
  if (!everyone) return false;
  return (bitsOf(everyone.deny) & VIEW_CHANNEL) !== 0n;
}

export function parseIdMap(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^\d{5,22}$/.test(key) || !Array.isArray(value)) continue;
      const ids = value.filter((item): item is string => typeof item === "string" && /^\d{5,22}$/.test(item));
      if (ids.length) out[key] = [...new Set(ids)];
    }
    return out;
  } catch {
    return {};
  }
}

export function parseFlag(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

export function toggleId(list: string[] | undefined, id: string): string[] {
  const current = list ?? [];
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function orderChannels<T extends { id: string; position: number }>(
  channels: T[],
  pinned: string[] | undefined,
): T[] {
  const rank = new Map((pinned ?? []).map((id, index) => [id, index]));
  return [...channels].sort((a, b) => {
    const ap = rank.has(a.id) ? rank.get(a.id)! : 10_000;
    const bp = rank.has(b.id) ? rank.get(b.id)! : 10_000;
    return ap - bp || a.position - b.position || a.id.localeCompare(b.id);
  });
}

export function hideMutedChannel(input: {
  hide: boolean;
  level: NotifyLevel;
  selected: boolean;
  kind: string;
}): boolean {
  if (!input.hide || input.kind === "category" || input.selected) return false;
  return input.level === "mute";
}

/** Channel override integers the Discord client writes: 1 all, 2 mentions, 3 nothing. */
export function channelNotifyBody(channelId: string, level: NotifyLevel): Record<string, unknown> {
  const messageNotifications = level === "all" ? 1 : level === "mentions" ? 2 : 3;
  const override =
    level === "mute"
      ? { muted: true, message_notifications: messageNotifications, mute_config: { selected_time_window: -1, end_time: null } }
      : { muted: false, message_notifications: messageNotifications };
  return { channel_overrides: { [channelId]: override } };
}

/** Guild default: 0 all messages, 1 only mentions. Mute is the guild flag. */
export function guildNotifyBody(level: NotifyLevel): Record<string, unknown> {
  if (level === "mute") return { muted: true };
  return { muted: false, message_notifications: level === "all" ? 0 : 1 };
}

export function nextNotify(level: NotifyLevel): NotifyLevel {
  const index = NOTIFY.indexOf(level);
  return NOTIFY[(index < 0 ? 0 : index + 1) % NOTIFY.length];
}

export const INVITE_EXPIRY = [
  { id: "1800", label: "30 minutes", maxAge: 1800 },
  { id: "3600", label: "1 hour", maxAge: 3600 },
  { id: "21600", label: "6 hours", maxAge: 21600 },
  { id: "43200", label: "12 hours", maxAge: 43200 },
  { id: "86400", label: "1 day", maxAge: 86400 },
  { id: "604800", label: "7 days", maxAge: 604800 },
  { id: "0", label: "Never", maxAge: 0 },
] as const;

export const INVITE_USES = [
  { id: "0", label: "No limit", maxUses: 0 },
  { id: "1", label: "1 use", maxUses: 1 },
  { id: "5", label: "5 uses", maxUses: 5 },
  { id: "10", label: "10 uses", maxUses: 10 },
  { id: "25", label: "25 uses", maxUses: 25 },
  { id: "50", label: "50 uses", maxUses: 50 },
  { id: "100", label: "100 uses", maxUses: 100 },
] as const;

export function inviteBody(input: { maxAge: number; maxUses: number; temporary: boolean }): Record<string, unknown> {
  const maxAge = INVITE_EXPIRY.some((item) => item.maxAge === input.maxAge) ? input.maxAge : 86400;
  const maxUses = INVITE_USES.some((item) => item.maxUses === input.maxUses) ? input.maxUses : 0;
  return { max_age: maxAge, max_uses: maxUses, temporary: Boolean(input.temporary), unique: true };
}

export function searchPeople<T extends IdName>(people: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return people.slice(0, 8);
  return people.filter((person) => person.name.toLowerCase().includes(needle)).slice(0, 8);
}

const CREATE_TYPES: Record<string, number> = { text: 0, voice: 2, forum: 15, category: 4 };

export function clampChannelName(name: string, kind: string): string {
  const clean = name.replace(/[\u0000-\u001f#]/g, "").trim().slice(0, 100);
  if (kind === "voice" || kind === "category" || kind === "stage") return clean;
  return clean.toLowerCase().replace(/\s+/g, "-");
}

export function createChannelBody(input: {
  name: string;
  kind: "text" | "voice" | "forum" | "category";
  parentId?: string | null;
  isPrivate?: boolean;
  guildId: string;
  userId?: string;
}): Record<string, unknown> | null {
  const name = clampChannelName(input.name, input.kind);
  if (!name) return null;
  const body: Record<string, unknown> = { name, type: CREATE_TYPES[input.kind] };
  if (input.kind !== "category" && input.parentId) body.parent_id = input.parentId;
  if (input.isPrivate && input.kind !== "category") {
    const overwrites: Record<string, unknown>[] = [
      { id: input.guildId, type: 0, allow: "0", deny: VIEW_CHANNEL.toString() },
    ];
    if (input.userId) overwrites.push({ id: input.userId, type: 1, allow: VIEW_CHANNEL.toString(), deny: "0" });
    body.permission_overwrites = overwrites;
  }
  return body;
}

export interface ServerTemplate {
  id: string;
  label: string;
  detail: string;
  channels: { name: string; type: number }[];
}

export const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    id: "blank",
    label: "Create My Own",
    detail: "A text channel and a voice channel.",
    channels: [
      { name: "general", type: 0 },
      { name: "Lobby", type: 2 },
    ],
  },
  {
    id: "gaming",
    label: "Gaming",
    detail: "Clips, looking-for-group, and a lobby.",
    channels: [
      { name: "general", type: 0 },
      { name: "clips", type: 0 },
      { name: "lfg", type: 0 },
      { name: "Lobby", type: 2 },
    ],
  },
  {
    id: "friends",
    label: "Friends",
    detail: "A hangout and a voice couch.",
    channels: [
      { name: "hangout", type: 0 },
      { name: "Couch", type: 2 },
    ],
  },
  {
    id: "school",
    label: "School Club",
    detail: "Homework, a forum, and a study room.",
    channels: [
      { name: "welcome", type: 0 },
      { name: "homework", type: 15 },
      { name: "Study room", type: 2 },
    ],
  },
  {
    id: "community",
    label: "Community",
    detail: "Announcements, rules, and general chat.",
    channels: [
      { name: "rules", type: 0 },
      { name: "announcements", type: 5 },
      { name: "general", type: 0 },
      { name: "Lounge", type: 2 },
    ],
  },
];

export function guildCreateBody(name: string, templateId: string): Record<string, unknown> | null {
  const template = SERVER_TEMPLATES.find((item) => item.id === templateId) ?? SERVER_TEMPLATES[0];
  const clean = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100);
  if (!clean) return null;
  return { name: clean, channels: template.channels };
}

export function serverContextItems(): MenuEntry[] {
  return [
    { id: "mark-read", label: "Mark As Read" },
    { id: "invite", label: "Invite People" },
    { id: "mute", label: "Mute Server", children: notifyChildren("guild-notify") },
    { id: "notifications", label: "Notification Settings", children: notifyChildren("guild-notify") },
    { id: "hide-muted", label: "Hide Muted Channels" },
    { id: "settings", label: "Server Settings" },
    { id: "privacy", label: "Privacy Settings" },
    { id: "profile", label: "Per-server Profile" },
    { id: "create-channel", label: "Create Channel" },
    { id: "create-category", label: "Create Category" },
    { id: "create-event", label: "Create Event" },
    { id: "move", label: "Move to", children: [] },
    { id: "copy-id", label: "Copy Server ID" },
  ];
}

export function headerMenuItems(level: number | null): MenuEntry[] {
  const boost = level == null ? "Server Boost" : `Server Boost · Level ${level}`;
  return [
    { id: "boost", label: boost, hint: "Opens Discord" },
    { id: "invite", label: "Invite People" },
    { id: "settings", label: "Server Settings" },
    { id: "create-channel", label: "Create Channel" },
    { id: "create-category", label: "Create Category" },
    { id: "create-event", label: "Create Event" },
    { id: "apps", label: "App Directory", hint: "Opens Discord" },
    { id: "hide-muted", label: "Hide Muted Channels" },
    { id: "notifications", label: "Notification Settings", children: notifyChildren("guild-notify") },
    { id: "privacy", label: "Privacy Settings" },
    { id: "profile", label: "Edit Per-server Profile" },
  ];
}

function notifyChildren(prefix: string): MenuEntry[] {
  return [
    { id: `${prefix}:all`, label: "All Messages" },
    { id: `${prefix}:mentions`, label: "Only Mentions" },
    { id: `${prefix}:mute`, label: "Nothing" },
  ];
}

export function withMoveTargets(items: MenuEntry[], folders: IdName[], looseLabel = "No Folder"): MenuEntry[] {
  const children: MenuEntry[] = [{ id: "move:loose", label: looseLabel }, ...folders.map((folder) => ({ id: `move:${folder.id}`, label: folder.name }))];
  return items.map((item) => (item.id === "move" ? { ...item, children } : item));
}

export function channelContextItems(kind: string): MenuEntry[] {
  const items: MenuEntry[] = [
    { id: "mark-read", label: "Mark as Read" },
    { id: "favorite", label: "Favorite" },
    { id: "invite", label: "Invite" },
    { id: "pin-top", label: "Pin Channel to Top" },
    { id: "copy-link", label: "Copy Link" },
    { id: "mute", label: "Mute Channel" },
    { id: "notifications", label: "Notification Settings", children: notifyChildren("notify") },
    { id: "move", label: "Move", children: [
      { id: "move:up", label: "Up" },
      { id: "move:down", label: "Down" },
    ] },
    { id: "edit", label: "Edit Channel" },
    { id: "duplicate", label: "Duplicate Channel" },
    { id: "delete", label: "Delete Channel", danger: true },
    { id: "copy-id", label: "Copy Channel ID" },
  ];
  if (kind === "voice" || kind === "stage") {
    items.find((item) => item.id === "move")?.children?.push({ id: "move:category", label: "Change Category" });
  }
  return items;
}

export function categoryContextItems(): MenuEntry[] {
  return [
    { id: "mute", label: "Mute Category" },
    { id: "notifications", label: "Notification Settings", children: notifyChildren("notify") },
    { id: "edit", label: "Edit Category" },
    { id: "delete", label: "Delete Category", danger: true },
  ];
}

export function folderMoveItems(folders: IdName[], currentId: string): MenuEntry[] {
  return folders
    .filter((folder) => folder.id !== currentId)
    .map((folder) => ({ id: `folder-move:${folder.id}`, label: folder.name }));
}

export interface PermItem {
  flag: bigint;
  label: string;
  group: "General" | "Membership" | "Text" | "Voice" | "Apps" | "Events" | "Advanced";
}

export const PERMISSIONS: PermItem[] = [
  { flag: 1n << 5n, label: "Manage Server", group: "General" },
  { flag: VIEW_CHANNEL, label: "View Channels", group: "General" },
  { flag: 1n << 4n, label: "Manage Channels", group: "General" },
  { flag: 1n << 28n, label: "Manage Roles", group: "General" },
  { flag: 1n << 30n, label: "Manage Expressions", group: "General" },
  { flag: 1n << 43n, label: "Create Expressions", group: "General" },
  { flag: 1n << 7n, label: "View Audit Log", group: "General" },
  { flag: 1n << 19n, label: "View Server Insights", group: "General" },
  { flag: 1n << 29n, label: "Manage Webhooks", group: "General" },
  { flag: 1n << 0n, label: "Create Invite", group: "Membership" },
  { flag: 1n << 26n, label: "Change Nickname", group: "Membership" },
  { flag: 1n << 27n, label: "Manage Nicknames", group: "Membership" },
  { flag: 1n << 1n, label: "Kick Members", group: "Membership" },
  { flag: 1n << 2n, label: "Ban Members", group: "Membership" },
  { flag: 1n << 40n, label: "Timeout Members", group: "Membership" },
  { flag: 1n << 11n, label: "Send Messages", group: "Text" },
  { flag: 1n << 35n, label: "Create Public Threads", group: "Text" },
  { flag: 1n << 36n, label: "Create Private Threads", group: "Text" },
  { flag: 1n << 38n, label: "Send Messages in Threads", group: "Text" },
  { flag: 1n << 12n, label: "Send Text-to-Speech Messages", group: "Text" },
  { flag: 1n << 13n, label: "Manage Messages", group: "Text" },
  { flag: 1n << 34n, label: "Manage Threads", group: "Text" },
  { flag: 1n << 14n, label: "Embed Links", group: "Text" },
  { flag: 1n << 15n, label: "Attach Files", group: "Text" },
  { flag: 1n << 16n, label: "Read Message History", group: "Text" },
  { flag: 1n << 17n, label: "Mention @everyone, @here, and All Roles", group: "Text" },
  { flag: 1n << 18n, label: "Use External Emoji", group: "Text" },
  { flag: 1n << 37n, label: "Use External Stickers", group: "Text" },
  { flag: 1n << 6n, label: "Add Reactions", group: "Text" },
  { flag: 1n << 46n, label: "Send Voice Messages", group: "Text" },
  { flag: 1n << 49n, label: "Create Polls", group: "Text" },
  { flag: 1n << 20n, label: "Connect", group: "Voice" },
  { flag: 1n << 21n, label: "Speak", group: "Voice" },
  { flag: 1n << 9n, label: "Video", group: "Voice" },
  { flag: 1n << 42n, label: "Use Soundboard", group: "Voice" },
  { flag: 1n << 45n, label: "Use External Sounds", group: "Voice" },
  { flag: 1n << 25n, label: "Use Voice Activity", group: "Voice" },
  { flag: 1n << 8n, label: "Priority Speaker", group: "Voice" },
  { flag: 1n << 22n, label: "Mute Members", group: "Voice" },
  { flag: 1n << 23n, label: "Deafen Members", group: "Voice" },
  { flag: 1n << 24n, label: "Move Members", group: "Voice" },
  { flag: 1n << 32n, label: "Request to Speak", group: "Voice" },
  { flag: 1n << 31n, label: "Use Application Commands", group: "Apps" },
  { flag: 1n << 39n, label: "Use Activities", group: "Apps" },
  { flag: 1n << 50n, label: "Use External Apps", group: "Apps" },
  { flag: 1n << 44n, label: "Create Events", group: "Events" },
  { flag: 1n << 33n, label: "Manage Events", group: "Events" },
  { flag: ADMINISTRATOR, label: "Administrator", group: "Advanced" },
];

export const PERMISSION_GROUPS = ["General", "Membership", "Text", "Voice", "Apps", "Events", "Advanced"] as const;

export function permissionsIn(group: (typeof PERMISSION_GROUPS)[number]): PermItem[] {
  return PERMISSIONS.filter((item) => item.group === group);
}

export interface RoleRow {
  id: string;
  name: string;
  position: number;
  permissions?: string;
  color?: number | string | null;
  hoist?: boolean;
  mentionable?: boolean;
}

export function reorderRole(roles: RoleRow[], id: string, direction: -1 | 1): { id: string; position: number }[] | null {
  const sorted = [...roles].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const index = sorted.findIndex((role) => role.id === id);
  if (index < 0) return null;
  const swap = index + direction;
  if (swap < 0 || swap >= sorted.length) return null;
  const moving = sorted[index];
  const other = sorted[swap];
  if (moving.position === 0 || other.position === 0) return null;
  return [
    { id: moving.id, position: other.position },
    { id: other.id, position: moving.position },
  ];
}

export function duplicateChannelBody(channel: {
  name: string;
  kind: string;
  parentId?: string | null;
  topic?: string | null;
}): Record<string, unknown> | null {
  const kind = channel.kind === "voice" || channel.kind === "forum" || channel.kind === "category" ? channel.kind : "text";
  const name = clampChannelName(`${channel.name}-copy`, kind);
  if (!name) return null;
  const body: Record<string, unknown> = { name, type: CREATE_TYPES[kind] ?? 0 };
  if (channel.parentId && kind !== "category") body.parent_id = channel.parentId;
  if (channel.topic) body.topic = channel.topic.slice(0, 1024);
  return body;
}

export function movedPosition(
  channels: { id: string; position: number; parentId?: string | null }[],
  id: string,
  direction: "up" | "down",
): { position: number; parentId: string | null } | null {
  const current = channels.find((channel) => channel.id === id);
  if (!current) return null;
  const ordered = [...channels.filter((channel) => (channel.parentId ?? null) === (current.parentId ?? null))].sort(
    (a, b) => a.position - b.position,
  );
  const index = ordered.findIndex((channel) => channel.id === id);
  const next = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || next < 0 || next >= ordered.length) return null;
  const neighbor = ordered[next];
  return { position: neighbor.position, parentId: current.parentId ?? null };
}

export const SLOWMODE_SECONDS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];

export function clampSlowmode(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  let best = 0;
  for (const option of SLOWMODE_SECONDS) if (option <= seconds) best = option;
  return best;
}

export function clampBitrate(kbps: number): number {
  if (!Number.isFinite(kbps)) return 64000;
  const bits = Math.round(kbps * 1000);
  return Math.min(96000, Math.max(8000, bits));
}

export function textChannelPatch(input: {
  name: string;
  topic: string;
  slowmode: number;
  nsfw: boolean;
  hideAfter: number | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: clampChannelName(input.name, "text") || "channel",
    topic: input.topic.slice(0, 1024),
    rate_limit_per_user: clampSlowmode(input.slowmode),
    nsfw: Boolean(input.nsfw),
  };
  if (input.hideAfter == null) body.default_auto_archive_duration = 4320;
  else body.default_auto_archive_duration = input.hideAfter;
  return body;
}

export function voiceChannelPatch(input: {
  name: string;
  bitrateKbps: number;
  videoQuality: 1 | 2;
  userLimit: number;
  region: string;
}): Record<string, unknown> {
  const region = input.region === "auto" || input.region === "" ? null : input.region;
  return {
    name: clampChannelName(input.name, "voice") || "Voice",
    bitrate: clampBitrate(input.bitrateKbps),
    video_quality_mode: input.videoQuality === 2 ? 2 : 1,
    user_limit: Math.min(99, Math.max(0, Math.round(input.userLimit) || 0)),
    rtc_region: region,
  };
}

export const RTC_REGIONS = ["auto", "us-west", "us-east", "us-central", "us-south", "europe", "brazil", "singapore", "japan", "hongkong", "sydney", "india", "southafrica"];

export function syncOverwritePlan(parent: OverwriteBits[], current: OverwriteBits[]): { put: OverwriteBits[]; remove: string[] } {
  const key = (overwrite: OverwriteBits) => `${overwrite.kind}:${overwrite.id}`;
  const parentKeys = new Set(parent.map(key));
  return {
    put: parent.map((overwrite) => ({ ...overwrite })),
    remove: current.filter((overwrite) => !parentKeys.has(key(overwrite))).map((overwrite) => overwrite.id),
  };
}

export function roleOverwrite(roleId: string, allowView: boolean): OverwriteBits {
  return allowView
    ? { id: roleId, kind: 0, allow: VIEW_CHANNEL.toString(), deny: "0" }
    : { id: roleId, kind: 0, allow: "0", deny: VIEW_CHANNEL.toString() };
}

export const BOOST_TIERS = [
  { level: 1, need: 2 },
  { level: 2, need: 7 },
  { level: 3, need: 14 },
] as const;

export function boostProgress(count: number): { level: number; next: number | null; into: number; ratio: number } {
  const safe = Math.max(0, Math.floor(count) || 0);
  let level = 0;
  let previous = 0;
  for (const tier of BOOST_TIERS) {
    if (safe >= tier.need) {
      level = tier.level;
      previous = tier.need;
    }
  }
  const next = BOOST_TIERS.find((tier) => tier.need > safe) ?? null;
  if (!next) return { level, next: null, into: safe - previous, ratio: 1 };
  const span = next.need - previous;
  return { level, next: next.need, into: safe - previous, ratio: span <= 0 ? 1 : (safe - previous) / span };
}

export function expressionSlots(tier: number): { emoji: number; sticker: number; sound: number } {
  if (tier >= 3) return { emoji: 250, sticker: 60, sound: 48 };
  if (tier >= 2) return { emoji: 150, sticker: 30, sound: 36 };
  if (tier >= 1) return { emoji: 100, sticker: 15, sound: 24 };
  return { emoji: 50, sticker: 5, sound: 8 };
}

export function clampTag(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

export function tagOk(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value);
}

export function vanityOk(code: string): boolean {
  return /^[a-z0-9-]{2,32}$/.test(code);
}

export const SYSTEM_FLAGS = [
  { bit: 1 << 0, label: "Send a random welcome message when someone joins" },
  { bit: 1 << 1, label: "Prompt members to reply to welcome messages with a sticker" },
  { bit: 1 << 2, label: "Send a message when someone boosts this server" },
  { bit: 1 << 3, label: "Send helpful tips while people set up the server" },
] as const;

export function systemFlagOn(flags: number, bit: number): boolean {
  return (flags & bit) === 0;
}

export function toggleSystemFlag(flags: number, bit: number, send: boolean): number {
  return send ? flags & ~bit : flags | bit;
}

export const TIMEOUTS = [
  { id: "60", label: "60 seconds", seconds: 60 },
  { id: "300", label: "5 minutes", seconds: 300 },
  { id: "600", label: "10 minutes", seconds: 600 },
  { id: "3600", label: "1 hour", seconds: 3600 },
  { id: "86400", label: "1 day", seconds: 86400 },
  { id: "604800", label: "1 week", seconds: 604800 },
] as const;

export function timeoutUntil(seconds: number, now = Date.now()): string {
  const known = TIMEOUTS.some((item) => item.seconds === seconds) ? seconds : 60;
  return new Date(now + known * 1000).toISOString();
}

export function snowflakeTime(id: string): string | null {
  if (!/^\d{5,22}$/.test(id)) return null;
  const ms = Number((BigInt(id) >> 22n) + 1420070400000n);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export type MemberSortKey = "name" | "joined" | "discord" | "roles";

export interface MemberTableRow {
  id: string;
  name: string;
  joinedAt?: string | null;
  joinMethod?: string;
  roles: string[];
  signals: string[];
}

export function sortMemberTable(rows: MemberTableRow[], key: MemberSortKey, direction: "asc" | "desc" = "asc"): MemberTableRow[] {
  const sign = direction === "desc" ? -1 : 1;
  const value = (row: MemberTableRow) => {
    if (key === "joined") return row.joinedAt ?? "";
    if (key === "discord") return snowflakeTime(row.id) ?? "";
    if (key === "roles") return row.roles.join(", ");
    return row.name.toLowerCase();
  };
  return [...rows].sort((a, b) => value(a).localeCompare(value(b)) * sign || a.id.localeCompare(b.id));
}

export function memberSignals(input: { pending?: boolean; timedOut?: boolean; mute?: boolean; deaf?: boolean }): string[] {
  const signals: string[] = [];
  if (input.pending) signals.push("Pending");
  if (input.timedOut) signals.push("Timed out");
  if (input.mute) signals.push("Server muted");
  if (input.deaf) signals.push("Server deafened");
  return signals;
}

export function pruneBody(days: number): { days: number; compute_prune_count: boolean } {
  const safe = days === 1 || days === 7 || days === 30 ? days : 7;
  return { days: safe, compute_prune_count: true };
}

export interface AuditFilter {
  userId?: string;
  action?: number | null;
}

export function auditQuery(filter: AuditFilter): { userId: string; extra: string } {
  const userId = filter.userId && /^\d{5,22}$/.test(filter.userId) ? filter.userId : "";
  const extra = filter.action != null && Number.isInteger(filter.action) && filter.action >= 0 && filter.action <= 999 ? String(filter.action) : "";
  return { userId, extra };
}

export const AUDIT_ACTIONS: { id: number; label: string }[] = [
  { id: 1, label: "Server updated" },
  { id: 10, label: "Channel created" },
  { id: 11, label: "Channel updated" },
  { id: 12, label: "Channel deleted" },
  { id: 13, label: "Overwrite created" },
  { id: 14, label: "Overwrite updated" },
  { id: 15, label: "Overwrite deleted" },
  { id: 20, label: "Member kicked" },
  { id: 21, label: "Member pruned" },
  { id: 22, label: "Member banned" },
  { id: 23, label: "Member unbanned" },
  { id: 24, label: "Member updated" },
  { id: 25, label: "Member roles updated" },
  { id: 26, label: "Member moved" },
  { id: 27, label: "Member disconnected" },
  { id: 28, label: "Bot added" },
  { id: 30, label: "Role created" },
  { id: 31, label: "Role updated" },
  { id: 32, label: "Role deleted" },
  { id: 40, label: "Invite created" },
  { id: 41, label: "Invite updated" },
  { id: 42, label: "Invite deleted" },
  { id: 50, label: "Webhook created" },
  { id: 51, label: "Webhook updated" },
  { id: 52, label: "Webhook deleted" },
  { id: 60, label: "Emoji created" },
  { id: 61, label: "Emoji updated" },
  { id: 62, label: "Emoji deleted" },
  { id: 72, label: "Message deleted" },
  { id: 73, label: "Messages bulk deleted" },
  { id: 74, label: "Message pinned" },
  { id: 75, label: "Message unpinned" },
  { id: 110, label: "AutoMod rule created" },
  { id: 111, label: "AutoMod rule updated" },
  { id: 112, label: "AutoMod rule deleted" },
  { id: 140, label: "Member timed out" },
];

export type AutomodKind = "mention" | "spam" | "preset" | "custom";

export function automodBody(input: { kind: AutomodKind; name: string; words?: string[]; mentionLimit?: number; alertChannelId?: string | null; timeoutSeconds?: number | null }): Record<string, unknown> | null {
  const name = input.name.trim().slice(0, 100) || "Rule";
  const actions: Record<string, unknown>[] = [{ type: 1, metadata: {} }];
  if (input.alertChannelId) actions.push({ type: 2, metadata: { channel_id: input.alertChannelId } });
  if (input.timeoutSeconds) actions.push({ type: 3, metadata: { duration_seconds: input.timeoutSeconds } });
  if (input.kind === "mention") {
    return { name, event_type: 1, trigger_type: 5, trigger_metadata: { mention_total_limit: Math.min(50, Math.max(1, input.mentionLimit ?? 5)) }, actions, enabled: true };
  }
  if (input.kind === "spam") return { name, event_type: 1, trigger_type: 3, trigger_metadata: {}, actions, enabled: true };
  if (input.kind === "preset") {
    return { name, event_type: 1, trigger_type: 4, trigger_metadata: { presets: [1, 2, 3] }, actions, enabled: true };
  }
  const words = (input.words ?? []).map((word) => word.trim()).filter(Boolean).slice(0, 1000);
  if (!words.length) return null;
  return { name, event_type: 1, trigger_type: 1, trigger_metadata: { keyword_filter: words }, actions, enabled: true };
}

export function communityBody(input: { rulesChannelId: string; updatesChannelId: string; features: string[] }): Record<string, unknown> | null {
  if (!/^\d{5,22}$/.test(input.rulesChannelId) || !/^\d{5,22}$/.test(input.updatesChannelId)) return null;
  const features = new Set(input.features);
  features.add("COMMUNITY");
  return {
    features: [...features],
    rules_channel_id: input.rulesChannelId,
    public_updates_channel_id: input.updatesChannelId,
    preferred_locale: "en-US",
  };
}

export function verificationBody(input: { enabled: boolean; rules: string; description: string }): Record<string, unknown> {
  const rules = input.rules.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 40);
  return {
    enabled: input.enabled,
    description: input.description.slice(0, 300),
    form_fields: [
      {
        field_type: "TERMS",
        label: "Read and agree to the server rules",
        description: input.description.slice(0, 300),
        required: true,
        values: rules.length ? rules : ["Be kind."],
      },
    ],
  };
}

export function deleteConfirmed(typed: string, serverName: string): boolean {
  return typed.trim() === serverName.trim() && serverName.trim().length > 0;
}

export function viewAsBits(rolePermissions: string | undefined, everyonePermissions: string | undefined): bigint {
  return bitsOf(everyonePermissions) | bitsOf(rolePermissions);
}

export function canUse(bits: bigint, flag: bigint, owner: boolean): boolean {
  if (owner) return true;
  return hasPerm(bits, flag);
}

/** Stream F registers the event wizard. Missing hooks stay quiet for the caller. */
export function openCreateEvent(guildId: string): "opened" | "missing" {
  const host = globalThis as {
    larkCreateEvent?: (guildId: string) => void;
    __lark?: { openCreateEvent?: (guildId: string) => void };
  };
  const hook = host.__lark?.openCreateEvent ?? host.larkCreateEvent;
  if (typeof hook === "function") {
    hook(guildId);
    return "opened";
  }
  return "missing";
}

/** Stream C owns the per-server profile editor. */
export function openPerServerProfile(guildId: string, userId: string): "opened" | "missing" {
  const host = globalThis as {
    larkPerServerProfile?: (guildId: string, userId: string) => void;
    __lark?: { openPerServerProfile?: (guildId: string, userId: string) => void };
  };
  const hook = host.__lark?.openPerServerProfile ?? host.larkPerServerProfile;
  if (typeof hook === "function") {
    hook(guildId, userId);
    return "opened";
  }
  return "missing";
}

export function openStageChannel(channelId: string): boolean {
  const hook = (globalThis as { larkOpenStage?: (channelId: string) => void }).larkOpenStage;
  if (typeof hook !== "function") return false;
  hook(channelId);
  return true;
}

export function openMediaChannel(channelId: string): boolean {
  const hook = (globalThis as { larkOpenMedia?: (channelId: string) => void }).larkOpenMedia;
  if (typeof hook !== "function") return false;
  hook(channelId);
  return true;
}

export function extraChannelItems(channel: { id: string; kind: string }): MenuEntry[] {
  const hook = (globalThis as { larkChannelMenu?: (channel: { id: string; kind: string }) => MenuEntry[] }).larkChannelMenu;
  if (typeof hook !== "function") return [];
  try {
    const items = hook(channel);
    return Array.isArray(items) ? items.filter((item) => item && typeof item.id === "string" && typeof item.label === "string") : [];
  } catch {
    return [];
  }
}
