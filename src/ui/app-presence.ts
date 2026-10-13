import { mergeIncoming, outgoingNonce } from "../chat";
import { history, people } from "../demo/data";
import { dockBadge } from "../shell";
import { stepAway } from "../pack/away";
import { cleanPatterns } from "../pack/patterns";
import { awayReplyDecision } from "../pack/away-reply";
import type { GameCatalog } from "../pack/game-desk";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "../pack/playing";
import { backoff, takeDue } from "../pack/schedule";
import { gameActivityName, mediaStatusLine } from "../media/activity";
import { publishActivity } from "../pack/privacy";
import { type PluginSource } from "../plugins";
import {
  pollInterval
} from "../game";
import {
  HARDWARE_STORAGE_KEY,
  clampStatus,
  hardwareSampleDue, noteHardwareEdit,
  serializeHardwareState, stepHardware
} from "../hardware";
import type { Person, RawMessage } from "../types";
import { clearAfterAt, type ClearAfter } from "../social";
import { el } from "./dom";
import { mountChatPluginPanel } from "./chat-plugin-panels";
import { isTauri, invoke, normalizeMessage } from "./app-shared";
import { defineMethods } from "./app-shared";
import type { LarkApp } from "./app";

export const presenceMethods = defineMethods({
  appendChatPluginPanel(wrap: HTMLElement, id: string) {
    this.ensureDmPins();
    const guildId = this.guildId ?? "";
    const guildName = guildId ? this.guilds().find((guild) => guild.id === guildId)?.name ?? "" : "";
    mountChatPluginPanel(wrap, id, {
      highlightPatterns: this.pack.highlightPatterns.join("\n"),
      highlightNotify: this.pack.highlightNotify,
      guildPatterns: guildId ? (this.pack.highlightGuilds[guildId] ?? []).join("\n") : "",
      guildName,
      pinnedNames: [...this.dmPins].map((dmId) => ({ id: dmId, name: this.dms().find((channel) => channel.id === dmId)?.name ?? "Conversation" })),
      setHighlightPatterns: (value) => {
        this.pack.highlightPatterns = cleanPatterns(value);
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        if (this.settings) this.renderSettings();
      },
      setHighlightNotify: (value) => {
        this.pack.highlightNotify = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setGuildPatterns: (value) => {
        if (!guildId) return;
        const patterns = cleanPatterns(value);
        if (!patterns.length) delete this.pack.highlightGuilds[guildId];
        else this.pack.highlightGuilds[guildId] = patterns;
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        if (this.settings) this.renderSettings();
      },
      unpinDm: (dmId) => {
        this.toggleDmPin(dmId, true);
      },
      readAllMuted: this.pack.readAllMuted,
      readAllDms: this.pack.readAllDms,
      setReadAllMuted: (value) => {
        this.pack.readAllMuted = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setReadAllDms: (value) => {
        this.pack.readAllDms = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      readEverything: () => this.readEverything(),
      whoisAge: this.pack.whoisAge,
      whoisMutuals: this.pack.whoisMutuals,
      whoisJoin: this.pack.whoisJoin,
      setWhoisAge: (value) => {
        this.pack.whoisAge = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setWhoisMutuals: (value) => {
        this.pack.whoisMutuals = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setWhoisJoin: (value) => {
        this.pack.whoisJoin = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      emoteStickers: this.pack.emoteStickers,
      setEmoteStickers: (value) => {
        this.pack.emoteStickers = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      schedulePreset: String(this.pack.schedulePreset),
      setSchedulePreset: (value) => {
        const preset = Number(value);
        if (preset === 15 || preset === 60 || preset === 1440) this.pack.schedulePreset = preset;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      liveWaiting: this.liveQueue.length,
      imageLens: this.pack.imageLens,
      imageTineye: this.pack.imageTineye,
      imageYandex: this.pack.imageYandex,
      setImageLens: (value) => {
        this.pack.imageLens = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setImageTineye: (value) => {
        this.pack.imageTineye = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      setImageYandex: (value) => {
        this.pack.imageYandex = value;
        this.savePack();
        if (this.settings) this.renderSettings();
      },
      jumboSize: this.pack.jumboSize,
      setJumboSize: (value) => {
        if (value === 32 || value === 48 || value === 64 || value === 96) this.pack.jumboSize = value;
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        if (this.settings) this.renderSettings();
      },
    });
  },
  tickClock() {
    if (!this.relativeClock() || this.view !== "app") return;
    this.clock = Date.now();
    this.msgSig = "";
    this.paintMessages();
  },
  tickPlugins() {
    this.tickReminders();
    this.tickSmartNotify();
    if (this.view !== "app") return;
    this.tickAway();
    this.tickPlaying();
    this.tickMediaStatus();
    this.tickHardware();
    void this.tickSchedule();
    void this.tickLiveSchedule();
  },
  tickAway() {
    if (!this.hookOn("autoAway")) return;
    const step = stepAway(this.away, Date.now(), this.pack.awayMinutes * 60_000);
    this.away = step.state;
    if (!step.write || step.write === this.me.status) return;
    this.setStatus(step.write, this.me.custom ?? "", "plugin");
  },
  tickPlaying() {
    if (!this.hookOn("nowPlaying")) return;
    const session = navigator.mediaSession?.metadata;
    if (!session?.title) return;
    this.writePlaying(playingLine(session.title, session.artist ?? ""), false);
  },
  tickMediaStatus() {
    if (!this.hookOn("mediaStatus")) return;
    const session = navigator.mediaSession?.metadata;
    const line = mediaStatusLine(this.pack.mediaStatusSource, this.detectedGame ?? "", session?.title ?? "", session?.artist ?? "");
    if (!line) return;
    this.writePlaying(line, false, this.pack.mediaStatusReplace);
  },
  presenceGame(): string {
    if (!this.hookOn("gameActivity")) return "";
    return gameActivityName(this.pack.gameActivity, this.detectedGame ?? "");
  },
  pushPresence() {
    if (this.demo) return;
    const status = this.presenceStatus();
    const wireStatus = status === "invisible" ? "invisible" : status;
    void invoke("set_presence", { status: wireStatus, custom: this.me.custom ?? "", game: this.presenceGame() });
  },
  tickHardware() {
    if (!this.config.desktop.hardware_status) {
      if (this.hardware.enabled || this.hardware.owned) this.applyHardware(null);
      return;
    }
    this.retryHardwarePush();
    if (!isTauri() || this.demo || this.hardwareBusy || this.hardware.paused) return;
    if (!hardwareSampleDue(this.hardwareSampleAt, Date.now(), pollInterval("hardware", this.gameMode))) return;
    void this.sampleHardware(false);
  },
  retryHardwarePush() {
    if (!this.hardwarePushFailed || !isTauri() || this.demo) return;
    const custom = this.hardware.owned;
    if (!custom || (this.me.custom ?? "") !== custom) {
      this.hardwarePushFailed = false;
      return;
    }
    const now = Date.now();
    if (now - this.hardwarePushAt < 30_000) return;
    this.hardwarePushAt = now;
    const status = this.presenceStatus();
    void invoke("set_presence", { status, custom, game: this.presenceGame() }).then(() => {
      this.hardwarePushFailed = false;
    }, () => {
      this.hardwarePushFailed = true;
    });
  },
  async sampleHardware(force: boolean) {
    if (!this.config.desktop.hardware_status || !isTauri() || this.demo) return;
    if (this.hardwareBusy) return;
    if (!force && !hardwareSampleDue(this.hardwareSampleAt, Date.now(), pollInterval("hardware", this.gameMode))) return;
    this.hardwareSampleAt = Date.now();
    this.hardwareBusy = true;
    this.hardwareChecking = true;
    if (this.settings && this.section === "gaming") this.renderSettings();
    try {
      if (force) await this.persist();
      if (!this.config.desktop.hardware_status) return;
      const snap = await invoke<{ line?: string | null }>("hardware_snapshot");
      if (!this.config.desktop.hardware_status) return;
      const line = typeof snap.line === "string" ? clampStatus(snap.line) : "";
      this.hardwareLine = line;
      this.applyHardware({ ok: true, line });
    } catch {
      if (this.config.desktop.hardware_status) this.applyHardware({ ok: false, line: null });
    } finally {
      this.hardwareBusy = false;
      this.hardwareChecking = false;
      if (this.settings && this.section === "gaming") this.renderSettings();
    }
  },
  applyHardware(sample: { ok: boolean; line: string | null } | null) {
    const step = stepHardware({ ...this.hardware, enabled: this.config.desktop.hardware_status }, this.me.custom ?? "", sample);
    this.hardware = step.state;
    this.rememberHardware();
    if (step.custom === undefined) return;
    const status = this.presenceStatus();
    if ((this.me.custom ?? "") !== step.custom || this.me.status !== status) {
      this.setStatus(status, step.custom, "plugin");
    }
  },
  presenceStatus(): "online" | "idle" | "dnd" | "invisible" {
    const status = this.me.status;
    if (status === "idle" || status === "dnd" || status === "invisible" || status === "online") return status;
    return "online";
  },
  rememberHardware() {
    const saved = serializeHardwareState(this.hardware);
    if (saved) localStorage.setItem(HARDWARE_STORAGE_KEY, saved);
    else localStorage.removeItem(HARDWARE_STORAGE_KEY);
  },
  gameDeskList(): { plugin: PluginSource; catalog: GameCatalog }[] {
    if (!this.late) return [];
    const out: { plugin: PluginSource; catalog: GameCatalog }[] = [];
    for (const plugin of this.enabledPlugins()) {
      if (!plugin.hooks.gameDesk) continue;
      const catalog = this.late!.readCatalog(plugin.source);
      if (catalog) out.push({ plugin, catalog });
    }
    return out;
  },
  mountGameDeskCard(wrap: HTMLElement, plugin: PluginSource) {
    if (!this.late) {
      void this.ensureLate().then(() => {
        if (wrap.isConnected) this.mountGameDeskCard(wrap, plugin);
      });
      return;
    }
    const catalog = this.late.readCatalog(plugin.source);
    if (!catalog) {
      wrap.append(el("p", "hint", "This desk has no options."));
      return;
    }
    const settings = this.pack.gameDesks[plugin.id] ?? this.late!.emptyDesk();
    this.late!.mountGameDesk(wrap, {
      catalog,
      settings,
      clock: this.late!.sessionClock(settings.sessionStart, Date.now()),
      save: (next, repaint) => {
        this.pack.gameDesks = { ...this.pack.gameDesks, [plugin.id]: next };
        this.savePack();
        this.syncGameSessions(false);
        if (repaint && this.settings) this.renderSettings();
      },
      toggleSession: () => this.toggleDeskSession(plugin.id),
      insert: (text) => this.insertDesk(text),
      lookup: () => void this.lookupDesk(plugin.id),
    });
  },
  deskButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Desk");
    button.type = "button";
    button.setAttribute("aria-label", "Game desk");
    button.addEventListener("click", () => {
      const items = this.gameDeskList().flatMap(({ plugin, catalog }) => this.late!.deskActions(plugin.id, catalog, this.pack.gameDesks[plugin.id] ?? this.late!.emptyDesk()));
      if (!items.length) {
        this.toast("Desk", "Turn on a game plugin first.");
        return;
      }
      const rect = button.getBoundingClientRect();
      this.showMenu(rect.left, rect.bottom + 4, items, (id) => this.onDeskAction(id));
    });
    return button;
  },
  onDeskAction(actionId: string) {
    const [pluginId, action, encoded] = actionId.split(":");
    const found = this.gameDeskList().find((item) => item.plugin.id === pluginId);
    if (!found || !action) return;
    const desk = this.pack.gameDesks[pluginId] ?? this.late!.emptyDesk();
    const name = this.late!.displayName(found.catalog, desk);
    if (action === "session") {
      this.toggleDeskSession(pluginId);
      return;
    }
    if (action === "lfg") {
      this.insertDesk(this.late!.lfgText(name, desk));
      return;
    }
    if (action === "build") {
      const text = this.late!.buildText(name, found.catalog.slots, desk);
      if (!text) this.toast("Build", "Fill in a slot first.");
      else this.insertDesk(text);
      return;
    }
    if (action === "callout" && encoded) {
      this.insertDesk(decodeURIComponent(encoded));
      return;
    }
    if (action === "crew") {
      const text = this.late!.crewText(name, desk);
      if (!text) this.toast("Crew", "Add a line in the plugin settings.");
      else this.insertDesk(text);
      return;
    }
    if (action === "stats") void this.lookupDesk(pluginId);
  },
  toggleDeskSession(id: string) {
    const current = this.pack.gameDesks[id] ?? this.late!.emptyDesk();
    const running = current.sessionStart === 0;
    this.pack.gameDesks = this.late!.setSession(this.pack.gameDesks, id, running, Date.now());
    this.savePack();
    if (!running) this.clearSessionStatus();
    else this.syncGameSessions(true);
    this.armSessionClock();
    if (this.settings) this.renderSettings();
    else this.paintComposer();
  },
  insertDesk(text: string) {
    const chunk = text.trim();
    if (!chunk || !this.composer) {
      this.toast("Desk", "Nothing to insert.");
      return;
    }
    const start = this.composer.selectionStart ?? this.composer.value.length;
    const end = this.composer.selectionEnd ?? start;
    const next = `${this.composer.value.slice(0, start)}${chunk}${this.composer.value.slice(end)}`.slice(0, 2000);
    this.composer.value = next;
    const caret = Math.min(next.length, start + chunk.length);
    this.composer.focus();
    this.composer.setSelectionRange(caret, caret);
    this.toast("Desk", "It's in the composer. It sends when you send it.");
  },
  async lookupDesk(pluginId: string) {
    const found = this.gameDeskList().find((item) => item.plugin.id === pluginId);
    if (!found) return;
    const desk = this.pack.gameDesks[pluginId] ?? this.late!.emptyDesk();
    const name = this.late!.displayName(found.catalog, desk);
    const kind = this.late!.activeStatKind(found.catalog, desk);
    if (kind === "card") {
      const text = this.late!.statsCard(name, desk);
      if (!text) this.toast("Stats", "Add a line first.");
      else this.insertDesk(text);
      return;
    }
    const target = this.late!.profileTarget(kind, desk.statId);
    if (!target) {
      this.toast("Stats", found.catalog.stats?.hint || "That is not a public profile.");
      return;
    }
    if (kind === "steam" && isTauri()) {
      try {
        const xml = await invoke<string>("read_public_profile", { kind: "steam", id: desk.statId.trim() });
        const card = this.late!.parseSteamProfile(xml, target.url);
        if (card) {
          this.insertDesk(this.late!.statsCard(name, desk, card));
          return;
        }
      } catch {
        // The public page is still opened below.
      }
    }
    try {
      if (isTauri()) await invoke("open_public_profile", { kind, id: desk.statId.trim() });
      else window.open(target.url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(target.url, "_blank", "noopener,noreferrer");
    }
    const text = this.late!.statsCard(name, desk, null, target.url);
    if (text) this.insertDesk(text);
    else this.toast("Stats", "Opened the public page.");
  },
  syncGameSessions(force: boolean) {
    const now = Date.now();
    for (const { plugin, catalog } of this.gameDeskList()) {
      const desk = this.pack.gameDesks[plugin.id];
      if (!desk?.sessionStart || !desk.presence) continue;
      const line = this.late!.sessionStatusLine(this.late!.displayName(catalog, desk), desk.sessionStart, now);
      if (line) this.writeSession(line, desk.presenceReplace, force);
      return;
    }
  },
  writeSession(line: string, replace: boolean, force: boolean) {
    if (this.demo) return;
    if (!this.late!.canReplaceSession(this.me.custom ?? "", this.sessionShown, replace)) return;
    const now = Date.now();
    if (!force && !shouldWritePlaying(this.sessionShown, line, this.sessionWrite, now)) return;
    this.sessionShown = line;
    this.sessionWrite = now;
    this.setStatus(this.me.status ?? "online", line, "plugin");
  },
  clearSessionStatus() {
    if (this.sessionShown && (this.me.custom ?? "") === this.sessionShown) {
      this.setStatus(this.me.status ?? "online", "", "plugin");
    }
    this.sessionShown = "";
    this.sessionWrite = 0;
  },
  armSessionClock() {
    const live = Object.values(this.pack.gameDesks).some((desk) => desk.sessionStart > 0);
    if (!live) {
      if (this.sessionTick) window.clearInterval(this.sessionTick);
      this.sessionTick = 0;
      return;
    }
    if (this.sessionTick) return;
    this.sessionTick = window.setInterval(() => this.syncGameSessions(false), 15_000);
  },
  writePlaying(this: LarkApp, line: string, fromButton: boolean, replace = this.pack.playingReplace) {
    if (!line) {
      if (fromButton) this.toast("Now playing", "Add a track title first.");
      return;
    }
    if (!canReplaceCustom(this.me.custom ?? "", replace)) {
      if (fromButton) this.toast("Now playing", "Your custom status stays. Turn on replace if this line should take over.");
      return;
    }
    const now = Date.now();
    if (!shouldWritePlaying(this.playingShown, line, this.playingWrite, now)) {
      if (fromButton) this.toast("Now playing", "That line is already showing, or it changed a moment ago.");
      return;
    }
    this.playingShown = line;
    this.playingWrite = now;
    this.setStatus(this.me.status ?? "online", line, "plugin");
  },
  considerAwayReply(message: RawMessage) {
    if (!this.hookOn("autoReply") || this.demo || this.awayReplyBusy) return;
    const decision = awayReplyDecision({
      armed: this.pack.awayReplyArmed,
      text: this.pack.awayReplyText,
      kind: this.channelById(message.channelId)?.kind ?? "",
      authorBot: Boolean(message.authorBot),
      authorId: message.authorId,
      meId: this.meId(),
      channelId: message.channelId,
      lookingAt: message.channelId === this.channelId,
      content: message.content,
      repliedChannels: this.pack.awayReplied,
      lastSentAt: this.pack.awayReplyAt,
      now: Date.now(),
    });
    if (!decision.send) return;
    this.pack.awayReplied = [...this.pack.awayReplied, message.channelId].slice(-50);
    this.pack.awayReplyAt = Date.now();
    this.savePack();
    void this.sendAwayReply(message.channelId, decision.text);
  },
  async sendAwayReply(channelId: string, content: string) {
    if (this.awayReplyBusy) return;
    this.awayReplyBusy = true;
    try {
      await invoke("send_message", { channelId, content, replyTo: null, nonce: null, files: [] });
    } catch {
      this.pack.awayReplied = this.pack.awayReplied.filter((id) => id !== channelId);
      this.savePack();
    } finally {
      this.awayReplyBusy = false;
    }
  },
  async tickSchedule() {
    if (this.sendingScheduled) return;
    const picked = takeDue(this.pack.schedule, Date.now());
    if (!picked.due) return;
    this.sendingScheduled = true;
    this.pack.schedule = picked.rest;
    try {
      const sent = await this.postPlain(picked.due.channelId, picked.due.content);
      if (!sent) {
        const retry = backoff(picked.due, Date.now());
        if (retry) this.pack.schedule = [...this.pack.schedule, retry].sort((a, b) => a.sendAt - b.sendAt);
        else this.toast("Send later", "That message was not sent.");
      }
    } finally {
      this.sendingScheduled = false;
      this.savePack();
      this.paintComposer();
    }
  },
  storeEcho(channelId: string, message: RawMessage) {
    history[channelId] = mergeIncoming(history[channelId] ?? [], message);
    this.pages[channelId] = mergeIncoming(this.pages[channelId] ?? [], message);
    this.queueLocalIndex(channelId);
  },
  dropEcho(channelId: string, localId: string) {
    const keep = (item: RawMessage) => item.id !== localId && item.nonce !== localId;
    history[channelId] = (history[channelId] ?? []).filter(keep);
    this.pages[channelId] = (this.pages[channelId] ?? []).filter(keep);
    this.forgetLocalMessage(channelId, localId, localId);
  },
  async postPlain(channelId: string, content: string): Promise<boolean> {
    const localId = outgoingNonce();
    const message: RawMessage = {
      id: localId,
      nonce: localId,
      channelId,
      authorId: this.meId(),
      authorName: this.demo ? "Ethan Park" : this.me.name,
      content,
      timestamp: new Date().toISOString(),
    };
    this.storeEcho(channelId, message);
    if (!this.demo) {
      try {
        const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
          channelId,
          content,
          replyTo: null,
          nonce: localId,
          files: [],
        }));
        this.storeEcho(channelId, { ...sent, nonce: sent.nonce || localId });
      } catch {
        if ((this.pages[channelId] ?? []).some((item) => item.id === localId)) {
          this.dropEcho(channelId, localId);
          return false;
        }
      }
    }
    if (channelId === this.channelId) {
      this.msgSig = "";
      this.scroll = "bottom";
      this.pinnedToBottom = true;
      this.paintMessages();
    }
    return true;
  },
  setStatus(status: NonNullable<Person["status"]>, custom: string, source: "user" | "plugin" = "user", extra?: { emoji: string; emojiId?: string | null; animated?: boolean; clearAfter: ClearAfter }) {
    if (!publishActivity(this.hookOn("incognito"), this.pack.privacy.incognitoHideActivity, source)) return;
    if (source === "user") {
      this.hardware = noteHardwareEdit(this.hardware, custom);
      if (!custom.trim() && this.config.desktop.hardware_status) this.hardwareSampleAt = 0;
      this.rememberHardware();
    }
    const emoji = extra?.emoji ?? (source === "user" ? this.statusEmoji : "");
    const emojiId = extra ? (extra.emojiId ?? null) : this.statusEmojiId;
    const animated = extra ? Boolean(extra.animated && emojiId) : this.statusEmojiAnimated;
    const clearAt = extra ? clearAfterAt(extra.clearAfter, Date.now()) : this.statusClearAt;
    if (source === "user" && extra) {
      this.statusEmoji = emoji;
      this.statusEmojiId = emojiId;
      this.statusEmojiAnimated = animated;
      this.statusClearAt = clearAt;
    }
    const changed = this.me.status !== status || (this.me.custom ?? "") !== custom || (extra ? this.me.statusEmoji !== emoji || this.me.statusClearAt !== clearAt : false);
    this.me = { ...this.me, status, custom, statusEmoji: source === "user" ? emoji : this.me.statusEmoji, statusClearAt: source === "user" ? clearAt : this.me.statusClearAt };
    if (source === "user" && (status === "online" || status === "idle" || status === "dnd" || status === "invisible")) {
      this.away = { ...this.away, savedStatus: status, away: status === "idle" };
    }
    if (this.demo) {
      people[0].status = status;
      people[0].custom = custom;
    } else if (changed) {
      const wireStatus = status === "invisible" ? "invisible" : status;
      const pending = extra
        ? invoke("set_custom_status", { status: wireStatus, custom, emoji, emojiId, animated, expiresAt: clearAt, game: this.presenceGame() })
        : invoke("set_presence", { status: wireStatus, custom, game: this.presenceGame() });
      if (source === "plugin" && this.hardware.enabled && custom === this.hardware.owned) {
        this.hardwarePushFailed = true;
        this.hardwarePushAt = Date.now();
        void pending.then(() => {
          this.hardwarePushFailed = false;
        }, () => {
          this.hardwarePushFailed = true;
        });
      } else {
        void pending.catch(() => undefined);
      }
    }
    if (source === "plugin") {
      this.paintChannels();
      this.paintMembers();
      return;
    }
    this.popout = this.me;
    this.paintChannels();
    this.paintPopout();
    this.paintMembers();
  },
  syncBadge() {
    const entries: { mentions: number; unread: number; dm: boolean }[] = [];
    for (const dm of this.dms()) {
      entries.push({ mentions: this.mentions[dm.id] ?? 0, unread: this.unread[dm.id] ?? 0, dm: true });
    }
    for (const guild of this.guilds()) {
      if (this.guildMuted(guild.id)) continue;
      for (const channel of this.channelsOf(guild.id)) {
        if (channel.kind === "category" || !this.canSeeChannel(guild.id, channel)) continue;
        if (this.levelFor(guild.id, channel.id) === "mute") continue;
        entries.push({ mentions: this.mentions[channel.id] ?? 0, unread: this.unread[channel.id] ?? 0, dm: false });
      }
    }
    const count = this.config.preferences.unread_badge === false ? 0 : dockBadge(entries);
    if (count === this.badgeSent) return;
    this.badgeSent = count;
    if (isTauri()) void invoke("set_unread", { count }).catch(() => undefined);
  },
});
