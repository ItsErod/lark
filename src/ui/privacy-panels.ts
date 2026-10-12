import { cleanPanicKey, type PrivacyOptions } from "../pack/privacy";
import { el } from "./dom";
import { segmentControl } from "./settings";

export function mountPrivacyPanel(
  id: string,
  privacy: PrivacyOptions,
  handlers: {
    save: (patch: Partial<PrivacyOptions>) => void;
    formatKey: (shortcut: string) => string;
    captureKey: (event: KeyboardEvent) => string | null;
  },
): HTMLElement | null {
  if (id === "panic-key") return panicPanel(privacy, handlers);
  if (id === "incognito") return incognitoPanel(privacy, handlers);
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

function check(label: string, on: boolean, change: (value: boolean) => void): HTMLElement {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = on;
  input.addEventListener("change", () => change(input.checked));
  row.append(input, el("span", "", label));
  return row;
}
