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
  readAllMuted: boolean;
  readAllDms: boolean;
  setReadAllMuted: (value: boolean) => void;
  setReadAllDms: (value: boolean) => void;
  readEverything: () => void;
  whoisAge: boolean;
  whoisMutuals: boolean;
  whoisJoin: boolean;
  setWhoisAge: (value: boolean) => void;
  setWhoisMutuals: (value: boolean) => void;
  setWhoisJoin: (value: boolean) => void;
  emoteStickers: boolean;
  setEmoteStickers: (value: boolean) => void;
  schedulePreset: string;
  setSchedulePreset: (value: string) => void;
  liveWaiting: number;
}

/** Extra settings cards for chat plugins. Unknown ids are ignored. */
export function mountChatPluginPanel(wrap: HTMLElement, id: string, host: ChatPluginHost): void {
  if (id === "keyword-highlights") wrap.append(highlightCard(host));
  else if (id === "pin-dms") wrap.append(pinCard(host));
  else if (id === "read-all") wrap.append(readAllCard(host));
  else if (id === "user-whois") wrap.append(whoisCard(host));
  else if (id === "emote-cloner") wrap.append(emoteCard(host));
  else if (id === "message-scheduler") wrap.append(scheduleCard(host));
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

function readAllCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  const go = el("button", "text-button", "Mark every server read");
  go.type = "button";
  go.addEventListener("click", () => host.readEverything());
  card.append(go);
  const muted = el("button", "text-button", host.readAllMuted ? "Muted channels included" : "Muted channels skipped");
  muted.type = "button";
  muted.addEventListener("click", () => host.setReadAllMuted(!host.readAllMuted));
  const dms = el("button", "text-button", host.readAllDms ? "Direct messages included" : "Direct messages skipped");
  dms.type = "button";
  dms.addEventListener("click", () => host.setReadAllDms(!host.readAllDms));
  card.append(muted, dms, el("p", "hint", "One click clears unread badges. Lark tells Discord about one channel at a time, so a large server list does not go out in a burst."));
  return card;
}

function whoisCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(flagButton("Account age", host.whoisAge, host.setWhoisAge));
  card.append(flagButton("Mutual servers", host.whoisMutuals, host.setWhoisMutuals));
  card.append(flagButton("Join date", host.whoisJoin, host.setWhoisJoin));
  card.append(el("p", "hint", "Hover a name or avatar. Account age comes from the user id. Mutual servers and the join date use the profile Lark already loads. Streamer mode hides the card."));
  return card;
}

function emoteCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(flagButton("Stickers", host.emoteStickers, host.setEmoteStickers));
  card.append(el("p", "hint", "Right-click an emoji or a sticker and choose a server where you can manage expressions. Lark uploads it with the same server action as the expression settings. Nothing is copied on its own."));
  return card;
}

function scheduleCard(host: ChatPluginHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Default delay"));
  for (const [value, label] of [["15", "15 min"], ["60", "1 hour"], ["1440", "1 day"]] as const) {
    const button = el("button", `text-button${host.schedulePreset === value ? " is-on" : ""}`, label);
    button.type = "button";
    button.addEventListener("click", () => host.setSchedulePreset(value));
    card.append(button);
  }
  card.append(el("p", "hint", host.liveWaiting ? `${host.liveWaiting} waiting in this session.` : "Use Schedule in the composer. The queue lives in memory. Closing Lark drops it, and Lark never sends a message you did not write."));
  return card;
}

function flagButton(label: string, on: boolean, toggle: (value: boolean) => void): HTMLButtonElement {
  const button = el("button", "text-button", `${label}: ${on ? "on" : "off"}`);
  button.type = "button";
  button.addEventListener("click", () => toggle(!on));
  return button;
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
