import type { Channel, Guild } from "../types";
import { el } from "./dom";
import {
  AUDIT_ACTIONS,
  BOOST_TIERS,
  DISCORD_LINKS,
  GUILD_SETTINGS_PAGES,
  INVITE_EXPIRY,
  INVITE_USES,
  PERMISSION_GROUPS,
  SYSTEM_FLAGS,
  TIMEOUTS,
  auditQuery,
  automodBody,
  bitsOf,
  boostProgress,
  communityBody,
  deleteConfirmed,
  expressionSlots,
  formatBits,
  hasPerm,
  inviteBody,
  memberSignals,
  permissionsIn,
  pruneBody,
  reorderRole,
  snowflakeTime,
  sortMemberTable,
  systemFlagOn,
  tagOk,
  clampTag,
  timeoutUntil,
  togglePerm,
  toggleSystemFlag,
  vanityOk,
  verificationBody,
  type AutomodKind,
  type MemberSortKey,
  type MemberTableRow,
  type RoleRow,
} from "../server-model";

export interface GuildSettingsHost {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  guild(): Guild;
  channels(): Channel[];
  me(): { id: string; name: string };
  access(): { owner: boolean; permissions: string } | null;
  refresh(): void;
  close(): void;
  viewAs(roleId: string | null, permissions: string, name: string): void;
  copy(text: string): Promise<void>;
}

type Json = Record<string, unknown>;

export function mountGuildSettings(host: GuildSettingsHost): HTMLElement {
  const layer = el("div", "settings-layer is-in guild-settings");
  layer.tabIndex = -1;
  let page = "profile";
  const sidebar = el("aside", "settings-sidebar");
  const search = el("input");
  search.type = "search";
  search.placeholder = "Search";
  search.setAttribute("aria-label", "Search server settings");
  const searchLabel = el("label", "settings-search");
  searchLabel.append(search);
  const navScroll = el("div", "settings-nav-scroll");
  const nav = el("nav", "settings-nav");
  navScroll.append(nav);
  sidebar.append(el("strong", "guild-settings-name", host.guild().name), searchLabel, navScroll);
  const stage = el("div", "settings-stage");
  const body = el("div", "settings-body");
  const content = el("div", "settings-content");
  body.append(content);
  const closeWrap = el("div", "settings-close-wrap");
  const close = el("button", "settings-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.append(el("span", "", "ESC"));
  close.addEventListener("click", () => host.close());
  closeWrap.append(close);
  stage.append(body, closeWrap);
  layer.append(sidebar, stage);

  const paintNav = () => {
    nav.replaceChildren();
    const query = search.value.trim().toLowerCase();
    let group = "";
    for (const item of GUILD_SETTINGS_PAGES) {
      if (query && !item.label.toLowerCase().includes(query)) continue;
      if (item.group !== group) {
        group = item.group;
        nav.append(el("div", "settings-group-label", group));
      }
      const button = el("button", `settings-link${page === item.id ? " is-on" : ""}`, item.label);
      button.type = "button";
      button.addEventListener("click", () => {
        page = item.id;
        paintNav();
        paintPage();
      });
      nav.append(button);
    }
  };
  const paintPage = () => {
    content.replaceChildren();
    const guildId = host.guild().id;
    const stack = el("div", "settings-stack");
    content.append(stack);
    const render = PAGES[page];
    if (render) render(host, guildId, stack);
  };
  search.addEventListener("input", paintNav);
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") host.close();
  });
  paintNav();
  paintPage();
  document.body.append(layer);
  search.focus();
  return layer;
}

const PAGES: Record<string, (host: GuildSettingsHost, guildId: string, stack: HTMLElement) => void> = {
  profile: paintProfile,
  tag: paintTag,
  engagement: paintEngagement,
  perks: paintPerks,
  emoji: paintEmoji,
  stickers: paintStickers,
  soundboard: paintSounds,
  members: paintMembersPage,
  roles: paintRoles,
  invites: paintInvites,
  access: paintAccess,
  integrations: paintIntegrations,
  safety: paintSafety,
  audit: paintAudit,
  bans: paintBans,
  automod: paintAutomod,
  community: paintCommunity,
  template: paintTemplate,
  boosts: paintBoosts,
  delete: paintDelete,
};

function call<T>(host: GuildSettingsHost, request: Record<string, unknown>): Promise<T> {
  return host.invoke<T>("guild_admin", { request });
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function labelsOf(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => (typeof item === "string" ? item : textOf((item as Json).label)))
    .filter(Boolean)
    .join(", ");
}

function numOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function field(label: string, node: HTMLElement): HTMLElement {
  const wrap = el("label", "setting-row is-stack");
  wrap.append(el("span", "", label), node);
  return wrap;
}

function card(...nodes: HTMLElement[]): HTMLElement {
  const box = el("section", "setting-card");
  box.append(...nodes);
  return box;
}

function heading(title: string, detail: string): HTMLElement {
  const head = el("div", "setting-head");
  head.append(el("h2", "", title), el("p", "", detail));
  return head;
}

function inputOf(value: string, label: string, max = 100): HTMLInputElement {
  const input = el("input");
  input.value = value;
  input.maxLength = max;
  input.setAttribute("aria-label", label);
  return input;
}

function saveRow(label: string, onClick: (button: HTMLButtonElement) => void): HTMLElement {
  const button = el("button", "primary", label);
  button.type = "button";
  button.addEventListener("click", () => onClick(button));
  return button;
}

function fail(host: GuildSettingsHost, err: unknown, title: string) {
  host.toast(title, err instanceof Error ? err.message : "Discord refused the change.");
}

async function readDataUrl(file: File): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
  return url;
}

function solidIcon(color: string, initials: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials.slice(0, 2).toUpperCase() || "S", 64, 68);
  return canvas.toDataURL("image/png");
}

const ICON_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#3ba55d"];

function paintProfile(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Server Profile", "Name, icon, banner, description, and the live preview."));
  const box = card(el("p", "hint", "Loading the server…"));
  stack.append(box);
  void Promise.all([
    call<Json>(host, { op: "get_guild", guildId }),
    call<Json>(host, { op: "get_profile", guildId }).catch(() => ({}) as Json),
  ]).then(([guild, profile]) => {
    box.replaceChildren();
    const name = inputOf(textOf(guild.name) || host.guild().name, "Server name");
    const description = el("textarea");
    description.value = textOf(guild.description) || textOf(profile.description);
    description.maxLength = 300;
    description.setAttribute("aria-label", "Description");
    const traits = inputOf(labelsOf(profile.traits), "Traits", 80);
    traits.placeholder = "art, music, late night";
    const games = inputOf(labelsOf(profile.games), "Games", 80);
    games.placeholder = "Game names";
    const privacy = el("input");
    privacy.type = "checkbox";
    privacy.checked = numOf(profile.visibility) === 1;
    const privacyRow = el("label", "check-row");
    privacyRow.append(privacy, el("span", "", "Private profile"));
    let iconData = "";
    const preview = el("div", "profile-preview");
    const paintPreview = () => {
      preview.replaceChildren();
      const face = el("div", "avatar", name.value.slice(0, 2).toUpperCase() || "S");
      if (iconData) {
        const img = document.createElement("img");
        img.src = iconData;
        img.alt = "";
        face.append(img);
        face.classList.add("has-image");
      }
      preview.append(face, el("strong", "", name.value || "Server"), el("p", "hint", description.value || "No description yet."));
      if (traits.value.trim()) preview.append(el("p", "hint", traits.value));
    };
    const colors = el("div", "folder-colors");
    for (const color of ICON_COLORS) {
      const swatch = el("button", "folder-swatch");
      swatch.type = "button";
      swatch.style.background = color;
      swatch.setAttribute("aria-label", `Icon color ${color}`);
      swatch.addEventListener("click", () => {
        iconData = solidIcon(color, name.value || host.guild().initials);
        paintPreview();
      });
      colors.append(swatch);
    }
    const iconFile = el("input");
    iconFile.type = "file";
    iconFile.accept = "image/png,image/jpeg,image/gif,image/webp";
    iconFile.setAttribute("aria-label", "Server icon");
    iconFile.addEventListener("change", () => {
      const file = iconFile.files?.[0];
      if (!file) return;
      void readDataUrl(file).then((url) => {
        iconData = url;
        paintPreview();
      });
    });
    const bannerFile = el("input");
    bannerFile.type = "file";
    bannerFile.accept = "image/png,image/jpeg,image/gif,image/webp";
    bannerFile.setAttribute("aria-label", "Server banner");
    let bannerData = "";
    bannerFile.addEventListener("change", () => {
      const file = bannerFile.files?.[0];
      if (!file) return;
      void readDataUrl(file).then((url) => {
        bannerData = url;
      });
    });
    name.addEventListener("input", paintPreview);
    description.addEventListener("input", paintPreview);
    traits.addEventListener("input", paintPreview);
    paintPreview();
    box.append(
      preview,
      field("Name", name),
      field("Description", description),
      field("Icon color", colors),
      field("Upload icon", iconFile),
      field("Banner", bannerFile),
      field("Traits", traits),
      field("Games", games),
      privacyRow,
      saveRow("Save profile", (button) => {
        button.disabled = true;
        const body: Json = { name: name.value.trim().slice(0, 100), description: description.value.slice(0, 300) };
        if (iconData) body.icon = iconData;
        if (bannerData) body.banner = bannerData;
        const profile: Json = {
          traits: traits.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
          games: games.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
          visibility: privacy.checked ? 1 : 2,
        };
        void call(host, { op: "patch_guild", guildId, body })
          .then(() => call(host, { op: "patch_profile", guildId, body: profile }))
          .then(() => {
            button.disabled = false;
            host.toast("Server profile", "Saved.");
            host.refresh();
          })
          .catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't save the profile");
          });
      }),
    );
  }).catch((err) => fail(host, err, "Couldn't load the server"));
}

function paintTag(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Server Tag", "A 4-character tag, badge colors, and a preview."));
  const box = card();
  stack.append(box);
  const tag = inputOf("", "Server tag", 4);
  const primary = el("input");
  primary.type = "color";
  primary.value = "#5865f2";
  const secondary = el("input");
  secondary.type = "color";
  secondary.value = "#111214";
  const preview = el("div", "tag-preview");
  const paint = () => {
    preview.replaceChildren();
    const badge = el("span", "server-tag", clampTag(tag.value) || "TAG");
    badge.style.background = primary.value;
    badge.style.color = secondary.value;
    preview.append(badge);
  };
  tag.addEventListener("input", () => {
    tag.value = clampTag(tag.value);
    paint();
  });
  primary.addEventListener("input", paint);
  secondary.addEventListener("input", paint);
  paint();
  void call<Json>(host, { op: "get_profile", guildId }).then((profile) => {
    const saved = textOf(profile.tag);
    if (saved) tag.value = clampTag(saved);
    const badge = textOf(profile.badge_color_primary);
    const ink = textOf(profile.badge_color_secondary);
    if (/^#[0-9a-fA-F]{6}$/.test(badge)) primary.value = badge;
    if (/^#[0-9a-fA-F]{6}$/.test(ink)) secondary.value = ink;
    paint();
  }).catch(() => undefined);
  box.append(
    preview,
    field("Tag", tag),
    field("Badge color", primary),
    field("Badge text", secondary),
    saveRow("Save tag", (button) => {
      const value = clampTag(tag.value);
      if (!tagOk(value)) {
        host.toast("Server tag", "Use exactly 4 letters or numbers.");
        return;
      }
      button.disabled = true;
      void call(host, {
        op: "patch_profile",
        guildId,
        body: { tag: value, badge_color_primary: primary.value, badge_color_secondary: secondary.value },
      })
        .then(() => {
          button.disabled = false;
          host.toast("Server tag", value);
        })
        .catch((err) => {
          button.disabled = false;
          fail(host, err, "Couldn't save the tag");
        });
    }),
  );
}

function paintEngagement(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Engagement", "System messages, default notifications, inactive channels, and the widget."));
  const box = card(el("p", "hint", "Loading…"));
  stack.append(box);
  void Promise.all([
    call<Json>(host, { op: "get_guild", guildId }),
    call<Json>(host, { op: "get_widget", guildId }).catch(() => ({ enabled: false }) as Json),
  ]).then(([guild, widget]) => {
    box.replaceChildren();
    const channels = host.channels().filter((channel) => channel.kind === "text" || channel.kind === "announcement");
    const system = channelSelect(channels, textOf(guild.system_channel_id), "System channel");
    const afk = channelSelect(host.channels().filter((channel) => channel.kind === "voice" || channel.kind === "stage"), textOf(guild.afk_channel_id), "Inactive channel");
    const timeout = el("select");
    timeout.setAttribute("aria-label", "Inactive timeout");
    for (const seconds of [60, 300, 900, 1800, 3600]) timeout.append(new Option(`${seconds / 60} minutes`, String(seconds)));
    timeout.value = String(numOf(guild.afk_timeout) || 300);
    const notify = el("select");
    notify.setAttribute("aria-label", "Default notifications");
    notify.append(new Option("All messages", "0"), new Option("Only mentions", "1"));
    notify.value = String(numOf(guild.default_message_notifications));
    let flags = numOf(guild.system_channel_flags);
    const flagRows: HTMLElement[] = [];
    for (const item of SYSTEM_FLAGS) {
      const boxInput = el("input");
      boxInput.type = "checkbox";
      boxInput.checked = systemFlagOn(flags, item.bit);
      boxInput.addEventListener("change", () => {
        flags = toggleSystemFlag(flags, item.bit, boxInput.checked);
      });
      const row = el("label", "check-row");
      row.append(boxInput, el("span", "", item.label));
      flagRows.push(row);
    }
    const widgetOn = el("input");
    widgetOn.type = "checkbox";
    widgetOn.checked = widget.enabled === true;
    const widgetRow = el("label", "check-row");
    widgetRow.append(widgetOn, el("span", "", "Enable server widget"));
    const widgetChannel = channelSelect(channels, textOf(widget.channel_id), "Widget channel");
    box.append(
      field("System channel", system),
      ...flagRows,
      field("Default notifications", notify),
      field("Inactive channel", afk),
      field("Inactive timeout", timeout),
      widgetRow,
      field("Widget channel", widgetChannel),
      saveRow("Save engagement", (button) => {
        button.disabled = true;
        void call(host, {
          op: "patch_guild",
          guildId,
          body: {
            system_channel_id: system.value || null,
            system_channel_flags: flags,
            default_message_notifications: Number(notify.value),
            afk_channel_id: afk.value || null,
            afk_timeout: Number(timeout.value),
          },
        })
          .then(() => call(host, { op: "patch_widget", guildId, body: { enabled: widgetOn.checked, channel_id: widgetChannel.value || null } }))
          .then(() => {
            button.disabled = false;
            host.toast("Engagement", "Saved.");
          })
          .catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't save engagement");
          });
      }),
    );
  }).catch((err) => fail(host, err, "Couldn't load engagement"));
}

function channelSelect(channels: Channel[], selected: string, label: string): HTMLSelectElement {
  const select = el("select");
  select.setAttribute("aria-label", label);
  select.append(new Option("None", ""));
  for (const channel of channels) select.append(new Option(channel.name, channel.id));
  if (selected) select.value = selected;
  return select;
}

function paintPerks(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Boost Perks", "Progress, invite background, and the custom invite link. Buying a boost stays on Discord."));
  const box = card(el("p", "hint", "Loading…"));
  stack.append(box);
  void Promise.all([
    call<Json>(host, { op: "get_guild", guildId }),
    call<Json>(host, { op: "vanity", guildId }).catch(() => ({}) as Json),
  ]).then(([guild, vanity]) => {
    box.replaceChildren();
    const count = numOf(guild.premium_subscription_count);
    const progress = boostProgress(count);
    const bar = el("div", "boost-bar");
    const fill = el("span", "boost-fill");
    fill.style.width = `${Math.round(progress.ratio * 100)}%`;
    bar.append(fill);
    const code = inputOf(textOf(vanity.code) || textOf(guild.vanity_url_code), "Custom invite", 32);
    let splashData = "";
    let bannerData = "";
    const splash = el("input");
    splash.type = "file";
    splash.accept = "image/png,image/jpeg,image/gif,image/webp";
    splash.setAttribute("aria-label", "Invite background");
    splash.addEventListener("change", () => {
      const file = splash.files?.[0];
      if (file) void readDataUrl(file).then((url) => { splashData = url; });
    });
    const banner = el("input");
    banner.type = "file";
    banner.accept = "image/png,image/jpeg,image/gif,image/webp";
    banner.setAttribute("aria-label", "Server banner");
    banner.addEventListener("change", () => {
      const file = banner.files?.[0];
      if (file) void readDataUrl(file).then((url) => { bannerData = url; });
    });
    box.append(
      el("p", "", `Level ${numOf(guild.premium_tier)} · ${count} boosts`),
      bar,
      el("p", "hint", progress.next == null ? "Level 3 perks are unlocked." : `${progress.next - count} boosts to the next level.`),
      el("p", "hint", textOf(guild.splash) ? "An invite background is set." : "No invite background yet. Level 1 unlocks one."),
      el("p", "hint", textOf(guild.banner) ? "A banner is set." : "No banner yet. Level 2 unlocks one."),
      field("Invite background", splash),
      field("Banner", banner),
      field("Custom invite link", code),
      saveRow("Save perks", (button) => {
        const vanityCode = code.value.trim().toLowerCase();
        if (vanityCode && !vanityOk(vanityCode)) {
          host.toast("Invite link", "Use 2–32 lowercase letters, numbers, or dashes.");
          return;
        }
        button.disabled = true;
        const body: Json = { vanity_url_code: vanityCode || null };
        if (splashData) body.splash = splashData;
        if (bannerData) body.banner = bannerData;
        void call(host, { op: "patch_guild", guildId, body })
          .then(() => {
            button.disabled = false;
            host.toast("Invite link", vanityCode ? `discord.gg/${vanityCode}` : "Cleared.");
          })
          .catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't save the invite link");
          });
      }),
      linkButton("Boost this server on Discord", DISCORD_LINKS.boost),
    );
  }).catch((err) => fail(host, err, "Couldn't load boosts"));
}

function directoryButton(host: GuildSettingsHost, guildId: string, onInstalled?: () => void): HTMLButtonElement {
  const button = el("button", "ghost", "Browse the App Directory");
  button.type = "button";
  button.addEventListener("click", () => {
    void import("./app-directory-view").then(({ openAppDirectory }) => {
      openAppDirectory({
        invoke: (command, args) => host.invoke(command, args),
        toast: (title, detail) => host.toast(title, detail),
        guildId,
        guildName: host.guild().name,
        onInstalled: () => {
          host.toast("Installed", "The app was added to this server.");
          onInstalled?.();
        },
      });
    });
  });
  return button;
}

function linkButton(label: string, url: string): HTMLButtonElement {
  const button = el("button", "ghost", label);
  button.type = "button";
  button.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  return button;
}

function paintEmoji(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  paintExpression(host, guildId, stack, {
    title: "Emoji",
    detail: "Slots follow the boost level. Upload one, or several at once.",
    opList: "list_emojis",
    opCreate: "create_emoji",
    opDelete: "delete_emoji",
    slot: "emoji",
    nameFirst: true,
  });
}

function paintStickers(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  paintExpression(host, guildId, stack, {
    title: "Stickers",
    detail: "Upload a PNG or APNG. The file is sent to Discord as a sticker.",
    opList: "list_stickers",
    opCreate: "create_sticker",
    opDelete: "delete_sticker",
    slot: "sticker",
    nameFirst: false,
  });
}

function paintSounds(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  paintExpression(host, guildId, stack, {
    title: "Soundboard",
    detail: "Guild sounds. The local WAV board in Voice & Video stays separate.",
    opList: "list_sounds",
    opCreate: "create_sound",
    opDelete: "delete_sound",
    slot: "sound",
    nameFirst: true,
  });
}

function paintExpression(
  host: GuildSettingsHost,
  guildId: string,
  stack: HTMLElement,
  spec: { title: string; detail: string; opList: string; opCreate: string; opDelete: string; slot: "emoji" | "sticker" | "sound"; nameFirst: boolean },
) {
  stack.append(heading(spec.title, spec.detail));
  const box = card(el("p", "hint", "Loading…"));
  stack.append(box);
  const reload = () => {
    void Promise.all([
      call<Json>(host, { op: "get_guild", guildId }).catch(() => ({})),
      call<unknown[]>(host, { op: spec.opList, guildId }).catch(() => []),
    ]).then(([guild, items]) => {
      const list = Array.isArray(items) ? items : items && typeof items === "object" && Array.isArray((items as Json).items) ? ((items as Json).items as unknown[]) : [];
      const slots = expressionSlots(numOf((guild as Json).premium_tier));
      const cap = spec.slot === "emoji" ? slots.emoji : spec.slot === "sticker" ? slots.sticker : slots.sound;
      box.replaceChildren();
      box.append(el("p", "", `${list.length} / ${cap} slots`));
      const table = el("div", "guild-table");
      for (const item of list) {
        const row = item as Json;
        const id = textOf(row.id) || textOf(row.sound_id);
        const name = textOf(row.name) || "untitled";
        const line = el("div", "guild-row");
        line.append(el("span", "", name));
        const remove = el("button", "ghost", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: spec.opDelete, guildId, extra: id })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't delete"));
        });
        line.append(remove);
        table.append(line);
      }
      const name = inputOf("", "Name", 32);
      const file = el("input");
      file.type = "file";
      file.multiple = spec.slot === "emoji";
      file.accept = spec.slot === "sound" ? "audio/mpeg,audio/ogg,audio/wav" : "image/png,image/gif,image/webp";
      file.setAttribute("aria-label", `${spec.title} file`);
      box.append(
        table,
        field("Name", name),
        field(spec.slot === "emoji" ? "Upload or bulk add" : "Upload", file),
        saveRow("Upload", (button) => {
          const files = [...(file.files ?? [])];
          if (!files.length) {
            host.toast(spec.title, "Choose a file.");
            return;
          }
          button.disabled = true;
          void Promise.all(files.map((item, index) => uploadExpression(host, guildId, spec, item, files.length > 1 ? item.name.replace(/\.[^.]+$/, "") : name.value, index)))
            .then(() => {
              button.disabled = false;
              host.toast(spec.title, files.length > 1 ? `Uploaded ${files.length}.` : "Uploaded.");
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't upload");
            });
        }),
      );
    }).catch((err) => fail(host, err, "Couldn't load"));
  };
  reload();
}

async function uploadExpression(
  host: GuildSettingsHost,
  guildId: string,
  spec: { opCreate: string; slot: "emoji" | "sticker" | "sound" },
  file: File,
  name: string,
  index: number,
) {
  const clean = (name || `item${index + 1}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32) || `item${index + 1}`;
  if (spec.slot === "sticker") {
    const data = await readDataUrl(file);
    const encoded = data.slice(data.indexOf(",") + 1);
    return call(host, {
      op: spec.opCreate,
      guildId,
      body: { name: clean, description: clean, tags: clean },
      fileName: file.name,
      fileMime: file.type || "image/png",
      fileBase64: encoded,
    });
  }
  const data = await readDataUrl(file);
  if (spec.slot === "sound") return call(host, { op: spec.opCreate, guildId, body: { name: clean, sound: data, volume: 1 } });
  return call(host, { op: spec.opCreate, guildId, body: { name: clean, image: data } });
}

function paintMembersPage(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Members", "Member since, when they joined Discord, join method, roles, and signals."));
  const box = card();
  stack.append(box);
  const query = inputOf("", "Search members", 32);
  const sort = el("select");
  sort.setAttribute("aria-label", "Sort members");
  for (const option of [
    ["name", "Name"],
    ["joined", "Member Since"],
    ["discord", "Joined Discord"],
    ["roles", "Roles"],
  ] as const) sort.append(new Option(option[1], option[0]));
  const pruneDays = el("select");
  pruneDays.setAttribute("aria-label", "Prune days");
  pruneDays.append(new Option("1 day", "1"), new Option("7 days", "7"), new Option("30 days", "30"));
  pruneDays.value = "7";
  const table = el("div", "guild-table is-members");
  const mod = el("div", "mod-view");
  let rows: MemberTableRow[] = [];
  let roles: RoleRow[] = [];
  const paint = () => {
    const sorted = sortMemberTable(rows, sort.value as MemberSortKey);
    table.replaceChildren();
    const head = el("div", "guild-row is-head");
    for (const label of ["Name", "Member Since", "Joined Discord", "Join Method", "Roles", "Signals"]) head.append(el("span", "", label));
    table.append(head);
    for (const row of sorted) {
      const line = el("button", "guild-row");
      line.type = "button";
      const joined = row.joinedAt ? row.joinedAt.slice(0, 10) : "";
      const created = snowflakeTime(row.id)?.slice(0, 10) ?? "";
      for (const cell of [row.name, joined, created, row.joinMethod || "Unknown", row.roles.join(", "), row.signals.join(", ") || "—"]) {
        line.append(el("span", "", cell));
      }
      line.addEventListener("click", () => paintMod(row));
      table.append(line);
    }
  };
  const paintMod = (row: MemberTableRow) => {
    mod.replaceChildren(el("h3", "", row.name));
    const rolePicks = el("div", "role-picks");
    for (const role of roles.filter((item) => item.id !== guildId)) {
      const label = el("label", "check-row");
      const boxInput = el("input");
      boxInput.type = "checkbox";
      boxInput.checked = row.roles.includes(role.name);
      boxInput.addEventListener("change", () => {
        const op = boxInput.checked ? "add_role" : "remove_role";
        void call(host, { op, guildId, userId: row.id, roleId: role.id })
          .then(() => host.toast("Roles", `${row.name} · ${role.name}`))
          .catch((err) => fail(host, err, "Couldn't update roles"));
      });
      label.append(boxInput, el("span", "", role.name));
      rolePicks.append(label);
    }
    const timeout = el("select");
    timeout.setAttribute("aria-label", "Timeout");
    timeout.append(new Option("No timeout", "0"));
    for (const option of TIMEOUTS) timeout.append(new Option(option.label, String(option.seconds)));
    const applyTimeout = el("button", "ghost", "Timeout");
    applyTimeout.type = "button";
    applyTimeout.addEventListener("click", () => {
      const seconds = Number(timeout.value);
      const body = seconds ? { communication_disabled_until: timeoutUntil(seconds) } : { communication_disabled_until: null };
      void call(host, { op: "patch_member", guildId, userId: row.id, body })
        .then(() => host.toast("Timeout", seconds ? `Until ${body.communication_disabled_until}` : "Cleared."))
        .catch((err) => fail(host, err, "Couldn't update the timeout"));
    });
    const kick = el("button", "ghost", "Kick");
    kick.type = "button";
    kick.addEventListener("click", () => {
      if (!window.confirm(`Kick ${row.name}?`)) return;
      void call(host, { op: "kick_member", guildId, userId: row.id })
        .then(() => host.toast("Kicked", row.name))
        .catch((err) => fail(host, err, "Couldn't kick"));
    });
    const ban = el("button", "ghost is-danger", "Ban");
    ban.type = "button";
    ban.addEventListener("click", () => {
      if (!window.confirm(`Ban ${row.name}?`)) return;
      void call(host, { op: "ban", guildId, userId: row.id, body: { delete_message_seconds: 0 } })
        .then(() => host.toast("Banned", row.name))
        .catch((err) => fail(host, err, "Couldn't ban"));
    });
    const actions = el("div", "choice-row");
    actions.append(applyTimeout, kick, ban);
    mod.append(el("p", "folder-menu-label", "Mod view"), rolePicks, field("Timeout", timeout), actions);
  };
  const load = (search = "") => {
    const op = search ? "search_members" : "list_members";
    void Promise.all([
      call<unknown[]>(host, { op, guildId, extra: search }),
      call<RoleRow[]>(host, { op: "list_roles", guildId }),
    ]).then(([members, roleRows]) => {
      roles = Array.isArray(roleRows) ? roleRows : [];
      const names = new Map(roles.map((role) => [role.id, role.name]));
      rows = (Array.isArray(members) ? members : []).map((item) => memberRow(item as Json, names));
      paint();
    }).catch((err) => fail(host, err, "Couldn't load members"));
  };
  query.addEventListener("change", () => load(query.value.trim()));
  sort.addEventListener("change", paint);
  box.append(
    field("Search", query),
    field("Sort", sort),
    table,
    mod,
    field("Prune inactive members", pruneDays),
    saveRow("Prune", (button) => {
      button.disabled = true;
      void call<{ pruned?: number }>(host, { op: "prune", guildId, body: pruneBody(Number(pruneDays.value)) })
        .then((result) => {
          button.disabled = false;
          host.toast("Prune", `${result?.pruned ?? 0} members.`);
        })
        .catch((err) => {
          button.disabled = false;
          fail(host, err, "Couldn't prune");
        });
    }),
  );
  load();
}

function memberRow(raw: Json, names: Map<string, string>): MemberTableRow {
  const user = (raw.user ?? {}) as Json;
  const id = textOf(user.id);
  const roleIds = Array.isArray(raw.roles) ? raw.roles.map((item) => String(item)) : [];
  return {
    id,
    name: textOf(raw.nick) || textOf(user.global_name) || textOf(user.username) || id,
    joinedAt: textOf(raw.joined_at),
    joinMethod: textOf(raw.join_source_type) || textOf(raw.source) || "Unknown",
    roles: roleIds.map((roleId) => names.get(roleId) || roleId),
    signals: memberSignals({
      pending: raw.pending === true,
      timedOut: Boolean(raw.communication_disabled_until),
      mute: raw.mute === true,
      deaf: raw.deaf === true,
    }),
  };
}

function paintRoles(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Roles", "@everyone stays. Create, reorder, and edit display, permissions, links, and members."));
  const box = card(el("p", "hint", "Loading roles…"));
  stack.append(box);
  const reload = () => {
    void call<Json[]>(host, { op: "list_roles", guildId }).then((roles) => {
      const list = (Array.isArray(roles) ? roles : []).map(normalizeRole).sort((a, b) => b.position - a.position);
      box.replaceChildren();
      const table = el("div", "guild-table");
      for (const role of list) {
        const line = el("div", "guild-row");
        const open = el("button", "text-button", role.id === guildId ? "@everyone" : role.name);
        open.type = "button";
        open.addEventListener("click", () => paintRoleEditor(host, guildId, role, reload));
        line.append(open);
        if (role.position > 0) {
          const up = el("button", "ghost", "Up");
          up.type = "button";
          const down = el("button", "ghost", "Down");
          down.type = "button";
          const move = (direction: -1 | 1) => {
            const payload = reorderRole(list, role.id, direction);
            if (!payload) return;
            void call(host, { op: "reorder_roles", guildId, body: payload })
              .then(() => reload())
              .catch((err) => fail(host, err, "Couldn't reorder"));
          };
          up.addEventListener("click", () => move(1));
          down.addEventListener("click", () => move(-1));
          line.append(up, down);
        }
        table.append(line);
      }
      box.append(
        table,
        saveRow("Create role", (button) => {
          button.disabled = true;
          void call(host, { op: "create_role", guildId, body: { name: "new role" } })
            .then(() => {
              button.disabled = false;
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't create the role");
            });
        }),
      );
    }).catch((err) => fail(host, err, "Couldn't load roles"));
  };
  reload();
}

function normalizeRole(raw: Json): RoleRow & { permissions: string; color: number; mentionable: boolean } {
  return {
    id: textOf(raw.id),
    name: textOf(raw.name),
    position: numOf(raw.position),
    permissions: textOf(raw.permissions) || "0",
    color: numOf(raw.color),
    hoist: raw.hoist === true,
    mentionable: raw.mentionable === true,
  };
}

function paintRoleEditor(host: GuildSettingsHost, guildId: string, role: ReturnType<typeof normalizeRole>, reload: () => void) {
  const layer = el("div", "modal-layer");
  const cardBox = el("div", "modal-card role-editor");
  cardBox.setAttribute("role", "dialog");
  cardBox.setAttribute("aria-label", "Edit role");
  let tab: "display" | "permissions" | "links" | "members" = "display";
  const tabs = el("div", "choice-row");
  const body = el("div", "role-editor-body");
  const paintTabs = () => {
    tabs.replaceChildren();
    for (const item of [
      ["display", "Display"],
      ["permissions", "Permissions"],
      ["links", "Links"],
      ["members", "Manage Members"],
    ] as const) {
      const button = el("button", `ghost${tab === item[0] ? " is-on" : ""}`, item[1]);
      button.type = "button";
      button.addEventListener("click", () => {
        tab = item[0];
        paintTabs();
        paintBody();
      });
      tabs.append(button);
    }
  };
  const paintBody = () => {
    body.replaceChildren();
    if (tab === "display") paintRoleDisplay(host, guildId, role, body, reload);
    else if (tab === "permissions") paintRolePerms(host, guildId, role, body);
    else if (tab === "links") {
      body.append(el("p", "hint", "Linked roles are granted when a member connects an app."));
      body.append(directoryButton(host, guildId));
    } else paintRoleMembers(host, guildId, role, body);
  };
  const close = el("button", "ghost", "Close");
  close.type = "button";
  close.addEventListener("click", () => layer.remove());
  if (role.id !== guildId) {
    const remove = el("button", "ghost is-danger", "Delete role");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete ${role.name}?`)) return;
      void call(host, { op: "delete_role", guildId, roleId: role.id })
        .then(() => {
          layer.remove();
          reload();
        })
        .catch((err) => fail(host, err, "Couldn't delete the role"));
    });
    cardBox.append(el("h2", "", role.name), tabs, body, remove, close);
  } else cardBox.append(el("h2", "", "@everyone"), tabs, body, close);
  paintTabs();
  paintBody();
  layer.append(cardBox);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
}

function paintRoleDisplay(host: GuildSettingsHost, guildId: string, role: ReturnType<typeof normalizeRole>, body: HTMLElement, reload: () => void) {
  const name = inputOf(role.id === guildId ? "@everyone" : role.name, "Role name");
  name.disabled = role.id === guildId;
  const color = el("input");
  color.type = "color";
  color.value = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "#99aab5";
  const hoist = el("input");
  hoist.type = "checkbox";
  hoist.checked = role.hoist === true;
  const mention = el("input");
  mention.type = "checkbox";
  mention.checked = role.mentionable;
  const hoistRow = el("label", "check-row");
  hoistRow.append(hoist, el("span", "", "Display role members separately"));
  const mentionRow = el("label", "check-row");
  mentionRow.append(mention, el("span", "", "Allow anyone to mention this role"));
  body.append(
    field("Name", name),
    field("Color", color),
    hoistRow,
    mentionRow,
    saveRow("Save display", (button) => {
      button.disabled = true;
      void call(host, {
        op: "patch_role",
        guildId,
        roleId: role.id,
        body: {
          name: role.id === guildId ? "@everyone" : name.value.trim().slice(0, 100),
          color: Number.parseInt(color.value.slice(1), 16) || 0,
          hoist: hoist.checked,
          mentionable: mention.checked,
        },
      })
        .then(() => {
          button.disabled = false;
          host.toast("Role", "Display saved.");
          reload();
        })
        .catch((err) => {
          button.disabled = false;
          fail(host, err, "Couldn't save the role");
        });
    }),
    saveRow("View server as role", () => {
      host.viewAs(role.id, role.permissions, role.name);
    }),
  );
}

function paintRolePerms(host: GuildSettingsHost, guildId: string, role: ReturnType<typeof normalizeRole>, body: HTMLElement) {
  let bits = bitsOf(role.permissions);
  for (const group of PERMISSION_GROUPS) {
    body.append(el("h3", "", group));
    for (const item of permissionsIn(group)) {
      const box = el("input");
      box.type = "checkbox";
      box.checked = hasPerm(bits, item.flag);
      box.addEventListener("change", () => {
        bits = togglePerm(bits, item.flag, box.checked);
      });
      const row = el("label", "check-row");
      row.append(box, el("span", "", item.label));
      body.append(row);
    }
  }
  body.append(saveRow("Save permissions", (button) => {
    button.disabled = true;
    void call(host, { op: "patch_role", guildId, roleId: role.id, body: { permissions: formatBits(bits) } })
      .then(() => {
        button.disabled = false;
        role.permissions = formatBits(bits);
        host.toast("Permissions", "Saved.");
      })
      .catch((err) => {
        button.disabled = false;
        fail(host, err, "Couldn't save permissions");
      });
  }));
}

function paintRoleMembers(host: GuildSettingsHost, guildId: string, role: ReturnType<typeof normalizeRole>, body: HTMLElement) {
  const list = el("div", "guild-table");
  body.append(el("p", "hint", "Members loaded from the server. Toggle the role on or off."), list);
  void call<Json[]>(host, { op: "list_members", guildId }).then((members) => {
    for (const raw of Array.isArray(members) ? members : []) {
      const user = (raw.user ?? {}) as Json;
      const id = textOf(user.id);
      const name = textOf(user.global_name) || textOf(user.username) || id;
      const has = Array.isArray(raw.roles) && raw.roles.map(String).includes(role.id);
      const row = el("label", "check-row");
      const box = el("input");
      box.type = "checkbox";
      box.checked = has || role.id === guildId;
      box.disabled = role.id === guildId;
      box.addEventListener("change", () => {
        void call(host, { op: box.checked ? "add_role" : "remove_role", guildId, userId: id, roleId: role.id })
          .catch((err) => fail(host, err, "Couldn't update the member"));
      });
      row.append(box, el("span", "", name));
      list.append(row);
    }
  }).catch((err) => fail(host, err, "Couldn't load members"));
}

function asList(value: unknown): Json[] {
  if (Array.isArray(value)) return value.filter((item): item is Json => Boolean(item) && typeof item === "object");
  if (value && typeof value === "object") {
    const bag = value as Json;
    const nested = bag.items ?? bag.audit_log_entries;
    if (Array.isArray(nested)) return nested.filter((item): item is Json => Boolean(item) && typeof item === "object");
  }
  return [];
}

function featuresOf(guild: Json): string[] {
  return Array.isArray(guild.features) ? guild.features.map((item) => String(item)) : [];
}

function withFeature(features: string[], name: string, on: boolean): string[] {
  const next = new Set(features);
  if (on) next.add(name);
  else next.delete(name);
  return [...next];
}

function paintInvites(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Invites", "List the links, pause them, or create a new one."));
  const box = card(el("p", "hint", "Loading invites…"));
  stack.append(box);
  const reload = () => {
    void Promise.all([
      call<unknown>(host, { op: "list_guild_invites", guildId }),
      call<Json>(host, { op: "get_guild", guildId }),
    ]).then(([invites, guild]) => {
      box.replaceChildren();
      const paused = featuresOf(guild).includes("INVITES_DISABLED");
      const pause = el("input");
      pause.type = "checkbox";
      pause.checked = paused;
      const pauseRow = el("label", "check-row");
      pauseRow.append(pause, el("span", "", "Pause invites"));
      const table = el("div", "guild-table");
      for (const invite of asList(invites)) {
        const code = textOf(invite.code);
        const channel = (invite.channel ?? {}) as Json;
        const line = el("div", "guild-row");
        line.append(el("span", "", code ? `discord.gg/${code}` : "Invite"), el("span", "", `${numOf(invite.uses)} uses`));
        const copy = el("button", "ghost", "Copy");
        copy.type = "button";
        copy.addEventListener("click", () => void host.copy(code ? `https://discord.gg/${code}` : ""));
        const remove = el("button", "ghost", "Revoke");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: "delete_invite", extra: code })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't revoke the invite"));
        });
        line.append(copy, remove);
        if (textOf(channel.name)) line.append(el("span", "", `#${textOf(channel.name)}`));
        table.append(line);
      }
      if (!asList(invites).length) table.append(el("p", "hint", "No invites yet."));
      const channels = host.channels().filter((channel) => channel.kind === "text" || channel.kind === "announcement" || channel.kind === "voice" || channel.kind === "forum");
      const channel = channelSelect(channels, channels[0]?.id ?? "", "Invite channel");
      const expiry = el("select");
      expiry.setAttribute("aria-label", "Expire after");
      for (const option of INVITE_EXPIRY) expiry.append(new Option(option.label, String(option.maxAge)));
      expiry.value = "86400";
      const uses = el("select");
      uses.setAttribute("aria-label", "Max uses");
      for (const option of INVITE_USES) uses.append(new Option(option.label, String(option.maxUses)));
      const temporary = el("input");
      temporary.type = "checkbox";
      const tempRow = el("label", "check-row");
      tempRow.append(temporary, el("span", "", "Grant temporary membership"));
      box.append(
        pauseRow,
        saveRow("Save pause", (button) => {
          button.disabled = true;
          void call(host, { op: "patch_guild", guildId, body: { features: withFeature(featuresOf(guild), "INVITES_DISABLED", pause.checked) } })
            .then(() => {
              button.disabled = false;
              host.toast("Invites", pause.checked ? "Paused." : "Resumed.");
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't pause invites");
            });
        }),
        table,
        field("Channel", channel),
        field("Expire after", expiry),
        field("Max number of uses", uses),
        tempRow,
        saveRow("Create invite", (button) => {
          if (!channel.value) {
            host.toast("Invite", "Pick a channel.");
            return;
          }
          button.disabled = true;
          void call<Json>(host, {
            op: "create_invite",
            guildId,
            channelId: channel.value,
            body: inviteBody({ maxAge: Number(expiry.value), maxUses: Number(uses.value), temporary: temporary.checked }),
          }).then((created) => {
            button.disabled = false;
            const code = textOf(created.code);
            if (code) void host.copy(`https://discord.gg/${code}`);
            host.toast("Invite", code ? `discord.gg/${code}` : "Created.");
            reload();
          }).catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't create the invite");
          });
        }),
      );
    }).catch((err) => fail(host, err, "Couldn't load invites"));
  };
  reload();
}

function paintAccess(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Access", "Invite only, apply to join, discovery, age restriction, and the rules."));
  const box = card(el("p", "hint", "Loading access…"));
  stack.append(box);
  void Promise.all([
    call<Json>(host, { op: "get_guild", guildId }),
    call<Json>(host, { op: "get_verification", guildId }).catch(() => ({}) as Json),
  ]).then(([guild, form]) => {
    box.replaceChildren();
    const mode = el("select");
    mode.setAttribute("aria-label", "How people join");
    mode.append(new Option("Invite only", "invite"), new Option("Apply to join", "apply"));
    mode.value = form.enabled === true ? "apply" : "invite";
    const discover = el("input");
    discover.type = "checkbox";
    discover.checked = featuresOf(guild).includes("DISCOVERABLE");
    const discoverRow = el("label", "check-row");
    discoverRow.append(discover, el("span", "", "Discoverable"));
    const age = el("input");
    age.type = "checkbox";
    age.checked = numOf(guild.nsfw_level) >= 1;
    const ageRow = el("label", "check-row");
    ageRow.append(age, el("span", "", "Age-restricted server"));
    const description = inputOf(textOf(form.description), "Rules description", 300);
    const rules = el("textarea");
    rules.setAttribute("aria-label", "Server rules");
    const fields = Array.isArray(form.form_fields) ? form.form_fields as Json[] : [];
    const values = Array.isArray(fields[0]?.values) ? (fields[0].values as unknown[]).map((item) => String(item)) : [];
    rules.value = values.join("\n");
    box.append(
      field("How people join", mode),
      discoverRow,
      ageRow,
      field("Description", description),
      field("Rules, one per line", rules),
      saveRow("Save access", (button) => {
        button.disabled = true;
        const features = withFeature(featuresOf(guild), "DISCOVERABLE", discover.checked);
        void call(host, { op: "patch_guild", guildId, body: { features, nsfw_level: age.checked ? 1 : 0 } })
          .then(() => call(host, {
            op: "patch_verification",
            guildId,
            body: verificationBody({ enabled: mode.value === "apply", rules: rules.value, description: description.value }),
          }))
          .then(() => {
            button.disabled = false;
            host.toast("Access", "Saved.");
          })
          .catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't save access");
          });
      }),
    );
  }).catch((err) => fail(host, err, "Couldn't load access"));
}

function paintIntegrations(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Integrations", "Webhooks, channels this server follows, and bots."));
  const box = card(el("p", "hint", "Loading integrations…"));
  let reload = () => {};
  stack.append(directoryButton(host, guildId, () => reload()), box);
  reload = () => {
    void Promise.all([
      call<unknown>(host, { op: "list_webhooks", guildId }).catch(() => []),
      call<unknown>(host, { op: "list_integrations", guildId }).catch(() => []),
    ]).then(([webhooks, bots]) => {
      box.replaceChildren();
      box.append(el("h3", "", "Webhooks"));
      const table = el("div", "guild-table");
      for (const hook of asList(webhooks)) {
        const line = el("div", "guild-row");
        line.append(el("span", "", textOf(hook.name) || "Webhook"));
        const remove = el("button", "ghost", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: "delete_webhook", extra: textOf(hook.id) })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't delete the webhook"));
        });
        line.append(remove);
        table.append(line);
      }
      const name = inputOf("Captain Hook", "Webhook name", 80);
      const channels = host.channels().filter((channel) => channel.kind === "text" || channel.kind === "announcement");
      const channel = channelSelect(channels, channels[0]?.id ?? "", "Webhook channel");
      box.append(
        table,
        field("Name", name),
        field("Channel", channel),
        saveRow("Create webhook", (button) => {
          if (!channel.value) return;
          button.disabled = true;
          void call(host, { op: "create_webhook", guildId, channelId: channel.value, body: { name: name.value.trim().slice(0, 80) || "Captain Hook" } })
            .then(() => {
              button.disabled = false;
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't create the webhook");
            });
        }),
      );
      box.append(el("h3", "", "Followed channels"));
      const news = host.channels().filter((channel) => channel.kind === "announcement");
      const newsPick = channelSelect(news, news[0]?.id ?? "", "Announcement channel");
      const followers = el("div", "guild-table");
      const loadFollowers = () => {
        followers.replaceChildren();
        if (!newsPick.value) {
          followers.append(el("p", "hint", "No announcement channel to follow from."));
          return;
        }
        void call<unknown>(host, { op: "list_followers", guildId, channelId: newsPick.value }).then((rows) => {
          followers.replaceChildren();
          const list = asList(rows);
          if (!list.length) followers.append(el("p", "hint", "Nothing is following this channel."));
          for (const row of list) followers.append(el("div", "guild-row", textOf(row.channel_id) || textOf(row.webhook_id) || "Follower"));
        }).catch((err) => fail(host, err, "Couldn't load followed channels"));
      };
      newsPick.addEventListener("change", loadFollowers);
      box.append(newsPick, followers);
      loadFollowers();
      box.append(el("h3", "", "Bots and apps"));
      const apps = el("div", "guild-table");
      const list = asList(bots);
      if (!list.length) apps.append(el("p", "hint", "No bots or app integrations."));
      for (const bot of list) {
        const account = (bot.account ?? {}) as Json;
        const line = el("div", "guild-row");
        line.append(el("span", "", textOf(bot.name) || textOf(account.name) || textOf(bot.type) || "Integration"));
        const remove = el("button", "ghost", "Remove");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: "delete_integration", guildId, extra: textOf(bot.id) })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't remove the integration"));
        });
        line.append(remove);
        apps.append(line);
      }
      box.append(apps);
    }).catch((err) => fail(host, err, "Couldn't load integrations"));
  };
  reload();
}

function paintSafety(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Safety Setup", "Verification, two-factor for moderators, and the content filter. Prune skips members who already have a role."));
  const box = card(el("p", "hint", "Loading safety…"));
  stack.append(box);
  void call<Json>(host, { op: "get_guild", guildId }).then((guild) => {
    box.replaceChildren();
    const verification = el("select");
    verification.setAttribute("aria-label", "Verification level");
    for (const option of [
      ["0", "None"],
      ["1", "Low — verified email"],
      ["2", "Medium — registered for 5 minutes"],
      ["3", "High — member for 10 minutes"],
      ["4", "Highest — verified phone"],
    ]) verification.append(new Option(option[1], option[0]));
    verification.value = String(numOf(guild.verification_level));
    const mfa = el("input");
    mfa.type = "checkbox";
    mfa.checked = numOf(guild.mfa_level) >= 1;
    const mfaRow = el("label", "check-row");
    mfaRow.append(mfa, el("span", "", "Require 2FA for moderator actions"));
    const filter = el("select");
    filter.setAttribute("aria-label", "Explicit content filter");
    filter.append(new Option("Don't scan", "0"), new Option("Scan members without a role", "1"), new Option("Scan everyone", "2"));
    filter.value = String(numOf(guild.explicit_content_filter));
    box.append(
      field("Verification level", verification),
      mfaRow,
      field("Explicit media content filter", filter),
      el("p", "hint", "Prune only removes members who have no role. Members with a role stay."),
      saveRow("Save safety", (button) => {
        button.disabled = true;
        void call(host, {
          op: "patch_guild",
          guildId,
          body: {
            verification_level: Number(verification.value),
            mfa_level: mfa.checked ? 1 : 0,
            explicit_content_filter: Number(filter.value),
          },
        }).then(() => {
          button.disabled = false;
          host.toast("Safety", "Saved.");
        }).catch((err) => {
          button.disabled = false;
          fail(host, err, "Couldn't save safety");
        });
      }),
    );
  }).catch((err) => fail(host, err, "Couldn't load safety"));
}

function paintAudit(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Audit Log", "Filter by a member and an action."));
  const box = card();
  stack.append(box);
  const user = inputOf("", "User id", 22);
  user.placeholder = "User id";
  const action = el("select");
  action.setAttribute("aria-label", "Action");
  action.append(new Option("All actions", ""));
  for (const item of AUDIT_ACTIONS) action.append(new Option(item.label, String(item.id)));
  const table = el("div", "guild-table");
  const load = () => {
    const filter = auditQuery({ userId: user.value.trim(), action: action.value === "" ? null : Number(action.value) });
    void call<Json>(host, { op: "audit_log", guildId, userId: filter.userId, extra: filter.extra }).then((log) => {
      table.replaceChildren();
      const users = new Map(asList(log.users).map((person) => [textOf(person.id), textOf(person.username) || textOf(person.global_name)]));
      const entries = asList(log.audit_log_entries ?? log);
      if (!entries.length) table.append(el("p", "hint", "No audit entries for that filter."));
      for (const entry of entries) {
        const who = users.get(textOf(entry.user_id)) || textOf(entry.user_id) || "Someone";
        const line = el("div", "guild-row");
        line.append(el("span", "", who), el("span", "", AUDIT_ACTIONS.find((item) => item.id === numOf(entry.action_type))?.label ?? "Action"));
        if (textOf(entry.reason)) line.append(el("span", "", textOf(entry.reason)));
        table.append(line);
      }
    }).catch((err) => fail(host, err, "Couldn't load the audit log"));
  };
  action.addEventListener("change", load);
  box.append(field("User", user), field("Action", action), saveRow("Filter", () => load()), table);
  load();
}

function paintBans(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Bans", "People who cannot rejoin until the ban is removed."));
  const box = card(el("p", "hint", "Loading bans…"));
  stack.append(box);
  const reload = () => {
    void call<unknown>(host, { op: "list_bans", guildId }).then((bans) => {
      box.replaceChildren();
      const list = asList(bans);
      if (!list.length) box.append(el("p", "hint", "No bans."));
      const table = el("div", "guild-table");
      for (const ban of list) {
        const person = (ban.user ?? {}) as Json;
        const id = textOf(person.id);
        const line = el("div", "guild-row");
        line.append(el("span", "", textOf(person.global_name) || textOf(person.username) || id), el("span", "", textOf(ban.reason) || "No reason"));
        const remove = el("button", "ghost", "Unban");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: "unban", guildId, userId: id })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't unban"));
        });
        line.append(remove);
        table.append(line);
      }
      box.append(table);
    }).catch((err) => fail(host, err, "Couldn't load bans"));
  };
  reload();
}

function paintAutomod(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("AutoMod", "Mention spam, spam content, flagged words, and your own word list."));
  const box = card(el("p", "hint", "Loading rules…"));
  stack.append(box);
  const reload = () => {
    void call<unknown>(host, { op: "list_automod", guildId }).then((rules) => {
      box.replaceChildren();
      const table = el("div", "guild-table");
      for (const rule of asList(rules)) {
        const line = el("div", "guild-row");
        const kind = numOf(rule.trigger_type);
        const kindName = kind === 5 ? "Mentions" : kind === 3 ? "Spam" : kind === 4 ? "Flagged words" : kind === 1 ? "Custom words" : "Rule";
        line.append(el("span", "", textOf(rule.name) || kindName), el("span", "", rule.enabled === false ? "Off" : "On"));
        const remove = el("button", "ghost", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void call(host, { op: "delete_automod", guildId, extra: textOf(rule.id) })
            .then(() => reload())
            .catch((err) => fail(host, err, "Couldn't delete the rule"));
        });
        line.append(remove);
        table.append(line);
      }
      const kind = el("select");
      kind.setAttribute("aria-label", "Rule kind");
      for (const option of [
        ["mention", "Mention spam"],
        ["spam", "Spam content"],
        ["preset", "Flagged words"],
        ["custom", "Custom words"],
      ] as const) kind.append(new Option(option[1], option[0]));
      const name = inputOf("Rule", "Rule name", 100);
      const words = inputOf("", "Custom words", 200);
      words.placeholder = "comma separated";
      const mentions = inputOf("5", "Mention limit", 2);
      const channels = host.channels().filter((channel) => channel.kind === "text" || channel.kind === "announcement");
      const alert = channelSelect(channels, "", "Alert channel");
      box.append(
        table,
        field("Kind", kind),
        field("Name", name),
        field("Custom words", words),
        field("Mention limit", mentions),
        field("Alert channel", alert),
        saveRow("Create rule", (button) => {
          const body = automodBody({
            kind: kind.value as AutomodKind,
            name: name.value,
            words: words.value.split(","),
            mentionLimit: Number(mentions.value) || 5,
            alertChannelId: alert.value || null,
          });
          if (!body) {
            host.toast("AutoMod", "Custom words need at least one word.");
            return;
          }
          button.disabled = true;
          void call(host, { op: "create_automod", guildId, body })
            .then(() => {
              button.disabled = false;
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't create the rule");
            });
        }),
      );
    }).catch((err) => fail(host, err, "Couldn't load AutoMod"));
  };
  reload();
}

function paintCommunity(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Enable Community", "Pick the rules channel and the updates channel. Discord turns community features on from there."));
  const box = card(el("p", "hint", "Loading…"));
  stack.append(box);
  void call<Json>(host, { op: "get_guild", guildId }).then((guild) => {
    box.replaceChildren();
    const on = featuresOf(guild).includes("COMMUNITY");
    const texts = host.channels().filter((channel) => channel.kind === "text" || channel.kind === "announcement");
    const rules = channelSelect(texts, textOf(guild.rules_channel_id), "Rules channel");
    const updates = channelSelect(texts, textOf(guild.public_updates_channel_id), "Updates channel");
    box.append(
      el("p", "", on ? "Community is on." : "Community is off."),
      field("Rules channel", rules),
      field("Community updates channel", updates),
      saveRow(on ? "Update community" : "Enable community", (button) => {
        const body = communityBody({ rulesChannelId: rules.value, updatesChannelId: updates.value, features: featuresOf(guild) });
        if (!body) {
          host.toast("Community", "Pick a rules channel and an updates channel.");
          return;
        }
        button.disabled = true;
        void call(host, { op: "patch_guild", guildId, body })
          .then(() => {
            button.disabled = false;
            host.toast("Community", "Saved.");
          })
          .catch((err) => {
            button.disabled = false;
            fail(host, err, "Couldn't enable community");
          });
      }),
    );
  }).catch((err) => fail(host, err, "Couldn't load community"));
}

function paintTemplate(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Server Template", "Save this server's channels and roles as a template other people can use."));
  const box = card(el("p", "hint", "Loading templates…"));
  stack.append(box);
  const reload = () => {
    void call<unknown>(host, { op: "list_templates", guildId }).then((templates) => {
      box.replaceChildren();
      const table = el("div", "guild-table");
      for (const template of asList(templates)) {
        const code = textOf(template.code);
        const line = el("div", "guild-row");
        line.append(el("span", "", textOf(template.name) || "Template"));
        const copy = el("button", "ghost", "Copy link");
        copy.type = "button";
        copy.addEventListener("click", () => void host.copy(code ? `https://discord.new/${code}` : ""));
        line.append(copy);
        table.append(line);
      }
      if (!asList(templates).length) table.append(el("p", "hint", "No template yet."));
      const name = inputOf(host.guild().name, "Template name", 100);
      const description = inputOf("", "Template description", 120);
      box.append(
        table,
        field("Name", name),
        field("Description", description),
        saveRow("Create template", (button) => {
          button.disabled = true;
          void call(host, { op: "create_template", guildId, body: { name: name.value.trim().slice(0, 100) || host.guild().name, description: description.value.slice(0, 120) } })
            .then(() => {
              button.disabled = false;
              host.toast("Template", "Created.");
              reload();
            })
            .catch((err) => {
              button.disabled = false;
              fail(host, err, "Couldn't create the template");
            });
        }),
      );
    }).catch((err) => fail(host, err, "Couldn't load templates"));
  };
  reload();
}

function paintBoosts(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Boosts", "Levels and perks. Buying a boost stays on Discord."));
  const box = card(el("p", "hint", "Loading boosts…"));
  stack.append(box);
  void call<Json>(host, { op: "get_guild", guildId }).then((guild) => {
    box.replaceChildren();
    const count = numOf(guild.premium_subscription_count);
    const progress = boostProgress(count);
    box.append(el("p", "", `Level ${progress.level} · ${count} boosts`));
    const table = el("div", "guild-table");
    const tiers = [{ level: 0, need: 0 }, ...BOOST_TIERS.map((tier) => ({ level: tier.level, need: tier.need }))];
    for (const tier of tiers) {
      const slots = expressionSlots(tier.level);
      const line = el("div", "guild-row");
      line.append(
        el("span", "", tier.level === 0 ? "No level" : `Level ${tier.level}`),
        el("span", "", tier.need ? `${tier.need} boosts` : "Start"),
        el("span", "", `${slots.emoji} emoji · ${slots.sticker} stickers · ${slots.sound} sounds`),
      );
      table.append(line);
    }
    box.append(
      table,
      el("p", "hint", "Level 1 adds an invite background. Level 2 adds a banner. Level 3 adds a vanity URL and an animated icon."),
      linkButton("Boost this server on Discord", DISCORD_LINKS.boost),
    );
  }).catch((err) => fail(host, err, "Couldn't load boosts"));
}

function paintDelete(host: GuildSettingsHost, guildId: string, stack: HTMLElement) {
  stack.append(heading("Delete Server", "Type the server name to confirm. This cannot be undone."));
  const box = card();
  const typed = inputOf("", "Server name", 100);
  typed.placeholder = host.guild().name;
  box.append(
    field("Server name", typed),
    saveRow("Delete server", (button) => {
      if (!deleteConfirmed(typed.value, host.guild().name)) {
        host.toast("Delete server", "Type the server name exactly.");
        return;
      }
      if (!window.confirm(`Delete ${host.guild().name}?`)) return;
      button.disabled = true;
      void call(host, { op: "delete_guild", guildId })
        .then(() => {
          host.toast("Delete server", `${host.guild().name} was deleted.`);
          host.close();
          host.refresh();
        })
        .catch((err) => {
          button.disabled = false;
          fail(host, err, "Couldn't delete the server");
        });
    }),
  );
  stack.append(box);
}
