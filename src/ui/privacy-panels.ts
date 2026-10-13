import { cleanPanicKey, type PrivacyOptions } from "../pack/privacy";
import { el } from "./dom";
import { segmentControl } from "./controls";

export function mountPrivacyPanel(
  id: string,
  privacy: PrivacyOptions,
  handlers: {
    save: (patch: Partial<PrivacyOptions>) => void;
    formatKey: (shortcut: string) => string;
    captureKey: (event: KeyboardEvent) => string | null;
  },
  channel?: { id: string; name: string } | null,
): HTMLElement | null {
  if (id === "panic-key") return panicPanel(privacy, handlers);
  if (id === "incognito") return incognitoPanel(privacy, handlers);
  if (id === "streamer-safe") return streamerPanel(privacy, handlers);
  if (id === "clean-links") return linksPanel(privacy, handlers);
  if (id === "spoiler-everything") return spoilerPanel(privacy, handlers, channel);
  if (id === "hide-blocked") return blockedPanel();
  return null;
}

function panicPanel(
  privacy: PrivacyOptions,
  handlers: {
    save: (patch: Partial<PrivacyOptions>) => void;
    formatKey: (shortcut: string) => string;
    captureKey: (event: KeyboardEvent) => string | null;
  },
): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Hotkey"));
  const key = el("button", "kbd", handlers.formatKey(privacy.panicKey));
  key.type = "button";
  key.title = "Click, then press the new keys";
  key.addEventListener("keydown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return;
    const shortcut = handlers.captureKey(event);
    if (!shortcut) return;
    handlers.save({ panicKey: cleanPanicKey(shortcut) });
  });
  card.append(key);
  card.append(el("div", "hint", "Window"));
  card.append(segmentControl(["hide", "minimize"], privacy.panicAction, (value) => {
    handlers.save({ panicAction: value as PrivacyOptions["panicAction"] });
  }, { hide: "Hide", minimize: "Minimize" }));
  card.append(check("Mute and deafen", privacy.panicMute, (value) => handlers.save({ panicMute: value })));
  card.append(el("p", "hint", "Hide covers the window. Minimize leaves it on the taskbar. Press the hotkey again after Lark is back to show the chat."));
  return card;
}

function incognitoPanel(privacy: PrivacyOptions, handlers: { save: (patch: Partial<PrivacyOptions>) => void }): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(check("Hold read receipts", privacy.incognitoHoldRead, (value) => handlers.save({ incognitoHoldRead: value })));
  card.append(check("Hide activity on this device", privacy.incognitoHideActivity, (value) => handlers.save({ incognitoHideActivity: value })));
  card.append(el("p", "hint", "Channels stay unread until you press Mark read or Esc. Typing and automatic status stay on this device. A status you set yourself still publishes."));
  return card;
}

function streamerPanel(privacy: PrivacyOptions, handlers: { save: (patch: Partial<PrivacyOptions>) => void }): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(check("On now", privacy.streamerManual, (value) => handlers.save({ streamerManual: value })));
  card.append(check("When OBS is the front app", privacy.streamerAutoObs, (value) => handlers.save({ streamerAutoObs: value })));
  card.append(check("When sharing or recording", privacy.streamerAutoShare, (value) => handlers.save({ streamerAutoShare: value })));
  card.append(check("Emails", privacy.streamerEmails, (value) => handlers.save({ streamerEmails: value })));
  card.append(check("Phone numbers", privacy.streamerPhones, (value) => handlers.save({ streamerPhones: value })));
  card.append(check("Account IDs", privacy.streamerIds, (value) => handlers.save({ streamerIds: value })));
  card.append(check("Direct messages", privacy.streamerDms, (value) => handlers.save({ streamerDms: value })));
  card.append(el("p", "hint", "Emails, phone numbers, and long IDs are replaced. Direct messages become “Message hidden”. A screen share, the clip buffer, or OBS in front turns this on without the manual switch."));
  return card;
}

function linksPanel(privacy: PrivacyOptions, handlers: { save: (patch: Partial<PrivacyOptions>) => void }): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(check("Clean links you send", privacy.cleanOnSend, (value) => handlers.save({ cleanOnSend: value })));
  card.append(check("Clean links you open", privacy.cleanOnClick, (value) => handlers.save({ cleanOnClick: value })));
  card.append(el("p", "hint", "utm_*, fbclid, gclid, si, and the other common click ids are removed. The rest of the link stays."));
  return card;
}

function spoilerPanel(
  privacy: PrivacyOptions,
  handlers: { save: (patch: Partial<PrivacyOptions>) => void },
  channel?: { id: string; name: string } | null,
): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Every channel"));
  card.append(segmentControl(["on", "off"], privacy.spoilerDefault, (value) => {
    handlers.save({ spoilerDefault: value as PrivacyOptions["spoilerDefault"] });
  }, { on: "Blur", off: "Show" }));
  if (channel) {
    const current = privacy.spoilerChannels[channel.id] ?? "default";
    card.append(el("div", "hint", channel.name));
    card.append(segmentControl(["default", "on", "off"], current, (value) => {
      const next = { ...privacy.spoilerChannels };
      if (value === "default") delete next[channel.id];
      else next[channel.id] = value as "on" | "off";
      handlers.save({ spoilerChannels: next });
    }, { default: "Use default", on: "Blur", off: "Show" }));
  }
  card.append(el("p", "hint", "Images, videos, and embeds stay blurred until you click them. A channel can blur or show even when the default is the other way."));
  return card;
}

function blockedPanel(): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("p", "hint", "People you have blocked disappear from the message list. With this off, Lark leaves a Blocked message row instead. This does not change the block on Discord."));
  return card;
}

function check(label: string, on: boolean, change: (value: boolean) => void): HTMLElement {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = on;
  input.addEventListener("change", () => change(input.checked));
  row.append(input, el("span", "", label));
  return row;
}
