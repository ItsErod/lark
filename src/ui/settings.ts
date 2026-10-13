import { fuzzyScore } from "../search";
import { DISCORD_KEYBINDS } from "../user-settings";
import { segmentControl } from "./controls";
import { el, icon, paths } from "./dom";

export { segmentControl };

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
  { id: "account", label: "My Account", group: "user", description: "Username, email, phone, devices, standing, and log out." },
  { id: "messaging", label: "Messaging Permissions", group: "user", description: "Sensitive content, spam, direct messages, and friend requests." },
  { id: "data", label: "Data & Privacy", group: "user", description: "How data is used, and a link to download yours." },
  { id: "connections", label: "Connections", group: "user", description: "Accounts Discord has connected. Adding one opens Discord." },
  { id: "activity", label: "Activity Privacy", group: "user", description: "Who can see what you are playing or listening to." },
  { id: "notifications", label: "Notifications", group: "user", description: "Desktop alerts, quiet hours, keyword and person alerts, and what you missed." },
  { id: "nitro", label: "Nitro & Billing", group: "user", description: "Nitro, boosts, subscriptions, gifts, and billing. Each one opens Discord." },
  { id: "appearance", label: "Appearance", group: "app", description: "Light, Ash, Dark, Onyx, the theme gallery, and the app icon." },
  { id: "accessibility", label: "Accessibility", group: "app", description: "Text size, contrast, density, links, and message groups." },
  { id: "shortcuts", label: "Keybinds", group: "app", description: "Discord's shortcuts and Lark's. mod is Command on macOS and Ctrl on Windows." },
  { id: "language", label: "Language & Time", group: "app", description: "Language and 12-hour or 24-hour time." },
  { id: "window", label: "Window", group: "app", description: "Tray, login, and how fast the window paints." },
  { id: "advanced", label: "Advanced", group: "app", description: "Developer Mode shows ids on messages and menus." },
  { id: "updates", label: "Updates", group: "app", description: "Automatic updates for the macOS and Windows apps, and signed interface bundles." },
  { id: "voice", label: "Voice & Video", group: "lark", description: "Input mode, the speaking ring, noise suppression, devices, and the in-game HUD." },
  { id: "messages", label: "Messages", group: "lark", description: "Saved messages, reminders, and scheduled sends on this device." },
  { id: "privacy", label: "Privacy", group: "lark", description: "Streamer mode hides personal info on this screen." },
  { id: "clips", label: "Clips", group: "lark", description: "A local recording of the main display, and the library of clips saved on this computer." },
  { id: "gaming", label: "Gaming", group: "lark", description: "Game Mode, per-game profiles, and a hardware status line." },
  { id: "stats", label: "Stats", group: "lark", description: "Play time, voice, messages, clips, and usage stored on this device." },
  { id: "plugins", label: "Plugins and Themes", group: "lark", description: "Install plugins and themes from the store. They stay off until you turn them on." },
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
  previous_server: { label: "Previous server", description: "Move up the server list. Home is included." },
  next_server: { label: "Next server", description: "Move down the server list. Home is included." },
  edit_last: { label: "Edit last message", description: "Edit your latest message when the composer is empty." },
  toggle_mute: { label: "Mute", description: "Mute or unmute your microphone." },
  toggle_deafen: { label: "Deafen", description: "Deafen or undeafen." },
  push_to_talk: { label: "Push to talk", description: "Hold to transmit while push to talk is on." },
  toggle_voice_overlay: { label: "Voice HUD", description: "Show or hide the in-game voice window." },
  toggle_perf_overlay: { label: "Performance overlay", description: "Add RAM, CPU, and FPS to the voice HUD." },
  toggle_game_mode: { label: "Game Mode", description: "Toggle Game Mode, including while a game is focused." },
  save_clip: { label: "Save clip", description: "Save the clip buffer. Global on macOS and Windows." },
  toggle_call: { label: "Call view", description: "Open or close the call grid. Esc returns to the text channel." },
};

const SETTING_ENTRIES: readonly SettingEntry[] = [
  { id: "account.session", section: "account", label: "Session", description: "Where this account's token is stored.", keywords: "keychain credential sign out forget token" },
  { id: "account.username", section: "account", label: "Username", description: "The username Discord returns for this account.", keywords: "name handle" },
  { id: "account.email", section: "account", label: "Email", description: "Shown when Discord returns it. Lark does not edit it.", keywords: "mail address" },
  { id: "account.phone", section: "account", label: "Phone", description: "Shown when Discord returns it. Lark does not edit it.", keywords: "mobile number" },
  { id: "account.password", section: "account", label: "Password", description: "Change it on Discord. Lark never asks for the password.", keywords: "change password" },
  { id: "account.mfa", section: "account", label: "Two-factor authentication", description: "Manage authenticator codes on Discord. Lark never asks for the secret.", keywords: "mfa 2fa totp" },
  { id: "account.devices", section: "account", label: "Devices", description: "Sessions Discord reports for this account.", keywords: "sessions logged in" },
  { id: "account.standing", section: "account", label: "Account standing", description: "The standing Discord returns, when it returns one.", keywords: "safety" },
  { id: "account.disable", section: "account", label: "Disable account", description: "Opens Discord. Lark does not send a disable request.", keywords: "deactivate" },
  { id: "account.delete", section: "account", label: "Delete account", description: "Opens Discord. Lark does not send a delete confirmation.", keywords: "remove account" },
  { id: "account.switch", section: "account", label: "Switch accounts", description: "Up to five accounts on this computer.", keywords: "add account sessions" },
  { id: "account.logout", section: "account", label: "Log Out", description: "Sign out of this account. Other saved accounts stay.", keywords: "sign out forget token" },
  { id: "messaging.explicit", section: "messaging", label: "Sensitive content", description: "Scan direct messages from no one, non-friends, or everyone.", keywords: "explicit filter nsfw" },
  { id: "messaging.spam", section: "messaging", label: "Spam filter", description: "How aggressively to filter spam in direct messages.", keywords: "junk" },
  { id: "messaging.dms", section: "messaging", label: "Direct messages", description: "Who can send you a direct message.", keywords: "dm permission" },
  { id: "messaging.friends", section: "messaging", label: "Friend requests", description: "Who can send you a friend request.", keywords: "friends of friends server members" },
  { id: "data.improve", section: "data", label: "Use data to improve Discord", description: "Saved on this device.", keywords: "telemetry" },
  { id: "data.personalize", section: "data", label: "Use data to personalize Discord", description: "Saved on this device.", keywords: "customize" },
  { id: "data.download", section: "data", label: "Request data", description: "Opens Discord to download your data.", keywords: "export privacy download" },
  { id: "connections.list", section: "connections", label: "Connections", description: "YouTube, Spotify, and the other accounts Discord returns.", keywords: "youtube spotify steam xbox" },
  { id: "connections.manage", section: "connections", label: "Manage connections", description: "Add a connection on Discord. Lark does not collect that login.", keywords: "link unlink" },
  { id: "activity.share", section: "activity", label: "Share activity", description: "Let other people see the game or app you are using.", keywords: "playing listening" },
  { id: "activity.status", section: "activity", label: "Display activity as status", description: "Show the current activity as a status message.", keywords: "status" },
  { id: "nitro.nitro", section: "nitro", label: "Nitro", description: "Opens Discord's Nitro page. Lark has no plan picker.", keywords: "premium subscription" },
  { id: "nitro.boost", section: "nitro", label: "Server Boost", description: "Opens Discord to boost a server. Lark has no checkout.", keywords: "boost" },
  { id: "nitro.subscriptions", section: "nitro", label: "Subscriptions", description: "Opens Discord's subscription list.", keywords: "plans" },
  { id: "nitro.gifts", section: "nitro", label: "Gift Inventory", description: "Opens Discord's gift inventory.", keywords: "gifts codes" },
  { id: "nitro.billing", section: "nitro", label: "Billing", description: "Opens Discord's billing page. Lark has no payment form.", keywords: "payment card invoice" },
  { id: "appearance.mode", section: "appearance", label: "Theme mode", description: "Light, Ash, Dark, or Onyx, beside the theme gallery.", keywords: "light ash dark onyx" },
  { id: "appearance.theme", section: "appearance", label: "Theme", description: "Colour theme gallery. One click applies it.", keywords: "gallery colours colors css json import export" },
  { id: "appearance.icon", section: "appearance", label: "App icon", description: "Blurple, dark, light, midnight, or dusk.", keywords: "dock icon favicon" },
  { id: "appearance.embeds", section: "appearance", label: "Show embeds", description: "Show embeds and link previews in chat.", keywords: "preview links" },
  { id: "appearance.media", section: "appearance", label: "Show media", description: "Show images, video, and audio attached to messages.", keywords: "images video" },
  { id: "appearance.pause_gif", section: "appearance", label: "Pause GIF autoplay", description: "GIFs and stickers stay still until you click them.", keywords: "gif sticker tenor giphy" },
  { id: "accessibility.motion", section: "accessibility", label: "Motion", description: "Follow the system, reduce motion, or allow motion.", keywords: "reduced motion animation" },
  { id: "appearance.spoilers", section: "appearance", label: "Show spoiler content", description: "Reveal spoilers without a click.", keywords: "spoiler" },
  { id: "appearance.font", section: "appearance", label: "Font", description: "The face used for messages and the chrome.", keywords: "inter system serif mono typeface" },
  { id: "appearance.size", section: "appearance", label: "Font size", description: "Interface size, from 12 to 24.", keywords: "text scale" },
  { id: "appearance.density", section: "appearance", label: "Density", description: "How tightly messages sit. IRC stays separate from cozy and compact.", keywords: "cozy compact irc" },
  { id: "appearance.channels", section: "appearance", label: "Channel list", description: "Which side the channel list uses, or hide it.", keywords: "left right hidden sidebar" },
  { id: "appearance.members", section: "appearance", label: "Member list", description: "Show the member list beside the chat." },
  { id: "appearance.rail", section: "appearance", label: "Server rail", description: "Show the server icons along the left edge." },
  { id: "appearance.accent", section: "appearance", label: "Server accent", description: "Colour for this server. It does not change the theme file.", keywords: "color picker hex" },
  { id: "notifications.desktop", section: "notifications", label: "Desktop notifications", description: "Banners while Lark is in the background.", keywords: "alerts toasts" },
  { id: "notifications.level", section: "notifications", label: "Notify me when", description: "All messages, only mentions, or nothing.", keywords: "all mentions mute nothing" },
  { id: "notifications.sounds", section: "notifications", label: "Message sound", description: "A short tone when a desktop notification fires.", keywords: "sounds message" },
  { id: "notifications.call", section: "notifications", label: "Call sound", description: "The ringtone while a direct or group call is ringing.", keywords: "call sound ringtone" },
  { id: "notifications.badge", section: "notifications", label: "Unread badge", description: "The count on the dock or taskbar.", keywords: "badge dock" },
  { id: "notifications.email", section: "notifications", label: "Email notifications", description: "Saved on this device. Discord sends the mail.", keywords: "email" },
  { id: "notifications.test", section: "notifications", label: "Test notification", description: "Send a sample so you can see where it lands." },
  { id: "notifications.keywords", section: "notifications", label: "Highlight keywords", description: "Messages that contain these words get a highlight.", keywords: "words ping" },
  { id: "notifications.quiet", section: "notifications", label: "Quiet hours", description: "A local window that holds or drops non-critical alerts.", keywords: "dnd do not disturb schedule night" },
  { id: "notifications.quiet.start", section: "notifications", label: "Quiet hours start", description: "Local time when the window begins.", keywords: "from" },
  { id: "notifications.quiet.end", section: "notifications", label: "Quiet hours end", description: "Local time when the window ends.", keywords: "until" },
  { id: "notifications.quiet.mode", section: "notifications", label: "During quiet hours", description: "Suppress non-critical alerts, or save them for one summary.", keywords: "batch suppress" },
  { id: "notifications.alerts", section: "notifications", label: "Alert keywords", description: "Notify when these words appear, even if the channel is muted.", keywords: "keyword ping" },
  { id: "notifications.people", section: "notifications", label: "People", description: "Notify when these people message you, even if the channel is muted.", keywords: "person user" },
  { id: "notifications.blocked", section: "notifications", label: "Blocked alerts", description: "Keywords, people, or channel ids that never break a mute.", keywords: "block ignore" },
  { id: "notifications.missed", section: "notifications", label: "Missed messages", description: "A summary of messages that arrived while you were away or during quiet hours.", keywords: "digest away" },
  { id: "shortcut.mark_read", section: "shortcuts", label: "Mark read", description: "Esc closes whatever is open first. With nothing open, it marks the channel read.", keywords: "escape" },
  { id: "shortcut.toggle_call", section: "shortcuts", label: "Call view", description: "Open or close the call grid.", keywords: "voice hotkey split popout" },
  { id: "window.tray", section: "window", label: "Minimise to tray", description: "Closing the window leaves Lark in the menu bar or system tray.", keywords: "minimize tray" },
  { id: "window.login", section: "window", label: "Open at login", description: "Start Lark when you sign in to this computer.", keywords: "autostart startup" },
  { id: "window.frame", section: "window", label: "Frame rate", description: "Scrolling and transitions follow the monitor, up to this cap.", keywords: "fps hz 240 cap" },
  { id: "voice.mode", section: "voice", label: "Input mode", description: "Voice activity opens the mic when you speak. Push to talk waits for the key.", keywords: "vad ptt microphone" },
  { id: "voice.sensitivity", section: "voice", label: "Voice activity sensitivity", description: "How loud you need to be before voice activity opens the mic.", keywords: "threshold" },
  { id: "voice.noise", section: "voice", label: "Noise suppression", description: "RNNoise runs on the microphone. Echo cancellation is a separate switch. This is not Krisp.", keywords: "rnnoise denoise" },
  { id: "voice.quality", section: "voice", label: "Higher quality suppression", description: "Spectral noise suppression. Echo cancellation is a separate switch.", keywords: "spectral rnnoise" },
  { id: "voice.soundboard", section: "voice", label: "Soundboard", description: "WAV clips mixed into the call.", keywords: "wav hotkey sound" },
  { id: "voice.hud", section: "voice", label: "Voice HUD", description: "A small always-on-top window that uses the same voice roster.", keywords: "overlay in-game" },
  { id: "voice.opacity", section: "voice", label: "HUD opacity", description: "How solid the voice HUD is.", keywords: "transparent" },
  { id: "voice.click", section: "voice", label: "Click through", description: "Let the game take the mouse. Turn this off to drag the HUD." },
  { id: "voice.perf", section: "voice", label: "Performance", description: "RAM, CPU, and FPS on the same window as the voice HUD.", keywords: "overlay fps" },
  { id: "voice.input", section: "voice", label: "Input device", description: "Microphone Lark stores for the call.", keywords: "mic capture" },
  { id: "voice.output", section: "voice", label: "Output device", description: "Speakers or headphones for the call.", keywords: "playback" },
  { id: "voice.camera", section: "voice", label: "Camera", description: "Camera Lark opens for the preview and for video in a call.", keywords: "video webcam" },
  { id: "voice.camera.quality", section: "voice", label: "Camera resolution", description: "360p, 480p, 720p, or 1080p. 720p is the default.", keywords: "720p 1080p hd video quality" },
  { id: "voice.camera.fps", section: "voice", label: "Camera frame rate", description: "15 or 30 frames per second. 30 is the default.", keywords: "fps 30 15" },
  { id: "voice.diagnostics", section: "voice", label: "Copy voice diagnostics", description: "Handshake steps, close codes, and packet counters for a voice call.", keywords: "debug log export dave udp" },
  { id: "voice.speak", section: "voice", label: "Speaking ring", description: "The ring around an avatar while someone is speaking. Discord green is the default.", keywords: "color colour picker speak ring" },
  { id: "messages.saved", section: "messages", label: "Saved messages", description: "Bookmarks kept on this device. Discord pins are unchanged.", keywords: "bookmarks" },
  { id: "messages.reminders", section: "messages", label: "Reminders", description: "Lark notifies you once, at the time you picked." },
  { id: "messages.scheduled", section: "messages", label: "Scheduled sends", description: "The soonest time is 15 seconds from now, and one message goes out at a time.", keywords: "later queue" },
  { id: "privacy.streamer", section: "privacy", label: "Streamer mode", description: "Hide emails, tokens, DM previews, and personal info on this screen.", keywords: "redact" },
  { id: "privacy.auto", section: "privacy", label: "Turn on while sharing or recording", description: "Follows screen share and the clip buffer. It does not look for other apps.", keywords: "auto capture" },
  { id: "clips.resolution", section: "clips", label: "Resolution", description: "720p, 1080p, 1440p, or 2160p. The default is 1440p.", keywords: "720 1080 1440 2160 quality" },
  { id: "clips.fps", section: "clips", label: "Frame rate", description: "60, 120, or 240 fps. Lark caps the rate when the display or encoder cannot hold it.", keywords: "fps 60 120 240" },
  { id: "clips.buffer", section: "clips", label: "Replay length", description: "How far back the hotkey saves: 15 seconds, 30 seconds, 1 minute, 90 seconds, or 2 minutes.", keywords: "buffer 15 30 60 90 120 replay shadowplay" },
  { id: "clips.capture", section: "clips", label: "Game Mode capture", description: "Keep a buffer of the main display without sharing your screen.", keywords: "record hotkey" },
  { id: "clips.folder", section: "clips", label: "Clips folder", description: "Saved clips stay on this computer until you attach one.", keywords: "directory path" },
  { id: "clips.compress", section: "clips", label: "When a clip is over the upload limit", description: "Always compress, ask first, or keep the original. The original stays in the clips folder.", keywords: "h264 aac nitro encode" },
  { id: "clips.library", section: "clips", label: "Clip library", description: "Gallery of clips saved on this computer. Play, trim, and share one to the open channel.", keywords: "library gallery replay video share trim" },
  { id: "gaming.mode", section: "gaming", label: "Game Mode", description: "Hide the member list and shrink the rail and channel list during a call or while a game is in front. Chat stays.", keywords: "performance chrome overlay" },
  { id: "gaming.detect", section: "gaming", label: "Detect games", description: "Watch the front app a few times a minute. GPU sensors stay off.", keywords: "foreground" },
  { id: "gaming.hardware", section: "gaming", label: "Hardware in status", description: "GPU, CPU temperature, and the current game as your Discord custom status.", keywords: "sensors" },
  { id: "gaming.profiles", section: "gaming", label: "Game profiles", description: "Push to talk, Game Mode, and the HUD for each game you adjust.", keywords: "per game" },
  { id: "stats.collect", section: "stats", label: "Collect stats", description: "Counts stay on this device. Turn collection off to stop new ones.", keywords: "usage play time voice clips local privacy" },
  { id: "stats.clear", section: "stats", label: "Clear stats", description: "Erase the counts stored on this device.", keywords: "reset delete history" },
  { id: "plugins.list", section: "plugins", label: "Plugins and Themes", description: "Installed from the store. The token never reaches a plugin.", keywords: "pack translate bookmarks store themes browse install" },
  { id: "plugins.store", section: "plugins", label: "Store", description: "Install a plugin or theme from the Lark store. Update and uninstall stay on the installed item.", keywords: "catalog browse install theme update uninstall" },
  { id: "accessibility.size", section: "accessibility", label: "Text size", description: "From 12 to 24.", keywords: "font size scale" },
  { id: "accessibility.underline", section: "accessibility", label: "Underline links", description: "Draw a line under links in messages.", keywords: "links" },
  { id: "accessibility.ui", section: "accessibility", label: "UI density", description: "Cozy or compact chrome, separate from message density.", keywords: "compact cozy spacing" },
  { id: "accessibility.messages", section: "accessibility", label: "Message display", description: "Cozy or compact messages. IRC is its own switch.", keywords: "cozy compact" },
  { id: "accessibility.irc", section: "accessibility", label: "IRC layout", description: "One line per message. It does not replace cozy or compact.", keywords: "irc" },
  { id: "accessibility.spacing", section: "accessibility", label: "Group spacing", description: "Extra space between message groups.", keywords: "gap margin" },
  { id: "accessibility.saturation", section: "accessibility", label: "Saturation", description: "How strong the colours are.", keywords: "color colour vivid" },
  { id: "accessibility.contrast", section: "accessibility", label: "High contrast", description: "Push muted text toward the main text colour.", keywords: "contrast" },
  { id: "language.locale", section: "language", label: "Language", description: "The language used for dates and the document.", keywords: "locale english" },
  { id: "language.time", section: "language", label: "Time format", description: "Automatic, 12-hour, or 24-hour clocks.", keywords: "12 24 hour clock" },
  { id: "advanced.developer", section: "advanced", label: "Developer Mode", description: "Show ids you can copy from messages and menus.", keywords: "copy id debug" },
  { id: "updates.version", section: "updates", label: "Current version", description: "The version of Lark running on this computer.", keywords: "version about" },
  { id: "updates.auto", section: "updates", label: "Automatically install updates", description: "Download a new version in the background and install it when it is ready. A voice call finishes first.", keywords: "updater auto update" },
  { id: "updates.check", section: "updates", label: "Check for updates", description: "Look for a Lark update now.", keywords: "version update check now" },
  { id: "updates.channel", section: "updates", label: "Interface channel", description: "Stable or Canary. Canary gets each interface build. Stable gets a promoted build.", keywords: "canary stable hot update channel" },
  { id: "updates.ui", section: "updates", label: "Interface build", description: "The interface loaded in this window. Built-in is the one packaged with the app.", keywords: "ui build hot bundle" },
  { id: "updates.interface", section: "updates", label: "Check interface", description: "Look for an interface bundle now.", keywords: "interface check now hot update" },
  { id: "updates.reset", section: "updates", label: "Reset to built-in UI", description: "Drop the downloaded interface and load the one packaged with Lark.", keywords: "builtin built-in rollback reset" },
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
  for (const entry of [...SETTING_ENTRIES, ...shortcutSettingEntries(), ...discordKeybindEntries(), ...extraEntries, ...dynamic]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function discordKeybindEntries(): SettingEntry[] {
  return DISCORD_KEYBINDS.map((row) => ({
    id: `keybind.${row.id}`,
    section: "shortcuts",
    label: row.label,
    description: row.description,
    keywords: row.keywords,
  }));
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
  const fallback = normalizeHex(value) ?? "#fafafa";
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
