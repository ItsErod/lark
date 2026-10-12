export interface PluginMessage {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  timestamp: string;
  mentionsMe: boolean;
  kind: string;
  highlights: string[];
  badges: string[];
  effects: string[];
  hidden?: boolean;
  edited?: boolean;
  collapsed?: boolean;
  channelId?: string;
}

export interface PluginSource {
  id: string;
  source: string;
  name: string;
  description: string;
  hooks: PluginHooks;
  run: PluginRun;
}

export interface PluginContext {
  settings: Record<string, string>;
  hiddenAuthors: ReadonlySet<string>;
}

export interface PluginApplyContext {
  settings?: Record<string, Record<string, string>>;
  hiddenAuthors?: ReadonlySet<string>;
}

export interface PluginCatalogItem {
  id: string;
  name: string;
  description: string;
}

export interface PluginHooks {
  silentTyping: boolean;
  autoAway: boolean;
  schedule: boolean;
  nowPlaying: boolean;
  keywords: boolean;
  bookmarks: boolean;
  hideUsers: boolean;
  channelRules: boolean;
  relativeTime: boolean;
  messageLog: boolean;
  betterTime: boolean;
  typingList: boolean;
  inlineTranslate: boolean;
  showHidden: boolean;
  spotify: boolean;
  quickReactions: string[];
  callTimer: boolean;
  volumeBoost: boolean;
  panicKey: boolean;
  incognito: boolean;
  streamerSafe: boolean;
  cleanLinks: boolean;
}

export type PluginRun = (message: PluginMessage, ctx: PluginContext) => PluginMessage | null;

export const EFFECTS = [
  "inline-code",
  "relative-time",
  "hide-previews",
  "compact-media",
  "quick-react",
  "bookmark",
  "translate",
] as const;

const EFFECT_SET = new Set<string>(EFFECTS);

const EMPTY_SETTINGS: Record<string, string> = {};
const EMPTY_HIDDEN: ReadonlySet<string> = new Set();

export function emptyHooks(): PluginHooks {
  return {
    silentTyping: false,
    autoAway: false,
    schedule: false,
    nowPlaying: false,
    keywords: false,
    bookmarks: false,
    hideUsers: false,
    channelRules: false,
    relativeTime: false,
    messageLog: false,
    betterTime: false,
    typingList: false,
    inlineTranslate: false,
    showHidden: false,
    spotify: false,
    quickReactions: [],
    callTimer: false,
    volumeBoost: false,
    panicKey: false,
    incognito: false,
    streamerSafe: false,
    cleanLinks: false,
  };
}

export function pluginMeta(source: string, fallbackId: string): { name: string; description: string } {
  const name = /@lark\s+name:\s*(.+)/.exec(source)?.[1]?.trim();
  const description = /@lark\s+description:\s*(.+)/.exec(source)?.[1]?.trim();
  return { name: name || fallbackId, description: description || "" };
}

export function validPluginId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}

export function parseCatalog(data: unknown): PluginCatalogItem[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as { plugins?: unknown }).plugins;
  if (!Array.isArray(list)) return [];
  const out: PluginCatalogItem[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item === "string") {
      if (!validPluginId(item) || seen.has(item)) continue;
      seen.add(item);
      out.push({ id: item, name: item, description: "" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; name?: unknown; description?: unknown };
    if (typeof record.id !== "string" || !validPluginId(record.id) || seen.has(record.id)) continue;
    seen.add(record.id);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : record.id;
    const description = typeof record.description === "string" ? record.description.trim().slice(0, 240) : "";
    out.push({ id: record.id, name, description });
  }
  return out;
}

export function compilePlugin(source: string): { hooks: PluginHooks; run: PluginRun } {
  try {
    const runBody = new Function(
      "message",
      "api",
      `"use strict";
       ${source}
       if (typeof onMessage !== "function") return message;
       return onMessage(message, api);`,
    ) as (message: PluginMessage, api: PluginApi) => unknown;
    const readHooks = new Function(
      `"use strict";
       ${source}
       if (typeof describe !== "function") return {};
       const value = describe();
       return value && typeof value === "object" ? value : {};`,
    ) as () => unknown;
    const hooks = sanitizeHooks(readHooks());
    return {
      hooks,
      run(message, ctx) {
        try {
          const draft = cloneMessage(message);
          const snapshot = cloneMessage(message);
          const api = makeApi(ctx);
          return sanitizeResult(snapshot, runBody(draft, api));
        } catch {
          return message;
        }
      },
    };
  } catch {
    return { hooks: emptyHooks(), run: (message) => message };
  }
}

export function applyPlugins(
  message: PluginMessage,
  plugins: PluginSource[],
  ctx: PluginApplyContext = {},
): PluginMessage | null {
  let current: PluginMessage | null = cloneMessage(message);
  for (const plugin of plugins) {
    if (!current) return null;
    const settings = ctx.settings?.[plugin.id] ?? EMPTY_SETTINGS;
    current = plugin.run(current, { settings, hiddenAuthors: ctx.hiddenAuthors ?? EMPTY_HIDDEN });
  }
  return current;
}

export function describePlugin(source: string, id: string): PluginSource {
  const meta = pluginMeta(source, id);
  const compiled = compilePlugin(source);
  return { id, source, name: meta.name, description: meta.description, hooks: compiled.hooks, run: compiled.run };
}

export function enabledSources(enabled: readonly string[], loaded: ReadonlyMap<string, PluginSource>): PluginSource[] {
  const out: PluginSource[] = [];
  const seen = new Set<string>();
  for (const id of enabled) {
    if (seen.has(id)) continue;
    seen.add(id);
    const plugin = loaded.get(id);
    if (plugin) out.push(plugin);
  }
  return out;
}

interface PluginApi {
  highlight(message: PluginMessage, kind: string): void;
  badge(message: PluginMessage, kind: string): void;
  collapse(message: PluginMessage): void;
  effect(message: PluginMessage, kind: string): void;
  setting(key: string): string;
  hidden(authorId: string): boolean;
}

function makeApi(ctx: PluginContext): PluginApi {
  return {
    highlight(target, kind) {
      pushTag(target.highlights, kind);
    },
    badge(target, kind) {
      pushTag(target.badges, kind);
    },
    collapse(target) {
      target.collapsed = true;
    },
    effect(target, kind) {
      pushEffect(target.effects, kind);
    },
    setting(key) {
      if (typeof key !== "string") return "";
      const value = ctx.settings[key];
      return typeof value === "string" ? value : "";
    },
    hidden(authorId) {
      return typeof authorId === "string" && ctx.hiddenAuthors.has(authorId);
    },
  };
}

function cloneMessage(message: PluginMessage): PluginMessage {
  return {
    ...message,
    highlights: [...message.highlights],
    badges: [...message.badges],
    effects: [...(message.effects ?? [])],
    authorId: message.authorId ?? "",
    timestamp: message.timestamp ?? "",
  };
}

function pushTag(list: string[], kind: string) {
  if (typeof kind !== "string") return;
  const clean = kind.trim().slice(0, 32);
  if (!clean || list.includes(clean) || list.length >= 8) return;
  list.push(clean);
}

function pushEffect(list: string[], kind: string) {
  if (typeof kind !== "string" || !EFFECT_SET.has(kind)) return;
  if (list.includes(kind) || list.length >= 8) return;
  list.push(kind);
}

function sanitizeHooks(value: unknown): PluginHooks {
  const hooks = emptyHooks();
  if (!value || typeof value !== "object") return hooks;
  const record = value as Record<string, unknown>;
  hooks.silentTyping = record.silentTyping === true;
  hooks.autoAway = record.autoAway === true;
  hooks.schedule = record.schedule === true;
  hooks.nowPlaying = record.nowPlaying === true;
  hooks.keywords = record.keywords === true;
  hooks.bookmarks = record.bookmarks === true;
  hooks.hideUsers = record.hideUsers === true;
  hooks.channelRules = record.channelRules === true;
  hooks.relativeTime = record.relativeTime === true;
  hooks.messageLog = record.messageLog === true;
  hooks.betterTime = record.betterTime === true;
  hooks.typingList = record.typingList === true;
  hooks.inlineTranslate = record.inlineTranslate === true;
  hooks.showHidden = record.showHidden === true;
  hooks.spotify = record.spotify === true;
  hooks.quickReactions = cleanEmoji(record.quickReactions);
  hooks.callTimer = record.callTimer === true;
  hooks.volumeBoost = record.volumeBoost === true;
  hooks.panicKey = record.panicKey === true;
  hooks.incognito = record.incognito === true;
  hooks.streamerSafe = record.streamerSafe === true;
  hooks.cleanLinks = record.cleanLinks === true;
  return hooks;
}

function cleanEmoji(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const emoji = item.trim();
    if (!emoji || emoji.length > 8 || /[<>]/.test(emoji) || out.includes(emoji)) continue;
    out.push(emoji);
    if (out.length >= 6) break;
  }
  return out;
}

function sanitizeResult(original: PluginMessage, result: unknown): PluginMessage | null {
  if (result === null) return null;
  if (!result || typeof result !== "object") return original;
  const record = result as Partial<PluginMessage>;
  if (record.hidden) return null;
  return {
    id: original.id,
    content: typeof record.content === "string" ? record.content.slice(0, 4000) : original.content,
    authorName: typeof record.authorName === "string" ? record.authorName.slice(0, 80) : original.authorName,
    authorId: original.authorId,
    timestamp: original.timestamp,
    mentionsMe: typeof record.mentionsMe === "boolean" ? record.mentionsMe : original.mentionsMe,
    kind: typeof record.kind === "string" ? record.kind.slice(0, 32) : original.kind,
    highlights: stringList(record.highlights, original.highlights),
    badges: stringList(record.badges, original.badges),
    effects: effectList(record.effects, original.effects),
    edited: typeof record.edited === "boolean" ? record.edited : original.edited,
    collapsed: Boolean(record.collapsed || original.collapsed),
    channelId: original.channelId,
  };
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 32)).slice(0, 8);
}

function effectList(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const out: string[] = [];
  for (const item of source) {
    if (typeof item !== "string" || !EFFECT_SET.has(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}
