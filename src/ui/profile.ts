import type { Person } from "../types";
import { colorFor, el, portrait } from "./dom";

export interface ProfileRole {
  id: string;
  name: string;
  color: string | null;
}

export interface WireProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  accent?: string | null;
  bio?: string;
  pronouns?: string;
  nick?: string | null;
  roleIds?: string[];
  mutualGuilds?: { id: string; nick?: string | null }[];
  mutualFriends?: number;
  bot?: boolean;
  joinedAt?: string;
}

export interface ProfileDetails {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  accent?: string | null;
  bio: string;
  pronouns: string;
  nick?: string | null;
  mutualNames: string[];
  mutualGuilds: number;
  mutualFriends: number;
  joinedAt?: string;
}

export interface ProfileView {
  person: Person;
  details: ProfileDetails | null;
  self: boolean;
  statusPicker: boolean;
  roles: ProfileRole[];
}

export interface ProfileActions {
  onClose: () => void;
  onMessage?: () => void;
  onStatus?: (status: "online" | "idle" | "dnd" | "invisible", custom: string) => void;
  note?: string;
  onNote?: (note: string) => void;
}

function statusLabel(status: Person["status"]): string {
  if (status === "dnd") return "Do not disturb";
  if (status === "idle") return "Idle";
  if (status === "online") return "Online";
  if (status === "invisible") return "Invisible";
  return "Offline";
}

function memberSince(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `Member since ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
}

export function renderProfileCard(host: HTMLElement, view: ProfileView, actions: ProfileActions) {
  host.className = "profile-layer";
  host.replaceChildren();
  const backdrop = el("button", "profile-backdrop");
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close profile");
  backdrop.addEventListener("click", actions.onClose);
  const card = el("section", "profile-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `${view.person.name} profile`);
  card.addEventListener("click", (event) => event.stopPropagation());

  const details = view.details;
  const banner = el("div", "profile-banner");
  const accent = details?.accent || colorFor(view.person.id);
  if (details?.bannerUrl) {
    banner.style.backgroundImage = `url("${details.bannerUrl.replace(/"/g, "")}")`;
  } else {
    banner.style.background = accent;
  }
  const face = el("div", "profile-face");
  const wrap = el("div", "avatar-wrap");
  wrap.append(
    portrait(view.person.name, view.person.id, details?.avatarUrl || view.person.avatarUrl, false),
    el("i", `status ${view.person.status ?? "offline"}`),
  );
  face.append(wrap);
  card.append(banner, face);

  const body = el("div", "profile-body");
  const name = details?.nick || view.person.name;
  body.append(el("h2", "", name));
  const handle = details?.username ? `@${details.username}` : "";
  const meta = [handle, details?.pronouns].filter(Boolean).join(" · ");
  if (meta) body.append(el("p", "profile-handle", meta));
  body.append(el("p", "profile-status", statusLabel(view.person.status)));
  const line = view.person.custom || view.person.activity;
  if (line) body.append(el("p", "profile-activity", line));

  if (view.statusPicker && view.self && actions.onStatus) {
    const picker = el("div", "profile-status-picker");
    for (const status of ["online", "idle", "dnd", "invisible"] as const) {
      const button = el("button", `text-button${view.person.status === status ? " is-on" : ""}`, statusLabel(status));
      button.type = "button";
      button.addEventListener("click", () => actions.onStatus?.(status, view.person.custom ?? ""));
      picker.append(button);
    }
    const custom = el("input");
    custom.value = view.person.custom ?? "";
    custom.maxLength = 128;
    custom.placeholder = "Custom status";
    custom.setAttribute("aria-label", "Custom status");
    const current = view.person.status === "invisible" || view.person.status === "idle" || view.person.status === "dnd" ? view.person.status : "online";
    custom.addEventListener("change", () => actions.onStatus?.(current, custom.value.trim()));
    const clear = el("button", "ghost", "Clear custom status");
    clear.type = "button";
    clear.addEventListener("click", () => actions.onStatus?.(current, ""));
    picker.append(custom, clear);
    body.append(picker);
  }

  if (details?.bio) {
    const about = el("section", "profile-section");
    about.append(el("h3", "", "About me"), el("p", "", details.bio));
    body.append(about);
  }
  const since = memberSince(details?.joinedAt);
  if (since) body.append(el("p", "profile-since", since));
  if (view.roles.length) {
    const roles = el("section", "profile-section");
    roles.append(el("h3", "", "Roles"));
    const pills = el("div", "role-pills");
    for (const role of view.roles) {
      const pill = el("span", "role-pill");
      const swatch = el("i", "role-swatch");
      swatch.style.background = role.color || "var(--faint)";
      pill.append(swatch, document.createTextNode(role.name));
      pills.append(pill);
    }
    roles.append(pills);
    body.append(roles);
  }
  if (details && (details.mutualGuilds > 0 || details.mutualNames.length)) {
    const mutual = el("section", "profile-section");
    const count = details.mutualGuilds || details.mutualNames.length;
    mutual.append(el("h3", "", count === 1 ? "1 mutual server" : `${count} mutual servers`));
    if (details.mutualNames.length) mutual.append(el("p", "", details.mutualNames.join(", ")));
    body.append(mutual);
  }
  if (details && details.mutualFriends > 0) {
    body.append(el("p", "profile-since", details.mutualFriends === 1 ? "1 mutual friend" : `${details.mutualFriends} mutual friends`));
  }
  if (!view.self && actions.onNote) {
    const notes = el("section", "profile-section");
    notes.append(el("h3", "", "Note"));
    const field = el("textarea", "profile-note");
    field.maxLength = 256;
    field.value = actions.note ?? "";
    field.placeholder = "Only you can see this";
    field.setAttribute("aria-label", `Note for ${view.person.name}`);
    field.addEventListener("change", () => actions.onNote?.(field.value));
    notes.append(field, el("p", "hint", "Saved on your Discord account. Other people cannot read it."));
    body.append(notes);
  }

  const actionsRow = el("div", "profile-actions");
  if (!view.self && actions.onMessage) {
    const message = el("button", "primary", "Message");
    message.type = "button";
    message.addEventListener("click", actions.onMessage);
    actionsRow.append(message);
  }
  const close = el("button", "ghost", "Close");
  close.type = "button";
  close.addEventListener("click", actions.onClose);
  actionsRow.append(close);
  body.append(actionsRow);
  card.append(body);
  host.append(backdrop, card);
}
