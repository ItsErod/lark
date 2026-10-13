import { EMOJI } from "../emoji";
import type { ClearAfter } from "../social";
import { blockedIds, pendingFriendCount } from "../social";
import type { Person } from "../types";
import { colorFor, el, portrait } from "./dom";
import { renderEmojiPicker } from "./emoji-picker";
import type { ServerEmoji } from "./status-emoji";

export { blockedIds, pendingFriendCount };

export interface ProfileRole {
  id: string;
  name: string;
  color: string | null;
}

export interface ProfileBadge {
  id: string;
  description: string;
  iconUrl?: string | null;
}

export interface ProfileWidget {
  kind: string;
  name: string;
  verified?: boolean;
}

export interface ProfileServerTag {
  tag: string;
  guildId?: string;
  badgeUrl?: string | null;
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
  badges?: ProfileBadge[];
  widgets?: ProfileWidget[];
  serverTag?: ProfileServerTag | null;
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
  badges: ProfileBadge[];
  widgets: ProfileWidget[];
  serverTag?: ProfileServerTag | null;
}

export type ProfilePlacement = "modal" | "panel" | "full";

export interface StatusEmojiSource {
  recent: string[];
  server: ServerEmoji[];
  allowServer: boolean;
}

export interface ProfileView {
  person: Person;
  details: ProfileDetails | null;
  self: boolean;
  statusPicker: boolean;
  roles: ProfileRole[];
  placement?: ProfilePlacement;
  serverEditor?: boolean;
  statusEmojis?: StatusEmojiSource;
}

/** Stream B adds moderation buttons here. The card renders them and does not own the actions. */
export interface ProfileActionSlot {
  id: string;
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
}

export interface ProfileStatusExtra {
  emoji: string;
  emojiId?: string | null;
  animated?: boolean;
  clearAfter: ClearAfter;
}

export interface ProfileActions {
  onClose: () => void;
  onMessage?: () => void;
  onStatus?: (status: "online" | "idle" | "dnd" | "invisible", custom: string, extra?: ProfileStatusExtra) => void;
  note?: string;
  onNote?: (note: string) => void;
  onAddFriend?: () => void;
  onJoinVoice?: () => void;
  onWatchStream?: () => void;
  onOpenFull?: () => void;
  onSaveServerProfile?: (nick: string, bio: string, avatar: string | null) => void;
  slots?: ProfileActionSlot[];
}

export function profileSlotLabels(slots: ProfileActionSlot[] | undefined): string[] {
  return (slots ?? []).map((slot) => slot.label.trim()).filter(Boolean);
}

/** Demo popout, so the banner, roles, and about section are visible without Discord. */
export function sampleProfile(person: Person): ProfileDetails {
  const username = person.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "member";
  return {
    id: person.id,
    name: person.name,
    username,
    accent: null,
    bio: person.custom || person.activity || "Northwind",
    pronouns: "",
    mutualNames: ["Northwind"],
    mutualGuilds: 1,
    mutualFriends: 1,
    badges: [{ id: "lark", description: "Lark" }],
    widgets: [],
  };
}

export function sampleRoles(): ProfileRole[] {
  return [
    { id: "design", name: "Design", color: "#e2a15a" },
    { id: "voice", name: "Voice", color: "#23a55a" },
  ];
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

function tagText(tag: ProfileServerTag | null | undefined): string {
  const text = tag?.tag?.trim() ?? "";
  if (!text || [...text].length > 4) return "";
  return text;
}

export function renderProfileCard(host: HTMLElement, view: ProfileView, actions: ProfileActions) {
  const placement = view.placement ?? "modal";
  host.className = placement === "panel" ? "profile-panel" : "profile-layer";
  host.replaceChildren();
  const backdrop = placement === "panel" ? null : el("button", "profile-backdrop");
  if (backdrop) {
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Close profile");
    backdrop.addEventListener("click", actions.onClose);
  }
  const card = el("section", `profile-card${placement === "full" ? " is-full" : ""}${placement === "panel" ? " is-panel" : ""}`);
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
  const name = details?.nick || view.person.friendNick || view.person.name;
  const heading = el("div", "profile-name");
  heading.append(el("h2", "", name));
  const tag = tagText(details?.serverTag || view.person.serverTag);
  if (tag) {
    const pill = el("span", "clan-tag");
    const badge = details?.serverTag?.badgeUrl || view.person.serverTag?.badgeUrl;
    if (badge) {
      const image = el("img");
      image.src = badge;
      image.alt = "";
      pill.append(image);
    }
    pill.append(document.createTextNode(tag));
    heading.append(pill);
  }
  body.append(heading);
  const badges = details?.badges ?? [];
  if (badges.length) body.append(badgeRow(badges));
  const handle = details?.username ? `@${details.username}` : "";
  const meta = [handle, details?.pronouns].filter(Boolean).join(" · ");
  if (meta) body.append(el("p", "profile-handle", meta));
  body.append(el("p", "profile-status", statusLabel(view.person.status)));
  const emoji = view.person.statusEmoji?.trim() ?? "";
  const custom = view.person.custom?.trim() ?? "";
  const statusLine = [emoji, custom].filter(Boolean).join(" ");
  const line = statusLine || view.person.activity;
  if (line) body.append(el("p", "profile-activity", line));

  if (view.statusPicker && view.self && actions.onStatus) {
    body.append(statusPicker(view, actions));
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
  const widgets = details?.widgets ?? [];
  if (widgets.length) {
    const connections = el("section", "profile-section");
    connections.append(el("h3", "", "Connections"));
    for (const widget of widgets) {
      const row = el("p", "profile-widget", widget.verified ? `${widget.name} · ${widget.kind}` : widget.name || widget.kind);
      connections.append(row);
    }
    body.append(connections);
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
  if (view.serverEditor && view.self && actions.onSaveServerProfile) {
    body.append(serverProfileEditor(actions));
  }

  const actionsRow = el("div", "profile-actions");
  if (!view.self && actions.onMessage) {
    const message = el("button", "primary", "Message");
    message.type = "button";
    message.addEventListener("click", actions.onMessage);
    actionsRow.append(message);
  }
  if (!view.self && actions.onAddFriend) {
    const add = el("button", "text-button", "Add Friend");
    add.type = "button";
    add.addEventListener("click", actions.onAddFriend);
    actionsRow.append(add);
  }
  if (actions.onJoinVoice) {
    const join = el("button", "text-button", "Join Voice");
    join.type = "button";
    join.addEventListener("click", actions.onJoinVoice);
    actionsRow.append(join);
  }
  if (actions.onWatchStream) {
    const watch = el("button", "text-button", "Watch Stream");
    watch.type = "button";
    watch.addEventListener("click", actions.onWatchStream);
    actionsRow.append(watch);
  }
  for (const slot of actions.slots ?? []) {
    if (!slot.label.trim()) continue;
    const button = el("button", slot.tone === "danger" ? "ghost is-danger" : "text-button", slot.label);
    button.type = "button";
    button.addEventListener("click", () => slot.onClick());
    actionsRow.append(button);
  }
  if (actions.onOpenFull && placement !== "full") {
    const full = el("button", "text-button", "View Full Profile");
    full.type = "button";
    full.addEventListener("click", actions.onOpenFull);
    actionsRow.append(full);
  }
  const close = el("button", "ghost", "Close");
  close.type = "button";
  close.addEventListener("click", actions.onClose);
  actionsRow.append(close);
  body.append(actionsRow);
  card.append(body);
  host.append(...(backdrop ? [backdrop, card] : [card]));
}

function badgeRow(badges: ProfileBadge[]): HTMLElement {
  const row = el("div", "profile-badges");
  for (const badge of badges) {
    const pill = el("span", "profile-badge");
    pill.title = badge.description || badge.id;
    if (badge.iconUrl) {
      const image = el("img");
      image.src = badge.iconUrl;
      image.alt = badge.description || badge.id;
      pill.append(image);
    }
    pill.append(document.createTextNode(badge.description || badge.id));
    row.append(pill);
  }
  return row;
}

function statusPicker(view: ProfileView, actions: ProfileActions): HTMLElement {
  const picker = el("div", "profile-status-picker");
  let emoji = view.person.statusEmoji ?? "";
  let emojiId: string | null = null;
  let emojiAnimated = false;
  let clearAfter: ClearAfter = "never";
  const source = view.statusEmojis;
  const current = () => view.person.status === "invisible" || view.person.status === "idle" || view.person.status === "dnd" ? view.person.status : "online";
  const send = (status: "online" | "idle" | "dnd" | "invisible", custom: string) => {
    actions.onStatus?.(status, custom, { emoji: emoji.trim(), emojiId, animated: emojiAnimated, clearAfter });
  };
  for (const status of ["online", "idle", "dnd", "invisible"] as const) {
    const button = el("button", `text-button${view.person.status === status ? " is-on" : ""}`, statusLabel(status));
    button.type = "button";
    button.addEventListener("click", () => send(status, view.person.custom ?? ""));
    picker.append(button);
  }
  const custom = el("input");
  custom.value = view.person.custom ?? "";
  custom.maxLength = 128;
  custom.placeholder = "Custom status";
  custom.setAttribute("aria-label", "Custom status");
  custom.addEventListener("change", () => send(current(), custom.value.trim()));
  const emojiButton = el("button", "text-button status-emoji-toggle", emoji || "Emoji");
  emojiButton.type = "button";
  emojiButton.setAttribute("aria-label", "Status emoji");
  emojiButton.setAttribute("aria-expanded", "false");
  const grid = el("div", "status-emoji-grid");
  grid.hidden = true;
  let query = "";
  const paintGrid = () => {
    grid.replaceChildren(renderEmojiPicker({
      query,
      unicode: EMOJI,
      recent: source?.recent ?? [],
      server: source?.server ?? [],
      allowServer: Boolean(source?.allowServer),
      onQuery: (value) => {
        query = value;
      },
      onPick: (glyph, id, animated) => {
        emoji = glyph;
        emojiId = id ?? null;
        emojiAnimated = Boolean(animated && id);
        emojiButton.textContent = glyph;
        grid.hidden = true;
        emojiButton.setAttribute("aria-expanded", "false");
        send(current(), custom.value.trim());
      },
    }));
  };
  emojiButton.addEventListener("click", () => {
    const open = grid.hidden;
    grid.hidden = !open;
    emojiButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) paintGrid();
  });
  const clearSelect = el("select");
  clearSelect.setAttribute("aria-label", "Clear after");
  for (const [value, label] of [
    ["never", "Don't clear"],
    ["30m", "30 minutes"],
    ["1h", "1 hour"],
    ["4h", "4 hours"],
    ["today", "Today"],
  ] as const) {
    const option = el("option", "", label);
    option.value = value;
    clearSelect.append(option);
  }
  clearSelect.addEventListener("change", () => {
    clearAfter = clearSelect.value as ClearAfter;
    send(current(), custom.value.trim());
  });
  const clear = el("button", "ghost", "Clear custom status");
  clear.type = "button";
  clear.addEventListener("click", () => {
    emoji = "";
    emojiId = null;
    emojiAnimated = false;
    emojiButton.textContent = "Emoji";
    grid.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
    custom.value = "";
    clearAfter = "never";
    clearSelect.value = "never";
    send(current(), "");
  });
  picker.append(custom, emojiButton, grid, clearSelect, clear);
  return picker;
}

function serverProfileEditor(actions: ProfileActions): HTMLElement {
  const section = el("section", "profile-section");
  section.append(el("h3", "", "Per-server profile"), el("p", "hint", "Nickname and bio for this server. Discord stores them on your member profile."));
  const nick = el("input");
  nick.maxLength = 32;
  nick.placeholder = "Nickname";
  nick.setAttribute("aria-label", "Server nickname");
  const bio = el("textarea", "profile-note");
  bio.maxLength = 190;
  bio.placeholder = "About me on this server";
  bio.setAttribute("aria-label", "Server bio");
  const file = el("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/gif,image/webp";
  file.setAttribute("aria-label", "Server avatar");
  let avatar: string | null = null;
  file.addEventListener("change", () => {
    const picked = file.files?.[0];
    if (!picked) {
      avatar = null;
      return;
    }
    if (picked.size > 256_000) {
      avatar = null;
      file.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      avatar = typeof reader.result === "string" ? reader.result : null;
    });
    reader.readAsDataURL(picked);
  });
  const save = el("button", "primary", "Save server profile");
  save.type = "button";
  save.addEventListener("click", () => actions.onSaveServerProfile?.(nick.value, bio.value, avatar));
  section.append(nick, bio, file, save);
  return section;
}
