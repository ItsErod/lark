import type { AppConfig, OsName } from "../types";
import {
  APP_ICONS,
  COLOR_MODES,
  DISCORD_KEYBINDS,
  LANGUAGES,
  MAX_ACCOUNTS,
  appIconSvg,
  connectionIdOk,
  discordUrl,
  type AccountOverview,
  type DiscordLink,
} from "../user-settings";
import { el } from "./dom";
import { registerSettingEntries, segmentControl, settingCard, settingHead, settingRow, sliderControl, switchControl } from "./settings";

registerSettingEntries([{
  id: "advanced.network",
  section: "advanced",
  label: "Network",
  description: "REST, gateway, and voice traffic. Nothing is recorded while this panel is closed.",
  keywords: "devtools traffic websocket rest gateway",
}]);

export interface SettingsHost {
  config: AppConfig;
  streamer: boolean;
  tauri: boolean;
  os: OsName;
  meName: string;
  meId: string;
  meCustom: string;
  credentialStore: string;
  configDir: string;
  account: AccountOverview | null;
  accountNote: string;
  discordRebind: string | null;
  mask: (value: string) => string;
  persist: () => void;
  refresh: () => void;
  apply: () => void;
  repaint?: () => void;
  logout: () => void;
  switchAccount: (id: string) => void;
  removeAccount: (id: string) => void;
  addAccount: () => void;
  unlink: (type: string, id: string) => void;
  rebindDiscord: (id: string) => void;
  formatShortcut: (shortcut: string) => string;
  open: (url: string) => void;
  onDeveloper?: (on: boolean) => void;
  openNetwork?: () => void;
}

function emailControl(host: SettingsHost): HTMLElement {
  const row = el("div", "settings-actions");
  row.append(
    toggle(host, "Email notifications", host.config.preferences.email_notifications, (value) => {
      host.config.preferences.email_notifications = value;
    }),
    linkButton(host, "emails", "Manage on Discord"),
  );
  return row;
}

function linkButton(host: SettingsHost, kind: DiscordLink, label: string): HTMLButtonElement {
  const button = el("button", "text-button", label);
  button.type = "button";
  button.addEventListener("click", () => host.open(discordUrl(kind)));
  return button;
}

function toggle(host: SettingsHost, label: string, on: boolean, change: (value: boolean) => void): HTMLButtonElement {
  const button = switchControl(on, label);
  button.addEventListener("click", () => {
    change(!on);
    host.persist();
    host.apply();
    host.refresh();
  });
  return button;
}

export function colorModeCard(host: SettingsHost): HTMLElement {
  const card = settingCard("Theme");
  const row = el("div", "segment");
  row.setAttribute("role", "radiogroup");
  row.setAttribute("aria-label", "Theme mode");
  const current = host.config.preferences.color_mode;
  const gallery = el("button", current ? "" : "is-on", "Gallery");
  gallery.type = "button";
  gallery.addEventListener("click", () => {
    host.config.preferences.color_mode = "";
    host.persist();
    host.apply();
    host.refresh();
  });
  row.append(gallery);
  for (const mode of COLOR_MODES) {
    const button = el("button", current === mode ? "is-on" : "", mode[0].toUpperCase() + mode.slice(1));
    button.type = "button";
    button.addEventListener("click", () => {
      host.config.preferences.color_mode = mode;
      host.persist();
      host.apply();
      host.refresh();
    });
    row.append(button);
  }
  card.append(settingRow(
    "appearance.mode",
    "Light, Ash, Dark, Onyx",
    "These four sit beside the theme gallery. Gallery uses the theme file you pick below.",
    row,
    true,
  ));
  return card;
}

export function appIconCard(host: SettingsHost): HTMLElement {
  const card = settingCard("App icon");
  const row = el("div", "segment");
  const current = host.config.preferences.app_icon;
  for (const icon of APP_ICONS) {
    const button = el("button", current === icon.id ? "is-on" : "", icon.label);
    button.type = "button";
    button.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(appIconSvg(icon.id))}")`;
    button.style.backgroundRepeat = "no-repeat";
    button.style.backgroundPosition = "8px center";
    button.style.backgroundSize = "16px 16px";
    button.style.paddingLeft = "28px";
    button.addEventListener("click", () => {
      host.config.preferences.app_icon = icon.id;
      host.persist();
      host.apply();
      host.refresh();
    });
    row.append(button);
  }
  card.append(settingRow("appearance.icon", "App icon", "The mark in the window and the dock.", row, true));
  return card;
}

export function mediaCard(host: SettingsHost): HTMLElement {
  const card = settingCard("Message media");
  const display = host.config.display;
  const prefs = host.config.preferences;
  card.append(settingRow(
    "appearance.embeds",
    "Show embeds",
    "Embeds and link previews in chat.",
    toggle(host, "Show embeds", display.show_embeds, (value) => {
      host.config.display.show_embeds = value;
    }),
  ));
  card.append(settingRow(
    "appearance.media",
    "Show media",
    "Images, video, and audio attached to messages.",
    toggle(host, "Show media", prefs.show_media, (value) => {
      host.config.preferences.show_media = value;
    }),
  ));
  card.append(settingRow(
    "appearance.spoilers",
    "Show spoiler content",
    "Reveal spoilers without a click.",
    toggle(host, "Show spoiler content", display.show_spoilers, (value) => {
      host.config.display.show_spoilers = value;
    }),
  ));
  return card;
}

export function renderAccessibilityPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Accessibility", "Text size, contrast, and how tightly the interface sits. IRC stays its own layout."));
  const text = settingCard("Text");
  const size = host.config.appearance.font_size;
  text.append(settingRow(
    "accessibility.size",
    "Text size",
    "From 12 to 24.",
    sliderControl(size, 12, 24, "Text size", (value) => {
      host.config.appearance.font_size = value;
      host.persist();
      host.apply();
    }),
    true,
  ));
  text.append(settingRow(
    "accessibility.underline",
    "Underline links",
    "Draw a line under links in messages.",
    toggle(host, "Underline links", host.config.preferences.underline_links, (value) => {
      host.config.preferences.underline_links = value;
    }),
  ));
  const display = settingCard("Display");
  display.append(settingRow(
    "accessibility.ui",
    "UI density",
    "Cozy or compact chrome. This does not change message density.",
    segmentControl(["cozy", "compact"], host.config.preferences.ui_density, (value) => {
      host.config.preferences.ui_density = value;
      host.persist();
      host.apply();
      host.refresh();
    }, { cozy: "Cozy", compact: "Compact" }),
    true,
  ));
  display.append(settingRow(
    "accessibility.messages",
    "Message display",
    "Cozy or compact. IRC, below, does not replace this choice.",
    segmentControl(["cozy", "compact"], host.config.preferences.message_density, (value) => {
      host.config.preferences.message_density = value;
      if (host.config.appearance.density !== "irc") host.config.appearance.density = value as AppConfig["appearance"]["density"];
      host.persist();
      host.apply();
      host.refresh();
    }, { cozy: "Cozy", compact: "Compact" }),
    true,
  ));
  display.append(settingRow(
    "accessibility.irc",
    "IRC layout",
    "One line per message. Turning it off returns to cozy or compact.",
    toggle(host, "IRC layout", host.config.appearance.density === "irc", (value) => {
      const message = host.config.preferences.message_density === "compact" ? "compact" : "cozy";
      host.config.appearance.density = value ? "irc" : message;
    }),
  ));
  display.append(settingRow(
    "accessibility.spacing",
    "Group spacing",
    "Extra space between message groups, from 0 to 24.",
    sliderControl(host.config.preferences.group_spacing, 0, 24, "Group spacing", (value) => {
      host.config.preferences.group_spacing = value;
      host.persist();
      host.apply();
    }),
    true,
  ));
  display.append(settingRow(
    "accessibility.saturation",
    "Saturation",
    "100 is unchanged. Lower values wash the colour out.",
    sliderControl(host.config.preferences.saturation, 0, 100, "Saturation", (value) => {
      host.config.preferences.saturation = value;
      host.persist();
      host.apply();
    }),
    true,
  ));
  display.append(settingRow(
    "accessibility.contrast",
    "High contrast",
    "Push muted text toward the main text colour.",
    toggle(host, "High contrast", host.config.preferences.high_contrast, (value) => {
      host.config.preferences.high_contrast = value;
    }),
  ));
  wrap.append(text, display);
  return wrap;
}

export function renderMessagingPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Messaging Permissions", "Filters and who can reach you. Saved on this device."));
  const prefs = host.config.preferences;
  const card = settingCard("Privacy & safety");
  card.append(settingRow(
    "messaging.explicit",
    "Sensitive content",
    "Scan direct messages from no one, from people who are not friends, or from everyone.",
    segmentControl(["off", "friends", "everyone"], prefs.explicit_filter, (value) => {
      host.config.preferences.explicit_filter = value;
      host.persist();
      host.refresh();
    }, { off: "Don't scan", friends: "Non-friends", everyone: "Everyone" }),
    true,
  ));
  card.append(settingRow(
    "messaging.spam",
    "Spam filter",
    "How aggressively to filter spam in direct messages.",
    segmentControl(["off", "non_friends", "everyone"], prefs.spam_filter, (value) => {
      host.config.preferences.spam_filter = value;
      host.persist();
      host.refresh();
    }, { off: "Off", non_friends: "Non-friends", everyone: "Everyone" }),
    true,
  ));
  card.append(settingRow(
    "messaging.dms",
    "Direct messages",
    "Who can send you a direct message.",
    segmentControl(["everyone", "friends", "none"], prefs.dm_permission, (value) => {
      host.config.preferences.dm_permission = value;
      host.persist();
      host.refresh();
    }, { everyone: "Everyone", friends: "Friends", none: "No one" }),
    true,
  ));
  card.append(settingRow(
    "messaging.friends",
    "Friend requests",
    "Who can send you a friend request.",
    segmentControl(["everyone", "friends_of_friends", "server_members"], prefs.friend_requests, (value) => {
      host.config.preferences.friend_requests = value;
      host.persist();
      host.refresh();
    }, { everyone: "Everyone", friends_of_friends: "Friends of friends", server_members: "Server members" }),
    true,
  ));
  wrap.append(card);
  return wrap;
}

export function renderDataPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Data & Privacy", "These switches are saved on this device. The download opens Discord."));
  const card = settingCard("Data");
  card.append(settingRow(
    "data.improve",
    "Use data to improve Discord",
    "Saved on this device.",
    toggle(host, "Use data to improve Discord", host.config.preferences.improve_discord, (value) => {
      host.config.preferences.improve_discord = value;
    }),
  ));
  card.append(settingRow(
    "data.personalize",
    "Use data to personalize Discord",
    "Saved on this device.",
    toggle(host, "Use data to personalize Discord", host.config.preferences.personalize, (value) => {
      host.config.preferences.personalize = value;
    }),
  ));
  card.append(settingRow(
    "data.download",
    "Request all of my data",
    "Discord prepares the download. Lark does not collect it.",
    linkButton(host, "data", "Request data on Discord"),
  ));
  wrap.append(card);
  return wrap;
}

export function renderActivityPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Activity Privacy", "Who can see the game or music Discord detects."));
  const card = settingCard("Activity");
  card.append(settingRow(
    "activity.share",
    "Share your activity",
    "Other people can see what you are playing or listening to.",
    toggle(host, "Share your activity", host.config.preferences.share_activity, (value) => {
      host.config.preferences.share_activity = value;
    }),
  ));
  card.append(settingRow(
    "activity.status",
    "Display current activity as a status",
    "Show that activity on your status message.",
    toggle(host, "Display current activity as a status", host.config.preferences.activity_status, (value) => {
      host.config.preferences.activity_status = value;
    }),
  ));
  wrap.append(card);
  return wrap;
}

export function renderNitroPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Nitro & Billing", "Lark does not sell Nitro, boosts, or gifts, and it does not store a card."));
  const card = settingCard("Open on Discord");
  const rows: [string, string, DiscordLink, string][] = [
    ["nitro.nitro", "Nitro", "nitro", "Plans and perks. There is no picker here."],
    ["nitro.boost", "Server Boost", "boost", "Boost a server on Discord."],
    ["nitro.subscriptions", "Subscriptions", "subscriptions", "What this account is paying for."],
    ["nitro.gifts", "Gift Inventory", "gifts", "Codes waiting on the account."],
    ["nitro.billing", "Billing", "billing", "Payment methods and history stay on Discord."],
  ];
  for (const [id, label, kind, description] of rows) {
    card.append(settingRow(id, label, description, linkButton(host, kind, "Open")));
  }
  wrap.append(card);
  return wrap;
}

export function renderLanguagePane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Language & Time", "The interface follows this language."));
  const card = settingCard("Locale");
  const select = el("select");
  select.setAttribute("aria-label", "Language");
  for (const language of LANGUAGES) {
    const option = el("option", "", language.label);
    option.value = language.id;
    select.append(option);
  }
  select.value = host.config.preferences.language;
  select.addEventListener("change", () => {
    host.config.preferences.language = select.value;
    host.persist();
    host.apply();
    host.repaint?.();
    host.refresh();
  });
  card.append(settingRow("language.locale", "Language", "Used for clocks and the document language.", select, true));
  card.append(settingRow(
    "language.time",
    "Time format",
    "Automatic follows this computer. 12-hour and 24-hour override it.",
    segmentControl(["auto", "12", "24"], host.config.preferences.time_format, (value) => {
      host.config.preferences.time_format = value;
      host.persist();
      host.apply();
      host.refresh();
    }, { auto: "Auto", "12": "12-hour", "24": "24-hour" }),
    true,
  ));
  const sample = new Intl.DateTimeFormat(host.config.preferences.language || "en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: host.config.preferences.time_format === "12" ? "h12" : host.config.preferences.time_format === "24" ? "h23" : undefined,
  }).format(new Date());
  card.append(el("p", "setting-help", `A clock on this device reads ${sample}.`));
  wrap.append(card);
  return wrap;
}

export function renderAdvancedPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Advanced", "Developer Mode shows ids on messages, channels, and people."));
  const card = settingCard("Developer");
  card.append(settingRow(
    "advanced.developer",
    "Developer Mode",
    "Copy ID appears where the menus support it. Network traffic is recorded only while its panel is open.",
    toggle(host, "Developer Mode", host.config.display.developer_mode, (value) => {
      host.config.display.developer_mode = value;
      host.onDeveloper?.(value);
    }),
  ));
  if (host.config.display.developer_mode) {
    const open = el("button", "text-button", "Open");
    open.type = "button";
    open.addEventListener("click", () => host.openNetwork?.());
    card.append(settingRow(
      "advanced.network",
      "Network",
      "Live REST calls, gateway events, and voice stats. Tokens and auth headers are removed.",
      open,
    ));
  }
  wrap.append(card);
  return wrap;
}

export function renderConnectionsPane(host: SettingsHost): HTMLElement {
  const wrap = el("div", "settings-stack");
  wrap.append(settingHead("Connections", "Lark lists what Discord returns. Adding a connection opens Discord."));
  const card = settingCard("Connected accounts");
  card.dataset.setting = "connections.list";
  const rows = host.account?.connections ?? [];
  if (!host.tauri) card.append(el("p", "setting-help", "Connections load in the desktop app, from the account you signed in."));
  else if (host.accountNote) card.append(el("p", "setting-help", host.accountNote));
  else if (!rows.length) card.append(el("p", "setting-help", "Discord did not return any connections."));
  for (const connection of rows) {
    const remove = el("button", "ghost", "Remove");
    remove.type = "button";
    remove.disabled = !connectionIdOk(connection.type) || !connectionIdOk(connection.id);
    remove.addEventListener("click", () => host.unlink(connection.type, connection.id));
    const name = host.streamer ? host.mask(connection.name) : connection.name;
    card.append(settingRow(
      `connections.${connection.type}`,
      name,
      `${connection.type}${connection.verified ? " · verified" : ""}`,
      remove,
    ));
  }
  card.append(settingRow(
    "connections.manage",
    "Add a connection",
    "YouTube, Spotify, and the rest are connected on Discord.",
    linkButton(host, "connections", "Manage on Discord"),
  ));
  wrap.append(card);
  return wrap;
}

export function renderAccountDetails(host: SettingsHost): HTMLElement[] {
  const account = host.account?.account ?? null;
  const who = settingCard("Account");
  const username = account?.username || host.meName;
  const email = account?.email ? host.mask(account.email) : "Discord has not returned an email.";
  const phone = account?.phone ? host.mask(account.phone) : "Discord has not returned a phone number.";
  who.append(settingRow("account.username", "Username", host.mask(username), el("span", "hint", account?.globalName ? host.mask(account.globalName) : "")));
  who.append(settingRow("account.email", "Email", "Shown when Discord returns it.", el("span", "", email)));
  who.append(settingRow("account.phone", "Phone", "Shown when Discord returns it.", el("span", "", phone)));
  if (host.accountNote) who.append(el("p", "setting-help", host.accountNote));

  const security = settingCard("Password and security");
  security.append(settingRow(
    "account.password",
    "Password",
    "Lark does not ask for a password.",
    linkButton(host, "password", "Change on Discord"),
  ));
  const mfa = account?.mfaEnabled ? "On" : "Off or not returned";
  security.append(settingRow(
    "account.mfa",
    "Two-factor authentication",
    `${mfa}. Lark does not ask for the authenticator secret.`,
    linkButton(host, "mfa", "Manage on Discord"),
  ));

  const devices = settingCard("Devices");
  devices.dataset.setting = "account.devices";
  const list = host.account?.devices ?? [];
  if (!list.length) devices.append(el("p", "setting-help", host.tauri ? "Discord did not return a device list." : "Device sessions load in the desktop app."));
  for (const device of list) {
    const where = [device.client, device.location].filter(Boolean).join(" · ");
    devices.append(settingRow(device.id, where || "Session", device.lastUsed ? `Last used ${device.lastUsed}` : "A session Discord reported.", el("span", "hint", "")));
  }

  const standing = settingCard("Standing");
  standing.append(settingRow(
    "account.standing",
    "Account standing",
    host.account?.standing || "Discord did not return an account standing.",
    el("span", "hint", ""),
  ));

  const danger = settingCard("Disable or delete");
  danger.append(settingRow("account.disable", "Disable account", "Opens Discord. Lark does not send the request.", linkButton(host, "disable", "Disable on Discord")));
  danger.append(settingRow("account.delete", "Delete account", "Opens Discord. Lark does not collect a delete confirmation.", linkButton(host, "delete", "Delete on Discord")));

  const switcher = settingCard("Accounts");
  switcher.dataset.setting = "account.switch";
  switcher.append(el("p", "setting-help", `Lark keeps ${MAX_ACCOUNTS} accounts. The token for each one stays in ${host.credentialStore || "the system credential store"}.`));
  if (!host.config.sessions.length) switcher.append(el("p", "setting-help", "This account is saved here after you sign in on the desktop app."));
  for (const session of host.config.sessions) {
    const current = session.id === host.meId;
    const button = el("button", current ? "primary" : "ghost", current ? "This account" : "Switch");
    button.type = "button";
    button.disabled = current;
    button.addEventListener("click", () => host.switchAccount(session.id));
    const remove = el("button", "ghost", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => host.removeAccount(session.id));
    const controls = el("div", "settings-actions");
    controls.append(button, remove);
    switcher.append(settingRow(`account.session.${session.id}`, host.mask(session.name), current ? "Signed in" : "Saved on this computer", controls));
  }
  const add = el("button", "ghost", "Add account");
  add.type = "button";
  add.addEventListener("click", () => host.addAccount());
  switcher.append(settingRow("account.switch", "Add account", "Sign in with Discord, the browser, QR, or a token. The login screen stays the same.", add));

  const session = settingCard("This computer");
  session.dataset.setting = "account.session";
  session.append(el("p", "setting-help", `Config folder: ${host.configDir || "the Lark folder"}.`));
  const logout = el("button", "primary", "Log Out");
  logout.type = "button";
  logout.addEventListener("click", () => host.logout());
  session.append(settingRow("account.logout", "Log Out", "Signs out of this account. Another saved account is used when one is left.", logout));
  return [who, security, devices, standing, danger, switcher, session];
}

export function discordKeybindCard(host: SettingsHost): HTMLElement {
  const card = settingCard("Discord");
  card.append(el("p", "setting-help", "These match Discord's set. Lark's shortcuts above stay. Backspace while listening clears a bind."));
  for (const row of DISCORD_KEYBINDS) {
    const shortcut = host.config.keybinds[row.id];
    const listening = host.discordRebind === row.id;
    const button = el("button", "kbd", listening ? "Press keys" : shortcut ? host.formatShortcut(shortcut) : "Unbound");
    button.type = "button";
    button.addEventListener("click", () => host.rebindDiscord(row.id));
    card.append(settingRow(`keybind.${row.id}`, row.label, row.description, button));
  }
  return card;
}

export function notificationExtras(host: SettingsHost): HTMLElement[] {
  const prefs = host.config.preferences;
  return [
    settingRow(
      "notifications.desktop",
      "Desktop notifications",
      "Banners while Lark is in the background.",
      toggle(host, "Desktop notifications", prefs.desktop_notifications, (value) => {
        host.config.preferences.desktop_notifications = value;
      }),
    ),
    settingRow(
      "notifications.sounds",
      "Message sound",
      "A short tone when a desktop notification fires.",
      toggle(host, "Message sound", prefs.message_sound, (value) => {
        host.config.preferences.message_sound = value;
      }),
    ),
    settingRow(
      "notifications.call",
      "Call sound",
      "A short tone for a call notification.",
      toggle(host, "Call sound", prefs.call_sound, (value) => {
        host.config.preferences.call_sound = value;
      }),
    ),
    settingRow(
      "notifications.badge",
      "Unread badge",
      "The count on the dock or taskbar.",
      toggle(host, "Unread badge", prefs.unread_badge, (value) => {
        host.config.preferences.unread_badge = value;
      }),
    ),
    settingRow(
      "notifications.email",
      "Email notifications",
      "Saved on this device. Discord sends the mail.",
      emailControl(host),
    ),
  ];
}
