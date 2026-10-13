import { clear, el } from "./dom";

export const PROFILE_TABS = [
  { id: "about", label: "About" },
  { id: "servers", label: "Mutual Servers" },
  { id: "friends", label: "Mutual Friends" },
  { id: "activity", label: "Activity" },
  { id: "connections", label: "Connections" },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

export interface ProfileFriend {
  id: string;
  name: string;
}

export interface ProfileTabModel {
  bio: string;
  pronouns: string;
  since: string;
  roles: string[];
  badges: string[];
  note: string;
  servers: string[];
  friends: ProfileFriend[];
  friendCount: number;
  custom: string;
  activity: string;
  connections: string[];
}

export function profileTabId(value: string | undefined): ProfileTabId {
  return PROFILE_TABS.some((tab) => tab.id === value) ? value as ProfileTabId : "about";
}

export function profileTabLines(tab: ProfileTabId, model: ProfileTabModel): string[] {
  if (tab === "about") {
    const lines = [model.bio, model.pronouns, model.since, ...model.roles, ...model.badges];
    if (model.note) lines.push(model.note);
    return lines.filter(Boolean).length ? lines.filter(Boolean) : ["No bio yet"];
  }
  if (tab === "servers") {
    return model.servers.length ? model.servers : ["No mutual servers"];
  }
  if (tab === "friends") {
    if (model.friends.length) return model.friends.map((friend) => friend.name).filter(Boolean);
    if (model.friendCount === 1) return ["1 mutual friend"];
    if (model.friendCount > 1) return [`${model.friendCount} mutual friends`];
    return ["No mutual friends"];
  }
  if (tab === "activity") {
    const lines = [model.custom, model.activity].map((line) => line.trim()).filter(Boolean);
    return lines.length ? lines : ["No activity"];
  }
  return model.connections.length ? model.connections : ["No connections"];
}

export function renderProfileTabs(
  model: ProfileTabModel,
  tab: ProfileTabId,
  onTab: (tab: ProfileTabId) => void,
  aboutExtra?: HTMLElement | null,
): HTMLElement {
  const wrap = el("div", "profile-tabs");
  const bar = el("div", "profile-tablist");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Profile");
  const panel = el("div", "profile-tabpanel");
  panel.setAttribute("role", "tabpanel");
  const paint = (next: ProfileTabId) => {
    clear(panel);
    panel.dataset.tab = next;
    for (const line of profileTabLines(next, model)) panel.append(el("p", "", line));
    if (next === "about" && aboutExtra) panel.append(aboutExtra);
    for (const button of bar.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      const on = button.dataset.tab === next;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    }
  };
  for (const item of PROFILE_TABS) {
    const button = el("button", item.id === tab ? "profile-tab is-on" : "profile-tab", item.label);
    button.type = "button";
    button.dataset.tab = item.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", item.id === tab ? "true" : "false");
    button.addEventListener("click", () => {
      paint(item.id);
      onTab(item.id);
    });
    bar.append(button);
  }
  wrap.append(bar, panel);
  paint(tab);
  return wrap;
}
