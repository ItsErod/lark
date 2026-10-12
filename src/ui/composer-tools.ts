/**
 * Messaging and composer behavior for Discord parity.
 *
 * Other streams register into this module. Nothing here implements threads,
 * polls, activities, Developer Mode, or the block list.
 *
 * - F: `onCreateThread` / `onCreatePoll` in `src/threads.ts`. A registered
 *   `registerMessagingHooks` callback or `globalThis.__larkOnCreateThread` /
 *   `__larkOnCreatePoll` wins when present.
 * - E: `onLaunchActivity` or `globalThis.__larkOnLaunchActivity`.
 * - D: Developer Mode via `globalThis.__larkDeveloperMode` or
 *   `config.appearance.developer_mode`. Embed and spoiler flags via
 *   `config.appearance.show_embeds` and `show_spoiler_content`, or
 *   `globalThis.__larkShowEmbeds` / `__larkRevealSpoilers`.
 * - C: blocked authors via `globalThis.__larkBlockedIds` (Set, array, or getter).
 */
import { bookmarkMenuLabel } from "../pack/bookmarks";
import { reminderMenuLabel } from "../reminders";
import { onCreatePoll as streamCreatePoll, onCreateThread as streamCreateThread } from "../threads";
import { el } from "./dom";

const DISCORD_EPOCH = 1_420_070_400_000n;
export const NITRO_URL = "https://discord.com/nitro";
export const APP_DIRECTORY_URL = "https://discord.com/app-directory";
export const SLASH_PREFIX = "\u0001slash:";

export interface MessagingHooks {
  onCreateThread?: (channelId: string, messageId: string | null) => void;
  onCreatePoll?: (channelId: string) => void;
  onLaunchActivity?: (channelId: string | null) => void;
}

type HookName = keyof MessagingHooks;

const hooks: MessagingHooks = {};

export function registerMessagingHooks(next: MessagingHooks) {
  if (next.onCreateThread) hooks.onCreateThread = next.onCreateThread;
  if (next.onCreatePoll) hooks.onCreatePoll = next.onCreatePoll;
  if (next.onLaunchActivity) hooks.onLaunchActivity = next.onLaunchActivity;
}

function globalHook(name: HookName): MessagingHooks[HookName] {
  const aliases: Record<HookName, string[]> = {
    onCreateThread: ["__larkOnCreateThread", "onCreateThread"],
    onCreatePoll: ["__larkOnCreatePoll", "onCreatePoll"],
    onLaunchActivity: ["__larkOnLaunchActivity", "onLaunchActivity"],
  };
  const bag = globalThis as unknown as Record<string, unknown>;
  for (const key of aliases[name]) {
    const value = bag[key];
    if (typeof value === "function") return value as MessagingHooks[HookName];
  }
  return undefined;
}

function callHook(name: HookName, ...args: [string, (string | null)?]): boolean {
  const fn = hooks[name] ?? globalHook(name);
  if (typeof fn !== "function") return false;
  if (name === "onCreateThread") (fn as MessagingHooks["onCreateThread"])?.(args[0], args[1] ?? null);
  else if (name === "onCreatePoll") (fn as MessagingHooks["onCreatePoll"])?.(args[0]);
  else (fn as MessagingHooks["onLaunchActivity"])?.(args[0]);
  return true;
}

function callStream(name: "onCreateThread" | "onCreatePoll", channelId: string, messageId: string | null): boolean {
  try {
    if (name === "onCreateThread") streamCreateThread({ channelId, messageId });
    else streamCreatePoll({ channelId });
    return true;
  } catch {
    return false;
  }
}

export function requestCreateThread(channelId: string, messageId?: string | null): boolean {
  if (!channelId) return false;
  if (callHook("onCreateThread", channelId, messageId ?? null)) return true;
  return callStream("onCreateThread", channelId, messageId ?? null);
}

export function requestCreatePoll(channelId: string): boolean {
  if (!channelId) return false;
  if (callHook("onCreatePoll", channelId)) return true;
  return callStream("onCreatePoll", channelId, null);
}

export function requestLaunchActivity(channelId: string | null): boolean {
  return callHook("onLaunchActivity", channelId ?? "");
}

const messagingApi = {
  registerMessagingHooks,
  requestCreateThread,
  requestCreatePoll,
  requestLaunchActivity,
};
(globalThis as unknown as { __larkMessaging?: typeof messagingApi }).__larkMessaging = messagingApi;

export interface PlusItem {
  id: "upload" | "thread" | "poll" | "apps";
  label: string;
}

export function plusMenuItems(): PlusItem[] {
  return [
    { id: "upload", label: "Upload a File" },
    { id: "thread", label: "Create Thread" },
    { id: "poll", label: "Create Poll" },
    { id: "apps", label: "Use Apps" },
  ];
}

export function discordPageOk(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "discord.com" && parsed.username === "";
  } catch {
    return false;
  }
}

export function gifChoice(url: string, shift: boolean): { mode: "insert" | "send"; text: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return { mode: shift ? "insert" : "send", text: parsed.toString() };
  } catch {
    return null;
  }
}

export interface GifHit {
  id: string;
  title: string;
  url: string;
  preview: string;
}

export function gifsFromPayload(payload: unknown): GifHit[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const list = Array.isArray(payload) ? payload : Array.isArray(root.gifs) ? root.gifs : [];
  const hits: GifHit[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = firstHttps(record.url, record.gif_src, record.src, record.preview);
    if (!url) continue;
    const preview = firstHttps(record.preview, record.src, url) ?? url;
    hits.push({
      id: typeof record.id === "string" && record.id ? record.id : url,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : "GIF",
      url,
      preview,
    });
    if (hits.length >= 24) break;
  }
  return hits;
}

function firstHttps(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂"];

/** Hover bar is three emoji, even when a plugin offers more. */
export function pickQuickReactions(plugin: readonly string[] | undefined, frequent: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const push = (emoji: string) => {
    const glyph = emoji.trim();
    if (!glyph || glyph.includes(":") || out.includes(glyph) || out.length >= 3) return;
    out.push(glyph);
  };
  for (const emoji of plugin ?? []) push(emoji);
  for (const emoji of frequent ?? []) push(emoji);
  for (const emoji of DEFAULT_QUICK_REACTIONS) push(emoji);
  return out.slice(0, 3);
}

export interface MenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

export function messageMenuItems(input: {
  mine: boolean;
  pinned: boolean;
  developerMode: boolean;
  bookmarked: boolean;
  reminded: boolean;
  hasTranslate: boolean;
  translated: boolean;
  hasHide: boolean;
}): MenuItem[] {
  const items: MenuItem[] = [{ id: "react", label: "Add Reaction" }];
  if (input.mine) items.push({ id: "edit", label: "Edit Message" });
  items.push({ id: "pin", label: input.pinned ? "Unpin Message" : "Pin Message" });
  items.push(
    { id: "reply", label: "Reply" },
    { id: "forward", label: "Forward Message" },
    { id: "thread", label: "Create Thread" },
    { id: "copy", label: "Copy Text" },
    { id: "apps", label: "Apps" },
    { id: "bookmark", label: bookmarkMenuLabel(input.bookmarked) },
    { id: "remind", label: reminderMenuLabel(input.reminded) },
    { id: "unread", label: "Mark Unread" },
    { id: "link", label: "Copy Message Link" },
    { id: "speak", label: "Speak Message" },
  );
  if (input.hasTranslate) items.push({ id: "translate", label: input.translated ? "Show Original" : "Translate" });
  if (input.hasHide) items.push({ id: "hide", label: "Hide" });
  if (input.developerMode) items.push({ id: "id", label: "Copy Message ID" });
  if (input.mine) items.push({ id: "delete", label: "Delete Message", danger: true });
  return items;
}

export function messageLink(guildId: string | null | undefined, channelId: string, messageId: string): string {
  const guild = guildId && /^\d{5,22}$/.test(guildId) ? guildId : "@me";
  return `https://discord.com/channels/${guild}/${channelId}/${messageId}`;
}

export function markUnreadPlan(ids: readonly string[], messageId: string): { ackId: string; count: number } {
  const index = ids.indexOf(messageId);
  const count = index >= 0 ? Math.max(1, ids.length - index) : 1;
  if (index > 0) return { ackId: ids[index - 1], count };
  if (/^\d{5,22}$/.test(messageId)) {
    try {
      return { ackId: (BigInt(messageId) - 1n).toString(), count };
    } catch {
      /* fall through */
    }
  }
  return { ackId: messageId, count };
}

export function reactorSummary(names: readonly string[]): string {
  const people = names.map((name) => name.trim()).filter(Boolean);
  if (!people.length) return "Nobody reacted";
  if (people.length === 1) return people[0];
  if (people.length === 2) return `${people[0]} and ${people[1]}`;
  if (people.length === 3) return `${people[0]}, ${people[1]}, and ${people[2]}`;
  return `${people[0]}, ${people[1]}, and ${people.length - 2} others`;
}

const JOIN_LINES = [
  "{user} just joined the server - glhf!",
  "{user} just joined. Everyone, look busy!",
  "{user} just joined. Can I get a heal?",
  "{user} joined your party.",
  "{user} joined. You must construct additional pylons.",
  "Ermagherd. {user} is here.",
  "Welcome, {user}. Stay awhile and listen.",
  "Welcome, {user}. We hope you brought pizza.",
  "A wild {user} appeared.",
  "{user} just landed.",
  "{user} just slid into the server.",
  "Welcome {user}. Say hi!",
  "{user} hopped into the server.",
  "Everyone welcome {user}!",
  "Glad you're here, {user}.",
  "Good to see you, {user}.",
  "Yay you made it, {user}!",
];

export interface SystemInput {
  id: string;
  kind?: string;
  messageType?: number;
  authorName: string;
  content: string;
  timestamp?: string;
  callEnded?: string | null;
}

export interface SystemView {
  text: string;
  icon: "join" | "call" | "pin" | "boost";
  pins: boolean;
}

export function systemMessage(input: SystemInput): SystemView | null {
  const type = input.messageType ?? (input.kind === "join" ? 7 : 0);
  const user = input.authorName.trim() || "Someone";
  if (input.content.trim() && type !== 3 && type !== 6 && type !== 7 && type !== 8 && type !== 9 && type !== 10 && type !== 11) {
    return null;
  }
  if (type === 7 || input.kind === "join") {
    if (input.content.trim()) return { text: input.content.trim(), icon: "join", pins: false };
    return { text: joinLine(user, input.id), icon: "join", pins: false };
  }
  if (type === 3) {
    const duration = input.callEnded && input.timestamp ? formatCallDuration(input.timestamp, input.callEnded) : null;
    const text = duration ? `${user} started a call that lasted ${duration}.` : `${user} started a call.`;
    return { text, icon: "call", pins: false };
  }
  if (type === 6) return { text: `${user} pinned a message to this channel.`, icon: "pin", pins: true };
  if (type === 8) return { text: `${user} just boosted the server!`, icon: "boost", pins: false };
  if (type === 9 || type === 10 || type === 11) {
    const level = type - 8;
    return { text: `${user} just boosted the server! The server has achieved Level ${level}!`, icon: "boost", pins: false };
  }
  return null;
}

export function joinLine(user: string, messageId: string): string {
  let hash = 0;
  for (const char of messageId) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return JOIN_LINES[hash % JOIN_LINES.length].replaceAll("{user}", user || "Someone");
}

export function formatCallDuration(startIso: string, endIso: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function snowflakeFromTime(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const value = BigInt(Math.trunc(ms));
  if (value < DISCORD_EPOCH) return null;
  return ((value - DISCORD_EPOCH) << 22n).toString();
}

export function snowflakeTime(id: string): number | null {
  if (!/^\d{5,22}$/.test(id)) return null;
  try {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  } catch {
    return null;
  }
}

const HAS_VALUES = new Set(["link", "embed", "file", "video", "image", "sound", "sticker", "poll", "snapshot"]);

export interface ParsedSearch {
  content: string;
  from: string[];
  mentions: string[];
  has: string[];
  before: string[];
  after: string[];
  in: string[];
  pinned: boolean | null;
}

export interface SearchDirectory {
  users: Record<string, string>;
  channels: Record<string, string>;
  meId: string;
}

export interface ResolvedSearch {
  content: string;
  authorIds: string[];
  mentionIds: string[];
  has: string[];
  beforeId: string | null;
  afterId: string | null;
  beforeMs: number | null;
  afterMs: number | null;
  channelIds: string[];
  pinned: boolean | null;
  unresolved: string[];
}

export function parseSearchQuery(input: string): ParsedSearch {
  const from: string[] = [];
  const mentions: string[] = [];
  const has: string[] = [];
  const before: string[] = [];
  const after: string[] = [];
  const inside: string[] = [];
  let pinned: boolean | null = null;
  const content = input.replace(/(?:^|\s)(from|mentions|has|before|after|in|pinned):(?:"([^"]+)"|(\S+))/gi, (all, key: string, quoted?: string, bare?: string) => {
    const value = (quoted ?? bare ?? "").trim();
    const name = key.toLowerCase();
    if (!value) return all.startsWith(" ") ? " " : "";
    if (name === "from") from.push(value);
    else if (name === "mentions") mentions.push(value);
    else if (name === "has" && HAS_VALUES.has(value.toLowerCase())) has.push(value.toLowerCase());
    else if (name === "before") before.push(value);
    else if (name === "after") after.push(value);
    else if (name === "in") inside.push(value.replace(/^#/, ""));
    else if (name === "pinned") pinned = /^(1|true|yes)$/i.test(value) ? true : /^(0|false|no)$/i.test(value) ? false : pinned;
    return all.startsWith(" ") ? " " : "";
  });
  return {
    content: content.replace(/\s+/g, " ").trim(),
    from,
    mentions,
    has,
    before,
    after,
    in: inside,
    pinned,
  };
}

export function resolveSearch(parsed: ParsedSearch, directory: SearchDirectory): ResolvedSearch {
  const unresolved: string[] = [];
  const authorIds = parsed.from.map((token) => resolveUser(token, directory, unresolved)).filter((id): id is string => Boolean(id));
  const mentionIds = parsed.mentions.map((token) => resolveUser(token, directory, unresolved)).filter((id): id is string => Boolean(id));
  const channelIds = parsed.in.map((token) => resolveChannel(token, directory, unresolved)).filter((id): id is string => Boolean(id));
  const before = boundary(parsed.before[parsed.before.length - 1]);
  const after = boundary(parsed.after[parsed.after.length - 1]);
  return {
    content: parsed.content,
    authorIds,
    mentionIds,
    has: parsed.has,
    beforeId: before?.id ?? null,
    afterId: after?.id ?? null,
    beforeMs: before?.ms ?? null,
    afterMs: after?.ms ?? null,
    channelIds,
    pinned: parsed.pinned,
    unresolved,
  };
}

export function hasSearchCriteria(search: ResolvedSearch): boolean {
  return Boolean(
    search.content
    || search.authorIds.length
    || search.mentionIds.length
    || search.has.length
    || search.beforeId
    || search.afterId
    || search.channelIds.length
    || search.pinned !== null,
  );
}

function resolveUser(token: string, directory: SearchDirectory, unresolved: string[]): string | null {
  const cleaned = token.trim().replace(/^@/, "");
  if (!cleaned) return null;
  if (/^(me|myself)$/i.test(cleaned) && directory.meId) return directory.meId;
  if (/^\d{5,22}$/.test(cleaned)) return cleaned;
  const needle = cleaned.toLowerCase();
  const hit = Object.entries(directory.users).find(([, name]) => name.toLowerCase() === needle || name.toLowerCase().includes(needle));
  if (hit) return hit[0];
  unresolved.push(`from:${token}`);
  return null;
}

function resolveChannel(token: string, directory: SearchDirectory, unresolved: string[]): string | null {
  const cleaned = token.trim().replace(/^#/, "");
  if (/^\d{5,22}$/.test(cleaned)) return cleaned;
  const needle = cleaned.toLowerCase();
  const hit = Object.entries(directory.channels).find(([, name]) => name.toLowerCase() === needle || name.toLowerCase().includes(needle));
  if (hit) return hit[0];
  unresolved.push(`in:${token}`);
  return null;
}

function boundary(token: string | undefined): { id: string; ms: number | null } | null {
  if (!token) return null;
  if (/^\d{5,22}$/.test(token) && token.length >= 15) {
    return { id: token, ms: snowflakeTime(token) };
  }
  const ms = Date.parse(token);
  if (!Number.isFinite(ms)) return null;
  const id = snowflakeFromTime(ms);
  return id ? { id, ms } : null;
}

export interface SearchableMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  pinned?: boolean;
  mentionIds?: string[];
  attachments?: { name: string; contentType?: string }[];
  embeds?: unknown[];
  stickers?: unknown[];
  forwarded?: unknown;
  messageType?: number;
  poll?: unknown;
}

export function messageMatchesSearch(message: SearchableMessage, search: ResolvedSearch): boolean {
  if (search.content && !message.content.toLowerCase().includes(search.content.toLowerCase())) return false;
  if (search.authorIds.length && !search.authorIds.includes(message.authorId)) return false;
  if (search.mentionIds.length) {
    const ids = new Set(message.mentionIds ?? []);
    if (!search.mentionIds.some((id) => ids.has(id) || message.content.includes(`<@${id}>`) || message.content.includes(`<@!${id}>`))) return false;
  }
  if (search.channelIds.length && !search.channelIds.includes(message.channelId)) return false;
  if (search.pinned === true && !message.pinned) return false;
  if (search.pinned === false && message.pinned) return false;
  const when = Date.parse(message.timestamp);
  if (search.beforeMs != null && Number.isFinite(when) && when >= search.beforeMs) return false;
  if (search.afterMs != null && Number.isFinite(when) && when <= search.afterMs) return false;
  for (const flag of search.has) {
    if (!messageHas(message, flag)) return false;
  }
  return true;
}

function messageHas(message: SearchableMessage, flag: string): boolean {
  const attachments = message.attachments ?? [];
  const typeOf = (item: { contentType?: string; name: string }) => `${item.contentType ?? ""} ${item.name}`.toLowerCase();
  if (flag === "link") return /https?:\/\//i.test(message.content);
  if (flag === "embed") return (message.embeds?.length ?? 0) > 0;
  if (flag === "file") return attachments.length > 0;
  if (flag === "image") return attachments.some((item) => typeOf(item).match(/image|\.(png|jpe?g|gif|webp|avif)/));
  if (flag === "video") return attachments.some((item) => typeOf(item).match(/video|\.(mp4|webm|mov)/));
  if (flag === "sound") return attachments.some((item) => typeOf(item).match(/audio|\.(mp3|ogg|wav|m4a)/));
  if (flag === "sticker") return (message.stickers?.length ?? 0) > 0;
  if (flag === "poll") return message.messageType === 43 || Boolean(message.poll);
  if (flag === "snapshot") return Boolean(message.forwarded);
  return false;
}

export function filterLoadedMessages<T extends SearchableMessage>(messages: readonly T[], search: ResolvedSearch): T[] {
  if (!hasSearchCriteria(search)) return [];
  return messages.filter((message) => messageMatchesSearch(message, search)).slice(0, 20);
}

export function readDeveloperMode(config: unknown): boolean {
  const bag = globalThis as unknown as { __larkDeveloperMode?: unknown };
  if (typeof bag.__larkDeveloperMode === "function") {
    try {
      return Boolean((bag.__larkDeveloperMode as () => unknown)());
    } catch {
      return false;
    }
  }
  if (typeof bag.__larkDeveloperMode === "boolean") return bag.__larkDeveloperMode;
  return readFlag(config, ["developer_mode", "developerMode"]) === true;
}

export function readShowEmbeds(config: unknown): boolean {
  const bag = globalThis as unknown as { __larkShowEmbeds?: unknown };
  if (typeof bag.__larkShowEmbeds === "function") {
    try {
      return Boolean((bag.__larkShowEmbeds as () => unknown)());
    } catch {
      return true;
    }
  }
  if (typeof bag.__larkShowEmbeds === "boolean") return bag.__larkShowEmbeds;
  const flag = readFlag(config, ["show_embeds", "showEmbeds"]);
  return flag === undefined ? true : flag;
}

export function readRevealSpoilers(config: unknown): boolean {
  const bag = globalThis as unknown as { __larkRevealSpoilers?: unknown };
  if (typeof bag.__larkRevealSpoilers === "function") {
    try {
      return Boolean((bag.__larkRevealSpoilers as () => unknown)());
    } catch {
      return false;
    }
  }
  if (typeof bag.__larkRevealSpoilers === "boolean") return bag.__larkRevealSpoilers;
  return readFlag(config, ["show_spoiler_content", "reveal_spoilers", "showSpoilers"]) === true;
}

export function readBlockedIds(): Set<string> {
  const bag = globalThis as unknown as { __larkBlockedIds?: unknown };
  const value = typeof bag.__larkBlockedIds === "function"
    ? safeCall(bag.__larkBlockedIds as () => unknown)
    : bag.__larkBlockedIds;
  if (value instanceof Set) return new Set([...value].map((item) => String(item)));
  if (Array.isArray(value)) return new Set(value.map((item) => String(item)));
  return new Set();
}

function safeCall(fn: () => unknown): unknown {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function readFlag(config: unknown, keys: string[]): boolean | undefined {
  if (!config || typeof config !== "object") return undefined;
  const record = config as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  for (const sectionName of ["appearance", "privacy", "advanced"]) {
    const section = record[sectionName];
    if (!section || typeof section !== "object") continue;
    const flags = section as Record<string, unknown>;
    for (const key of keys) {
      if (typeof flags[key] === "boolean") return flags[key] as boolean;
    }
  }
  return undefined;
}

export interface SlashOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
}

export interface SlashCommand {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  type: number;
  version: string;
  options: SlashOption[];
}

export type SlashAction =
  | { op: "send"; text: string }
  | { op: "gif"; query: string }
  | { op: "app"; command: SlashCommand; args: string; targetId?: string | null };

const BUILT_INS: { name: string; description: string; run: (args: string) => SlashAction }[] = [
  { name: "gif", description: "Open the GIF picker", run: (args) => ({ op: "gif", query: args }) },
  { name: "tenor", description: "Open the GIF picker", run: (args) => ({ op: "gif", query: args }) },
  { name: "shrug", description: "Append ¯\\_(ツ)_/¯", run: (args) => ({ op: "send", text: joinArgs(args, "¯\\_(ツ)_/¯") }) },
  { name: "tableflip", description: "Append (╯°□°）╯︵ ┻━┻", run: (args) => ({ op: "send", text: joinArgs(args, "(╯°□°）╯︵ ┻━┻") }) },
  { name: "unflip", description: "Append ┬─┬ ノ( ゜-゜ノ)", run: (args) => ({ op: "send", text: joinArgs(args, "┬─┬ ノ( ゜-゜ノ)") }) },
  { name: "me", description: "Send an italic action", run: (args) => ({ op: "send", text: args ? `*${args}*` : "" }) },
  { name: "spoiler", description: "Wrap the text in a spoiler", run: (args) => ({ op: "send", text: args ? `||${args}||` : "" }) },
];

function joinArgs(args: string, glyph: string): string {
  return args ? `${args} ${glyph}` : glyph;
}

let slashCommands: SlashCommand[] = [];
let slashRunner: ((action: SlashAction) => void) | null = null;
let slashLoader: ((query: string) => void) | null = null;
let slashTimer = 0;

export function setSlashCommands(list: SlashCommand[]) {
  slashCommands = list.filter((command) => command.name && command.id);
}

export function slashCommandsOf(type: number): SlashCommand[] {
  return slashCommands.filter((command) => (command.type || 1) === type);
}

export function bindSlashRunner(fn: ((action: SlashAction) => void) | null) {
  slashRunner = fn;
}

let slashScope = "";
let slashScheduled = "";

export function bindSlashLoader(fn: ((query: string) => void) | null, scope = "") {
  slashLoader = fn;
  if (scope !== slashScope) {
    slashScope = scope;
    slashScheduled = "";
  }
}

export function scheduleSlash(query: string) {
  if (!slashLoader || typeof window === "undefined") return;
  const name = (query.split(/\s/, 1)[0] ?? "").toLowerCase();
  const key = `${slashScope}:${name}`;
  if (key === slashScheduled) return;
  slashScheduled = key;
  window.clearTimeout(slashTimer);
  slashTimer = window.setTimeout(() => slashLoader?.(name), 80);
}

export function slashSuggestions(query: string): { token: string; label: string; hint: string }[] {
  const trimmed = query.trim();
  const [name, ...rest] = trimmed.split(/\s+/);
  const needle = (name ?? "").toLowerCase();
  const args = rest.join(" ");
  const hits: { token: string; label: string; hint: string }[] = [];
  for (const command of BUILT_INS) {
    if (needle && !command.name.startsWith(needle)) continue;
    const action = command.run(args);
    if (action.op === "send" && !action.text) continue;
    hits.push({ token: slashToken(action), label: `/${command.name}`, hint: command.description });
    if (hits.length >= 8) return hits;
  }
  for (const command of slashCommandsOf(1)) {
    if (needle && !command.name.toLowerCase().includes(needle)) continue;
    const ready = !command.options.some((option) => option.required) || Boolean(args);
    const action: SlashAction = { op: "app", command, args };
    hits.push({
      token: ready ? slashToken(action) : `/${command.name} `,
      label: `/${command.name}`,
      hint: command.description || "App command",
    });
    if (hits.length >= 8) break;
  }
  return hits;
}

function slashToken(action: SlashAction): string {
  return `${SLASH_PREFIX}${JSON.stringify(action)}`;
}

export function dispatchSlashToken(token: string): boolean {
  if (!token.startsWith(SLASH_PREFIX) || !slashRunner) return false;
  try {
    const action = JSON.parse(token.slice(SLASH_PREFIX.length)) as SlashAction;
    const run = slashRunner;
    queueMicrotask(() => run(action));
    return true;
  } catch {
    return false;
  }
}

export function interactionBody(input: {
  command: SlashCommand;
  channelId: string;
  guildId?: string | null;
  args: string;
  targetId?: string | null;
}): Record<string, unknown> | null {
  if (!input.command.id || !input.command.applicationId || !input.channelId) return null;
  const options = optionValues(input.command, input.args);
  if (options === null) return null;
  const data: Record<string, unknown> = {
    id: input.command.id,
    name: input.command.name,
    type: input.command.type || 1,
    options,
  };
  if (input.command.version) data.version = input.command.version;
  if (input.targetId) data.target_id = input.targetId;
  const body: Record<string, unknown> = {
    type: 2,
    application_id: input.command.applicationId,
    channel_id: input.channelId,
    data,
    nonce: interactionNonce(),
  };
  if (input.guildId && /^\d{5,22}$/.test(input.guildId)) body.guild_id = input.guildId;
  return body;
}

function optionValues(command: SlashCommand, args: string): Record<string, unknown>[] | null {
  const options = command.options ?? [];
  if (!options.length) return [];
  const named = namedArgs(args);
  const out: Record<string, unknown>[] = [];
  const used = new Set<string>();
  for (const option of options) {
    const raw = named[option.name] ?? (!used.size && !Object.keys(named).length ? args.trim() : "");
    if (!raw) {
      if (option.required) return null;
      continue;
    }
    const value = coerceOption(option.type, raw);
    if (value == null) return null;
    used.add(option.name);
    out.push({ type: option.type || 3, name: option.name, value });
    if (!Object.keys(named).length) break;
  }
  return out;
}

function namedArgs(args: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of args.matchAll(/(?:^|\s)([a-z0-9_]{1,32}):(?:"([^"]+)"|(\S+))/gi)) {
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return out;
}

function coerceOption(type: number, value: string): unknown {
  if (type === 4 || type === 10) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (type === 5) {
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
    return null;
  }
  return value;
}

function interactionNonce(): string {
  const ms = BigInt(Date.now());
  return ((ms - DISCORD_EPOCH) << 22n).toString();
}

function stringField(record: Record<string, unknown>, camel: string, snake: string): string {
  const value = record[camel] ?? record[snake];
  return typeof value === "string" ? value : "";
}

export function commandsFromPayload(payload: unknown): SlashCommand[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const list = Array.isArray(payload) ? payload : Array.isArray(root.application_commands) ? root.application_commands : [];
  const commands: SlashCommand[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const applicationId = stringField(record, "applicationId", "application_id");
    const name = typeof record.name === "string" ? record.name : "";
    if (!id || !applicationId || !name) continue;
    const options = Array.isArray(record.options) ? record.options.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const row = option as Record<string, unknown>;
      const optionName = typeof row.name === "string" ? row.name : "";
      if (!optionName) return [];
      const optionType = typeof row.type === "number" ? row.type : typeof row.typeId === "number" ? row.typeId : 3;
      return [{
        name: optionName,
        description: typeof row.description === "string" ? row.description : "",
        type: optionType,
        required: row.required === true,
      }];
    }) : [];
    commands.push({
      id,
      applicationId,
      name,
      description: typeof record.description === "string" ? record.description : "",
      type: typeof record.type === "number" ? record.type : typeof record.kind === "number" ? record.kind : 1,
      version: typeof record.version === "string" ? record.version : "",
      options,
    });
  }
  return commands;
}

export type ComposerPanel = "plus" | "gif" | "stickers" | null;

let panel: ComposerPanel = null;
let gifQuery = "";
let gifHits: GifHit[] = [];
let stickers: { id: string; name: string; url: string | null }[] = [];
let stickerGuild = "";
let forwardDraft: { messageId: string; channelId: string; guildId: string | null; authorName: string; preview: string } | null = null;
let armedStickers: string[] = [];

export function composerPanel(): ComposerPanel {
  return panel;
}

export function setComposerPanel(next: ComposerPanel) {
  panel = next;
}

export function toggleComposerPanel(next: Exclude<ComposerPanel, null>) {
  panel = panel === next ? null : next;
}

export function gifQueryText(): string {
  return gifQuery;
}

export function setGifQuery(query: string) {
  gifQuery = query;
}

export function gifHitsNow(): GifHit[] {
  return gifHits;
}

export function setGifHits(hits: GifHit[]) {
  gifHits = hits;
}

let gifLoader: ((query: string) => void) | null = null;
let gifTimer = 0;
let gifFocus = false;

export function bindGifLoader(fn: ((query: string) => void) | null) {
  gifLoader = fn;
}

export function noteGifFocus() {
  gifFocus = true;
}

export function takeGifFocus(): boolean {
  const focused = gifFocus;
  gifFocus = false;
  return focused;
}

export function scheduleGifLoad(query: string) {
  if (!gifLoader) return;
  if (typeof window === "undefined") {
    gifLoader(query);
    return;
  }
  window.clearTimeout(gifTimer);
  gifTimer = window.setTimeout(() => gifLoader?.(query), query.trim() ? 180 : 0);
}

export async function openDiscordPage(url: string): Promise<boolean> {
  if (!discordPageOk(url)) return false;
  const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (tauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_discord_page", { url });
      return true;
    } catch {
      /* The browser can still open the page. */
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

export function stickerHitsNow(): { id: string; name: string; url: string | null }[] {
  return stickers;
}

export function stickerGuildNow(): string {
  return stickerGuild;
}

export function setStickerHits(guildId: string, hits: { id: string; name: string; url: string | null }[]) {
  stickerGuild = guildId;
  stickers = hits;
}

export function armForward(draft: NonNullable<typeof forwardDraft>) {
  forwardDraft = draft;
  panel = null;
}

export function peekForward() {
  return forwardDraft;
}

export function clearForward() {
  forwardDraft = null;
}

export function armStickers(ids: string[]) {
  armedStickers = ids.filter((id) => /^\d{5,22}$/.test(id)).slice(0, 3);
}

export function peekStickers(): string[] {
  return armedStickers;
}

export function clearStickers() {
  armedStickers = [];
}

export function renderComposerAccessories(input: {
  fileInput: HTMLInputElement;
  onUpload: () => void;
  onThread: () => void;
  onPoll: () => void;
  onAppsLink: () => void;
  onGift: () => void;
  onGif: () => void;
  onStickers: () => void;
  onEmoji: () => void;
  onActivity: () => void;
  onRepaint: () => void;
}): HTMLElement {
  const row = el("div", "composer-accessories");
  const plusWrap = el("div", "plus-wrap");
  const plus = toolButton(panel === "plus" ? "icon-button is-on" : "icon-button", "Add", "+");
  plus.addEventListener("click", () => {
    toggleComposerPanel("plus");
    input.onRepaint();
  });
  plusWrap.append(plus);
  if (panel === "plus") {
    const menu = el("div", "plus-menu");
    menu.setAttribute("role", "menu");
    for (const item of plusMenuItems()) {
      const button = el("button", "plus-item", item.label);
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", () => {
        setComposerPanel(null);
        if (item.id === "upload") input.onUpload();
        else if (item.id === "thread") input.onThread();
        else if (item.id === "poll") input.onPoll();
        else input.onAppsLink();
        input.onRepaint();
      });
      menu.append(button);
    }
    plusWrap.append(menu);
  }
  row.append(plusWrap, input.fileInput);
  row.append(toolButton("icon-button", "Send a gift", "🎁", input.onGift));
  row.append(toolButton("text-button gif-button", "Open GIF picker", "GIF", input.onGif, panel === "gif"));
  row.append(toolButton("icon-button", "Open sticker picker", "✦", input.onStickers, panel === "stickers"));
  const emoji = toolButton("icon-button", "Emoji", "☺", input.onEmoji);
  row.append(emoji);
  row.append(toolButton("icon-button", "Apps", "▦", input.onActivity));
  return row;
}

function toolButton(className: string, label: string, text: string, onClick?: () => void, on = false): HTMLButtonElement {
  const button = el("button", on ? `${className} is-on` : className, text);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

export function renderGifPicker(input: {
  query: string;
  hits: GifHit[];
  onQuery: (query: string) => void;
  onPick: (hit: GifHit, shift: boolean) => void;
}): HTMLElement {
  const picker = el("div", "gif-picker");
  const field = el("input");
  field.type = "search";
  field.placeholder = "Search GIFs";
  field.setAttribute("aria-label", "Search GIFs");
  field.value = input.query;
  field.addEventListener("input", () => input.onQuery(field.value));
  field.addEventListener("keydown", (event) => event.stopPropagation());
  const grid = el("div", "gif-grid");
  if (!input.hits.length) grid.append(el("p", "empty", input.query ? "No GIFs." : "Trending GIFs"));
  for (const hit of input.hits) {
    const button = el("button", "gif-hit");
    button.type = "button";
    button.title = "Shift-click to paste the URL";
    button.setAttribute("aria-label", hit.title);
    const img = el("img");
    img.alt = "";
    img.src = hit.preview;
    button.append(img);
    button.addEventListener("click", (event) => input.onPick(hit, event.shiftKey));
    grid.append(button);
  }
  picker.append(field, el("p", "hint", "Click to send. Shift-click pastes the URL."), grid);
  return picker;
}

export function renderStickerPicker(input: {
  hits: { id: string; name: string; url: string | null }[];
  onPick: (id: string) => void;
}): HTMLElement {
  const picker = el("div", "sticker-picker");
  if (!input.hits.length) {
    picker.append(el("p", "empty", "This server has no stickers yet."));
    return picker;
  }
  const grid = el("div", "sticker-grid");
  for (const hit of input.hits) {
    const button = el("button", "sticker-hit");
    button.type = "button";
    button.setAttribute("aria-label", hit.name);
    if (hit.url) {
      const img = el("img");
      img.alt = "";
      img.src = hit.url;
      button.append(img);
    }
    button.append(el("span", "", hit.name));
    button.addEventListener("click", () => input.onPick(hit.id));
    grid.append(button);
  }
  picker.append(grid);
  return picker;
}

export function renderForwardPicker(input: {
  preview: string;
  channels: { id: string; name: string; kind: string }[];
  onPick: (channelId: string) => void;
  onCancel: () => void;
}): HTMLElement {
  const card = el("div", "forward-picker");
  card.append(el("strong", "", "Forward message"), el("p", "hint", input.preview || "This message"));
  const list = el("div", "forward-list");
  const channels = input.channels.filter((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group" || channel.kind === "announcement" || channel.kind === "thread");
  if (!channels.length) list.append(el("p", "empty", "No channel to forward to."));
  for (const channel of channels.slice(0, 40)) {
    const button = el("button", "forward-hit", channel.kind === "dm" || channel.kind === "group" ? channel.name : `# ${channel.name}`);
    button.type = "button";
    button.addEventListener("click", () => input.onPick(channel.id));
    list.append(button);
  }
  const cancel = el("button", "ghost", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", input.onCancel);
  card.append(list, cancel);
  return card;
}

export function messagingCss(): string {
  return `
.composer-accessories { display: flex; gap: 4px; align-items: center; position: relative; }
.plus-wrap { position: relative; }
.plus-menu, .msg-menu {
  position: absolute; z-index: 30; min-width: 196px; padding: 6px; border-radius: 8px;
  background: var(--bg-1); border: 1px solid var(--line); box-shadow: var(--shadow);
}
.plus-menu { bottom: 36px; left: 0; }
.msg-menu { position: fixed; }
.plus-item, .msg-item, .forward-hit {
  display: block; width: 100%; text-align: left; border: 0; background: transparent; color: var(--text);
  border-radius: 6px; padding: 8px 10px; font: inherit;
}
.plus-item:hover, .msg-item:hover, .forward-hit:hover, .gif-hit:hover, .sticker-hit:hover { background: var(--bg-3); }
.msg-item.is-danger { color: #f3867a; }
.gif-button { font-weight: 800; letter-spacing: 0.04em; width: auto; padding: 0 8px; }
.gif-picker, .sticker-picker, .forward-picker, .reactor-pop {
  margin-top: 8px; background: var(--bg-1); border: 1px solid var(--line); border-radius: 12px; padding: 8px; width: min(420px, 100%);
}
.gif-picker input, .forward-picker input { width: 100%; background: var(--bg-0); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.gif-grid, .sticker-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 240px; overflow: auto; margin-top: 8px; }
.gif-hit, .sticker-hit { border: 0; background: var(--bg-2); border-radius: 8px; padding: 4px; color: var(--text); }
.gif-hit img, .sticker-hit img { display: block; width: 92px; height: 72px; object-fit: cover; border-radius: 6px; }
.sticker-hit { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100px; }
.forward-list { max-height: 220px; overflow: auto; }
.spoiler-media { position: relative; width: fit-content; }
.spoiler-media:not(.is-revealed) .image-frame,
.spoiler-media:not(.is-revealed) .attachment-video,
.spoiler-media:not(.is-revealed) .file-chip { filter: blur(18px); }
.spoiler-cover {
  position: absolute; inset: 0; z-index: 1; border: 0; border-radius: 12px; background: rgba(0, 0, 0, 0.45);
  color: white; font-weight: 700;
}
.spoiler-media.is-revealed .spoiler-cover { display: none; }
.system-line { display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; }
.forwarded-card { border-left: 2px solid var(--line); padding-left: 8px; margin: 2px 0 6px; color: var(--faint); }
.blocked-message { color: var(--faint); font-size: 13px; }
.reactor-pop { position: absolute; z-index: 4; }
.file-spoiler.is-on { color: var(--accent); }
.reaction button { border: 0; background: transparent; color: inherit; padding: 0 2px; font: inherit; }
.msg-apps { padding-left: 8px; }
`;
}

export function ensureMessagingStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("lark-messaging-style")) return;
  const style = document.createElement("style");
  style.id = "lark-messaging-style";
  style.textContent = messagingCss();
  document.head.append(style);
}
