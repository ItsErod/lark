import { ME, NORTHWIND, channels as demoChannels, dms as demoDms, guilds as demoGuilds, people } from "../demo/data";
import { effectiveLevel } from "../notify";
import {
  FOLDER_COLORS,
  FOLDER_STORAGE_KEY,
  FolderSync,
  applyFolderDrop,
  folderStructureKey,
  foldersKey,
  intentFromHit,
  recolorFolder,
  renameFolder,
  type DropIntent,
  type RailHit,
} from "../folders";
import {
  canViewChannel, folderBadge, layoutRail, type ChannelOverwrite, type GuildFolder
} from "../shell";
import { folderTitle, orderUnreadFirst, peekNames, summarizeFolder, type FolderServer } from "../pack/folder-extra";
import { callTimerLabel } from "../media/call-timer";
import { volumeCeiling } from "../media/volume";
import { type MediaHost } from "../media/registry";
import { unseenChannels } from "../pack/unseen";
import { openTarget, playerTrack } from "../pack/spotify";
import { voiceBadges, voiceStatusNote } from "../voice-stage";
import type { Channel, Guild, Person } from "../types";
import {
  sortDms
} from "../members";
import {
  dmVoiceStamp, groupCallStamp,
  friendActivityText, groupMemberCount, pendingFriendCount, voiceSpotFor
} from "../social";
import { isHeldRequest } from "../message-requests";
import { playableGuildSounds } from "../soundboard";
import { participantsIn, voiceDetailLine, type VoiceParticipant } from "../voice";
import { isStageChannel } from "../voice-stage";
import { clear, colorFor, el, icon, portrait, paths } from "./dom";
import {
  DISCORD_LINKS, channelIsPrivate, hideMutedChannel, openMediaChannel,
  openStageChannel,
  orderChannels
} from "../server-model";
import { externalLink } from "./guild-settings";
import { liveBadge, signalMeter, speakWrap } from "./voice-bits";
import { isTauri, invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const railMethods = defineMethods({
  guilds(): Guild[] {
    return this.demo ? demoGuilds : this.liveGuilds;
  },
  dmChannels(): Channel[] {
    return sortDms(this.demo ? demoDms : this.liveDms);
  },
  dms(): Channel[] {
    return this.dmChannels().filter((channel) => !isHeldRequest(channel.id));
  },
  currentChannelIsDm(): boolean {
    const channel = this.currentChannel();
    return channel?.kind === "dm" || channel?.kind === "group";
  },
  channelsOf(guildId: string): Channel[] {
    const list = (this.demo ? demoChannels : this.liveChannels)[guildId] ?? [];
    if (this.demo && guildId === NORTHWIND) {
      return [
        ...list,
        {
          id: "100000000000000099",
          name: "staff",
          kind: "text",
          parentId: "100000000000000020",
          position: 50,
          overwrites: [{ id: NORTHWIND, kind: 0, allow: "0", deny: "1024" }],
        },
      ];
    }
    return list;
  },
  meId(): string {
    return this.demo ? ME : this.me.id;
  },
  railShapeSig(): string {
    const guilds = this.guilds().map((guild) => `${guild.id}:${guild.name}:${guild.iconUrl ?? ""}:${this.guildMuted(guild.id) ? "m" : ""}`).join(",");
    const folders = this.folders.map((folder) => `${folder.id ?? ""}:${folder.name ?? ""}:${folder.color ?? ""}:${folder.id ? this.folderOpen[folder.id] !== false : true}:${folder.guildIds.join(".")}`).join(";");
    const hot = this.hookOn("betterFolders") && this.pack.folderUnreadFirst
      ? this.guilds().filter((guild) => this.folderHot(guild.id)).map((guild) => guild.id).join(".")
      : "";
    return `${guilds}|${folders}|${hot}`;
  },
  railBadgeStamp(): string {
    const homeMentions = this.dms().reduce((sum, dm) => sum + (this.mentions[dm.id] ?? 0), 0);
    const homeUnread = this.dms().some((dm) => (this.unread[dm.id] ?? 0) > 0 || (this.mentions[dm.id] ?? 0) > 0);
    const guilds = this.guilds().map((guild) => {
      const badge = this.guildBadge(guild.id);
      return `${guild.id}:${badge.mentions}:${badge.count}`;
    }).join(",");
    return `${this.guildId ?? ""}|${homeMentions}:${homeUnread ? 1 : 0}|${guilds}`;
  },
  patchRail() {
    const homeMentions = this.dms().reduce((sum, dm) => sum + (this.mentions[dm.id] ?? 0), 0);
    const homeUnread = this.dms().some((dm) => (this.unread[dm.id] ?? 0) > 0 || (this.mentions[dm.id] ?? 0) > 0);
    for (const button of this.rail.querySelectorAll<HTMLElement>("[data-guild]")) {
      const id = button.dataset.guild ?? "";
      if (id === "home") {
        button.classList.toggle("is-selected", this.guildId === null);
        const unread = homeMentions > 0 || (homeUnread && this.guildId !== null);
        button.classList.toggle("has-unread", unread);
        this.setBadge(button, homeMentions);
        continue;
      }
      button.classList.toggle("is-selected", id === this.guildId);
      const badge = this.guildBadge(id);
      button.classList.toggle("has-unread", badge.mentions > 0 || badge.count > 0);
      this.setBadge(button, badge.mentions);
    }
    for (const button of this.rail.querySelectorAll<HTMLElement>("[data-folder]")) {
      const folder = this.folders.find((item) => item.id === button.dataset.folder);
      if (!folder?.guildIds) continue;
      const badge = folderBadge(folder.guildIds, (guildId) => {
        const item = this.guildBadge(guildId);
        return { mentions: item.mentions, unread: item.count };
      });
      button.classList.toggle("has-unread", badge.mentions > 0 || badge.unread);
      this.setBadge(button, badge.mentions);
      if (this.hookOn("folderStats") && folder.id) button.title = folderTitle(this.folderSummary(folder.id, folder.name?.trim() || "Folder", folder.guildIds));
    }
  },
  setBadge(button: HTMLElement, mentions: number) {
    const badge = button.querySelector(":scope > .badge");
    if (mentions > 0) {
      if (badge) badge.textContent = String(mentions);
      else button.append(el("span", "badge", String(mentions)));
      return;
    }
    badge?.remove();
  },
  paintRail() {
    if (this.holdShell) return;
    const shape = this.railShapeSig();
    if (shape === this.railShape && this.rail.querySelector("[data-guild]")) {
      const badges = this.railBadgeStamp();
      if (badges !== this.railBadges) {
        this.railBadges = badges;
        this.patchRail();
      }
      return;
    }
    this.railShape = shape;
    this.railBadges = this.railBadgeStamp();
    clear(this.rail);
    const home = el("button", `rail-button${this.guildId === null ? " is-selected" : ""}`);
    home.type = "button";
    home.dataset.guild = "home";
    home.title = "Direct messages";
    home.setAttribute("aria-label", "Direct messages");
    const homeFace = el("span", "server-face");
    homeFace.append(icon(paths.message));
    home.append(homeFace, el("span", "pip"));
    const dmMentions = this.dms().reduce((sum, dm) => sum + (this.mentions[dm.id] ?? 0), 0);
    const dmUnread = this.dms().some((dm) => (this.unread[dm.id] ?? 0) > 0 || (this.mentions[dm.id] ?? 0) > 0);
    if (dmMentions || (dmUnread && this.guildId !== null)) home.classList.add("has-unread");
    if (dmMentions) home.append(el("span", "badge", String(dmMentions)));
    home.addEventListener("click", () => this.selectGuild(null));
    const sep = el("div", "rail-sep");
    sep.setAttribute("aria-hidden", "true");
    const servers = el("div", "rail-scroll");
    servers.setAttribute("aria-label", "Server list");
    const entries = layoutRail(this.guilds().map((guild) => guild.id), this.folders);
    for (const entry of entries) {
      if (entry.kind === "guild") this.appendServerButton(servers, entry.guildId, null);
      else this.appendFolder(servers, entry);
    }
    const settings = el("button", "rail-button");
    settings.type = "button";
    settings.title = "User Settings";
    settings.setAttribute("aria-label", "User Settings");
    const settingsFace = el("span", "server-face");
    settingsFace.append(icon(paths.settings));
    settings.append(settingsFace, el("span", "pip"));
    settings.addEventListener("click", () => this.openSettings());
    const add = this.railIcon("Add a Server", paths.plus, () => this.openAddServer());
    const discover = this.railGlyph("Discover", "D", () => this.openDiscover());
    const nitro = this.railGlyph("Nitro", "N", () => externalLink(DISCORD_LINKS.nitro));
    const shop = this.railGlyph("Shop", "S", () => externalLink(DISCORD_LINKS.shop));
    const quests = this.railGlyph("Quests", "Q", () => externalLink(DISCORD_LINKS.quests));
    this.rail.append(home, sep, servers, add, discover, nitro, shop, quests, settings);
  },
  appendFolder(parent: HTMLElement, entry: { id: string; name: string; color: string | null; guildIds: string[] }) {
    const open = this.folderOpen[entry.id] !== false;
    const wrap = el("div", `folder${open ? " is-open" : ""}`);
    if (entry.color) wrap.style.setProperty("--folder", entry.color);
    const badge = folderBadge(entry.guildIds, (guildId) => {
      const item = this.guildBadge(guildId);
      return { mentions: item.mentions, unread: item.count };
    });
    const button = el("button", `server-button folder-button${open ? " is-open" : ""}`);
    button.type = "button";
    button.dataset.folder = entry.id;
    const ordered = this.hookOn("betterFolders") && this.pack.folderUnreadFirst
      ? orderUnreadFirst(entry.guildIds, (guildId) => this.folderHot(guildId))
      : entry.guildIds;
    const summary = this.folderSummary(entry.id, entry.name, entry.guildIds);
    button.title = this.hookOn("folderStats")
      ? folderTitle(summary)
      : this.hookOn("betterFolders")
        ? `${entry.name}: ${peekNames(ordered.map((guildId) => this.folderServer(guildId)))}`
        : entry.name;
    button.setAttribute("aria-label", `${entry.name} folder`);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    const face = el("span", "server-face");
    face.textContent = open ? "–" : entry.name.slice(0, 2).toUpperCase();
    if (entry.color) face.style.background = entry.color;
    button.append(face, el("span", "pip"));
    if (badge.mentions) {
      button.classList.add("has-unread");
      button.append(el("span", "badge", String(badge.mentions)));
    } else if (badge.unread) button.classList.add("has-unread");
    button.addEventListener("click", (event) => {
      if (this.consumeRailClick(event)) return;
      this.folderOpen[entry.id] = !open;
      localStorage.setItem("lark.folders.v1", JSON.stringify(this.folderOpen));
      this.paintRail();
    });
    wrap.append(button);
    if (open) {
      for (const guildId of ordered) this.appendServerButton(wrap, guildId, entry.id);
    }
    parent.append(wrap);
  },
  appendServerButton(parent: HTMLElement, guildId: string, folderId: string | null) {
    const guild = this.guilds().find((item) => item.id === guildId);
    if (!guild) return;
    const selected = guild.id === this.guildId;
    const muted = this.guildMuted(guild.id);
    const button = el("button", `server-button${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`);
    button.type = "button";
    button.dataset.guild = guild.id;
    if (folderId) button.dataset.inFolder = folderId;
    button.title = muted ? `${guild.name} (muted)` : guild.name;
    button.setAttribute("aria-label", guild.name);
    const face = el("span", "server-face");
    const iconUrl = guild.iconUrl?.trim();
    if (iconUrl) {
      button.classList.add("has-icon");
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.loading = "lazy";
      img.src = iconUrl;
      img.addEventListener("error", () => {
        img.remove();
        button.classList.remove("has-icon");
        face.textContent = guild.initials;
        face.style.background = colorFor(guild.id);
      });
      face.append(img);
    } else {
      face.textContent = guild.initials;
      face.style.background = colorFor(guild.id);
    }
    button.append(face, el("span", "pip"));
    const badge = this.guildBadge(guild.id);
    if (badge.mentions) {
      button.classList.add("has-unread");
      button.append(el("span", "badge", String(badge.mentions)));
    } else if (badge.count) button.classList.add("has-unread");
    button.addEventListener("click", (event) => {
      if (this.consumeRailClick(event)) return;
      this.selectGuild(guild.id);
    });
    parent.append(button);
  },
  ensureFolderSync(): FolderSync {
    if (this.folderSync) return this.folderSync;
    this.folderSync = new FolderSync({
      read: () => localStorage.getItem(FOLDER_STORAGE_KEY),
      write: (raw) => localStorage.setItem(FOLDER_STORAGE_KEY, raw),
      send: async (folders) => {
        if (this.demo || !isTauri()) throw new Error("offline");
        await invoke("set_guild_folders", { folders });
      },
      schedule: (ms, fn) => window.setTimeout(fn, ms),
      cancel: (id) => window.clearTimeout(id),
      onError: () => this.toast("Servers", "Discord didn't save the server order. Lark kept it on this device."),
    });
    return this.folderSync;
  },
  consumeRailClick(event: Event): boolean {
    if (!this.suppressRailClick) return false;
    this.suppressRailClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  },
  commitFolders(next: GuildFolder[]) {
    if (foldersKey(next) === foldersKey(this.folders)) return;
    const structural = folderStructureKey(next) !== folderStructureKey(this.folders);
    this.folders = next;
    if (!structural && this.rail.querySelector("[data-guild]")) {
      this.railShape = this.railShapeSig();
      this.patchFolderLabels();
    } else this.paintRail();
    if (this.demo) return;
    this.ensureFolderSync().edit(next);
  },
  patchFolderLabels() {
    for (const button of this.rail.querySelectorAll<HTMLElement>("[data-folder]")) {
      const folder = this.folders.find((item) => item.id === button.dataset.folder);
      if (!folder?.id) continue;
      const name = folder.name?.trim() || "Folder";
      const open = this.folderOpen[folder.id] !== false;
      button.title = name;
      button.setAttribute("aria-label", `${name} folder`);
      const face = button.querySelector<HTMLElement>(".server-face");
      if (face) {
        face.textContent = open ? "–" : name.slice(0, 2).toUpperCase();
        if (folder.color) face.style.background = folder.color;
        else face.style.removeProperty("background");
      }
      const wrap = button.closest<HTMLElement>(".folder");
      if (folder.color) wrap?.style.setProperty("--folder", folder.color);
      else wrap?.style.removeProperty("--folder");
    }
    for (const swatch of this.folderMenuEl?.querySelectorAll<HTMLElement>(".folder-swatch") ?? []) {
      swatch.classList.toggle("is-on", swatch.dataset.color === (this.folderMenuEl?.dataset.color ?? ""));
    }
  },
  onRailPointerDown(event: PointerEvent) {
    if (this.suppressRailClick) this.suppressRailClick = false;
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(".rail-scroll .server-button");
    if (!button) return;
    const folderId = button.dataset.folder;
    const guildId = button.dataset.guild;
    if (!folderId && !guildId) return;
    this.railDrag = {
      pointerId: event.pointerId,
      kind: folderId ? "folder" : "guild",
      id: folderId || guildId || "",
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    this.railIntent = null;
  },
  onRailPointerMove(event: PointerEvent) {
    const drag = this.railDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (dx * dx + dy * dy < 25) return;
      drag.moved = true;
      this.rail.setPointerCapture(event.pointerId);
      this.rail.classList.add("is-reordering");
      this.closeFolderMenu();
      const selector = drag.kind === "folder" ? `[data-folder="${CSS.escape(drag.id)}"]` : `[data-guild="${CSS.escape(drag.id)}"]`;
      this.rail.querySelector(selector)?.classList.add("is-dragging");
    }
    this.cueRail(event.clientY);
  },
  onRailPointerUp(event: PointerEvent) {
    const drag = this.railDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    const intent = this.railIntent;
    if (this.rail.hasPointerCapture(event.pointerId)) this.rail.releasePointerCapture(event.pointerId);
    this.railDrag = null;
    this.railIntent = null;
    this.clearRailCue();
    if (!moved || !intent) return;
    this.suppressRailClick = true;
    this.commitFolders(applyFolderDrop(this.guilds().map((guild) => guild.id), this.folders, { kind: drag.kind, id: drag.id }, intent, Date.now()));
  },
  railHits(): RailHit[] {
    const scroll = this.rail.querySelector(".rail-scroll");
    if (!scroll) return [];
    const hits: RailHit[] = [];
    for (const button of scroll.querySelectorAll<HTMLElement>(".server-button")) {
      const rect = button.getBoundingClientRect();
      if (button.dataset.folder) {
        hits.push({ role: "folder", guildId: null, folderId: button.dataset.folder, top: rect.top, bottom: rect.bottom });
      } else if (button.dataset.guild) {
        hits.push({ role: "guild", guildId: button.dataset.guild, folderId: button.dataset.inFolder ?? null, top: rect.top, bottom: rect.bottom });
      }
    }
    return hits;
  },
  cueRail(clientY: number) {
    const drag = this.railDrag;
    if (!drag?.moved) return;
    const hits = this.railHits();
    const intent = intentFromHit(hits, clientY, { kind: drag.kind, id: drag.id });
    this.railIntent = intent;
    const scroll = this.rail.querySelector<HTMLElement>(".rail-scroll");
    if (!scroll) return;
    scroll.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    const line = this.ensureDropLine(scroll);
    if (!intent || intent.kind === "onto-guild" || intent.kind === "into-folder") {
      line.hidden = true;
      if (intent?.kind === "onto-guild") scroll.querySelector(`[data-guild="${CSS.escape(intent.guildId)}"]`)?.classList.add("is-drop-target");
      else if (intent?.kind === "into-folder") scroll.querySelector(`[data-folder="${CSS.escape(intent.folderId)}"]`)?.classList.add("is-drop-target");
      return;
    }
    const edge = this.dropEdge(intent, hits, scroll);
    if (edge == null) {
      line.hidden = true;
      return;
    }
    line.hidden = false;
    line.style.top = `${edge}px`;
  },
  dropEdge(intent: DropIntent, hits: RailHit[], scroll: HTMLElement): number | null {
    const rect = scroll.getBoundingClientRect();
    const toContent = (viewport: number) => viewport - rect.top + scroll.scrollTop;
    if (intent.kind === "end") {
      const last = hits[hits.length - 1];
      return last ? toContent(last.bottom) + 4 : 4;
    }
    const hit = hits.find((item) => {
      if (intent.kind === "before-folder" || intent.kind === "after-folder") return item.role === "folder" && item.folderId === intent.folderId;
      if (intent.kind === "before-guild" || intent.kind === "after-guild") return item.role === "guild" && item.guildId === intent.guildId;
      return false;
    });
    if (!hit) return null;
    const before = intent.kind === "before-folder" || intent.kind === "before-guild";
    return toContent(before ? hit.top : hit.bottom) - 5;
  },
  ensureDropLine(scroll: HTMLElement): HTMLElement {
    let line = scroll.querySelector<HTMLElement>(".rail-drop-line");
    if (!line) {
      line = el("div", "rail-drop-line");
      line.setAttribute("aria-hidden", "true");
      scroll.append(line);
    }
    return line;
  },
  clearRailCue() {
    this.rail.classList.remove("is-reordering");
    this.rail.querySelectorAll(".is-drop-target, .is-dragging").forEach((node) => node.classList.remove("is-drop-target", "is-dragging"));
    this.rail.querySelector(".rail-drop-line")?.remove();
  },
  onRailContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const folder = target.closest<HTMLElement>("[data-folder]");
    if (folder?.dataset.folder) {
      event.preventDefault();
      this.openFolderMenu(folder.dataset.folder, event.clientX, event.clientY);
      return;
    }
    const button = target.closest<HTMLElement>("[data-guild]");
    const guildId = button?.dataset.guild;
    if (!guildId || guildId === "home") return;
    event.preventDefault();
    this.openServerMenu(guildId, event.clientX, event.clientY);
  },
  openFolderMenu(folderId: string, x: number, y: number) {
    this.closeFolderMenu();
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) return;
    const menu = el("div", "folder-menu");
    menu.dataset.folder = folderId;
    menu.dataset.color = folder.color ?? "";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Folder settings");
    const input = el("input");
    input.value = folder.name ?? "";
    input.placeholder = "Folder name";
    input.maxLength = 80;
    input.setAttribute("aria-label", "Folder name");
    input.addEventListener("input", () => this.commitFolders(renameFolder(this.folders, folderId, input.value)));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        this.closeFolderMenu();
      }
      event.stopPropagation();
    });
    const colors = el("div", "folder-colors");
    for (const color of FOLDER_COLORS) {
      const swatch = el("button", "folder-swatch");
      swatch.type = "button";
      swatch.dataset.color = color ?? "";
      swatch.title = color ?? "Default";
      swatch.setAttribute("aria-label", color ? `Color ${color}` : "Default color");
      swatch.style.background = color ?? "var(--bg-4)";
      if ((folder.color ?? "") === (color ?? "")) swatch.classList.add("is-on");
      swatch.addEventListener("click", () => {
        menu.dataset.color = color ?? "";
        this.commitFolders(recolorFolder(this.folders, folderId, color));
      });
      colors.append(swatch);
    }
    const commands = el("div", "folder-commands");
    const read = el("button", "ctx-item", "Mark As Read");
    read.type = "button";
    read.addEventListener("click", () => {
      this.markRead(this.channelsInFolder(folderId));
      this.closeFolderMenu();
    });
    commands.append(read, el("p", "folder-menu-label", "Move to"));
    for (const other of this.folders) {
      if (!other.id || other.id === folderId) continue;
      const move = el("button", "ctx-item", other.name?.trim() || "Folder");
      move.type = "button";
      move.addEventListener("click", () => {
        this.commitFolders(applyFolderDrop(
          this.guilds().map((guild) => guild.id),
          this.folders,
          { kind: "folder", id: folderId },
          { kind: "before-folder", folderId: other.id as string },
          Date.now(),
        ));
        this.closeFolderMenu();
      });
      commands.append(move);
    }
    menu.append(el("p", "folder-menu-label", "Folder"), input, colors, commands);
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 232))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 140))}px`;
    document.body.append(menu);
    this.folderMenuEl = menu;
    input.focus();
    input.select();
  },
  closeFolderMenu() {
    this.folderMenuEl?.remove();
    this.folderMenuEl = null;
  },
  guildBadge(guildId: string): { count: number; mentions: number } {
    let count = 0;
    let mentions = 0;
    if (this.guildMuted(guildId)) return { count, mentions };
    for (const channel of this.channelsOf(guildId)) {
      if (channel.kind === "category" || !this.canSeeChannel(guildId, channel)) continue;
      const level = this.levelFor(guildId, channel.id);
      if (level === "mute") continue;
      const mention = this.mentions[channel.id] ?? 0;
      const unread = this.unread[channel.id] ?? 0;
      const pending = unread || (this.behind[channel.id] ? 1 : 0);
      if (level === "mentions") mentions += mention;
      else {
        count += pending;
        mentions += mention;
      }
    }
    return { count, mentions };
  },
  folderHot(guildId: string): boolean {
    if (this.guildMuted(guildId)) return false;
    const badge = this.guildBadge(guildId);
    return badge.mentions > 0 || badge.count > 0;
  },
  folderServer(guildId: string): FolderServer {
    const guild = this.guilds().find((item) => item.id === guildId);
    const badge = this.guildBadge(guildId);
    return {
      id: guildId,
      name: guild?.name ?? "Server",
      mentions: badge.mentions,
      unread: badge.count > 0,
      muted: this.guildMuted(guildId),
    };
  },
  folderSummary(id: string, name: string, guildIds: readonly string[]) {
    return summarizeFolder(id, name, guildIds.map((guildId) => this.folderServer(guildId)));
  },
  guildMuted(guildId: string): boolean {
    const remote = this.discordNotify.guilds[guildId];
    if (remote?.authoritative) return remote.muted;
    return Boolean(remote?.muted || this.config.notifications.guilds[guildId]?.muted);
  },
  levelFor(guildId: string | null, channelId: string) {
    return effectiveLevel(this.config, guildId, channelId, this.discordNotify);
  },
  canSeeChannel(guildId: string, channel: Channel): boolean {
    const access = this.viewingAccess(guildId);
    const userId = this.meId();
    if (!canViewChannel({ userId, guildId, access, overwrites: channel.overwrites as ChannelOverwrite[] | undefined })) return false;
    if (!channel.parentId) return true;
    const parent = this.channelsOf(guildId).find((item) => item.id === channel.parentId);
    if (!parent) return true;
    return canViewChannel({ userId, guildId, access, overwrites: parent.overwrites as ChannelOverwrite[] | undefined });
  },
  selectGuild(id: string | null) {
    const previous = this.guildId;
    this.guildId = id;
    this.drawer = false;
    if (id === null) {
      this.friendsOpen = true;
      this.channelId = "";
      this.msgSig = "";
      if (!this.demo && previous) this.queueMemberSubscribe(previous, "", []);
    } else {
      this.friendsOpen = false;
      if (!this.demo) {
        this.liveMembers = this.membersByGuild[id] ?? [];
        void this.ensureGuild(id);
      }
    }
    const first = id ? this.visibleChannels().find((channel) => channel.kind === "text" || channel.kind === "announcement" || channel.kind === "forum") : undefined;
    this.paint();
    if (first) void this.openChannel(first.id);
  },
  visibleChannels(): Channel[] {
    if (!this.guildId) return this.dms();
    const guildId = this.guildId;
    return this.channelsOf(guildId).filter((channel) => this.canSeeChannel(guildId, channel));
  },
  channelShapeSig(): string {
    const list = this.guildId ? this.visibleChannels() : this.dms();
    const roster = this.guildId ? null : Object.values(this.voiceRoster);
    const bits = list.map((channel) => {
      const voice = this.guildId && channel.kind === "voice"
        ? participantsIn(this.voiceRoster, this.guildId, channel.id).map((person) => {
            const flags = voiceBadges(person);
            return `${person.userId}${flags.muted ? "m" : ""}${flags.deafened ? "d" : ""}`;
          }).join(".")
        : "";
      const elsewhere = roster && channel.kind === "dm" ? dmVoiceStamp(voiceSpotFor(roster, this.dmUserId(channel))) : "";
      const memberIds = channel.recipientIds?.length ? channel.recipientIds : (channel.recipients ?? []).map((item) => item.id);
      const members = channel.kind === "group" ? String(groupMemberCount(memberIds, this.meId())) : "";
      const groupCall = roster && channel.kind === "group" ? groupCallStamp(roster, channel.id) : "";
      const muted = this.levelFor(this.guildId && channel.kind !== "dm" && channel.kind !== "group" ? this.guildId : null, channel.id) === "mute" ? "m" : "";
      const collapsed = this.collapsedCats.has(channel.id) ? "c" : "";
      const direct = !this.guildId && (channel.kind === "dm" || channel.kind === "group");
      const preview = direct ? this.dmPreviewLabel(channel.id) : "";
      const activity = direct ? this.dmActivityLabel(channel) : "";
      const typing = this.listTyping(channel, direct)?.title ?? "";
      return `${channel.id}:${channel.name}:${channel.kind}:${channel.parentId ?? ""}:${channel.position}:${muted}:${collapsed}:${voice}:${elsewhere}:${members}:${groupCall}:${preview}:${activity}:${typing}`;
    });
    const me = this.demo ? people[0] : this.me;
    const pins = (this.pinnedChannels[this.guildId ?? ""] ?? []).join(".");
    const favs = (this.favorites[this.guildId ?? ""] ?? []).join(".");
    const timer = this.hookOn("callTimer") ? `${this.pack.callTimerFrom}:${this.pack.callTimerStyle}` : "";
    return `${this.guildId ?? ""}|${this.friendsOpen ? 1 : 0}|${this.clipsOpen ? 1 : 0}|${this.streamerOn() ? 1 : 0}|${me.id}|${me.name}|${this.voice?.channelId ?? ""}|${this.voice?.status ?? ""}|${this.voice?.muted ? 1 : 0}|${this.voice?.deafened ? 1 : 0}|${this.shareOn ? 1 : 0}|${this.stripOpen ? 1 : 0}|${this.hideMuted ? 1 : 0}|${this.viewAsRoleId ?? ""}|${timer}|${pins}|${favs}|${this.hiddenStamp()}|${this.spotifyStamp()}|${bits.join(",")}`;
  },
  patchChannelRows() {
    const me = this.demo ? people[0] : this.me;
    const dot = this.channelPane.querySelector(".profile-chip i.status");
    if (dot) dot.className = `status ${me.status ?? "online"}`;
    const line = this.channelPane.querySelector(".profile-chip .who span");
    if (line) {
      const next = this.maskText(me.custom || this.connection);
      if (line.textContent !== next) line.textContent = next;
    }
    const friends = this.channelPane.querySelector<HTMLElement>("[data-friends]");
    if (friends) {
      friends.classList.toggle("is-selected", this.friendsOpen && !this.dashboardOpen && !this.channelId && !this.clipsOpen);
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      const pending = pendingFriendCount();
      this.setBadge(friends, pending || online);
    }
    const activity = this.channelPane.querySelector<HTMLElement>("[data-activity]");
    if (activity) activity.classList.toggle("is-selected", this.dashboardHome());
    const clips = this.channelPane.querySelector<HTMLElement>("[data-clips]");
    if (clips) clips.classList.toggle("is-selected", this.clipsOpen);
    for (const node of this.channelPane.querySelectorAll<HTMLElement>("[data-channel]")) {
      const id = node.dataset.channel ?? "";
      const mentions = this.mentions[id] ?? 0;
      const unread = (this.unread[id] ?? 0) > 0 || mentions > 0;
      const quiet = !unread && Boolean(this.behind[id]);
      node.classList.toggle("is-selected", this.channelSelected(id));
      node.classList.toggle("is-unread", unread || quiet);
      this.setBadge(node, mentions);
      const userId = node.dataset.user;
      if (!userId) continue;
      const person = this.directory[userId];
      const dot = node.querySelector("i.status");
      if (dot && person) dot.className = `status ${person.status ?? "offline"}`;
    }
  },
  clipsNavButton(): HTMLButtonElement {
    const clips = el("button", `channel-row${this.clipsOpen ? " is-selected" : ""}`);
    clips.type = "button";
    clips.dataset.clips = "1";
    clips.append(icon(paths.film), el("span", "row-label", "Clips"));
    clips.addEventListener("click", () => this.openClips());
    return clips;
  },
  paintChannels() {
    if (this.holdShell) return;
    const shape = this.channelShapeSig();
    if (shape === this.channelShape && this.channelPane.querySelector(".channel-scroll")) {
      this.patchChannelRows();
      return;
    }
    this.channelShape = shape;
    const kept = this.channelPane.querySelector(".channel-scroll")?.scrollTop ?? 0;
    clear(this.channelPane);
    const head = el("div", "channel-head");
    const guild = this.guilds().find((item) => item.id === this.guildId);
    if (guild) head.append(this.serverHeadButton(guild));
    else head.append(el("h1", "", "Direct messages"));
    if (guild && this.viewAsRoleId) head.append(this.viewAsBar(guild.id));
    const scroll = el("div", "channel-scroll");
    if (!this.guildId) {
      const friends = el("button", `channel-row${this.friendsOpen && !this.dashboardOpen ? " is-selected" : ""}`);
      friends.type = "button";
      friends.dataset.friends = "1";
      friends.append(icon(paths.users), el("span", "row-label", "Friends"));
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      const pending = pendingFriendCount();
      if (pending) friends.append(el("span", "badge", String(pending)));
      else if (online) friends.append(el("span", "badge", String(online)));
      friends.addEventListener("click", () => {
        this.dashboardOpen = false;
        this.stopDashboardTick();
        this.dashboardSig = "";
        this.friendsOpen = true;
        this.returnToChat();
        this.channelId = "";
        this.drawer = false;
        this.msgSig = "";
        this.paint();
      });
      const activity = el("button", `channel-row${this.dashboardHome() ? " is-selected" : ""}`);
      activity.type = "button";
      activity.dataset.activity = "1";
      activity.append(icon(paths.bell), el("span", "row-label", "Activity"));
      activity.addEventListener("click", () => this.showActivity());
      scroll.append(friends, activity, this.clipsNavButton());
      const group = el("button", "channel-row");
      group.type = "button";
      group.append(icon(paths.plus), el("span", "row-label", "New Group DM"));
      group.addEventListener("click", () => this.openGroupCreator());
      scroll.append(group);
      this.paintDirectMessages(scroll);
    } else {
      scroll.append(this.clipsNavButton(), this.sidebarRow("Events", () => this.openEventsEntry()), this.sidebarRow("Server Boosts", () => externalLink(DISCORD_LINKS.boost)));
      const list = [...this.visibleChannels()]
        .filter((channel) => !hideMutedChannel({
          hide: this.hideMuted,
          level: this.levelFor(this.guildId, channel.id),
          selected: channel.id === this.channelId,
          kind: channel.kind,
        }))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const threads = list.filter((channel) => channel.kind === "thread");
      const categories = list.filter((channel) => channel.kind === "category");
      const categoryIds = new Set(categories.map((category) => category.id));
      const pins = this.pinnedChannels[this.guildId ?? ""] ?? [];
      const loose = orderChannels(
        list.filter((channel) => channel.kind !== "category" && channel.kind !== "thread" && (!channel.parentId || !categoryIds.has(channel.parentId))),
        pins,
      );
      const appendChannel = (channel: Channel) => {
        scroll.append(this.channelBlock(channel));
        for (const thread of threads.filter((item) => item.parentId === channel.id)) scroll.append(this.channelButton(thread, false));
      };
      const favs = list.filter((channel) => (this.favorites[this.guildId ?? ""] ?? []).includes(channel.id) && channel.kind !== "category" && channel.kind !== "thread");
      if (favs.length) {
        scroll.append(el("div", "category", "Favorites"));
        for (const channel of favs) appendChannel(channel);
      }
      for (const channel of loose) appendChannel(channel);
      for (const category of categories) {
        const children = orderChannels(
          list.filter((item) => item.parentId === category.id && item.kind !== "category" && item.kind !== "thread"),
          pins,
        );
        const collapsed = this.collapsedCats.has(category.id);
        const header = el("button", `category${collapsed ? " is-collapsed" : ""}`);
        header.type = "button";
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        header.append(el("span", "chev", collapsed ? "▸" : "▾"), el("span", "", category.name));
        header.addEventListener("click", () => this.toggleCategory(category.id));
        header.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.openCategoryMenu(category, event.clientX, event.clientY);
        });
        scroll.append(header);
        if (!collapsed) for (const channel of children) appendChannel(channel);
      }
      this.appendHiddenChannels(scroll);
    }
    const me = this.demo ? people[0] : this.me;
    const profile = el("button", "profile-chip");
    profile.type = "button";
    profile.setAttribute("aria-label", "Set a status");
    const wrap = el("div", "avatar-wrap");
    wrap.append(portrait(me.name, me.id, me.avatarUrl, true), el("i", `status ${me.status ?? "online"}`));
    const who = el("div", "who");
    who.append(el("strong", "", this.maskText(me.name)), el("span", "", this.maskText(me.custom || this.connection)));
    profile.append(wrap, who);
    profile.addEventListener("click", () => {
      if (this.statusOpen && this.popout?.id === me.id) {
        this.popout = null;
        this.statusOpen = false;
        this.paintPopout();
        return;
      }
      this.openProfile(me, true);
    });
    const gear = el("button", "icon-button user-settings");
    gear.type = "button";
    gear.title = "Settings";
    gear.setAttribute("aria-label", "Open settings");
    gear.append(icon(paths.settings));
    gear.addEventListener("click", () => this.openSettings());
    const dock = el("div", "user-dock");
    dock.append(profile, gear);
    const panel = this.voicePanel();
    const player = this.spotifyPlayer();
    const tail = [panel, player, dock].filter((node): node is HTMLElement => Boolean(node));
    this.channelPane.append(head, scroll, ...tail);
    scroll.scrollTop = kept;
    this.bindSocialMenus();
    this.scheduleSocialChrome();
  },
  channelBlock(channel: Channel): HTMLElement {
    const button = this.channelButton(channel, false);
    if ((channel.kind !== "voice" && !isStageChannel(channel)) || !this.guildId) return button;
    const people = participantsIn(this.voiceRoster, this.guildId, channel.id);
    if (!people.length) return button;
    const block = el("div", "voice-block has-people");
    block.append(button);
    const roster = el("div", "voice-roster");
    for (const person of people) roster.append(this.voiceUserRow(person));
    block.append(roster);
    return block;
  },
  channelSelected(id: string): boolean {
    if (this.friendsOpen || this.clipsOpen) return false;
    return id === this.channelId;
  },
  voiceUserRow(person: VoiceParticipant): HTMLElement {
    const badges = voiceBadges(person);
    const row = el("div", `voice-user${badges.speaking ? " is-speaking" : ""}`);
    row.dataset.voiceUser = person.userId;
    row.append(speakWrap(portrait(person.name, person.userId, person.avatarUrl, true), this.ringMotion()));
    const note = voiceStatusNote({
      self: person.userId === this.meId(),
      speaking: badges.speaking,
      sharing: person.sharing || (person.userId === this.meId() && this.shareOn),
    });
    const copy = el("span", "voice-user-copy");
    copy.append(el("span", "voice-user-name", person.name), el("span", "voice-user-sub", note));
    row.append(copy);
    const flags = el("span", "voice-flags");
    if (badges.deafened) flags.append(icon(paths.headphonesOff));
    if (badges.muted) flags.append(icon(paths.micOff));
    if (person.localMuted) flags.title = "Muted for you";
    if (person.sharing || (person.userId === this.meId() && this.shareOn)) flags.append(liveBadge(person.userId === this.meId() && this.sharePaused));
    if (flags.childElementCount) row.append(flags);
    if (person.userId !== this.meId()) {
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openVoiceMenu(person.userId, event.clientX, event.clientY);
      });
    }
    return row;
  },
  userVolumeCeiling(): number {
    return volumeCeiling(this.hookOn("volumeBoost"), this.pack.volumeCap);
  },
  callTimerText(now = Date.now()): string {
    if (!this.hookOn("callTimer") || !this.voice) return "";
    return callTimerLabel(this.pack.callTimerFrom, this.pack.callTimerStyle, this.voiceJoinedAt, this.voiceConnectedAt, now);
  },
  noteVoiceConnected() {
    if (!this.voiceConnectedAt) this.voiceConnectedAt = Date.now();
  },
  clearVoiceClock() {
    this.voiceJoinedAt = 0;
    this.voiceConnectedAt = 0;
    if (this.callTimerTick) {
      window.clearInterval(this.callTimerTick);
      this.callTimerTick = 0;
    }
  },
  armCallTimer() {
    if (this.callTimerTick) return;
    this.callTimerTick = window.setInterval(() => this.syncCallTimer(), 1000);
  },
  syncCallTimer() {
    const label = this.callTimerText();
    const node = this.root.querySelector(".voice-panel-timer");
    if (!label) {
      node?.remove();
      return;
    }
    if (!(node instanceof HTMLElement)) {
      this.channelShape = "";
      this.paintChannels();
      return;
    }
    if (node.textContent !== label) node.textContent = label;
  },
  resendVoiceMix() {
    this.sentMix.clear();
    this.syncCallMembers();
    this.paintVoiceFloats();
  },
  mediaHost(): MediaHost {
    return {
      pack: this.pack,
      savePack: () => this.savePack(),
      choice: (values, current, onPick, labels) => this.choice(values, current, onPick, labels),
      resendVoiceMix: () => this.resendVoiceMix(),
      refreshMessages: () => {
        this.msgSig = "";
        this.paintMessages();
      },
      resendPresence: () => this.pushPresence(),
    };
  },
  voicePanel(): HTMLElement {
    this.ensureVoicePrefs();
    this.bindVoiceChannelMenu();
    const session = this.voice;
    const panel = el("section", session ? "voice-panel" : "voice-panel is-resting");
    if (!session) {
      panel.setAttribute("aria-label", "Mute and deafen");
      panel.append(this.userAudioRow());
      return panel;
    }
    const status = session.status ?? "connecting";
    const audible = status === "connected" ? "Voice connected" : status === "reconnecting" ? "Reconnecting" : "Connecting";
    const timer = this.callTimerText();
    panel.setAttribute("aria-label", timer ? `${audible}, ${session.name ?? "Voice"}, ${timer}` : `${audible}, ${session.name ?? "Voice"}`);
    const line = el("div", "voice-panel-line");
    const diagnostics = this.diagnosticsButton();
    diagnostics.classList.add("voice-diagnostics");
    line.append(signalMeter(status), el("strong", "voice-panel-name", session.name ?? "Voice"), diagnostics);
    if (timer) line.append(el("time", "voice-panel-timer", timer));
    if (this.shareOn) line.append(liveBadge(this.sharePaused));
    const details = el("p", "voice-panel-details", voiceDetailLine(this.voiceDetails, status, session.detail ?? ""));
    const actions = el("div", "voice-panel-actions");
    const share = this.iconButton(this.shareOn ? "Stop sharing" : "Share your screen", paths.monitor, () => this.toggleShare(), false);
    if (this.shareOn) share.classList.add("is-live");
    const camera = this.iconButton(this.cameraOn ? "Turn off camera" : "Turn on camera", this.cameraOn ? paths.camera : paths.cameraOff, () => this.toggleCamera(), false);
    if (this.cameraOn) camera.classList.add("is-live");
    const activity = this.iconButton(this.activitiesOpen ? "Close activities" : "Activity", paths.activity, () => this.toggleActivities(), false);
    if (this.activitiesOpen) activity.classList.add("is-live");
    const sounds = this.iconButton(this.soundboardOpen ? "Close soundboard" : "Soundboard", paths.volume, () => this.toggleSoundboard(), false);
    if (this.soundboardOpen) sounds.classList.add("is-live");
    const noise = this.iconButton(
      this.config.voice.noise_suppression ? "Noise suppression on" : "Noise suppression off",
      paths.mic,
      () => this.toggleNoiseSuppression(),
      false,
    );
    if (this.config.voice.noise_suppression) noise.classList.add("is-on");
    noise.title = "Lark noise suppression (RNNoise)";
    noise.dataset.voiceNoise = "1";
    const echo = this.iconButton(
      this.echoCancellation ? "Echo cancellation on" : "Echo cancellation off",
      paths.echo,
      () => this.toggleEchoCancellation(),
      false,
    );
    if (this.echoCancellation) echo.classList.add("is-on");
    echo.title = "Echo cancellation";
    echo.dataset.voiceEcho = "1";
    const hangup = this.iconButton("Disconnect", paths.hangup, () => this.leaveVoice(), false);
    hangup.classList.add("is-disconnect");
    const strip = this.iconButton(
      this.stripOpen ? "Hide call strip" : "Show call strip",
      this.stripOpen ? paths.chevronUp : paths.chevronDown,
      () => this.setStripOpen(!this.stripOpen),
      false,
    );
    actions.append(
      share,
      camera,
      activity,
      sounds,
      noise,
      echo,
      this.iconButton(session.muted ? "Unmute" : "Mute", session.muted ? paths.micOff : paths.mic, () => this.toggleMute(), Boolean(session.muted)),
      this.deviceChevron("Input device", () => this.toggleDeviceMenu("input")),
      this.iconButton(session.deafened ? "Undeafen" : "Deafen", session.deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), Boolean(session.deafened)),
      this.deviceChevron("Output device", () => this.toggleDeviceMenu("output")),
      hangup,
      el("span", "spacer"),
      strip,
    );
    panel.append(line, details, actions);
    if (this.soundboardOpen) panel.append(this.soundboardPanel());
    if (this.deviceMenu) panel.append(this.deviceMenuPop());
    return panel;
  },
  soundboardPanel(): HTMLElement {
    const board = el("div", "voice-board");
    board.setAttribute("role", "menu");
    board.setAttribute("aria-label", "Soundboard");
    const deafened = Boolean(this.voice?.deafened);
    if (deafened) {
      board.append(el("p", "hint", "Soundboard is off while you are deafened."));
      return board;
    }
    const sounds = playableGuildSounds(this.guildSounds, this.soundToggles, false);
    board.append(el("span", "hint", "Server sounds"));
    if (!sounds.length) board.append(el("p", "hint", "No server sounds."));
    for (const sound of sounds) {
      const button = el("button", "text-button", sound.name);
      button.type = "button";
      button.addEventListener("click", () => void this.playGuildSound(sound.id));
      board.append(button);
    }
    return board;
  },
  userAudioRow(): HTMLElement {
    const row = el("div", "user-audio");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Microphone and headphones");
    const muted = this.voice?.muted ?? this.desk.muted;
    const deafened = this.voice?.deafened ?? this.desk.deafened;
    const micSlot = el("div", "user-audio-slot");
    micSlot.append(
      this.iconButton(muted ? "Unmute" : "Mute", muted ? paths.micOff : paths.mic, () => this.toggleMute(), muted),
      this.deviceChevron("Input device", () => this.toggleDeviceMenu("input")),
    );
    const deafSlot = el("div", "user-audio-slot");
    deafSlot.append(
      this.iconButton(deafened ? "Undeafen" : "Deafen", deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), deafened),
      this.deviceChevron("Output device", () => this.toggleDeviceMenu("output")),
    );
    row.append(micSlot, deafSlot);
    if (!this.voice && this.deviceMenu) row.append(this.deviceMenuPop());
    return row;
  },
  deviceChevron(label: string, onClick: () => void): HTMLButtonElement {
    const button = this.iconButton(label, paths.chevronUp, onClick, false);
    button.classList.add("device-chevron");
    return button;
  },
  channelButton(channel: Channel, dm: boolean): HTMLButtonElement {
    const muted = this.levelFor(dm ? null : this.guildId, channel.id) === "mute";
    const unreadCount = this.unread[channel.id] ?? 0;
    const mentions = this.mentions[channel.id] ?? 0;
    const unread = unreadCount > 0 || mentions > 0;
    const quiet = !unread && Boolean(this.behind[channel.id]);
    const stage = isStageChannel(channel);
    const joined = (channel.kind === "voice" || stage) && this.voice?.channelId === channel.id;
    const button = el("button", `${dm ? "dm-row" : "channel-row"}${channel.kind === "thread" ? " is-thread" : ""}${this.channelSelected(channel.id) ? " is-selected" : ""}${unread || quiet ? " is-unread" : ""}${muted ? " is-muted" : ""}${channel.kind === "voice" || stage ? " is-voice" : ""}${stage ? " is-stage" : ""}${joined ? " is-joined" : ""}`);
    button.type = "button";
    button.dataset.channel = channel.id;
    let known: Person | undefined;
    if (!dm) button.append(icon(channel.kind === "voice" || channel.kind === "stage" ? paths.volume : channel.kind === "announcement" ? paths.bell : paths.hash));
    else {
      const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
      const userId = recipient?.id && recipient.id !== this.meId() ? recipient.id : (channel.kind === "dm" ? this.dmUserId(channel) : "");
      if (userId) button.dataset.user = userId;
      known = userId ? this.directory[userId] : undefined;
      const wrap = el("div", "avatar-wrap");
      wrap.append(
        portrait(known?.name || recipient?.name || channel.name, userId || recipient?.id || channel.id, known?.avatarUrl || recipient?.avatarUrl, true),
        channel.kind === "dm" ? el("i", `status ${known?.status ?? "offline"}`) : el("i"),
      );
      button.append(wrap);
    }
    const label = el("span", "row-copy");
    label.append(el("span", "row-label", dm ? this.maskText(channel.name) : channel.name));
    if (dm && known) {
      const activity = friendActivityText(known);
      if (activity) label.append(el("span", "dm-activity", this.maskText(activity)));
    }
    if (dm && channel.kind === "group") {
      const ids = channel.recipientIds?.length ? channel.recipientIds : (channel.recipients ?? []).map((item) => item.id);
      const count = groupMemberCount(ids, this.meId());
      if (count >= 2) label.append(el("span", "dm-count", `${count} members`));
    }
    if (dm) {
      const preview = this.dmPreviewLabel(channel.id);
      if (preview) label.append(el("span", "dm-preview", preview));
    }
    button.append(label);
    if (dm && (channel.kind === "dm" || channel.kind === "group")) {
      const stamp = channel.kind === "group"
        ? groupCallStamp(Object.values(this.voiceRoster), channel.id)
        : dmVoiceStamp(this.dmUserId(channel) ? voiceSpotFor(Object.values(this.voiceRoster), this.dmUserId(channel)) : null);
      if (stamp) {
        const mark = el("span", "dm-voice");
        mark.title = stamp === "live" ? "In voice, live" : "In voice";
        mark.append(icon(paths.volume));
        if (stamp === "live") mark.append(el("span", "live-pill", "LIVE"));
        button.append(mark);
      }
    }
    const typing = this.listTyping(channel, dm);
    if (typing) {
      const mark = el("span", "typing-row", typing.label);
      mark.title = typing.title;
      button.append(mark);
    }
    if (!dm && this.guildId && channelIsPrivate(this.guildId, channel.overwrites)) button.append(el("span", "channel-lock", "🔒"));
    if (muted) button.append(el("span", "faint", "muted"));
    else if (mentions > 0) button.append(el("span", "badge", String(mentions)));
    if (dm) {
      const close = el("span", "dm-close");
      close.setAttribute("role", "button");
      close.tabIndex = 0;
      close.setAttribute("aria-label", "Close DM");
      close.textContent = "×";
      const closeConversation = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.closeDmChannel(channel);
      };
      close.addEventListener("click", closeConversation);
      close.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        closeConversation(event);
      });
      button.append(close);
    }
    if (!dm) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openChannelMenu(channel, event.clientX, event.clientY);
      });
    }
    button.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".dm-close")) return;
      this.drawer = false;
      if (channel.kind === "voice" || isStageChannel(channel)) {
        this.onVoiceChannel(channel);
        return;
      }
      if (channel.kind === "stage" && openStageChannel(channel.id)) return;
      if (channel.kind === "media" && openMediaChannel(channel.id)) return;
      void this.openChannel(channel.id);
    });
    if (dm && this.hookOn("pinDms") && this.dmPins.has(channel.id)) {
      button.classList.add("is-pinned");
      button.append(el("span", "faint", "pinned"));
    }
    if (dm) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openDmMenu(channel, event.clientX, event.clientY);
      });
    }
    return button;
  },
  hiddenStamp(): string {
    if (!this.guildId || !this.hookOn("showHidden")) return "";
    return unseenChannels(this.channelsOf(this.guildId), (channel) => this.canSeeChannel(this.guildId!, channel))
      .map((channel) => `${channel.id}:${this.pack.hiddenTopics ? channel.topic ?? "" : ""}`)
      .join(",");
  },
  appendHiddenChannels(scroll: HTMLElement) {
    if (!this.guildId || !this.hookOn("showHidden")) return;
    const hidden = unseenChannels(this.channelsOf(this.guildId), (channel) => this.canSeeChannel(this.guildId!, channel));
    if (!hidden.length) return;
    scroll.append(el("div", "category", "Hidden"));
    for (const channel of hidden) scroll.append(this.lockedChannelRow(channel));
  },
  lockedChannelRow(channel: Channel): HTMLButtonElement {
    const row = el("button", "channel-row is-locked");
    row.type = "button";
    row.title = "You can't view this channel";
    row.append(el("span", "channel-lock", "🔒"));
    const copy = el("span", "row-copy");
    copy.append(el("span", "row-label", channel.name));
    if (this.pack.hiddenTopics && channel.topic) copy.append(el("span", "dm-preview", channel.topic));
    row.append(copy);
    row.addEventListener("click", () => this.toast("Hidden channel", "You can't view this channel."));
    return row;
  },
  spotifyStamp(): string {
    const track = this.currentSpotify();
    return track ? `${track.title}:${track.artist}:${track.url}` : "";
  },
  currentSpotify() {
    if (!this.hookOn("spotify")) return null;
    const me = this.demo ? people[0] : this.me;
    const contents = this.pack.spotifyLinks && this.channelId ? (this.pages[this.channelId] ?? []).map((message) => message.content) : [];
    return playerTrack(me.activity ?? "", contents, this.pack.spotifyPresence, this.pack.spotifyLinks);
  },
  spotifyPlayer(): HTMLElement | null {
    const track = this.currentSpotify();
    if (!track) return null;
    const panel = el("section", "spotify-player");
    panel.setAttribute("aria-label", "Spotify");
    panel.append(el("strong", "", this.maskText(track.title)));
    if (track.artist) panel.append(el("span", "", this.maskText(track.artist)));
    const open = el("a", "text-button", "Open");
    open.href = openTarget(track);
    open.target = "_blank";
    open.rel = "noreferrer noopener";
    panel.append(open);
    return panel;
  },
});
