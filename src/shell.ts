import type { AppConfig, NotifyLevel } from "./types";

export const VIEW_CHANNEL = 1 << 10;
export const ADMINISTRATOR = 1 << 3;

export interface GuildFolder {
  id: string | null;
  name: string | null;
  color: string | null;
  guildIds: string[];
}

export type RailEntry =
  | { kind: "guild"; guildId: string }
  | { kind: "folder"; id: string; name: string; color: string | null; guildIds: string[] };

export interface RoleGrant {
  id: string;
  permissions: string;
}

export interface ChannelOverwrite {
  id: string;
  kind: number;
  allow: string;
  deny: string;
}

export interface GuildAccess {
  owner: boolean;
  permissions: string;
  roles: RoleGrant[];
  myRoles: string[];
}

export interface ChannelPref {
  muted: boolean;
  level: NotifyLevel | null;
  collapsed: boolean;
}

export interface GuildPref {
  muted: boolean;
  level: NotifyLevel | null;
  suppressEveryone: boolean;
  suppressRoles: boolean;
  channels: Record<string, ChannelPref>;
  /** Set when this guild's settings were read from Discord, not typed on this device. */
  authoritative?: boolean;
}

export interface DiscordNotify {
  guilds: Record<string, GuildPref>;
  dms: Record<string, ChannelPref>;
  /** The private-channel (`@me`) settings snapshot has arrived. */
  dmsReady?: boolean;
}

export interface ReadMarker {
  lastMessageId: string;
  mentionCount: number;
}

const LEVELS = new Set<NotifyLevel>(["all", "mentions", "mute"]);

export function parseBits(value: string | undefined): number {
  if (!value) return 0;
  const bits = Number(value);
  return Number.isSafeInteger(bits) && bits >= 0 ? bits : 0;
}

export function channelPermissions(input: {
  userId: string;
  guildId: string;
  owner: boolean;
  base: number;
  myRoles: string[];
  overwrites: ChannelOverwrite[];
}): number {
  if (input.owner || (input.base & ADMINISTRATOR) !== 0) return Number.MAX_SAFE_INTEGER;
  let permissions = input.base;
  const everyone = input.overwrites.find((overwrite) => overwrite.kind === 0 && overwrite.id === input.guildId);
  if (everyone) {
    permissions = (permissions & ~parseBits(everyone.deny)) | parseBits(everyone.allow);
  }
  let allow = 0;
  let deny = 0;
  for (const role of input.myRoles) {
    const overwrite = input.overwrites.find((item) => item.kind === 0 && item.id === role);
    if (!overwrite) continue;
    allow |= parseBits(overwrite.allow);
    deny |= parseBits(overwrite.deny);
  }
  permissions = (permissions & ~deny) | allow;
  const member = input.overwrites.find((overwrite) => overwrite.kind === 1 && overwrite.id === input.userId);
  if (member) permissions = (permissions & ~parseBits(member.deny)) | parseBits(member.allow);
  return permissions >>> 0;
}

export function canViewChannel(input: {
  userId: string;
  guildId: string;
  access: GuildAccess | null;
  overwrites?: ChannelOverwrite[];
}): boolean {
  if (!input.access) return true;
  const base = input.access.permissions
    ? parseBits(input.access.permissions)
    : baseFromRoles(input.access.roles, input.access.myRoles, input.guildId);
  return (channelPermissions({
    userId: input.userId,
    guildId: input.guildId,
    owner: input.access.owner,
    base,
    myRoles: input.access.myRoles,
    overwrites: input.overwrites ?? [],
  }) & VIEW_CHANNEL) !== 0;
}

function baseFromRoles(roles: RoleGrant[], myRoles: string[], guildId: string): number {
  let bits = 0;
  for (const role of roles) {
    if (role.id === guildId || myRoles.includes(role.id)) bits |= parseBits(role.permissions);
  }
  return bits >>> 0;
}

/** Folder order is the server order. A slot without an id is a loose server. */
export function layoutRail(guildIds: string[], folders: GuildFolder[]): RailEntry[] {
  if (!folders.length) return guildIds.map((guildId) => ({ kind: "guild", guildId }));
  const known = new Set(guildIds);
  const seen = new Set<string>();
  const entries: RailEntry[] = [];
  for (const folder of folders) {
    const ids = folder.guildIds.filter((id) => known.has(id) && !seen.has(id));
    for (const id of ids) seen.add(id);
    if (!ids.length) continue;
    if (folder.id) {
      entries.push({
        kind: "folder",
        id: folder.id,
        name: folder.name?.trim() || "Folder",
        color: folder.color,
        guildIds: ids,
      });
    } else {
      for (const guildId of ids) entries.push({ kind: "guild", guildId });
    }
  }
  for (const guildId of guildIds) {
    if (!seen.has(guildId)) entries.push({ kind: "guild", guildId });
  }
  return entries;
}

/** Servers in rail order, including the ones inside a folder. */
export function orderedGuildIds(guildIds: string[], folders: GuildFolder[]): string[] {
  const ids: string[] = [];
  for (const entry of layoutRail(guildIds, folders)) {
    if (entry.kind === "guild") ids.push(entry.guildId);
    else ids.push(...entry.guildIds);
  }
  return ids;
}

/** Home is null and sits first. The step wraps. */
export function cycleServer(ids: readonly (string | null)[], current: string | null, delta: number): string | null {
  if (!ids.length || delta === 0) return current;
  const index = ids.indexOf(current);
  const size = ids.length;
  const start = index < 0 ? (delta > 0 ? -1 : 0) : index;
  const next = ((start + delta) % size + size) % size;
  const picked = ids[next];
  return picked === undefined ? current : picked;
}

export function isNewerSnowflake(messageId: string, lastRead: string): boolean {
  if (!messageId) return false;
  if (!lastRead) return true;
  if (messageId.length !== lastRead.length) return messageId.length > lastRead.length;
  return messageId > lastRead;
}

export function channelFlags(input: {
  lastMessageId?: string | null;
  marker?: ReadMarker | null;
  localUnread: number;
  localMentions: number;
  viewing: boolean;
}): { unread: number; mentions: number } {
  if (input.viewing) return { unread: 0, mentions: 0 };
  const mentions = Math.max(0, input.marker?.mentionCount ?? 0) + Math.max(0, input.localMentions);
  const newer = Boolean(
    input.lastMessageId && input.marker && isNewerSnowflake(input.lastMessageId, input.marker.lastMessageId),
  );
  const unread = Math.max(0, input.localUnread) + (newer && input.localUnread <= 0 ? 1 : 0);
  return { unread: Math.max(unread, mentions > 0 || newer ? 1 : 0), mentions };
}

export function dockBadge(entries: { mentions: number; unread: number; dm: boolean }[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.mentions > 0) count += entry.mentions;
    else if (entry.dm && entry.unread > 0) count += 1;
  }
  return count;
}

export function asLevel(value: unknown): NotifyLevel | null {
  return typeof value === "string" && LEVELS.has(value as NotifyLevel) ? (value as NotifyLevel) : null;
}

function levelFromPref(pref: { muted?: boolean; level?: NotifyLevel | null } | undefined): NotifyLevel | null {
  if (!pref) return null;
  if (pref.muted || pref.level === "mute") return "mute";
  if (pref.level) return pref.level;
  return null;
}

export function effectiveLevel(
  config: AppConfig,
  guildId: string | null,
  channelId: string,
  discord?: DiscordNotify | null,
): NotifyLevel {
  if (guildId && discord?.guilds[guildId]?.authoritative) {
    const guild = discord.guilds[guildId];
    return levelFromPref(guild.channels[channelId]) ?? levelFromPref(guild) ?? config.notifications.default;
  }
  if (!guildId && discord?.dmsReady) {
    return levelFromPref(discord.dms[channelId]) ?? config.notifications.default;
  }
  const channelPref = guildId ? discord?.guilds[guildId]?.channels[channelId] : discord?.dms[channelId];
  const remoteChannel = levelFromPref(channelPref);
  if (remoteChannel) return remoteChannel;
  const savedChannel = config.notifications.channels[channelId];
  if (savedChannel?.muted) return "mute";
  if (savedChannel?.level) return savedChannel.level;
  if (guildId) {
    const guildPref = discord?.guilds[guildId];
    const remoteGuild = levelFromPref(guildPref);
    if (remoteGuild) return remoteGuild;
    const savedGuild = config.notifications.guilds[guildId];
    if (savedGuild?.muted) return "mute";
    if (savedGuild?.level) return savedGuild.level;
  }
  return config.notifications.default;
}

export function mentionsUser(input: {
  mentionIds: string[];
  mentionRoles: string[];
  mentionEveryone: boolean;
  meId: string;
  myRoles: string[];
  suppressEveryone: boolean;
  suppressRoles: boolean;
  direct: boolean;
}): boolean {
  if (input.direct) return true;
  if (input.mentionIds.includes(input.meId)) return true;
  if (input.mentionEveryone && !input.suppressEveryone) return true;
  if (!input.suppressRoles && input.mentionRoles.some((role) => input.myRoles.includes(role))) return true;
  return false;
}

export function inviteCode(url: string): string | null {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return null;
  const withoutScheme = trimmed.includes("://") ? trimmed.slice(trimmed.indexOf("://") + 3) : trimmed;
  const hostPath = withoutScheme.split(/[?#]/, 1)[0];
  const parts = hostPath.split("/").filter(Boolean);
  if (!parts.length) return null;
  const host = parts[0].split("@").pop()?.split(":")[0]?.toLowerCase() ?? "";
  let code = "";
  if (host === "discord.gg" || host.endsWith(".discord.gg")) code = parts[1] ?? "";
  else if (host === "discord.com" || host === "discordapp.com" || host.endsWith(".discord.com")) {
    if (parts[1] !== "invite") return null;
    code = parts[2] ?? "";
  } else return null;
  if (/^[A-Za-z0-9-]{2,32}$/.test(code)) return code;
  return null;
}

export function normalizeFolder(raw: {
  id?: string | number | null;
  name?: string | null;
  color?: string | null;
  guildIds?: string[];
}): GuildFolder | null {
  const guildIds = (raw.guildIds ?? []).filter((id) => /^\d{5,22}$/.test(id));
  if (!guildIds.length) return null;
  const id = raw.id === null || raw.id === undefined || raw.id === "" ? null : String(raw.id);
  const name = raw.name?.trim() ? raw.name.trim().slice(0, 80) : null;
  const color = raw.color && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : null;
  return { id, name, color, guildIds };
}

export function folderBadge(guildIds: string[], badgeFor: (guildId: string) => { mentions: number; unread: number }): {
  mentions: number;
  unread: boolean;
} {
  let mentions = 0;
  let unread = false;
  for (const guildId of guildIds) {
    const badge = badgeFor(guildId);
    mentions += badge.mentions;
    if (badge.unread > 0 || badge.mentions > 0) unread = true;
  }
  return { mentions, unread };
}
