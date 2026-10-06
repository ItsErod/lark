import type { AppConfig, ChannelList, Density, FontFamily, NotifyLevel } from "./types";

export function defaultConfig(): AppConfig {
  return {
    appearance: {
      theme: "discord",
      density: "cozy",
      font_family: "inter",
      font_size: 16,
      channel_list: "left",
      show_member_list: true,
      show_server_rail: true,
    },
    shortcuts: {
      quick_switcher: "mod+k",
      open_settings: "mod+comma",
      toggle_members: "mod+shift+m",
      toggle_channels: "mod+b",
      focus_composer: "mod+l",
      next_unread: "alt+shift+down",
      previous_channel: "alt+up",
      next_channel: "alt+down",
      edit_last: "arrowup",
      toggle_mute: "mod+shift+alt+m",
      toggle_deafen: "mod+shift+d",
      push_to_talk: "backquote",
    },
    notifications: {
      default: "all",
      guilds: {
        "100000000000000011": { level: "mentions" },
      },
      channels: {
        "100000000000000025": { muted: true },
      },
      keywords: ["wordmark"],
    },
    plugins: { enabled: ["highlight-mentions", "code-badge"] },
    voice: {
      mode: "vad",
      sensitivity: 45,
      noise_suppression: true,
      input_device: "",
      output_device: "",
      video_device: "",
    },
    desktop: { minimize_to_tray: true, autostart: false, frame_cap: 240 },
    accents: {},
  };
}

const DENSITIES = new Set<Density>(["cozy", "compact", "irc"]);
const FONTS = new Set<FontFamily>(["inter", "system", "serif", "mono"]);
const SIDES = new Set<ChannelList>(["left", "right", "hidden"]);
const LEVELS = new Set<NotifyLevel>(["all", "mentions", "mute"]);

export function sanitizeConfig(input: unknown): AppConfig {
  const base = defaultConfig();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<AppConfig>;
  const appearance = raw.appearance ?? base.appearance;
  if (DENSITIES.has(appearance.density)) base.appearance.density = appearance.density;
  if (FONTS.has(appearance.font_family)) base.appearance.font_family = appearance.font_family;
  if (SIDES.has(appearance.channel_list)) base.appearance.channel_list = appearance.channel_list;
  if (typeof appearance.theme === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(appearance.theme)) {
    base.appearance.theme = appearance.theme;
  }
  if (typeof appearance.font_size === "number" && Number.isFinite(appearance.font_size)) {
    base.appearance.font_size = Math.min(20, Math.max(12, Math.round(appearance.font_size)));
  }
  if (typeof appearance.show_member_list === "boolean") base.appearance.show_member_list = appearance.show_member_list;
  if (typeof appearance.show_server_rail === "boolean") base.appearance.show_server_rail = appearance.show_server_rail;
  if (raw.shortcuts) {
    for (const key of Object.keys(base.shortcuts) as (keyof AppConfig["shortcuts"])[]) {
      const value = raw.shortcuts[key];
      if (typeof value === "string" && value.trim()) base.shortcuts[key] = value.trim();
    }
  }
  if (raw.notifications) {
    if (LEVELS.has(raw.notifications.default)) base.notifications.default = raw.notifications.default;
    base.notifications.guilds = sanitizeOverrides(raw.notifications.guilds);
    base.notifications.channels = sanitizeOverrides(raw.notifications.channels);
  }
  if (Array.isArray(raw.plugins?.enabled)) {
    base.plugins.enabled = raw.plugins.enabled.filter((id): id is string => typeof id === "string");
  }
  if (Array.isArray(raw.notifications?.keywords)) {
    base.notifications.keywords = raw.notifications.keywords
      .filter((word): word is string => typeof word === "string")
      .map((word) => word.trim())
      .filter((word) => word.length > 1 && word.length <= 40)
      .slice(0, 20);
  }
  if (raw.voice) {
    if (raw.voice.mode === "vad" || raw.voice.mode === "ptt") base.voice.mode = raw.voice.mode;
    if (typeof raw.voice.sensitivity === "number" && Number.isFinite(raw.voice.sensitivity)) {
      base.voice.sensitivity = Math.min(100, Math.max(0, Math.round(raw.voice.sensitivity)));
    }
    if (typeof raw.voice.noise_suppression === "boolean") base.voice.noise_suppression = raw.voice.noise_suppression;
    if (typeof raw.voice.input_device === "string") base.voice.input_device = raw.voice.input_device.slice(0, 128);
    if (typeof raw.voice.output_device === "string") base.voice.output_device = raw.voice.output_device.slice(0, 128);
    if (typeof raw.voice.video_device === "string") base.voice.video_device = raw.voice.video_device.slice(0, 128);
  }
  if (raw.desktop) {
    if (typeof raw.desktop.minimize_to_tray === "boolean") base.desktop.minimize_to_tray = raw.desktop.minimize_to_tray;
    if (typeof raw.desktop.autostart === "boolean") base.desktop.autostart = raw.desktop.autostart;
    if (typeof raw.desktop.frame_cap === "number" && Number.isFinite(raw.desktop.frame_cap)) {
      base.desktop.frame_cap = raw.desktop.frame_cap <= 0 ? 0 : Math.min(240, Math.max(30, Math.round(raw.desktop.frame_cap)));
    }
  }
  if (raw.accents && typeof raw.accents === "object") {
    const accents: Record<string, string> = {};
    for (const [id, color] of Object.entries(raw.accents)) {
      if (/^\d{5,22}$/.test(id) && typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) accents[id] = color;
    }
    base.accents = accents;
  }
  return base;
}

function sanitizeOverrides(input: unknown): AppConfig["notifications"]["guilds"] {
  if (!input || typeof input !== "object") return {};
  const out: AppConfig["notifications"]["guilds"] = {};
  for (const [id, value] of Object.entries(input as Record<string, { level?: NotifyLevel; muted?: boolean }>)) {
    if (!/^\d{5,22}$/.test(id) || !value || typeof value !== "object") continue;
    out[id] = {
      level: value.level && LEVELS.has(value.level) ? value.level : undefined,
      muted: Boolean(value.muted),
    };
  }
  return out;
}
