import { matchShortcut, type KeyEventLike } from "./shortcuts";
import type { AppConfig, DiscordKeybinds, OsName, SavedSession, UserPreferences } from "./types";

/** Lark keeps five signed-in accounts. Tokens never go in this list. */
export const MAX_ACCOUNTS = 5;

const SNOWFLAKE = /^\d{5,22}$/;
const TOKENISH = /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,})\b/;

export const COLOR_MODES = ["light", "ash", "dark", "onyx"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const APP_ICONS = [
  { id: "blurple", label: "Blurple" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "midnight", label: "Midnight" },
  { id: "dusk", label: "Dusk" },
] as const;

export const LANGUAGES: readonly { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "en-GB", label: "English, UK" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "pt-BR", label: "Português" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "zh-CN", label: "中文" },
  { id: "ru", label: "Русский" },
  { id: "pl", label: "Polski" },
  { id: "tr", label: "Türkçe" },
  { id: "nl", label: "Nederlands" },
  { id: "it", label: "Italiano" },
  { id: "sv", label: "Svenska" },
];

export const DISCORD_KEYBINDS = [
  { id: "mark_server_read", label: "Mark server as read", description: "Mark every channel you can see in this server as read.", default: "shift+escape", keywords: "shift esc" },
  { id: "toggle_hotkeys", label: "Toggle hotkeys", description: "Turn keyboard shortcuts off until you press this again.", default: "mod+slash", keywords: "disable keys" },
  { id: "return_previous_text", label: "Return to previous text channel", description: "Move to the previous text channel.", default: "alt+arrowleft", keywords: "back history" },
  { id: "return_previous_audio", label: "Return to connected audio channel", description: "Open the voice channel you are in.", default: "alt+arrowright", keywords: "voice call" },
  { id: "toggle_pins", label: "Toggle pins popout", description: "Show or hide pinned messages.", default: "mod+p", keywords: "pins" },
  { id: "toggle_inbox", label: "Toggle inbox popout", description: "Open or close the inbox.", default: "mod+i", keywords: "mentions unreads" },
  { id: "toggle_emoji_picker", label: "Toggle emoji picker", description: "Open or close the emoji picker in the composer.", default: "mod+e", keywords: "emoji" },
  { id: "toggle_gif_picker", label: "Toggle GIF picker", description: "Open or close the GIF picker in the composer.", default: "mod+g", keywords: "gif" },
  { id: "toggle_sticker_picker", label: "Toggle sticker picker", description: "Open or close the sticker picker in the composer.", default: "mod+s", keywords: "sticker" },
  { id: "scroll_chat_up", label: "Scroll chat up", description: "Scroll the message list up.", default: "pageup", keywords: "page up" },
  { id: "scroll_chat_down", label: "Scroll chat down", description: "Scroll the message list down.", default: "pagedown", keywords: "page down" },
  { id: "create_or_join_server", label: "Create or join a server", description: "Opens Discord to create or join a server.", default: "mod+shift+n", keywords: "guild" },
  { id: "answer_call", label: "Answer incoming call", description: "Focus a direct-message call, or join the direct message you have open.", default: "mod+enter", keywords: "accept" },
  { id: "decline_call", label: "Decline incoming call", description: "Leave a direct message or group call.", default: "mod+shift+escape", keywords: "reject" },
  { id: "create_group", label: "Create a private group", description: "Start a group direct message.", default: "mod+shift+t", keywords: "group dm" },
  { id: "start_call", label: "Start a call", description: "Start a call in the current direct message.", default: "mod+quote", keywords: "voice" },
  { id: "upload_file", label: "Upload a file", description: "Open the file picker for the composer.", default: "mod+u", keywords: "attach" },
  { id: "search", label: "Search", description: "Open message search.", default: "mod+f", keywords: "find" },
  { id: "push_to_mute", label: "Push to mute", description: "Hold to mute the microphone.", default: "mod+shift+alt+b", keywords: "ptm" },
] as const;

export type DiscordKeybindId = (typeof DISCORD_KEYBINDS)[number]["id"];

const KEYBIND_DEFAULTS: DiscordKeybinds = Object.fromEntries(
  DISCORD_KEYBINDS.map((row) => [row.id, row.default]),
) as unknown as DiscordKeybinds;

const DISCORD_URLS = {
  account: "https://discord.com/settings/account",
  password: "https://discord.com/settings/account",
  mfa: "https://discord.com/settings/account",
  disable: "https://discord.com/settings/account",
  delete: "https://discord.com/settings/account",
  data: "https://discord.com/settings/privacy-and-safety",
  nitro: "https://discord.com/settings/nitro",
  boost: "https://discord.com/settings/premium",
  subscriptions: "https://discord.com/settings/subscriptions",
  gifts: "https://discord.com/settings/gift-inventory",
  billing: "https://discord.com/settings/billing",
  connections: "https://discord.com/settings/connections",
  emails: "https://discord.com/settings/notifications",
  servers: "https://discord.com/channels/@me",
} as const;

export type DiscordLink = keyof typeof DISCORD_URLS;

const MODIFIERS = new Set(["mod", "cmd", "command", "ctrl", "control", "alt", "option", "shift", "meta", "super"]);
const KEYS = new Set([
  "comma", "escape", "enter", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab", "space",
  "backspace", "slash", "period", "minus", "equal", "bracketleft", "bracketright", "quote",
  "semicolon", "backslash", "backquote", "pageup", "pagedown", "home", "end", "delete",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
]);

export function defaultPreferences(): UserPreferences {
  return {
    color_mode: "",
    app_icon: "blurple",
    show_media: true,
    underline_links: false,
    ui_density: "cozy",
    message_density: "cozy",
    group_spacing: 0,
    saturation: 100,
    high_contrast: false,
    explicit_filter: "everyone",
    spam_filter: "non_friends",
    dm_permission: "everyone",
    friend_requests: "everyone",
    improve_discord: true,
    personalize: true,
    desktop_notifications: true,
    message_sound: false,
    call_sound: false,
    unread_badge: true,
    email_notifications: false,
    share_activity: true,
    activity_status: true,
    language: "en",
    time_format: "auto",
  };
}

export function defaultKeybinds(): DiscordKeybinds {
  return { ...KEYBIND_DEFAULTS };
}

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return 16;
  return Math.min(24, Math.max(12, Math.round(value)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function sanitizePreferences(input: unknown): UserPreferences {
  const base = defaultPreferences();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<UserPreferences> & Record<string, unknown>;
  base.color_mode = COLOR_MODES.includes(raw.color_mode as ColorMode) ? String(raw.color_mode) : "";
  base.app_icon = oneOf(raw.app_icon, APP_ICONS.map((icon) => icon.id), "blurple");
  base.show_media = flag(raw.show_media, true);
  base.underline_links = flag(raw.underline_links, false);
  base.ui_density = oneOf(raw.ui_density, ["cozy", "compact"] as const, "cozy");
  base.message_density = oneOf(raw.message_density, ["cozy", "compact"] as const, "cozy");
  if (typeof raw.group_spacing === "number" && Number.isFinite(raw.group_spacing)) {
    base.group_spacing = Math.min(24, Math.max(0, Math.round(raw.group_spacing)));
  }
  if (typeof raw.saturation === "number" && Number.isFinite(raw.saturation)) {
    base.saturation = Math.min(100, Math.max(0, Math.round(raw.saturation)));
  }
  base.high_contrast = flag(raw.high_contrast, false);
  base.explicit_filter = oneOf(raw.explicit_filter, ["off", "friends", "everyone"] as const, "everyone");
  base.spam_filter = oneOf(raw.spam_filter, ["off", "non_friends", "everyone"] as const, "non_friends");
  base.dm_permission = oneOf(raw.dm_permission, ["everyone", "friends", "none"] as const, "everyone");
  base.friend_requests = oneOf(raw.friend_requests, ["everyone", "friends_of_friends", "server_members"] as const, "everyone");
  base.improve_discord = flag(raw.improve_discord, true);
  base.personalize = flag(raw.personalize, true);
  base.desktop_notifications = flag(raw.desktop_notifications, true);
  base.message_sound = flag(raw.message_sound, false);
  base.call_sound = flag(raw.call_sound, false);
  base.unread_badge = flag(raw.unread_badge, true);
  base.email_notifications = flag(raw.email_notifications, false);
  base.share_activity = flag(raw.share_activity, true);
  base.activity_status = flag(raw.activity_status, true);
  base.language = LANGUAGES.some((item) => item.id === raw.language) ? String(raw.language) : "en";
  base.time_format = oneOf(raw.time_format, ["auto", "12", "24"] as const, "auto");
  return base;
}

export function shortcutOk(raw: string): boolean {
  const parts = raw.split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1 && MODIFIERS.has(parts[0])) return false;
  const key = canonicalKey(parts[parts.length - 1]);
  if (!isKey(key)) return false;
  return parts.slice(0, -1).every((part) => MODIFIERS.has(part));
}

function canonicalKey(key: string): string {
  if (key === "down" || key === "arrowdown") return "arrowdown";
  if (key === "up" || key === "arrowup") return "arrowup";
  if (key === "left" || key === "arrowleft") return "arrowleft";
  if (key === "right" || key === "arrowright") return "arrowright";
  if (key === "esc" || key === "escape") return "escape";
  if (key === "return" || key === "enter") return "enter";
  if (key === "," || key === "comma") return "comma";
  if (key === "pageup" || key === "page-up") return "pageup";
  if (key === "pagedown" || key === "page-down") return "pagedown";
  return key;
}

function isKey(key: string): boolean {
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return true;
  return KEYS.has(key);
}

export function sanitizeKeybinds(input: unknown): DiscordKeybinds {
  const base = defaultKeybinds();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<Record<DiscordKeybindId, unknown>>;
  for (const row of DISCORD_KEYBINDS) {
    const value = raw[row.id];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      base[row.id] = "";
      continue;
    }
    if (shortcutOk(trimmed)) base[row.id] = trimmed;
  }
  return base;
}

export function sessionName(name: string, id: string): string {
  const trimmed = name.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 64);
  if (!trimmed || TOKENISH.test(trimmed)) return `Account ${id.slice(-4)}`;
  return trimmed;
}

export function sanitizeSessions(input: unknown): SavedSession[] {
  if (!Array.isArray(input)) return [];
  const out: SavedSession[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: unknown }).id ?? "");
    if (!SNOWFLAKE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const name = sessionName(String((item as { name?: unknown }).name ?? ""), id);
    out.push({ id, name });
    if (out.length >= MAX_ACCOUNTS) break;
  }
  return out;
}

export function rememberSession(list: readonly SavedSession[], next: SavedSession): { sessions: SavedSession[]; dropped: string[] } {
  const prior = sanitizeSessions(list);
  if (!SNOWFLAKE.test(next.id)) return { sessions: prior, dropped: [] };
  const cleaned = { id: next.id, name: sessionName(next.name, next.id) };
  const sessions = [cleaned, ...prior.filter((item) => item.id !== cleaned.id)].slice(0, MAX_ACCOUNTS);
  const kept = new Set(sessions.map((item) => item.id));
  const dropped = prior.map((item) => item.id).filter((id) => !kept.has(id));
  return { sessions, dropped };
}

export function dropSession(list: readonly SavedSession[], id: string): SavedSession[] {
  return sanitizeSessions(list).filter((item) => item.id !== id);
}

export function discordUrl(kind: DiscordLink): string {
  return DISCORD_URLS[kind];
}

export function shareActivity(config: { preferences?: Partial<UserPreferences> | null } | null | undefined): boolean {
  return sanitizePreferences(config?.preferences).share_activity;
}

export function showActivityStatus(config: { preferences?: Partial<UserPreferences> | null } | null | undefined): boolean {
  return sanitizePreferences(config?.preferences).activity_status;
}

export function setMessageDensity(config: AppConfig, value: "cozy" | "compact") {
  config.preferences.message_density = value;
  if (config.appearance.density !== "irc") config.appearance.density = value;
}

export function setIrcLayout(config: AppConfig, on: boolean) {
  const message = config.preferences.message_density === "compact" ? "compact" : "cozy";
  config.appearance.density = on ? "irc" : message;
}

export function hourCycle(format: string): "h12" | "h23" | undefined {
  if (format === "12") return "h12";
  if (format === "24") return "h23";
  return undefined;
}

export function keybindConflicts(shortcuts: Record<string, string>, keybinds: DiscordKeybinds): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  const rows: [string, string][] = [
    ...Object.entries(shortcuts),
    ...DISCORD_KEYBINDS.map((row) => [row.label, keybinds[row.id]] as [string, string]),
  ];
  for (const [label, shortcut] of rows) {
    const key = shortcut.toLowerCase().replace(/\s+/g, "");
    if (!key) continue;
    const previous = seen.get(key);
    if (previous) conflicts.push(`${previous} and ${label} both use ${shortcut}`);
    else seen.set(key, label);
  }
  return conflicts;
}

export function matchingKeybind(event: KeyEventLike, keybinds: DiscordKeybinds, os: OsName): DiscordKeybindId | null {
  for (const row of DISCORD_KEYBINDS) {
    const shortcut = keybinds[row.id];
    if (shortcut && matchShortcut(event, shortcut, os)) return row.id;
  }
  return null;
}

export interface AccountDetails {
  id: string;
  username: string;
  globalName: string;
  email: string;
  phone: string;
  mfaEnabled: boolean;
  verified: boolean;
}

export interface DeviceRow {
  id: string;
  client: string;
  location: string;
  lastUsed: string;
}

export interface ConnectionRow {
  id: string;
  type: string;
  name: string;
  verified: boolean;
}

export interface AccountOverview {
  account: AccountDetails | null;
  devices: DeviceRow[];
  standing: string;
  connections: ConnectionRow[];
}

const CONNECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function connectionIdOk(value: string): boolean {
  return CONNECTION_ID.test(value);
}

function textField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function emailField(value: unknown): string {
  const email = textField(value, 80);
  if (!email.includes("@") || email.includes(" ")) return "";
  return email;
}

function phoneField(value: unknown): string {
  const phone = textField(value, 24);
  if (!phone || !/^[0-9+().\-\s]+$/.test(phone)) return "";
  return phone;
}

export function standingLabel(raw: unknown): string {
  const state = standingState(raw);
  if (!state) return "Discord did not return an account standing.";
  const key = state.toLowerCase().replace(/[\s-]+/g, "_");
  if (["all_good", "ok", "good", "none", "healthy"].includes(key)) return "All good";
  if (key.includes("limited") || key.includes("warning") || key.includes("at_risk")) return "Limited";
  if (key.includes("suspend") || key.includes("quarantine") || key.includes("banned") || key.includes("restrict")) return "Restricted";
  if (/^[A-Za-z0-9 ._-]{1,40}$/.test(state)) return state;
  return "Discord returned a standing.";
}

function standingState(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const record = raw as Record<string, unknown>;
  const nested = record.account_standing ?? record.standing ?? record.state;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") {
    const state = (nested as { state?: unknown; status?: unknown }).state ?? (nested as { status?: unknown }).status;
    if (typeof state === "string") return state;
  }
  return "";
}

export function parseAccountOverview(input: unknown): AccountOverview {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const me = raw.me && typeof raw.me === "object" ? raw.me as Record<string, unknown> : null;
  let account: AccountDetails | null = null;
  if (me && SNOWFLAKE.test(String(me.id ?? ""))) {
    account = {
      id: String(me.id),
      username: textField(me.username, 64),
      globalName: textField(me.global_name, 64),
      email: emailField(me.email),
      phone: phoneField(me.phone),
      mfaEnabled: me.mfa_enabled === true,
      verified: me.verified === true,
    };
  }
  return {
    account,
    devices: deviceRows(raw.sessions),
    standing: standingLabel(raw.standing),
    connections: connectionRows(raw.connections),
  };
}

function deviceRows(input: unknown): DeviceRow[] {
  if (!Array.isArray(input)) return [];
  const out: DeviceRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const info = row.client_info && typeof row.client_info === "object" ? row.client_info as Record<string, unknown> : {};
    const client = [textField(info.platform, 24), textField(info.os, 24)].filter(Boolean).join(" · ") || "Discord";
    const id = textField(row.id_hash ?? row.id, 80) || `device-${out.length + 1}`;
    out.push({
      id,
      client,
      location: textField(info.location, 80),
      lastUsed: textField(row.approx_last_used_time, 40),
    });
    if (out.length >= 20) break;
  }
  return out;
}

function connectionRows(input: unknown): ConnectionRow[] {
  if (!Array.isArray(input)) return [];
  const out: ConnectionRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = textField(row.type, 64);
    const id = textField(row.id, 64);
    if (!connectionIdOk(type) || !connectionIdOk(id)) continue;
    if (row.revoked === true) continue;
    out.push({
      id,
      type,
      name: textField(row.name, 80) || type,
      verified: row.verified === true,
    });
    if (out.length >= 40) break;
  }
  return out;
}

const MODE_VARS: Record<ColorMode, { scheme: "light" | "dark"; vars: Record<string, string> }> = {
  light: {
    scheme: "light",
    vars: {
      "--bg-0": "#fbfbfb",
      "--bg-1": "#ffffff",
      "--bg-2": "#ffffff",
      "--bg-3": "#eeeff1",
      "--bg-4": "#e3e5e8",
      "--text": "#313338",
      "--muted": "#5c5e66",
      "--faint": "#80848e",
      "--heading": "#060607",
      "--accent": "#18181b",
      "--accent-ink": "#ffffff",
      "--line": "rgba(0, 0, 0, 0.08)",
      "--link": "#18181b",
      "--mention-fg": "#18181b",
      "--mention-bg": "rgba(24, 24, 27, 0.08)",
    },
  },
  ash: {
    scheme: "dark",
    vars: {
      "--bg-0": "#2e2e34",
      "--bg-1": "#37373e",
      "--bg-2": "#3f3f48",
      "--bg-3": "#4a4a54",
      "--bg-4": "#555560",
      "--text": "#f2f3f5",
      "--muted": "#b5bac1",
      "--faint": "#949ba4",
      "--heading": "#ffffff",
      "--accent": "#fafafa",
      "--accent-ink": "#09090b",
      "--line": "rgba(255, 255, 255, 0.08)",
    },
  },
  dark: {
    scheme: "dark",
    vars: {
      "--bg-0": "#1a1a1e",
      "--bg-1": "#242429",
      "--bg-2": "#2b2b31",
      "--bg-3": "#313138",
      "--bg-4": "#3a3a42",
      "--text": "#f2f3f5",
      "--muted": "#b5bac1",
      "--faint": "#949ba4",
      "--heading": "#ffffff",
      "--accent": "#fafafa",
      "--accent-ink": "#09090b",
      "--line": "rgba(255, 255, 255, 0.06)",
    },
  },
  onyx: {
    scheme: "dark",
    vars: {
      "--bg-0": "#070709",
      "--bg-1": "#131416",
      "--bg-2": "#1a1b1e",
      "--bg-3": "#222327",
      "--bg-4": "#2b2d31",
      "--text": "#f2f3f5",
      "--muted": "#b5bac1",
      "--faint": "#949ba4",
      "--heading": "#ffffff",
      "--accent": "#fafafa",
      "--accent-ink": "#09090b",
      "--line": "rgba(255, 255, 255, 0.08)",
    },
  },
};

export function colorModeCss(mode: string): string {
  if (!COLOR_MODES.includes(mode as ColorMode)) return "";
  const palette = MODE_VARS[mode as ColorMode];
  const body = Object.entries(palette.vars).map(([key, value]) => `${key}: ${value};`).join(" ");
  return `:root { color-scheme: ${palette.scheme}; ${body} }`;
}

export function chromeRules(): string {
  return [
    "#app[data-embeds='off'] .embed { display: none !important; }",
    "#app[data-media='off'] .image-frame, #app[data-media='off'] .attachment-video, #app[data-media='off'] .attachment-audio, #app[data-media='off'] .embed-image, #app[data-media='off'] .image-preview { display: none !important; }",
    "#app[data-spoilers='on'] .spoiler { background: var(--bg-4); color: inherit; }",
    "#app[data-spoilers='on'] .spoiler, #app[data-spoilers='on'] .spoiler * { color: inherit !important; }",
    "#app[data-underline='on'] a { text-decoration: underline; text-underline-offset: 2px; }",
    "#app[data-contrast='on'] { --muted: var(--text); --faint: var(--text); --line: color-mix(in srgb, var(--text) 55%, transparent); }",
    "#app[data-ui-density='compact'] .message { padding-top: 1px; padding-bottom: 1px; }",
    "#app[data-ui-density='compact'] .settings-link { padding-top: 4px; padding-bottom: 4px; }",
    "#app .message { margin-top: var(--group-gap, 0px); }",
  ].join("\n");
}

export function appIconSvg(id: string): string {
  const fills: Record<string, string> = {
    blurple: "#5865f2",
    dark: "#1a1a1e",
    light: "#fbfbfb",
    midnight: "#070709",
    dusk: "#3b3d44",
  };
  const fill = fills[id] ?? fills.blurple;
  const ink = id === "light" ? "#1a1a1e" : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="16" fill="${ink}">L</text></svg>`;
}

export function applyUserChrome(root: HTMLElement, config: AppConfig) {
  const prefs = config.preferences ?? defaultPreferences();
  const display = config.display;
  root.dataset.embeds = display?.show_embeds === false ? "off" : "on";
  root.dataset.spoilers = display?.show_spoilers === true ? "on" : "off";
  root.dataset.media = prefs.show_media === false ? "off" : "on";
  root.dataset.underline = prefs.underline_links ? "on" : "off";
  root.dataset.uiDensity = prefs.ui_density === "compact" ? "compact" : "cozy";
  root.dataset.contrast = prefs.high_contrast ? "on" : "off";
  root.dataset.developer = display?.developer_mode === true ? "on" : "off";
  root.style.setProperty("--group-gap", `${prefs.group_spacing || 0}px`);
  if (prefs.saturation === 100 || prefs.saturation === undefined) root.style.removeProperty("filter");
  else root.style.filter = `saturate(${Math.min(100, Math.max(0, prefs.saturation)) / 100})`;
  const lang = LANGUAGES.some((item) => item.id === prefs.language) ? prefs.language : "en";
  document.documentElement.lang = lang;
  const cycle = hourCycle(prefs.time_format);
  if (cycle === "h12") document.documentElement.dataset.timeFormat = "12";
  else if (cycle === "h23") document.documentElement.dataset.timeFormat = "24";
  else delete document.documentElement.dataset.timeFormat;
  let style = document.getElementById("lark-color-mode");
  const css = colorModeCss(prefs.color_mode);
  if (!css) style?.remove();
  else {
    if (!style) {
      style = document.createElement("style");
      style.id = "lark-color-mode";
      document.head.append(style);
    }
    style.textContent = css;
    document.head.append(style);
  }
  let chrome = document.getElementById("lark-user-chrome");
  if (!chrome) {
    chrome = document.createElement("style");
    chrome.id = "lark-user-chrome";
    document.head.append(chrome);
  }
  if (chrome.textContent !== chromeRules()) chrome.textContent = chromeRules();
  const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(appIconSvg(prefs.app_icon))}`;
}

export function playSoftTone(kind: "message" | "call") {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = kind === "call" ? 520 : 880;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
  osc.onended = () => void ctx.close();
}
