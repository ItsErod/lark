import type { FriendTab, MenuItem } from "../social";
import { el, portrait } from "./dom";

export interface FriendRowModel {
  id: string;
  name: string;
  status: string;
  line: string;
  tag: string;
  note: string;
  avatarUrl?: string | null;
}

export interface PendingRowModel {
  id: string;
  name: string;
  username: string;
  incoming: boolean;
  avatarUrl?: string | null;
}

export interface ActiveCardModel {
  id: string;
  name: string;
  line: string;
  detail: string;
  elapsed: string;
  tag: string;
  art: string | null;
  live: boolean;
  inVoice: boolean;
  voiceLabel: string;
}

export interface FriendsBoardModel {
  tab: FriendTab;
  pending: number;
  groups: { label: string; people: FriendRowModel[] }[];
  incoming: PendingRowModel[];
  outgoing: PendingRowModel[];
  active: ActiveCardModel[];
}

export interface FriendsBoardActions {
  onTab: (tab: FriendTab) => void;
  onOpen: (id: string) => void;
  onMessage: (id: string) => void;
  onAccept: (id: string) => void;
  onIgnore: (id: string) => void;
  onCancel: (id: string) => void;
  onAdd: (username: string) => void;
  onWatch: (id: string) => void;
  onJoinVoice: (id: string) => void;
}

const TABS: { id: FriendTab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "add", label: "Add Friend" },
];

export function renderFriendsBoard(host: HTMLElement, model: FriendsBoardModel, actions: FriendsBoardActions) {
  host.replaceChildren();
  const board = el("div", "friends-board");
  const tabs = el("div", "friend-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Friends");
  for (const tab of TABS) {
    const button = el("button", `friend-tab${model.tab === tab.id ? " is-on" : ""}${tab.id === "add" ? " is-add" : ""}`, tab.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", model.tab === tab.id ? "true" : "false");
    if (tab.id === "pending" && model.pending > 0) {
      button.append(el("span", "badge", String(model.pending)));
    }
    button.addEventListener("click", () => actions.onTab(tab.id));
    tabs.append(button);
  }
  board.append(tabs);

  if (model.tab === "add") {
    board.append(addFriendForm(actions));
    host.append(board);
    return;
  }

  const shell = el("div", `friends-shell${model.active.length && model.tab !== "pending" ? "" : " no-active"}`);
  const list = el("div", "friends-list");
  if (model.tab === "pending") {
    list.append(pendingBlock("Friend requests", model.incoming, true, actions));
    list.append(pendingBlock("Outgoing", model.outgoing, false, actions));
    if (!model.incoming.length && !model.outgoing.length) {
      list.append(el("p", "empty", "No pending friend requests."));
    }
  } else if (!model.groups.some((group) => group.people.length)) {
    list.append(el("p", "empty", model.tab === "online" ? "No one is online right now." : "Friends show up here once Discord sends them."));
  } else {
    for (const group of model.groups) {
      if (!group.people.length) continue;
      list.append(el("h3", "member-group", `${group.label} — ${group.people.length}`));
      for (const person of group.people) list.append(friendRow(person, actions));
    }
  }
  shell.append(list);
  if (model.active.length && model.tab !== "pending") shell.append(activeColumn(model.active, actions));
  board.append(shell);
  host.append(board);
}

function addFriendForm(actions: FriendsBoardActions): HTMLElement {
  const form = el("form", "add-friend");
  form.append(el("h2", "", "Add Friend"), el("p", "hint", "You can add friends with their Discord username."));
  const field = el("input");
  field.type = "text";
  field.maxLength = 32;
  field.placeholder = "Username";
  field.setAttribute("aria-label", "Username");
  field.autocomplete = "off";
  field.spellcheck = false;
  const send = el("button", "primary", "Send Friend Request");
  send.type = "submit";
  form.append(field, send);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.onAdd(field.value);
  });
  return form;
}

function friendRow(person: FriendRowModel, actions: FriendsBoardActions): HTMLElement {
  const row = el("div", "friend-row");
  const wrap = el("div", "avatar-wrap");
  wrap.append(portrait(person.name, person.id, person.avatarUrl, false), el("i", `status ${person.status || "offline"}`));
  const copy = el("div", "member-copy");
  const title = el("div", "member-name");
  title.append(el("strong", "", person.name));
  if (person.tag) title.append(el("span", "clan-tag", person.tag));
  copy.append(title);
  if (person.line) copy.append(el("span", "", person.line));
  if (person.note) copy.append(el("span", "friend-note", person.note));
  const open = el("button", "text-button", "Message");
  open.type = "button";
  open.addEventListener("click", () => actions.onMessage(person.id));
  row.append(wrap, copy, open);
  row.addEventListener("click", (event) => {
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    actions.onOpen(person.id);
  });
  row.addEventListener("dblclick", () => actions.onMessage(person.id));
  return row;
}

function pendingBlock(title: string, rows: PendingRowModel[], incoming: boolean, actions: FriendsBoardActions): HTMLElement {
  const block = el("section", "pending-block");
  if (!rows.length) return block;
  block.append(el("h3", "member-group", `${title} — ${rows.length}`));
  for (const row of rows) {
    const line = el("div", "friend-row");
    const wrap = el("div", "avatar-wrap");
    wrap.append(portrait(row.name, row.id, row.avatarUrl, false));
    const copy = el("div", "member-copy");
    copy.append(el("strong", "", row.name));
    if (row.username) copy.append(el("span", "", `@${row.username}`));
    const buttons = el("div", "pending-actions");
    if (incoming) {
      const accept = el("button", "primary", "Accept");
      accept.type = "button";
      accept.addEventListener("click", () => actions.onAccept(row.id));
      const ignore = el("button", "ghost", "Ignore");
      ignore.type = "button";
      ignore.addEventListener("click", () => actions.onIgnore(row.id));
      buttons.append(accept, ignore);
    } else {
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => actions.onCancel(row.id));
      buttons.append(cancel);
    }
    line.append(wrap, copy, buttons);
    block.append(line);
  }
  return block;
}

function activeColumn(cards: ActiveCardModel[], actions: FriendsBoardActions): HTMLElement {
  const column = el("aside", "active-now");
  column.append(el("h3", "member-group", "Active Now"));
  for (const card of cards) {
    const item = el("article", "active-card");
    if (card.art) {
      const image = el("img", "activity-art");
      image.src = card.art;
      image.alt = "";
      item.append(image);
    }
    const title = el("div", "member-name");
    title.append(el("strong", "", card.name));
    if (card.tag) title.append(el("span", "clan-tag", card.tag));
    if (card.live) title.append(el("span", "live-pill", "LIVE"));
    item.append(title);
    if (card.line) item.append(el("p", "", card.line));
    if (card.detail) item.append(el("p", "hint", card.detail));
    if (card.elapsed) item.append(el("p", "hint", card.elapsed));
    if (card.inVoice) item.append(el("p", "hint", card.voiceLabel));
    const buttons = el("div", "pending-actions");
    if (card.inVoice) {
      const join = el("button", "text-button", "Join Voice");
      join.type = "button";
      join.addEventListener("click", () => actions.onJoinVoice(card.id));
      buttons.append(join);
    }
    if (card.live) {
      const watch = el("button", "text-button", "Watch Stream");
      watch.type = "button";
      watch.addEventListener("click", () => actions.onWatch(card.id));
      buttons.append(watch);
    }
    if (buttons.childElementCount) item.append(buttons);
    item.addEventListener("click", (event) => {
      if ((event.target as HTMLElement | null)?.closest("button")) return;
      actions.onOpen(card.id);
    });
    column.append(item);
  }
  return column;
}

export function renderContextMenu(x: number, y: number, items: MenuItem[], onPick: (id: string) => void): HTMLElement {
  const menu = el("div", "social-menu");
  menu.setAttribute("role", "menu");
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
  for (const item of items) {
    const button = el("button", `social-menu-item${item.danger ? " is-danger" : ""}`, item.label);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick(item.id);
    });
    menu.append(button);
  }
  return menu;
}
