import { fuzzyScore } from "../search";
import { el, icon, paths } from "./dom";

/**
 * Settings catalog and chrome.
 *
 * Add a page by appending a section (or calling registerSettingsSection) and
 * rendering it from the app. List its controls in SETTING_ENTRIES, or pass
 * them into search, so the sidebar can find them. registerSettingsPane covers
 * a section whose markup lives outside the app switch.
 */

export type SettingsGroupId = "user" | "app" | "lark";

export interface SettingsGroup {
  id: SettingsGroupId;
  label: string;
}

export interface SettingsSectionMeta {
  id: string;
  label: string;
  group: SettingsGroupId;
  description: string;
}

export interface SettingEntry {
  id: string;
  section: string;
  label: string;
  description: string;
  keywords?: string;
}

export interface SettingsSearchHit {
  kind: "section" | "setting";
  id: string;
  section: string;
  label: string;
  description: string;
  score: number;
}

export interface ShortcutCopy {
  label: string;
  description: string;
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: "user", label: "User Settings" },
  { id: "app", label: "App Settings" },
  { id: "lark", label: "Lark" },
];

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  { id: "account", label: "My Account", group: "user", description: "Profile, session, and where the token is stored." },
  { id: "appearance", label: "Appearance", group: "app", description: "Theme, type, density, and which panes stay open." },
  { id: "notifications", label: "Notifications", group: "app", description: "What reaches you, and words that light a message up." },
  { id: "shortcuts", label: "Keybinds", group: "app", description: "Keyboard shortcuts. mod is Command on macOS and Ctrl on Windows." },
  { id: "window", label: "Window", group: "app", description: "Tray, login, and how fast the window paints." },
  { id: "voice", label: "Voice & Video", group: "lark", description: "Input mode, the speaking ring, noise suppression, devices, and the in-game HUD." },
  { id: "messages", label: "Messages", group: "lark", description: "Saved messages, reminders, and scheduled sends on this device." },
  { id: "privacy", label: "Privacy", group: "lark", description: "Streamer mode hides personal info on this screen." },
  { id: "clips", label: "Clips", group: "lark", description: "A local recording of the main display, and the library of clips saved on this computer." },
  { id: "gaming", label: "Gaming", group: "lark", description: "Game Mode, per-game profiles, and a hardware status line." },
  { id: "plugins", label: "Plugins", group: "lark", description: "Local plugins stay off until you turn them on." },
];

export const SHORTCUT_COPY: Record<string, ShortcutCopy> = {
  quick_switcher: { label: "Quick switcher", description: "Open the command palette." },
  open_settings: { label: "Open settings", description: "Open this screen." },
  toggle_members: { label: "Member list", description: "Show or hide the member list." },
  toggle_channels: { label: "Channel list", description: "Show or hide the channel list." },
  focus_composer: { label: "Focus composer", description: "Move the cursor to the message box." },
  next_unread: { label: "Next unread", description: "Jump to the next channel with something new." },
  previous_channel: { label: "Previous channel", description: "Move up the channel list." },
  next_channel: { label: "Next channel", description: "Move down the channel list." },
  edit_last: { label: "Edit last message", description: "Edit your latest message when the composer is empty." },
  toggle_mute: { label: "Mute", description: "Mute or unmute your microphone." },
  toggle_deafen: { label: "Deafen", description: "Deafen or undeafen." },
  push_to_talk: { label: "Push to talk", description: "Hold to transmit while push to talk is on." },
  toggle_voice_overlay: { label: "Voice HUD", description: "Show or hide the in-game voice window." },
  toggle_perf_overlay: { label: "Performance overlay", description: "Add RAM, CPU, and FPS to the voice HUD." },
  toggle_game_mode: { label: "Game Mode", description: "Toggle Game Mode, including while a game is focused." },
  save_clip: { label: "Save clip", description: "Save the clip buffer. Global on macOS and Windows." },
};

const SETTING_ENTRIES: readonly SettingEntry[] = [
  { id: "account.session", section: "account", label: "Session", description: "Where this account's token is stored.", keywords: "keychain credential sign out forget token" },
  { id: "appearance.theme", section: "appearance", label: "Theme", description: "Colour theme. One click applies it.", keywords: "gallery colours colors css json import export" },
  { id: "appearance.font", section: "appearance", label: "Font", description: "The face used for messages and the chrome.", keywords: "inter system serif mono typeface" },
  { id: "appearance.size", section: "appearance", label: "Font size", description: "Interface size, from 12 to 20.", keywords: "text scale" },
  { id: "appearance.density", section: "appearance", label: "Density", description: "How tightly messages sit.", keywords: "cozy compact irc" },
  { id: "appearance.channels", section: "appearance", label: "Channel list", description: "Which side the channel list uses, or hide it.", keywords: "left right hidden sidebar" },
  { id: "appearance.members", section: "appearance", label: "Member list", description: "Show the member list beside the chat." },
  { id: "appearance.rail", section: "appearance", label: "Server rail", description: "Show the server icons along the left edge." },
  { id: "appearance.accent", section: "appearance", label: "Server accent", description: "Colour for this server. It does not change the theme file.", keywords: "color picker hex" },
  { id: "notifications.level", section: "notifications", label: "Default notifications", description: "What a new channel does until you set it.", keywords: "all mentions mute" },
  { id: "notifications.test", section: "notifications", label: "Test notification", description: "Send a sample so you can see where it lands." },
  { id: "notifications.keywords", section: "notifications", label: "Highlight keywords", description: "Messages that contain these words get a highlight.", keywords: "words ping" },
  { id: "shortcut.mark_read", section: "shortcuts", label: "Mark read", description: "Esc closes whatever is open first. With nothing open, it marks the channel read.", keywords: "escape" },
  { id: "window.tray", section: "window", label: "Minimise to tray", description: "Closing the window leaves Lark in the menu bar or system tray.", keywords: "minimize tray" },
  { id: "window.login", section: "window", label: "Open at login", description: "Start Lark when you sign in to this computer.", keywords: "autostart startup" },
  { id: "window.frame", section: "window", label: "Frame rate", description: "Scrolling and transitions follow the monitor, up to this cap.", keywords: "fps hz 240 cap" },
  { id: "voice.mode", section: "voice", label: "Input mode", description: "Voice activity opens the mic when you speak. Push to talk waits for the key.", keywords: "vad ptt microphone" },
  { id: "voice.sensitivity", section: "voice", label: "Voice activity sensitivity", description: "How loud you need to be before voice activity opens the mic.", keywords: "threshold" },
  { id: "voice.noise", section: "voice", label: "Noise suppression", description: "RNNoise runs on the microphone. It does not cancel echo.", keywords: "rnnoise denoise" },
  { id: "voice.soundboard", section: "voice", label: "Soundboard", description: "WAV clips mixed into the call.", keywords: "wav hotkey sound" },
  { id: "voice.hud", section: "voice", label: "Voice HUD", description: "A small always-on-top window that uses the same voice roster.", keywords: "overlay in-game" },
  { id: "voice.opacity", section: "voice", label: "HUD opacity", description: "How solid the voice HUD is.", keywords: "transparent" },
  { id: "voice.click", section: "voice", label: "Click through", description: "Let the game take the mouse. Turn this off to drag the HUD." },
  { id: "voice.perf", section: "voice", label: "Performance", description: "RAM, CPU, and FPS on the same window as the voice HUD.", keywords: "overlay fps" },
  { id: "voice.input", section: "voice", label: "Input device", description: "Microphone Lark stores for the call.", keywords: "mic capture" },
  { id: "voice.output", section: "voice", label: "Output device", description: "Speakers or headphones for the call.", keywords: "playback" },
  { id: "voice.camera", section: "voice", label: "Camera", description: "Camera id stored for later. Video calls are not sent yet.", keywords: "video webcam" },
  { id: "voice.speak", section: "voice", label: "Speaking ring", description: "The ring around an avatar while someone is speaking. Discord green is the default.", keywords: "color colour picker speak ring" },
  { id: "messages.saved", section: "messages", label: "Saved messages", description: "Bookmarks kept on this device. Discord pins are unchanged.", keywords: "bookmarks" },
  { id: "messages.reminders", section: "messages", label: "Reminders", description: "Lark notifies you once, at the time you picked." },
  { id: "messages.scheduled", section: "messages", label: "Scheduled sends", description: "The soonest time is 15 seconds from now, and one message goes out at a time.", keywords: "later queue" },
  { id: "privacy.streamer", section: "privacy", label: "Streamer mode", description: "Hide emails, tokens, DM previews, and personal info on this screen.", keywords: "redact" },
  { id: "privacy.auto", section: "privacy", label: "Turn on while sharing or recording", description: "Follows screen share and the clip buffer. It does not look for other apps.", keywords: "auto capture" },
  { id: "clips.resolution", section: "clips", label: "Resolution", description: "720p, 1080p, 1440p, or 2160p. The default is 1440p.", keywords: "720 1080 1440 2160 quality" },
  { id: "clips.fps", section: "clips", label: "Frame rate", description: "60, 120, or 240 fps. Lark caps the rate when the display or encoder cannot hold it.", keywords: "fps 60 120 240" },
  { id: "clips.capture", section: "clips", label: "Game Mode capture", description: "Keep a buffer of the main display without sharing your screen.", keywords: "record hotkey" },
  { id: "clips.folder", section: "clips", label: "Clips folder", description: "Saved clips stay on this computer until you attach one.", keywords: "directory path" },
  { id: "clips.compress", section: "clips", label: "When a clip is over the upload limit", description: "Always compress, ask first, or keep the original. The original stays in the clips folder.", keywords: "h264 aac nitro encode" },
  { id: "clips.library", section: "clips", label: "Clip library", description: "Clips saved on this computer. Open the Clips view to play, trim, and send them.", keywords: "library replay video" },
  { id: "gaming.mode", section: "gaming", label: "Game Mode", description: "Pause animations, skip prefetch, and slow the polls Lark already runs.", keywords: "performance" },
  { id: "gaming.detect", section: "gaming", label: "Detect games", description: "Watch the front app a few times a minute. GPU sensors stay off.", keywords: "foreground" },
  { id: "gaming.hardware", section: "gaming", label: "Hardware in status", description: "GPU, CPU temperature, and the current game as your Discord custom status.", keywords: "sensors" },
  { id: "gaming.profiles", section: "gaming", label: "Game profiles", description: "Push to talk, Game Mode, and the HUD for each game you adjust.", keywords: "per game" },
  { id: "plugins.list", section: "plugins", label: "Plugins", description: "Reading tools stay on this device. The token never reaches a plugin.", keywords: "pack translate bookmarks" },
];

const extraSections: SettingsSectionMeta[] = [];
const extraEntries: SettingEntry[] = [];
const panes = new Map<string, () => HTMLElement>();

export function registerSettingsSection(section: SettingsSectionMeta) {
  if (!SETTINGS_GROUPS.some((group) => group.id === section.group)) return;
  if (settingsSections().some((item) => item.id === section.id)) return;
  extraSections.push(section);
}

export function registerSettingEntries(entries: readonly SettingEntry[]) {
  for (const entry of entries) {
    if (settingEntries().some((item) => item.id === entry.id)) continue;
    extraEntries.push(entry);
  }
}

export function registerSettingsPane(id: string, render: () => HTMLElement) {
  panes.set(id, render);
}

export function settingsPane(id: string): (() => HTMLElement) | undefined {
  return panes.get(id);
}

export function clearSettingsExtensions() {
  extraSections.length = 0;
  extraEntries.length = 0;
  panes.clear();
}

export function settingsSections(): SettingsSectionMeta[] {
  return [...SETTINGS_SECTIONS, ...extraSections];
}

export function settingEntries(dynamic: readonly SettingEntry[] = []): SettingEntry[] {
  const seen = new Set<string>();
  const out: SettingEntry[] = [];
  for (const entry of [...SETTING_ENTRIES, ...shortcutSettingEntries(), ...extraEntries, ...dynamic]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function shortcutSettingEntries(): SettingEntry[] {
  return Object.entries(SHORTCUT_COPY).map(([id, copy]) => ({
    id: `shortcut.${id}`,
    section: "shortcuts",
    label: copy.label,
    description: copy.description,
    keywords: id.replaceAll("_", " "),
  }));
}

export function groupedSections(sections: readonly SettingsSectionMeta[] = settingsSections()): { id: SettingsGroupId; label: string; sections: SettingsSectionMeta[] }[] {
  return SETTINGS_GROUPS
    .map((group) => ({ ...group, sections: sections.filter((section) => section.group === group.id) }))
    .filter((group) => group.sections.length > 0);
}

export function sectionsForQuery(query: string, sections: readonly SettingsSectionMeta[] = settingsSections(), entries: readonly SettingEntry[] = settingEntries()): SettingsSectionMeta[] {
  const needle = query.trim();
  if (!needle) return [...sections];
  const matched = new Set(searchSettings(needle, sections, entries).map((hit) => hit.section));
  return sections.filter((section) => matched.has(section.id));
}

export function searchSettings(query: string, sections: readonly SettingsSectionMeta[] = settingsSections(), entries: readonly SettingEntry[] = settingEntries()): SettingsSearchHit[] {
  const needle = query.trim();
  if (!needle) return [];
  const hits: SettingsSearchHit[] = [];
  for (const section of sections) {
    const score = fuzzyScore(needle, `${section.label} ${section.description}`);
    if (score === null) continue;
    hits.push({ kind: "section", id: section.id, section: section.id, label: section.label, description: section.description, score: score + 12 });
  }
  for (const entry of entries) {
    const score = fuzzyScore(needle, `${entry.label} ${entry.description} ${entry.keywords ?? ""}`);
    if (score === null) continue;
    hits.push({ kind: "setting", id: entry.id, section: entry.section, label: entry.label, description: entry.description, score });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const seen = new Set<string>();
  const unique: SettingsSearchHit[] = [];
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
    if (unique.length >= 20) break;
  }
  return unique;
}

export function normalizeHex(value: string): string | null {
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

export function settingHead(title: string, lede: string): HTMLElement {
  const head = el("header", "setting-head");
  head.append(el("h2", "", title), el("p", "", lede));
  return head;
}

export function settingCard(title?: string): HTMLElement {
  const card = el("section", "setting-card");
  if (title) card.append(el("h3", "", title));
  return card;
}

export function settingRow(id: string, label: string, description: string, control: HTMLElement, stack = false): HTMLElement {
  const row = el("div", stack ? "setting-row is-stack" : "setting-row");
  if (id) row.dataset.setting = id;
  const copy = el("div", "setting-copy");
  copy.append(el("div", "setting-label", label));
  if (description) copy.append(el("p", "setting-help", description));
  const slot = el("div", "setting-control");
  slot.append(control);
  row.append(copy, slot);
  return row;
}

export function switchControl(on: boolean, label: string): HTMLButtonElement {
  const button = el("button", on ? "switch is-on" : "switch");
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", on ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.append(el("span", "switch-knob"));
  return button;
}

export function segmentControl(values: readonly string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
  const row = el("div", "segment");
  row.setAttribute("role", "radiogroup");
  for (const value of values) {
    const button = el("button", value === current ? "is-on" : "", labels?.[value] ?? value);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", value === current ? "true" : "false");
    button.addEventListener("click", () => onPick(value));
    row.append(button);
  }
  return row;
}

export function sliderControl(value: number, min: number, max: number, label: string, onInput: (value: number) => void): HTMLElement {
  const line = el("div", "slider-line");
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.setAttribute("aria-label", label);
  const readout = el("span", "slider-value", String(value));
  input.addEventListener("input", () => {
    readout.textContent = input.value;
    onInput(Number(input.value));
  });
  line.append(input, readout);
  return line;
}

export function selectControl(label: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void, placeholder = "System default"): HTMLSelectElement {
  const select = el("select");
  select.setAttribute("aria-label", label);
  const fallback = el("option", "", placeholder);
  fallback.value = "";
  select.append(fallback);
  const known = new Set(options.map((option) => option.id));
  if (current && !known.has(current)) {
    const extra = el("option", "", current);
    extra.value = current;
    select.append(extra);
  }
  for (const option of options) {
    const node = el("option", "", option.label);
    node.value = option.id;
    select.append(node);
  }
  select.value = current;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

export function colorControl(value: string, label: string, onPick: (hex: string) => void, onReset?: () => void): HTMLElement {
  const line = el("div", "color-line");
  const fallback = normalizeHex(value) ?? "#5865f2";
  const input = el("input");
  input.type = "color";
  input.value = fallback;
  input.setAttribute("aria-label", label);
  const hex = el("input", "color-hex");
  hex.type = "text";
  hex.maxLength = 7;
  hex.value = fallback;
  hex.spellcheck = false;
  hex.setAttribute("aria-label", `${label} hex`);
  const write = (next: string) => {
    const clean = normalizeHex(next);
    if (!clean) return;
    input.value = clean;
    hex.value = clean;
    onPick(clean);
  };
  input.addEventListener("input", () => write(input.value));
  hex.addEventListener("change", () => {
    if (!normalizeHex(hex.value)) hex.value = input.value;
    else write(hex.value);
  });
  line.append(input, hex);
  if (onReset) {
    const reset = el("button", "text-button", "Reset");
    reset.type = "button";
    reset.addEventListener("click", () => onReset());
    line.append(reset);
  }
  return line;
}

export function settingsCloseButton(onClose: () => void): HTMLButtonElement {
  const button = el("button", "settings-close");
  button.type = "button";
  button.setAttribute("aria-label", "Close settings");
  button.append(icon(paths.close), el("span", "", "ESC"));
  button.addEventListener("click", onClose);
  return button;
}
