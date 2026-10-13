import { people } from "../demo/data";
import {
  applyFolderDrop
} from "../folders";
import {
  channelFlags, type GuildAccess, type GuildPref
} from "../shell";
import type { Channel, Guild, NotifyLevel } from "../types";
import { commandError } from "../signin";
import { writeClipboard } from "../clipboard";
import { clear, el, icon } from "./dom";
import {
  DISCORD_LINKS,
  categoryChannelIds,
  categoryContextItems,
  channelContextItems, channelLink,
  channelNotifyBody,
  channelsNotifyBody,
  duplicateChannelBody,
  extraChannelItems,
  guildNotifyBody,
  headerMenuItems, openCreateEvent, serverContextItems, withMoveTargets
} from "../server-model";
import { externalLink, mountAddServer, mountMenu } from "./guild-settings";
import {
  readDeveloperMode
} from "./composer-tools";
import { isTauri, invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const menuMethods = defineMethods({
  refreshChannelBadge(channelId: string) {
    const channel = this.channelById(channelId);
    const flags = channelFlags({
      lastMessageId: channel?.lastMessageId,
      marker: this.markers[channelId],
      localUnread: this.localUnread[channelId] ?? 0,
      localMentions: this.localMentions[channelId] ?? 0,
      viewing: channelId === this.channelId && !this.holdRead(),
    });
    if (flags.unread) this.unread[channelId] = flags.unread;
    else delete this.unread[channelId];
    if (flags.mentions) this.mentions[channelId] = flags.mentions;
    else delete this.mentions[channelId];
  },
  toggleCategory(channelId: string) {
    if (this.collapsedCats.has(channelId)) this.collapsedCats.delete(channelId);
    else this.collapsedCats.add(channelId);
    this.catSeeded = true;
    localStorage.setItem("lark.categories.v1", JSON.stringify([...this.collapsedCats]));
    this.paintChannels();
    if (!this.demo && this.guildId && isTauri()) {
      void invoke("set_channel_collapsed", {
        guildId: this.guildId,
        channelId,
        collapsed: this.collapsedCats.has(channelId),
      }).catch(() => undefined);
    }
  },
  applyNotify(entries: {
    guildId?: string | null;
    muted?: boolean;
    level?: string | null;
    suppressEveryone?: boolean;
    suppressRoles?: boolean;
    channels?: { channelId?: string; muted?: boolean; level?: string | null; collapsed?: boolean }[];
  }[]) {
    for (const entry of entries) {
      const channels: GuildPref["channels"] = {};
      for (const channel of entry.channels ?? []) {
        if (!channel.channelId) continue;
        const level = channel.level === "all" || channel.level === "mentions" || channel.level === "mute" ? channel.level : null;
        channels[channel.channelId] = { muted: Boolean(channel.muted), level, collapsed: Boolean(channel.collapsed) };
        if (channel.collapsed && !this.catSeeded) this.collapsedCats.add(channel.channelId);
      }
      if (!entry.guildId) {
        this.discordNotify.dms = channels;
        this.discordNotify.dmsReady = true;
        for (const dm of this.dms()) {
          if (!channels[dm.id]) delete this.config.notifications.channels[dm.id];
        }
        for (const [id, pref] of Object.entries(channels)) this.config.notifications.channels[id] = this.overrideFromPref(pref);
        continue;
      }
      const level = entry.level === "all" || entry.level === "mentions" || entry.level === "mute" ? entry.level : null;
      this.discordNotify.guilds[entry.guildId] = {
        muted: Boolean(entry.muted),
        level,
        suppressEveryone: Boolean(entry.suppressEveryone),
        suppressRoles: Boolean(entry.suppressRoles),
        channels,
        authoritative: true,
      };
      this.config.notifications.guilds[entry.guildId] = entry.muted ? { muted: true } : { muted: false, level: level ?? undefined };
      const known = new Set(Object.keys(channels));
      for (const channel of this.channelsOf(entry.guildId)) {
        if (!known.has(channel.id)) delete this.config.notifications.channels[channel.id];
      }
      for (const [id, pref] of Object.entries(channels)) this.config.notifications.channels[id] = this.overrideFromPref(pref);
    }
    if (entries.length) this.persist();
  },
  overrideFromPref(pref: { muted: boolean; level: "all" | "mentions" | "mute" | null }): { muted: boolean; level?: NotifyLevel } {
    if (pref.muted || pref.level === "mute") return { muted: true };
    return pref.level ? { muted: false, level: pref.level } : { muted: false };
  },
  stageNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
    const muted = level === "mute";
    const pref = { muted, level: muted ? "mute" as const : level, collapsed: false };
    if (guildId && channelId) {
      const guild = this.discordNotify.guilds[guildId] ?? {
        muted: false,
        level: null,
        suppressEveryone: false,
        suppressRoles: false,
        channels: {},
      };
      const previous = guild.channels[channelId];
      guild.channels[channelId] = { ...pref, collapsed: previous?.collapsed ?? false };
      this.discordNotify.guilds[guildId] = guild;
      return;
    }
    if (guildId) {
      const guild = this.discordNotify.guilds[guildId] ?? {
        muted: false,
        level: null,
        suppressEveryone: false,
        suppressRoles: false,
        channels: {},
      };
      guild.muted = muted;
      guild.level = muted ? "mute" : level;
      this.discordNotify.guilds[guildId] = guild;
      return;
    }
    if (channelId) this.discordNotify.dms[channelId] = pref;
  },
  markReadFromEscape() {
    const current = this.channelId;
    const pending = (id: string) => (this.unread[id] ?? 0) + (this.mentions[id] ?? 0);
    if (current && pending(current) > 0) {
      this.markRead([current]);
      return;
    }
    const ids = this.visibleChannels().filter((channel) => channel.kind !== "category" && pending(channel.id) > 0).map((channel) => channel.id);
    if (ids.length) this.markRead(ids);
  },
  markRead(ids: string[]) {
    for (const id of ids) {
      this.localUnread[id] = 0;
      this.localMentions[id] = 0;
      const last = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
      this.markers[id] = { lastMessageId: last, mentionCount: 0 };
      this.refreshChannelBadge(id);
      if (!this.demo && last) void invoke("ack_message", { channelId: id, messageId: last }).catch(() => undefined);
    }
    this.badgeSent = -1;
    this.syncBadge();
    this.paint();
  },
  openInvite(code: string) {
    this.invite = { code, name: "Invite", detail: "Looking up the server…", icon: "" };
    this.paintInvite();
    if (!isTauri()) {
      this.invite.detail = "Join this server?";
      this.invite.name = "Discord server";
      this.paintInvite();
      return;
    }
    void invoke<{ guildName?: string; iconUrl?: string | null; memberCount?: number; channelName?: string }>("preview_invite", { code })
      .then((preview) => {
        if (!this.invite || this.invite.code !== code) return;
        this.invite.name = preview.guildName || "Server";
        this.invite.icon = preview.iconUrl || "";
        const count = preview.memberCount ? `${preview.memberCount} members` : "";
        const channel = preview.channelName ? `#${preview.channelName}` : "";
        this.invite.detail = [count, channel].filter(Boolean).join(" · ") || "Join this server?";
        this.paintInvite();
      })
      .catch((err) => {
        if (!this.invite || this.invite.code !== code) return;
        this.invite.detail = commandError(err, "Couldn't open that invite.");
        this.paintInvite();
      });
  },
  paintInvite() {
    this.inviteEl.hidden = !this.invite;
    clear(this.inviteEl);
    if (!this.invite) return;
    const card = el("div", "invite-card");
    card.append(el("h2", "", this.invite.name));
    if (this.invite.icon) {
      const img = el("img", "invite-icon");
      img.src = this.invite.icon;
      img.alt = "";
      card.append(img);
    }
    card.append(el("p", "lede", this.invite.detail), el("p", "hint", `discord.gg/${this.invite.code}`));
    const row = el("div", "choice-row");
    const join = el("button", "primary", "Join server");
    join.type = "button";
    const code = this.invite.code;
    join.addEventListener("click", () => {
      if (!isTauri()) {
        this.toast("Invite", "Joining a server needs the Lark app.");
        return;
      }
      join.disabled = true;
      void invoke("accept_invite", { code })
        .then(() => {
          this.toast("Joined", this.invite?.name || "Server");
          this.invite = null;
          this.paintInvite();
        })
        .catch((err) => {
          join.disabled = false;
          if (this.invite) {
            this.invite.detail = commandError(err, "Couldn't join that server.");
            this.paintInvite();
          }
        });
    });
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.invite = null;
      this.paintInvite();
    });
    row.append(join, cancel);
    card.append(row);
    this.inviteEl.append(card);
    this.inviteEl.onclick = (event) => {
      if (event.target === this.inviteEl) {
        this.invite = null;
        this.paintInvite();
      }
    };
  },
  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let listed: MediaDeviceInfo[] = [];
    try {
      listed = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    const unlabeled = listed.some((device) => device.kind === "audioinput" && !device.label);
    if (unlabeled && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
        listed = await navigator.mediaDevices.enumerateDevices();
      } catch {
        /* The picker still stores a device id once labels are available. */
      }
    }
    const map = (kind: MediaDeviceKind) =>
      listed
        .filter((device) => device.kind === kind && device.deviceId)
        .map((device) => ({ id: device.deviceId, label: device.label || device.deviceId }));
    this.audioInputs = map("audioinput");
    this.audioOutputs = map("audiooutput");
    this.videoInputs = map("videoinput");
    if (this.settings && this.section === "voice") this.renderSettings();
  },
  diagnosticsButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Copy voice diagnostics");
    button.type = "button";
    button.addEventListener("click", () => void this.copyVoiceDiagnostics());
    return button;
  },
  async copyVoiceDiagnostics() {
    if (!isTauri()) {
      this.toast("Voice", "Voice diagnostics are available in the desktop app.");
      return;
    }
    let text = "";
    try {
      text = await invoke<string>("voice_diagnostics");
    } catch (err) {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't read voice diagnostics.");
      return;
    }
    if (await writeClipboard(text)) this.toast("Copied", "Voice diagnostics are on the clipboard.");
    else this.toast("Voice", "Couldn't copy voice diagnostics.");
  },
  railIcon(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "rail-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const face = el("span", "server-face");
    face.append(icon(path));
    button.append(face, el("span", "pip"));
    button.addEventListener("click", onClick);
    return button;
  },
  railGlyph(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "rail-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const face = el("span", "server-face rail-glyph", glyph);
    button.append(face, el("span", "pip"));
    button.addEventListener("click", onClick);
    return button;
  },
  sidebarRow(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "channel-row");
    button.type = "button";
    button.append(el("span", "row-label", label));
    button.addEventListener("click", onClick);
    return button;
  },
  serverHeadButton(guild: Guild): HTMLButtonElement {
    const button = el("button", "channel-head-button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", `${guild.name} server menu`);
    button.append(el("h1", "", guild.name), el("span", "chev", "▾"));
    button.addEventListener("click", (event) => {
      const rect = button.getBoundingClientRect();
      this.openServerMenu(guild.id, rect.left, rect.bottom + 4, true);
      event.stopPropagation();
    });
    return button;
  },
  viewAsBar(guildId: string): HTMLElement {
    const role = (this.rolesByGuild[guildId] ?? []).find((item) => item.id === this.viewAsRoleId);
    const bar = el("div", "view-as-bar");
    bar.append(el("span", "", `Viewing as ${role?.name ?? "role"}`));
    const stop = el("button", "text-button", "Stop");
    stop.type = "button";
    stop.addEventListener("click", () => {
      this.viewAsRoleId = null;
      this.viewAsPermissions = "";
      this.paint();
    });
    bar.append(stop);
    return bar;
  },
  viewingAccess(guildId: string): GuildAccess | null {
    if (this.viewAsRoleId && this.guildId === guildId) {
      return {
        owner: false,
        permissions: this.viewAsPermissions,
        roles: [{ id: this.viewAsRoleId, permissions: this.viewAsPermissions }],
        myRoles: [this.viewAsRoleId],
      };
    }
    return this.access[guildId] ?? null;
  },
  channelHeading(channel: Channel): string {
    if (channel.kind === "voice" || channel.kind === "stage") return channel.name;
    if (channel.kind === "media") return channel.name;
    return `# ${channel.name}`;
  },
  closeContextMenu() {
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  },
  showMenu(x: number, y: number, items: ReturnType<typeof serverContextItems>, onPick: (id: string) => void) {
    this.closeContextMenu();
    const menu = mountMenu(x, y, items, (id) => {
      this.closeContextMenu();
      onPick(id);
    });
    this.contextMenuEl = menu;
    const closer = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      this.closeContextMenu();
      document.removeEventListener("pointerdown", closer, true);
    };
    document.addEventListener("pointerdown", closer, true);
  },
  openServerMenu(guildId: string, x: number, y: number, header = false) {
    const folders = this.folders.filter((folder) => folder.id).map((folder) => ({ id: folder.id as string, name: folder.name?.trim() || "Folder" }));
    const flags = {
      developerMode: readDeveloperMode(this.config),
      muted: this.guildMuted(guildId),
      hideMuted: this.hideMuted,
    };
    const items = header ? headerMenuItems(null, flags) : withMoveTargets(serverContextItems(flags), folders);
    this.showMenu(x, y, items, (id) => this.onServerAction(guildId, id));
  },
  onServerAction(guildId: string, id: string) {
    if (id === "mark-read") {
      const ids = this.channelsOf(guildId).filter((channel) => channel.kind !== "category").map((channel) => channel.id);
      this.markRead(ids);
      return;
    }
    if (id === "invite") {
      const channel = this.channelsOf(guildId).find((item) => item.kind === "text" || item.kind === "announcement");
      if (!channel) {
        this.toast("Invite", "This server has no text channel yet.");
        return;
      }
      void import("./channel-settings").then(({ mountInviteModal }) => mountInviteModal(this.channelHost(guildId), channel.id));
      return;
    }
    if (id === "mute") {
      this.onServerAction(guildId, this.guildMuted(guildId) ? "guild-notify:all" : "guild-notify:mute");
      return;
    }
    if (id === "hide-muted") {
      this.hideMuted = !this.hideMuted;
      localStorage.setItem("lark.hide-muted.v1", this.hideMuted ? "1" : "0");
      this.paintChannels();
      this.toast("Channels", this.hideMuted ? "Muted channels are hidden." : "Muted channels are shown.");
      return;
    }
    if (id === "settings") {
      this.openGuildSettings(guildId);
      return;
    }
    if (id === "privacy") {
      this.section = "privacy";
      this.openSettings();
      return;
    }
    if (id === "profile") {
      if (this.guildId !== guildId) this.selectGuild(guildId);
      const me = this.demo ? people[0] : this.me;
      this.openProfile(me, false, true);
      return;
    }
    if (id === "create-channel") {
      void import("./channel-settings").then(({ mountCreateChannel }) => mountCreateChannel(this.channelHost(guildId), "text"));
      return;
    }
    if (id === "create-category") {
      void import("./channel-settings").then(({ mountCreateChannel }) => mountCreateChannel(this.channelHost(guildId), "category"));
      return;
    }
    if (id === "create-event") {
      if (openCreateEvent(guildId) === "missing") this.toast("Events", "The event wizard is not available yet.");
      return;
    }
    if (id === "boost") {
      externalLink(DISCORD_LINKS.boost);
      return;
    }
    if (id === "apps") {
      this.openAppDirectory(guildId);
      return;
    }
    if (id === "copy-id") {
      void this.copyText(guildId);
      return;
    }
    if (id.startsWith("guild-notify:")) {
      const level = id.slice("guild-notify:".length) as NotifyLevel;
      this.config.notifications.guilds[guildId] = level === "mute" ? { muted: true } : { level, muted: false };
      this.stageNotify(guildId, null, level);
      this.persist();
      void this.writeNotify(guildId, null, level);
      this.toast("Notifications", `Server notifications are set to ${level}.`);
      this.paint();
      return;
    }
    if (id.startsWith("move:")) {
      const folderId = id.slice("move:".length);
      const intent = folderId === "loose" ? { kind: "end" as const } : { kind: "into-folder" as const, folderId };
      this.commitFolders(applyFolderDrop(this.guilds().map((guild) => guild.id), this.folders, { kind: "guild", id: guildId }, intent, Date.now()));
    }
  },
  openEventsEntry() {
    if (!this.guildId) return;
    this.openEvents(this.guildId);
  },
  openDiscover() {
    void import("./discover-view").then(({ openDiscover }) => {
      openDiscover({
        invoke: (command, args) => invoke(command, args),
        toast: (title, detail) => this.toast(title, detail),
        onJoined: (guildId) => {
          this.guildId = guildId;
          void this.ensureGuild(guildId);
          this.paint();
        },
      });
    });
  },
  openAddServer() {
    mountAddServer({
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      openInvite: (code) => this.openInvite(code),
      openDiscover: () => this.openDiscover(),
      onCreated: (guildId) => {
        this.guildId = guildId;
        void this.ensureGuild(guildId);
        this.paint();
      },
    });
  },
  openAppDirectory(guildId: string) {
    const guild = this.guilds().find((item) => item.id === guildId);
    void import("./app-directory-view").then(({ openAppDirectory }) => {
      openAppDirectory({
        invoke: (command, args) => invoke(command, args),
        toast: (title, detail) => this.toast(title, detail),
        guildId,
        guildName: guild?.name ?? "Server",
        onInstalled: () => this.toast("Installed", "The app was added to this server."),
      });
    });
  },
  openGuildSettings(guildId: string) {
    const opener = (globalThis as { larkOpenGuildSettings?: (guildId: string) => void }).larkOpenGuildSettings;
    if (typeof opener === "function") {
      opener(guildId);
      return;
    }
    const guild = this.guilds().find((item) => item.id === guildId);
    if (!guild) return;
    this.guildSettingsEl?.remove();
    this.guildSettingsEl = null;
    const ticket = ++this.guildSettingsTicket;
    void import("./guild-pages").then(({ mountGuildSettings }) => {
    if (ticket !== this.guildSettingsTicket) return;
    this.guildSettingsEl?.remove();
    this.guildSettingsEl = mountGuildSettings({
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      guild: () => this.guilds().find((item) => item.id === guildId) ?? guild,
      channels: () => this.channelsOf(guildId),
      me: () => ({ id: this.meId(), name: this.me.name }),
      access: () => {
        const access = this.access[guildId];
        return access ? { owner: access.owner, permissions: access.permissions } : null;
      },
      refresh: () => {
        void this.ensureGuild(guildId);
        this.paint();
      },
      close: () => {
        this.guildSettingsEl?.remove();
        this.guildSettingsEl = null;
      },
      viewAs: (roleId, permissions, name) => {
        this.viewAsRoleId = roleId;
        this.viewAsPermissions = permissions;
        this.toast("View as role", roleId ? `Viewing as ${name}` : "Stopped.");
        this.paint();
      },
      copy: (text) => this.copyText(text),
    });
    });
  },
  channelHost(guildId: string) {
    return {
      invoke: <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args),
      toast: (title: string, detail: string) => this.toast(title, detail),
      guildId,
      userId: this.meId(),
      channels: this.channelsOf(guildId),
      friends: this.friends.map((person) => ({ id: person.id, name: person.name })),
      roles: (this.rolesByGuild[guildId] ?? []).map((role) => ({ id: role.id, name: role.name })),
      copy: (text: string) => this.copyText(text),
      onChannel: (channel: Channel) => this.rememberServerChannel(guildId, channel),
    };
  },
  rememberServerChannel(guildId: string, channel: Channel) {
    const list = this.liveChannels[guildId] ?? [];
    const next = list.filter((item) => item.id !== channel.id);
    next.push(channel);
    this.liveChannels[guildId] = next;
    if (this.guildId === guildId) {
      this.paintChannels();
      if (channel.kind !== "category" && channel.kind !== "voice") void this.openChannel(channel.id);
    }
  },
  openChannelMenu(channel: Channel, x: number, y: number) {
    const items = [...channelContextItems(channel.kind, {
      developerMode: readDeveloperMode(this.config),
      muted: this.levelFor(this.guildId, channel.id) === "mute",
      hideNames: this.callView.hideNames,
    }), ...extraChannelItems(channel)];
    const favorite = (this.favorites[this.guildId ?? ""] ?? []).includes(channel.id);
    const pinned = (this.pinnedChannels[this.guildId ?? ""] ?? []).includes(channel.id);
    for (const item of items) {
      if (item.id === "favorite" && favorite) item.label = "Unfavorite";
      if (item.id === "pin-top" && pinned) item.label = "Unpin Channel";
    }
    this.showMenu(x, y, items, (id) => this.onChannelAction(channel, id));
  },
  onChannelAction(channel: Channel, id: string) {
    const guildId = this.guildId;
    if (id === "mark-read") {
      this.markRead([channel.id]);
      return;
    }
    if (id === "favorite" && guildId) {
      this.toggleFavorite(channel.id);
      return;
    }
    if (id === "invite" && guildId) {
      void import("./channel-settings").then(({ mountInviteModal }) => mountInviteModal(this.channelHost(guildId), channel.id));
      return;
    }
    if (id === "pin-top" && guildId) {
      this.toggleChannelPin(guildId, channel.id);
      return;
    }
    if (id === "copy-link" && guildId) {
      void this.copyText(channelLink(guildId, channel.id));
      return;
    }
    if (id === "copy-id") {
      void this.copyText(channel.id);
      return;
    }
    if (id === "mute") {
      const next: NotifyLevel = this.levelFor(guildId, channel.id) === "mute" ? "all" : "mute";
      this.writeChannelLevel(channel.id, next);
      return;
    }
    if (id === "join-quiet" || id === "open-chat" || id === "hide-names" || id === "set-status") {
      void this.runVoiceChannelAction(channel, id);
      return;
    }
    if (id.startsWith("notify:")) {
      this.writeChannelLevel(channel.id, id.slice("notify:".length) as NotifyLevel);
      return;
    }
    if (id === "edit" && guildId) {
      void import("./channel-settings").then(({ mountChannelEditor }) => mountChannelEditor(this.channelHost(guildId), channel));
      return;
    }
    if (id === "duplicate" && guildId) {
      const body = duplicateChannelBody(channel);
      if (!body) return;
      void invoke<Channel>("guild_admin", { request: { op: "create_channel", guildId, body } })
        .then((created) => this.rememberServerChannel(guildId, created))
        .catch((err) => this.toast("Couldn't duplicate", err instanceof Error ? err.message : "Discord refused the channel."));
      return;
    }
    if (id === "delete") {
      if (!window.confirm(`Delete #${channel.name}? This cannot be undone.`)) return;
      void invoke("guild_admin", { request: { op: "delete_channel", channelId: channel.id } })
        .then(() => {
          if (guildId) this.liveChannels[guildId] = (this.liveChannels[guildId] ?? []).filter((item) => item.id !== channel.id);
          this.toast("Channel deleted", channel.name);
          this.paintChannels();
        })
        .catch((err) => this.toast("Couldn't delete", err instanceof Error ? err.message : "Discord refused the delete."));
      return;
    }
    if ((id === "move:up" || id === "move:down") && guildId) {
      const siblings = this.channelsOf(guildId);
      const ordered = [...siblings.filter((item) => (item.parentId ?? null) === (channel.parentId ?? null))].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((item) => item.id === channel.id);
      const neighbor = ordered[id === "move:up" ? index - 1 : index + 1];
      if (!neighbor) return;
      void invoke("guild_admin", { request: { op: "patch_channel", channelId: channel.id, body: { position: neighbor.position } } })
        .then(() => {
          const previous = channel.position;
          channel.position = neighbor.position;
          neighbor.position = previous;
          this.paintChannels();
        })
        .catch((err) => this.toast("Couldn't move", err instanceof Error ? err.message : "Discord refused the move."));
    }
  },
  openCategoryMenu(category: Channel, x: number, y: number) {
    const muted = this.levelFor(this.guildId, category.id) === "mute";
    this.showMenu(x, y, categoryContextItems({ muted }), (id) => {
      if (id === "edit" && this.guildId) {
        const guildId = this.guildId;
        void import("./channel-settings").then(({ mountChannelEditor }) => mountChannelEditor(this.channelHost(guildId), category));
        return;
      }
      if (id === "delete") {
        if (!window.confirm(`Delete the ${category.name} category?`)) return;
        void invoke("guild_admin", { request: { op: "delete_channel", channelId: category.id } })
          .then(() => {
            if (this.guildId) this.liveChannels[this.guildId] = (this.liveChannels[this.guildId] ?? []).filter((item) => item.id !== category.id);
            this.paintChannels();
          })
          .catch((err) => this.toast("Couldn't delete", err instanceof Error ? err.message : "Discord refused the delete."));
        return;
      }
      if (id === "mute" || id.startsWith("notify:")) {
        const level: NotifyLevel = id === "mute" ? (muted ? "all" : "mute") : id.slice("notify:".length) as NotifyLevel;
        const ids = this.guildId ? categoryChannelIds(this.channelsOf(this.guildId), category.id) : [category.id];
        this.writeChannelLevels(ids, level);
      }
    });
  },
  writeChannelLevel(channelId: string, level: NotifyLevel) {
    this.writeChannelLevels([channelId], level);
  },
  writeChannelLevels(channelIds: string[], level: NotifyLevel) {
    const ids = [...new Set(channelIds.filter(Boolean))];
    if (!ids.length) return;
    for (const channelId of ids) {
      this.config.notifications.channels[channelId] = level === "mute" ? { muted: true } : { level, muted: false };
      this.stageNotify(this.guildId, channelId, level);
    }
    this.persist();
    void this.writeNotifyChannels(this.guildId, ids, level);
    this.toast("Notifications", `${level}.`);
    this.paint();
  },
  async writeNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
    await this.writeNotifyChannels(guildId, channelId ? [channelId] : [], level);
  },
  async writeNotifyChannels(guildId: string | null, channelIds: string[], level: NotifyLevel) {
    if (this.demo || !isTauri()) return;
    try {
      if (guildId && channelIds.length) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: channelsNotifyBody(channelIds, level) } });
      } else if (guildId) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: guildNotifyBody(level) } });
      } else if (channelIds[0]) {
        await invoke("guild_admin", { request: { op: "patch_dm_settings", body: channelNotifyBody(channelIds[0], level) } });
      }
    } catch (err) {
      this.toast("Notifications", err instanceof Error ? err.message : "Discord did not save that. Lark kept it on this device.");
    }
  },
  channelsInFolder(folderId: string): string[] {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) return [];
    const ids: string[] = [];
    for (const guildId of folder.guildIds) {
      for (const channel of this.channelsOf(guildId)) {
        if (channel.kind !== "category") ids.push(channel.id);
      }
    }
    return ids;
  },
});
