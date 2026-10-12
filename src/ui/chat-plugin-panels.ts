import { el } from "./dom";

export interface ChatPluginHost {
  highlightPatterns: string;
  highlightNotify: boolean;
  guildPatterns: string;
  guildName: string;
  pinnedNames: { id: string; name: string }[];
  setHighlightPatterns: (value: string) => void;
  setHighlightNotify: (value: boolean) => void;
  setGuildPatterns: (value: string) => void;
  unpinDm: (id: string) => void;
}

/** Extra settings cards for chat plugins. Unknown ids are ignored. */
export function mountChatPluginPanel(wrap: HTMLElement, id: string, host: ChatPluginHost): void {
  if (id === "keyword-highlights") wrap.append(highlightCard(host));
  else if (id === "pin-dms") wrap.append(pinCard(host));
}

function highlightCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Words or regex, for every server. One per line. A regex looks like /deploy/i."));
  const global = el("textarea");
  global.value = host.highlightPatterns;
  global.setAttribute("aria-label", "Highlight patterns");
  global.addEventListener("change", () => host.setHighlightPatterns(global.value));
  card.append(global);
  const notify = el("button", "text-button", host.highlightNotify ? "Notifications on" : "Notifications off");
  notify.type = "button";
  notify.addEventListener("click", () => host.setHighlightNotify(!host.highlightNotify));
  card.append(notify);
  if (host.guildName) {
    card.append(el("div", "hint", `Also in ${host.guildName}`));
    const local = el("textarea");
    local.value = host.guildPatterns;
    local.setAttribute("aria-label", "Server highlight patterns");
    local.addEventListener("change", () => host.setGuildPatterns(local.value));
    card.append(local);
  }
  card.append(el("p", "hint", "A match is highlighted in every server. Lark notifies when the channel is not muted, you are not already looking at it, and the message did not already notify you. Mute wins."));
  return card;
}

function pinCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  if (!host.pinnedNames.length) card.append(el("p", "hint", "Right-click a direct message and choose Pin. Pinned chats sit in a Pinned category."));
  for (const dm of host.pinnedNames) {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", dm.name));
    const button = el("button", "text-button", "Unpin");
    button.type = "button";
    button.addEventListener("click", () => host.unpinDm(dm.id));
    row.append(button);
    card.append(row);
  }
  return card;
}
