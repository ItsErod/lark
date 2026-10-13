import { channelIsBehind } from "../chat";
import { people } from "../demo/data";
import { frecency } from "../emoji";
import { plainPreview } from "../mentions";
import { isBookmarked, toggleBookmark } from "../pack/bookmarks";
import { toggleHidden } from "../pack/hidden";
import { cleanWords } from "../pack/keywords";
import { setLocalNick } from "../pack/nicks";
import { folderTitle } from "../pack/folder-extra";
import { cleanAwayText } from "../pack/away-reply";
import { themeAttributeLines, themeAttributeText } from "../pack/theme-attrs";
import { playingLine } from "../pack/playing";
import { formatRelative } from "../pack/relative";
import { cancelSend, queueSend } from "../pack/schedule";
import { settingsFor, type PackState } from "../pack/state";
import { downloadName, originalImageUrl } from "../media/files";
import { renderMediaPanel } from "../media/registry";
import { findLog, logView, recordDelete, recordEdit } from "../pack/logger";
import { holdRead as privacyHoldRead, panicPlan } from "../pack/privacy";
import type { HourCycle, TimeMode } from "../pack/time";
import { messageMarkdown } from "../pack/markdown";
import { addTemplate, insertTemplate, removeTemplate } from "../pack/replies";
import { personalLine } from "../privacy";
import { reminderFor } from "../reminders";
import { enabledSources, type PluginHooks, type PluginSource } from "../plugins";
import { type ViewMessage } from "../render/message";
import { formatShortcut, matchShortcut, shortcutFromEvent } from "../shortcuts";
import type { Channel, NotifyLevel, RawMessage } from "../types";
import { roleColor } from "../members";
import {
  voiceSpotFor
} from "../social";
import * as socialApi from "../social";
import type { ParityHost, ThreadIndexWire } from "../threads";
import { loadThreadsUi, threadsNow } from "./lazy-threads";
import { rowEstimate } from "../virtual";
import { clear, el } from "./dom";
import { mountPrivacyPanel } from "./privacy-panels";
import {
  type MenuEntry
} from "../server-model";
import {
  armForward, commandsFromPayload, interactionBody,
  markUnreadPlan,
  messageLink, pickQuickReactions,
  readBlockedIds,
  readDeveloperMode,
  readRevealSpoilers,
  readShowEmbeds, requestCreateThread, type SlashCommand
} from "./composer-tools";
import { isTauri, invoke, localInputValue, rgbToHex, normalizeChannel } from "./app-shared";
import { defineMethods } from "./app-shared";

export const messageToolMethods = defineMethods({
  paintTheme() {
    let overlay = document.getElementById("lark-theme-editor");
    if (!this.themeOpen) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = el("div", "overlay");
      overlay.id = "lark-theme-editor";
      this.root.append(overlay);
    }
    clear(overlay);
    const card = el("div", "theme-editor");
    card.append(el("h2", "", "Theme editor"), el("p", "hint", "Export from Appearance to save these colours as CSS or JSON."));
    const preview = el("div", "theme-preview");
    preview.append(el("strong", "", "Northwind"), el("p", "", "The mark sits on ink. Unread stays apricot."));
    const fields: [string, string][] = [
      ["--bg-0", "#12110f"],
      ["--bg-2", "#221f1b"],
      ["--text", "#f3efe7"],
      ["--accent", "#e2a15a"],
    ];
    for (const [name, fallback] of fields) {
      const row = el("label", "theme-field");
      row.append(el("span", "", name));
      const input = el("input");
      input.type = "color";
      input.value = rgbToHex(getComputedStyle(this.root).getPropertyValue(name)) || fallback;
      input.addEventListener("input", () => {
        this.root.style.setProperty(name, input.value);
        preview.style.setProperty(name, input.value);
        if (name === "--accent" && this.guildId) {
          this.config.accents[this.guildId] = input.value;
          this.persist();
        }
      });
      row.append(input);
      card.append(row);
    }
    card.append(preview);
    const close = el("button", "primary", "Done");
    close.type = "button";
    close.addEventListener("click", () => {
      this.themeOpen = false;
      this.paintTheme();
    });
    card.append(close);
    overlay.append(card);
    overlay.onclick = (event) => {
      if (event.target === overlay) {
        this.themeOpen = false;
        this.paintTheme();
      }
    };
  },
  paintPopout() {
    let pop = document.getElementById("lark-popout");
    if (!this.popout) {
      pop?.remove();
      return;
    }
    if (!pop) {
      pop = el("div", "profile-layer");
      pop.id = "lark-popout";
      this.root.append(pop);
    }
    if (!this.late) {
      void this.ensureLate().then(() => this.paintPopout());
      return;
    }
    const person = this.popout;
    const details = this.wireProfile?.id === person.id ? this.wireProfile : null;
    const sample = this.demo && !details ? this.late!.sampleProfile(person) : null;
    const roles = this.profileRoles(person);
    const mutualNames = (details?.mutualGuilds ?? [])
      .map((guild) => this.guilds().find((item) => item.id === guild.id)?.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8);
    const personView = this.streamerOn()
      ? { ...person, name: this.maskText(person.name), custom: this.maskText(person.custom ?? ""), activity: person.activity ? this.maskText(person.activity) : person.activity, statusEmoji: this.maskText(person.statusEmoji ?? "") }
      : { ...person, statusEmoji: person.id === this.meId() ? this.statusEmoji || person.statusEmoji : person.statusEmoji };
    const knownFriend = person.id === this.meId() || this.friends.some((item) => item.id === person.id) || this.relationships.some((item) => item.id === person.id && item.kind === "friend");
    const spot = voiceSpotFor(Object.values(this.voiceRoster), person.id);
    this.late!.renderProfileCard(pop, {
      person: personView,
      self: person.id === this.meId(),
      statusPicker: this.statusOpen && person.id === this.meId(),
      roles: roles.length ? roles : (sample ? this.late!.sampleRoles() : []),
      statusEmojis: this.statusOpen && person.id === this.meId() ? this.statusEmojiSource() : undefined,
      placement: this.profileFull ? "full" : "modal",
      profileTab: this.profileTab,
      serverEditor: this.serverEditor && person.id === this.meId(),
      details: details ? {
        id: personalLine(details.id, this.streamerOn()),
        name: this.maskText(details.name),
        username: this.maskText(details.username),
        avatarUrl: details.avatarUrl,
        bannerUrl: details.bannerUrl,
        accent: details.accent,
        bio: this.maskText(details.bio ?? ""),
        pronouns: this.maskText(details.pronouns ?? ""),
        nick: details.nick ? this.maskText(details.nick) : details.nick,
        mutualNames,
        mutualGuilds: details.mutualGuilds?.length ?? 0,
        mutualFriends: details.mutualFriends ?? 0,
        mutualFriendsList: (details.mutualFriendsList ?? []).map((friend) => ({ id: friend.id, name: this.maskText(friend.name) })),
        joinedAt: details.joinedAt,
        badges: (details.badges ?? []).map((badge) => ({ ...badge, description: this.maskText(badge.description) })),
        widgets: (details.widgets ?? []).map((widget) => ({ ...widget, name: this.maskText(widget.name) })),
        serverTag: details.serverTag ?? person.serverTag ?? null,
      } : sample,
    }, {
      onClose: () => {
        this.popout = null;
        this.statusOpen = false;
        this.profileFull = false;
        this.profileTab = "about";
        this.serverEditor = false;
        this.wireProfile = null;
        this.paintPopout();
      },
      onMessage: person.id === this.meId() ? undefined : () => {
        this.popout = null;
        this.paintPopout();
        void this.openDm(person.id);
      },
      onStatus: (status, custom, extra) => this.setStatus(status, custom, "user", extra),
      note: this.streamerOn() ? "" : (this.notes[person.id] ?? ""),
      onNote: this.streamerOn() || person.id === this.meId() ? undefined : (note) => this.saveNote(person.id, note),
      onAddFriend: knownFriend ? undefined : () => void this.changeRelationship(person.id, "friend"),
      onJoinVoice: spot ? () => this.joinFriendVoice(person.id) : undefined,
      onWatchStream: spot?.sharing || person.rich?.live ? () => this.watchFriend(person.id) : undefined,
      onOpenFull: this.profileFull ? undefined : () => {
        this.profileFull = true;
        this.profileTab = "about";
        this.paintPopout();
      },
      onBack: this.profileFull ? () => {
        this.profileFull = false;
        this.paintPopout();
      } : undefined,
      onProfileTab: (tab) => {
        this.profileTab = tab;
      },
      onSaveServerProfile: (nick, bio, avatar) => void this.saveServerProfile(nick, bio, avatar),
      slots: this.profileSlots(person),
    });
  },
  enabledPlugins(): PluginSource[] {
    return enabledSources(this.config.plugins.enabled, this.loaded);
  },
  hookOn(flag: keyof PluginHooks): boolean {
    return this.enabledPlugins().some((plugin) => plugin.hooks[flag] === true);
  },
  holdRead(): boolean {
    return privacyHoldRead(this.hookOn("incognito"), this.pack.privacy.incognitoHoldRead);
  },
  hideActivity(): boolean {
    return this.hookOn("incognito") && this.pack.privacy.incognitoHideActivity;
  },
  tryPanic(event: KeyboardEvent): boolean {
    if (!this.hookOn("panicKey")) return false;
    if (!matchShortcut(event, this.pack.privacy.panicKey, this.platform.os)) return false;
    event.preventDefault();
    void this.runPanic();
    return true;
  },
  async runPanic() {
    const root = document.documentElement;
    if (root.classList.contains("is-panic")) {
      root.classList.remove("is-panic");
      if (isTauri()) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        await win.show();
        await win.unminimize();
        await win.setFocus();
      }
      return;
    }
    const plan = panicPlan(this.pack.privacy.panicAction, this.pack.privacy.panicMute);
    if (plan.mute) this.forceMute();
    root.classList.add("is-panic");
    if (!isTauri()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (plan.action === "minimize") await win.minimize();
    else await win.hide();
  },
  forceMute() {
    if (!this.voice || (this.voice.muted && this.voice.deafened)) return;
    this.voice.muted = true;
    this.voice.deafened = true;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  },
  quickReactionEmoji(): string[] {
    for (const plugin of this.enabledPlugins()) {
      if (plugin.hooks.quickReactions.length) return plugin.hooks.quickReactions;
    }
    return [];
  },
  pluginSettings(channelId: string): Record<string, Record<string, string>> {
    const settings: Record<string, Record<string, string>> = {};
    for (const plugin of this.enabledPlugins()) {
      const record = settingsFor(this.pack, plugin.id, channelId, this.guildForChannel(channelId) ?? "");
      if (plugin.id === "streamer-safe") {
        const channel = this.channelById(channelId);
        const direct = channel?.kind === "dm" || channel?.kind === "group";
        record.active = this.streamerSafeOn() ? "1" : "0";
        record.direct = direct ? "1" : "0";
        record.dms = this.pack.privacy.streamerDms ? "1" : "0";
        record.emails = this.pack.privacy.streamerEmails ? "1" : "0";
        record.phones = this.pack.privacy.streamerPhones ? "1" : "0";
        record.ids = this.pack.privacy.streamerIds ? "1" : "0";
      }
      if (plugin.id === "clean-links") record.receive = this.pack.privacy.cleanOnClick ? "1" : "0";
      if (Object.keys(record).length) settings[plugin.id] = record;
    }
    return settings;
  },
  async saveRemote(url: string, name: string) {
    const filename = downloadName(name, "download");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("status");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.click();
    }
  },
  viewOriginal(url: string, name: string) {
    const original = originalImageUrl(url);
    if (!original) {
      this.toast("Image", "That image doesn't have a full-size link.");
      return;
    }
    if (this.pack.originalImageAction !== "download") {
      this.lightbox = original;
      this.paintLightbox();
    }
    if (this.pack.originalImageAction !== "open") void this.saveRemote(original, name);
  },
  messageChrome(message: RawMessage, view: ViewMessage) {
    const roles = this.guildId ? this.rolesByGuild[this.guildId] ?? [] : [];
    const member = [this.me, ...this.liveMembers].find((person) => person.id === message.authorId);
    const roleIds = message.authorRoleIds?.length ? message.authorRoleIds : member?.roleIds;
    const copy = (title: string, text: string) => {
      const write = navigator.clipboard?.writeText(text);
      if (!write) {
        this.toast(title, "Couldn't copy that.");
        return;
      }
      void write.then(() => this.toast(title, "Copied.")).catch(() => this.toast(title, "Couldn't copy that."));
    };
    return {
      now: this.clock,
      quickReactions: pickQuickReactions(this.quickReactionEmoji(), frecency(this.emojiUses, this.clock || Date.now()).map((item) => item.emoji.split(":")[0])),
      bookmarked: isBookmarked(this.pack.bookmarks, message.channelId, message.id),
      quiet: this.gameMode,
      reminded: Boolean(reminderFor(this.reminders, message.channelId, message.id)),
      translated: Boolean(this.translated[message.id]),
      authorColor: roleColor(roleIds, roles) || member?.color || null,
      blocked: readBlockedIds().has(message.authorId),
      developerMode: readDeveloperMode(this.config),
      pinned: Boolean(message.pinned),
      showEmbeds: readShowEmbeds(this.config),
      revealSpoilers: readRevealSpoilers(this.config),
      onBookmark: () => this.onBookmark(message),
      onRemind: () => this.beginReminder(message),
      onTranslate: view.effects.includes("translate") ? () => void this.onTranslate(message) : undefined,
      onHideAuthor: this.hookOn("hideUsers") ? () => this.onHideAuthor(message) : undefined,
      downloadScope: view.effects.includes("voice-download") ? this.pack.voiceDownloadScope : undefined,
      onDownload: view.effects.includes("voice-download") ? (url: string, name: string) => void this.saveRemote(url, name) : undefined,
      originalAction: view.effects.includes("original-image") ? this.pack.originalImageAction : undefined,
      onOriginal: view.effects.includes("original-image") ? (url: string, name: string) => this.viewOriginal(url, name) : undefined,
      onYoutube: view.effects.includes("youtube-pip") ? (url: string) => this.openYoutube(url) : undefined,
      onForward: () => {
        armForward({
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId ?? this.guildId,
          authorName: message.authorName,
          preview: plainPreview(message.content, this.renderContext(), 80),
        });
        this.paintComposer();
      },
      onCopyText: () => copy("Copy Text", message.content || ""),
      onCopyLink: () => copy("Copy Message Link", messageLink(message.guildId ?? this.guildId, message.channelId, message.id)),
      onSpeak: () => {
        const text = (message.content || "").replace(/<a?:(\w+):\d+>/g, "$1").trim();
        if (!text || typeof speechSynthesis === "undefined") {
          this.toast("Speak Message", "Nothing to read aloud.");
          return;
        }
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(text.slice(0, 500)));
      },
      onCopyId: () => copy("Copy Message ID", message.id),
      onMarkUnread: () => {
        const channelId = message.channelId;
        const ids = (this.pages[channelId] ?? []).map((item) => item.id);
        const plan = markUnreadPlan(ids, message.id);
        this.divider[channelId] = message.id;
        this.lastRead[channelId] = plan.ackId;
        this.markers[channelId] = { lastMessageId: plan.ackId, mentionCount: this.markers[channelId]?.mentionCount ?? 0 };
        this.localUnread[channelId] = plan.count;
        this.unread[channelId] = plan.count;
        this.msgSig = "";
        this.paintMessages();
        if (!this.demo && /^\d{5,22}$/.test(plan.ackId)) void invoke("ack_message", { channelId, messageId: plan.ackId }).catch(() => undefined);
      },
      onCreateThread: () => {
        if (!requestCreateThread(message.channelId, message.id)) this.toast("Create Thread", "Threads aren't available yet.");
      },
      onShowPins: () => {
        this.pinsOpen = true;
        this.paintPins();
      },
      loadApps: async () => {
        if (this.demo || !message.channelId) return [];
        const payload = await invoke<unknown>("search_app_commands", {
          guildId: message.guildId ?? this.guildId,
          channelId: message.channelId,
          query: "",
          kind: 3,
        });
        return commandsFromPayload(payload).filter((command) => (command.type || 1) === 3);
      },
      onRunApp: (command: SlashCommand) => {
        const body = interactionBody({
          command,
          channelId: message.channelId,
          guildId: message.guildId ?? this.guildId,
          args: "",
          targetId: message.id,
        });
        if (!body || this.demo) {
          this.toast("Apps", "That app command isn't available here.");
          return;
        }
        void invoke("invoke_command", { payload: body }).catch((err) => {
          this.toast("Apps", err instanceof Error ? err.message : "Discord refused the command.");
        });
      },
      loadReactors: async (emoji: string, emojiId?: string | null) => {
        if (this.demo) {
          const reaction = message.reactions?.find((item) => item.emoji === emoji);
          return reaction?.me ? [{ id: this.meId(), name: this.me.name || "You" }] : [];
        }
        return invoke<{ id: string; name: string }[]>("reaction_users", {
          channelId: message.channelId,
          messageId: message.id,
          emoji,
          emojiId: emojiId ?? null,
        });
      },
    };
  },
  messageMenuItems(message: RawMessage): MenuEntry[] {
    const items: MenuEntry[] = [];
    if (this.hookOn("inlineTranslate")) items.push({ id: "translate", label: this.translated[message.id] ? "Show original" : "Translate" });
    if (this.hookOn("copyMarkdown")) items.push({ id: "copy-md", label: "Copy Markdown" });
    if (this.hookOn("replyChain") && message.reply) items.push({ id: "reply-chain", label: "Reply chain" });
    if (this.hookOn("showConnections")) items.push({ id: "connections", label: "Connections" });
    if (this.hookOn("localNicks")) items.push({ id: "local-nick", label: "Local nickname" });
    return items;
  },
  bindMessageMenu(node: HTMLElement, message: RawMessage) {
    const items = this.messageMenuItems(message);
    if (!items.length) return;
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showMenu(event.clientX, event.clientY, items, (id) => {
        void this.onMessageMenu(message, id);
      });
    });
  },
  async onMessageMenu(message: RawMessage, id: string) {
    if (id === "translate") await this.onInlineTranslate(message);
    if (id === "copy-md") await this.copyMessageMarkdown(message);
    if (id === "reply-chain") this.openReplyChain(message);
    if (id === "connections") await this.openConnections(message);
    if (id === "local-nick") {
      this.nickTarget = { id: message.authorId, name: message.authorName };
      this.paintComposer();
    }
  },
  repliesButton(): HTMLButtonElement {
    const replies = el("button", "text-button", "Replies");
    replies.type = "button";
    replies.setAttribute("aria-label", "Insert a saved reply");
    replies.addEventListener("click", () => {
      if (!this.pack.templates.length) {
        this.toast("Replies", "Save one in the plugin settings.");
        return;
      }
      const rect = replies.getBoundingClientRect();
      this.showMenu(rect.left, rect.bottom + 4, this.pack.templates.map((item) => ({ id: item.id, label: item.label })), (id) => {
        const template = this.pack.templates.find((item) => item.id === id);
        if (!template) return;
        const start = this.composer.selectionStart ?? this.composer.value.length;
        const end = this.composer.selectionEnd ?? start;
        const next = insertTemplate(this.composer.value, start, end, template.body);
        this.composer.value = next.text;
        this.composer.focus();
        this.composer.setSelectionRange(next.caret, next.caret);
      });
    });
    return replies;
  },
  async copyMessageMarkdown(message: RawMessage) {
    const text = messageMarkdown(message, this.pack.copyMeta);
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", "Message markdown is on the clipboard.");
    } catch {
      this.toast("Copy", "Couldn't copy that message.");
    }
  },
  async onInlineTranslate(message: RawMessage) {
    if (this.translated[message.id]) {
      delete this.translated[message.id];
      this.msgSig = "";
      this.paintMessages();
      return;
    }
    const { translateInline } = await import("../pack/inline-translate");
    const result = await translateInline({
      text: message.content,
      source: this.pack.inlineSource,
      target: this.pack.inlineLang,
      glossary: this.pack.glossary,
      prefer: this.pack.inlinePrefer,
    });
    if (result.via === "original") {
      this.toast("Translate", "No translation for that line.");
      return;
    }
    this.translated[message.id] = result.text;
    this.msgSig = "";
    this.paintMessages();
  },
  messageExtras(message: RawMessage): { log?: { deleted: boolean; history: string[] } } {
    if (!this.hookOn("messageLog")) return {};
    const view = logView(findLog(this.pack.messageLog, message.channelId, message.id), this.pack.logDeleted, this.pack.logEdits);
    return view ? { log: view } : {};
  },
  timeClock(): { mode: TimeMode; hours: HourCycle } | undefined {
    if (!this.hookOn("betterTime")) return undefined;
    return { mode: this.pack.timeMode, hours: this.pack.timeHours };
  },
  relativeClock(): boolean {
    return this.hookOn("relativeTime") || (this.hookOn("betterTime") && this.pack.timeMode === "relative");
  },
  logStamp(): string {
    if (!this.hookOn("messageLog")) return "";
    return this.pack.messageLog.map((entry) => `${entry.id}:${entry.deleted ? 1 : 0}:${entry.edits.length}`).join(".");
  },
  noteLoggedEdit(message: RawMessage, previous: string, next: string) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordEdit(this.pack.messageLog, message, previous, next, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
  },
  noteLoggedDelete(message: RawMessage) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordDelete(this.pack.messageLog, message, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
  },
  savePack() {
    localStorage.setItem("lark.pack.v1", JSON.stringify(this.pack));
  },
  async setPluginEnabled(id: string, enabled: boolean) {
    if (enabled) {
      const ok = await this.ensurePlugin(id);
      if (!ok) {
        this.toast("Plugin", `${id} could not be loaded.`);
        return;
      }
      if (!this.config.plugins.enabled.includes(id)) this.config.plugins.enabled = [...this.config.plugins.enabled, id];
    } else {
      this.config.plugins.enabled = this.config.plugins.enabled.filter((item) => item !== id);
    }
    this.persist();
    this.msgSig = "";
    if (id === "volume-booster") this.resendVoiceMix();
    this.paint();
  },
  appendPluginPanel(wrap: HTMLElement, id: string) {
    const desk = this.enabledPlugins().find((plugin) => plugin.id === id);
    if (desk?.hooks.gameDesk) {
      this.mountGameDeskCard(wrap, desk);
      return;
    }
    if (renderMediaPanel(wrap, id, this.mediaHost())) return;
    const privacy = mountPrivacyPanel(id, this.pack.privacy, {
      save: (patch) => {
        this.pack.privacy = { ...this.pack.privacy, ...patch };
        this.savePack();
        this.msgSig = "";
        this.paint();
      },
      formatKey: (shortcut) => formatShortcut(shortcut, this.platform.os),
      captureKey: (event) => shortcutFromEvent(event, this.platform.os),
    }, this.currentChannel() ? { id: this.currentChannel()!.id, name: this.currentChannel()!.name } : null);
    if (privacy) {
      wrap.append(privacy);
      return;
    }
    if (id === "message-translate") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Phrase book language"));
      card.append(this.choice(["en", "es", "fr", "de", "ja"], this.pack.translateLang, (value) => {
        this.pack.translateLang = value as PackState["translateLang"];
        this.translated = {};
        this.savePack();
        this.msgSig = "";
        if (this.settings) this.renderSettings();
      }));
      const source = el("input");
      source.placeholder = "Line to remember";
      source.setAttribute("aria-label", "Glossary line");
      const translation = el("input");
      translation.placeholder = "Translation";
      translation.setAttribute("aria-label", "Glossary translation");
      const add = el("button", "text-button", "Add line");
      add.type = "button";
      add.addEventListener("click", () => {
        const text = source.value.trim();
        const line = translation.value.trim();
        if (!text || !line) return;
        this.pack.glossary = [...this.pack.glossary, { text, lang: this.pack.translateLang, translation: line }].slice(-100);
        source.value = "";
        translation.value = "";
        this.savePack();
        this.renderSettings();
      });
      card.append(source, translation, add);
      if (this.pack.glossary.length) card.append(el("p", "hint", `${this.pack.glossary.length} saved line${this.pack.glossary.length === 1 ? "" : "s"} on this device.`));
      wrap.append(card);
    } else if (id === "quiet-media") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Link previews"));
      card.append(this.choice(["hide", "show"], this.pack.mediaPreviews, (value) => {
        this.pack.mediaPreviews = value as PackState["mediaPreviews"];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        if (this.settings) this.renderSettings();
      }));
      card.append(el("div", "hint", "Images"));
      card.append(this.choice(["on", "off"], this.pack.mediaCompact, (value) => {
        this.pack.mediaCompact = value as PackState["mediaCompact"];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        if (this.settings) this.renderSettings();
      }));
      card.append(el("p", "hint", "On keeps images small. Hide drops the preview card and leaves the link."));
      wrap.append(card);
    } else if (id === "keyword-ping") {
      const card = el("div", "plugin-card");
      const global = el("input");
      global.value = this.pack.keywordGlobal.join(", ");
      global.setAttribute("aria-label", "Keyword list");
      global.addEventListener("change", () => {
        this.pack.keywordGlobal = cleanWords(global.value);
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      });
      card.append(el("div", "hint", "Words, for every channel"), global);
      const channel = this.currentChannel();
      if (channel && this.channelId) {
        const current = this.pack.keywordChannels[this.channelId] ?? { words: [] };
        const local = el("input");
        local.value = current.words.join(", ");
        local.setAttribute("aria-label", "Channel keywords");
        local.addEventListener("change", () => {
          const words = cleanWords(local.value);
          const level = this.pack.keywordChannels[this.channelId!]?.level;
          if (!words.length && !level) delete this.pack.keywordChannels[this.channelId!];
          else this.pack.keywordChannels[this.channelId!] = level ? { words, level } : { words };
          this.savePack();
          this.msgSig = "";
          this.paintMessages();
        });
        card.append(el("div", "hint", `Words only in ${channel.name}`), local);
        card.append(el("div", "hint", "Notification rule for this channel"));
        const level = this.levelFor(this.guildId, this.channelId);
        card.append(this.choice(["all", "mentions", "mute"], level, (value) => {
          const next = value as NotifyLevel;
          this.config.notifications.channels[this.channelId!] = next === "mute" ? { muted: true } : { level: next, muted: false };
          this.stageNotify(this.guildId, this.channelId, next);
          const words = this.pack.keywordChannels[this.channelId!]?.words ?? [];
          this.pack.keywordChannels[this.channelId!] = { words, level: next };
          this.persist();
          void this.writeNotify(this.guildId, this.channelId, next);
          this.savePack();
          this.paint();
        }));
        card.append(el("p", "hint", "Mute wins. A keyword pings a mentions-only channel at most once a minute, and only when you are not already looking at it."));
      }
      wrap.append(card);
    } else if (id === "auto-away") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Go idle after"));
      card.append(this.choice(["5", "15", "30"], String(this.pack.awayMinutes), (value) => {
        this.pack.awayMinutes = Number(value) as PackState["awayMinutes"];
        this.savePack();
        if (this.settings) this.renderSettings();
      }));
      card.append(el("p", "hint", "One presence update when you go idle, and one when you come back. Do not disturb and invisible are left alone."));
      wrap.append(card);
    } else if (id === "now-playing") {
      const card = el("div", "plugin-card");
      const title = el("input");
      title.value = this.pack.playingTitle;
      title.placeholder = "Track";
      title.setAttribute("aria-label", "Track title");
      const artist = el("input");
      artist.value = this.pack.playingArtist;
      artist.placeholder = "Artist";
      artist.setAttribute("aria-label", "Artist");
      const apply = el("button", "text-button", "Show on my status");
      apply.type = "button";
      apply.addEventListener("click", () => {
        this.pack.playingTitle = title.value.trim().slice(0, 80);
        this.pack.playingArtist = artist.value.trim().slice(0, 80);
        this.savePack();
        this.writePlaying(playingLine(this.pack.playingTitle, this.pack.playingArtist), true);
      });
      card.append(title, artist, apply);
      card.append(this.toggle("Replace a custom status", this.pack.playingReplace, (value) => {
        this.pack.playingReplace = value;
        this.savePack();
      }));
      card.append(el("p", "hint", "Lark does not sign in to Spotify. If the system media session has a track, that line is used, at most every 30 seconds, and only when it changes."));
      wrap.append(card);
    } else if (id === "bookmarks") {
      const card = el("div", "plugin-card");
      const open = el("button", "text-button", "Show bookmarks");
      open.type = "button";
      open.addEventListener("click", () => {
        this.bookmarksOpen = true;
        this.closeSettings();
        this.paintBookmarks();
      });
      card.append(open, el("p", "hint", "Saved on this device only. Discord pins are unchanged."));
      wrap.append(card);
    } else if (id === "hide-muted") {
      const card = el("div", "plugin-card");
      if (!this.pack.hiddenAuthors.length) card.append(el("p", "hint", "Use Hide on a message. The person is hidden here, not blocked on Discord."));
      for (const author of this.pack.hiddenAuthors) {
        const row = el("div", "shortcut-row");
        row.append(el("span", "", author.name));
        const button = el("button", "text-button", "Show");
        button.type = "button";
        button.addEventListener("click", () => {
          this.pack.hiddenAuthors = toggleHidden(this.pack.hiddenAuthors, author);
          this.savePack();
          this.msgSig = "";
          this.paint();
        });
        row.append(button);
        card.append(row);
      }
      wrap.append(card);
    } else if (id === "send-later") {
      const card = el("div", "plugin-card");
      const waiting = this.pack.schedule.length;
      card.append(el("p", "hint", waiting ? `${waiting} waiting. Lark sends the oldest due message, then waits before the next.` : "Use Later in the composer. The soonest time is 15 seconds from now."));
      wrap.append(card);
    } else if (id === "message-logger") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Show deleted messages", this.pack.logDeleted, (value) => {
        this.pack.logDeleted = value;
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }));
      card.append(this.toggle("Show edit history", this.pack.logEdits, (value) => {
        this.pack.logEdits = value;
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }));
      const clearLog = el("button", "text-button", "Clear log");
      clearLog.type = "button";
      clearLog.addEventListener("click", () => {
        this.pack.messageLog = [];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
        this.renderSettings();
      });
      card.append(clearLog, el("p", "hint", this.pack.messageLog.length ? `${this.pack.messageLog.length} saved on this device. Nothing is sent back to Discord.` : "Deleted and edited messages stay on this device."));
      wrap.append(card);
    } else if (id === "better-timestamps") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Label"));
      card.append(this.choice(["relative", "absolute"], this.pack.timeMode, (value) => {
        this.pack.timeMode = value as PackState["timeMode"];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }));
      card.append(el("div", "hint", "Clock"));
      card.append(this.choice(["12", "24"], this.pack.timeHours, (value) => {
        this.pack.timeHours = value as PackState["timeHours"];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }, { "12": "12-hour", "24": "24-hour" }));
      card.append(el("p", "hint", "Hover a time for the full date. Relative labels refresh about twice a minute."));
      wrap.append(card);
    } else if (id === "typing-list") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Channel list", this.pack.typingChannels, (value) => {
        this.pack.typingChannels = value;
        this.savePack();
        this.paintChannels();
      }));
      card.append(this.toggle("Direct messages", this.pack.typingDms, (value) => {
        this.pack.typingDms = value;
        this.savePack();
        this.paintChannels();
      }));
      card.append(el("p", "hint", "A row says typing while someone is typing there. Hover the label for the names. Silent typing, above, stops your own indicator."));
      wrap.append(card);
    } else if (id === "inline-translate") {
      const card = el("div", "plugin-card");
      const langs = ["en", "es", "fr", "de", "ja"];
      const labels = { en: "English", es: "Spanish", fr: "French", de: "German", ja: "Japanese" };
      card.append(el("div", "hint", "Translate into"));
      card.append(this.choice(langs, this.pack.inlineLang, (value) => {
        this.pack.inlineLang = value as PackState["inlineLang"];
        this.translated = {};
        this.savePack();
        this.msgSig = "";
      }, labels));
      card.append(el("div", "hint", "Source language"));
      card.append(this.choice(langs, this.pack.inlineSource, (value) => {
        this.pack.inlineSource = value as PackState["inlineSource"];
        this.savePack();
      }, labels));
      card.append(el("div", "hint", "Prefer"));
      card.append(this.choice(["remote", "local"], this.pack.inlinePrefer, (value) => {
        this.pack.inlinePrefer = value as PackState["inlinePrefer"];
        this.savePack();
      }, { remote: "Free endpoint", local: "Phrase book" }));
      card.append(el("p", "hint", "Right-click a message. The free endpoint is tried first unless you prefer the phrase book. No key is stored."));
      wrap.append(card);
    } else if (id === "show-hidden") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Show topics", this.pack.hiddenTopics, (value) => {
        this.pack.hiddenTopics = value;
        this.savePack();
        this.paintChannels();
      }));
      card.append(el("p", "hint", "Locked channels stay in the list. Opening one is refused, and nothing is fetched from them."));
      wrap.append(card);
    } else if (id === "spotify-controls") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Listening status", this.pack.spotifyPresence, (value) => {
        this.pack.spotifyPresence = value;
        this.savePack();
        this.paintChannels();
      }));
      card.append(this.toggle("Spotify links", this.pack.spotifyLinks, (value) => {
        this.pack.spotifyLinks = value;
        this.savePack();
        this.paintChannels();
      }));
      card.append(el("p", "hint", "The player uses the listening line already on a profile, plus Spotify links in the open channel. No login and no key."));
      wrap.append(card);
    } else if (id === "quick-replies") {
      wrap.append(this.repliesPanel());
    } else if (id === "copy-markdown") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Include author and time", this.pack.copyMeta, (value) => {
        this.pack.copyMeta = value;
        this.savePack();
      }));
      card.append(el("p", "hint", "Right-click a message and choose Copy Markdown."));
      wrap.append(card);
    } else if (id === "image-zoom") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Largest zoom"));
      card.append(this.choice(["2", "3", "4"], String(this.pack.zoomMax), (value) => {
        this.pack.zoomMax = Number(value) as PackState["zoomMax"];
        this.savePack();
      }, { "2": "2×", "3": "3×", "4": "4×" }));
      card.append(el("p", "hint", "Click an opened image to zoom in. Scroll to zoom in or out."));
      wrap.append(card);
    } else if (id === "read-receipts") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Show Seen", this.pack.showReceipts, (value) => {
        this.pack.showReceipts = value;
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }));
      card.append(el("p", "hint", "A message you scroll past gets a Seen mark on this device. Lark does not tell Discord."));
      wrap.append(card);
    } else if (id === "mention-digest") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Include direct messages", this.pack.digestDms, (value) => {
        this.pack.digestDms = value;
        this.savePack();
        if (this.digestOpen) this.paintDigest();
      }));
      card.append(el("p", "hint", "Mentions in the header lists counts Lark already has. It does not fetch history."));
      wrap.append(card);
    } else if (id === "word-counter") {
      const card = el("div", "plugin-card");
      card.append(el("div", "hint", "Badge a message"));
      card.append(this.choice(["0", "40", "100", "280"], String(this.pack.wordMin), (value) => {
        this.pack.wordMin = Number(value) as PackState["wordMin"];
        this.savePack();
        this.msgSig = "";
        this.paintMessages();
      }, { "0": "Off", "40": "40 words", "100": "100 words", "280": "280 words" }));
      card.append(el("p", "hint", "The composer always shows the word count while this is on. A badge appears only at the size you pick."));
      wrap.append(card);
    } else if (id === "reply-chain") {
      const card = el("div", "plugin-card");
      card.append(el("p", "hint", "Right-click a reply. The chain is built from messages already loaded. A missing parent is not fetched."));
      wrap.append(card);
    } else if (id === "show-connections") {
      const card = el("div", "plugin-card");
      card.append(el("p", "hint", "Right-click a message and choose Connections. Lark loads that one profile. It does not scan the member list."));
      wrap.append(card);
    } else if (id === "local-nicknames") {
      const card = el("div", "plugin-card");
      const ids = Object.keys(this.pack.localNicks);
      if (!ids.length) card.append(el("p", "hint", "Right-click a message and choose Local nickname. Discord is not updated."));
      for (const userId of ids) {
        const row = el("div", "shortcut-row");
        row.append(el("span", "", this.pack.localNicks[userId]));
        const clearNick = el("button", "text-button", "Clear");
        clearNick.type = "button";
        clearNick.addEventListener("click", () => {
          this.pack.localNicks = setLocalNick(this.pack.localNicks, userId, "");
          this.savePack();
          this.msgSig = "";
          this.paint();
        });
        row.append(clearNick);
        card.append(row);
      }
      wrap.append(card);
    } else if (id === "folder-stats") {
      const card = el("div", "plugin-card");
      const folders = this.folders.filter((folder) => folder.id);
      if (!folders.length) card.append(el("p", "hint", "No server folders yet. Counts stay on this device."));
      for (const folder of folders) {
        if (!folder.id) continue;
        const summary = this.folderSummary(folder.id, folder.name?.trim() || "Folder", folder.guildIds);
        card.append(el("p", "", folderTitle(summary)));
      }
      card.append(el("p", "hint", "Muted servers are left out of the unread and mention counts. Discord's folder list is not changed."));
      wrap.append(card);
    } else if (id === "better-folders") {
      const card = el("div", "plugin-card");
      card.append(this.toggle("Unread first", this.pack.folderUnreadFirst, (value) => {
        this.pack.folderUnreadFirst = value;
        this.savePack();
        this.railShape = "";
        this.paintRail();
      }));
      card.append(el("p", "hint", "Hover a folder for the server names. Unread servers can move to the top of the folder on this screen. Discord keeps the saved order."));
      wrap.append(card);
    } else if (id === "auto-reply") {
      const card = el("div", "plugin-card");
      const field = el("textarea");
      field.maxLength = 200;
      field.value = this.pack.awayReplyText;
      field.placeholder = "I am away. I will reply later.";
      field.setAttribute("aria-label", "Away reply");
      field.addEventListener("input", () => {
        this.pack.awayReplyText = cleanAwayText(field.value);
        this.savePack();
      });
      card.append(field);
      card.append(this.toggle("Reply while away", this.pack.awayReplyArmed, (value) => {
        this.pack.awayReplyArmed = value;
        if (!value) this.pack.awayReplied = [];
        this.savePack();
      }));
      card.append(el("p", "hint", "Direct messages only. Group chats and servers are skipped, and nothing is sent while that conversation is open. Each conversation gets one reply until you turn this off. Sends stay 30 seconds apart. You write the line. Bots and your own messages are skipped."));
      wrap.append(card);
    } else if (id === "theme-attributes") {
      const card = el("div", "plugin-card");
      const lines = themeAttributeLines(getComputedStyle(document.documentElement));
      if (!lines.length) card.append(el("p", "hint", "No theme colours are set on this page."));
      for (const line of lines) card.append(el("p", "", `${line.name}: ${line.value}`));
      const copy = el("button", "text-button", "Copy");
      copy.type = "button";
      copy.addEventListener("click", () => {
        const text = themeAttributeText(lines);
        void navigator.clipboard.writeText(text).then(
          () => this.toast("Theme attributes", "Copied."),
          () => this.toast("Theme attributes", text || "Nothing to copy."),
        );
      });
      card.append(copy);
      card.append(el("p", "hint", "These are the colours already on the page. The theme file is not changed."));
      wrap.append(card);
    }
    this.appendChatPluginPanel(wrap, id);
  },
  repliesPanel(): HTMLElement {
    const card = el("div", "plugin-card");
    const label = el("input");
    label.placeholder = "Name";
    label.setAttribute("aria-label", "Reply name");
    const body = el("input");
    body.placeholder = "Reply";
    body.setAttribute("aria-label", "Reply text");
    const add = el("button", "text-button", "Save reply");
    add.type = "button";
    add.addEventListener("click", () => {
      const next = addTemplate(this.pack.templates, label.value, body.value);
      if (next === this.pack.templates) return;
      this.pack.templates = next;
      this.savePack();
      this.renderSettings();
    });
    card.append(label, body, add);
    if (!this.pack.templates.length) card.append(el("p", "hint", "Saved replies show up as Replies in the composer."));
    for (const template of this.pack.templates) {
      const row = el("div", "shortcut-row");
      row.append(el("span", "", template.label));
      const remove = el("button", "text-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        this.pack.templates = removeTemplate(this.pack.templates, template.id);
        this.savePack();
        this.renderSettings();
      });
      row.append(remove);
      card.append(row);
    }
    return card;
  },
  paintScheduleBanner() {
    const channelId = this.channelId;
    if (!channelId) return;
    if (this.scheduling) {
      clear(this.composerBanner);
      this.composerBanner.hidden = false;
      const when = el("input");
      when.type = "datetime-local";
      when.setAttribute("aria-label", "Send at");
      when.value = localInputValue(Date.now() + 15 * 60_000);
      const confirm = el("button", "primary", "Queue");
      confirm.type = "button";
      confirm.addEventListener("click", () => {
        const sendAt = Date.parse(when.value);
        const result = queueSend(this.pack.schedule, { channelId, content: this.composer.value, sendAt }, Date.now());
        if (!result.ok) {
          this.toast("Send later", result.error);
          return;
        }
        this.pack.schedule = result.list;
        this.composer.value = "";
        if (this.channelId) delete this.drafts[this.channelId];
        void this.writeDrafts();
        this.scheduling = false;
        this.savePack();
        this.paintComposer();
        this.toast("Send later", "Queued. It sends once, on its own.");
      });
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.scheduling = false;
        this.paintComposer();
      });
      this.composerBanner.append(el("span", "", "Send at"), when, confirm, cancel);
      return;
    }
    if (!this.composerBanner.hidden) return;
    const waiting = this.pack.schedule.filter((item) => item.channelId === channelId);
    const next = waiting[0];
    if (!next) return;
    this.composerBanner.hidden = false;
    const when = formatRelative(new Date(next.sendAt).toISOString(), Date.now());
    this.composerBanner.append(el("span", "", `Sends ${when} · ${this.maskText(next.content.slice(0, 80))}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.setAttribute("aria-label", "Cancel scheduled message");
    cancel.addEventListener("click", () => {
      this.pack.schedule = cancelSend(this.pack.schedule, next.id);
      this.savePack();
      this.paintComposer();
    });
    this.composerBanner.append(cancel);
  },
  paintBookmarks() {
    let overlay = document.getElementById("lark-bookmarks");
    if (!this.bookmarksOpen) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = el("div", "overlay");
      overlay.id = "lark-bookmarks";
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          this.bookmarksOpen = false;
          this.paintBookmarks();
        }
      });
      this.root.append(overlay);
    }
    clear(overlay);
    const card = el("div", "switcher-card");
    const head = el("div", "switcher-head");
    head.append(el("strong", "", "Saved messages"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.bookmarksOpen = false;
      this.paintBookmarks();
    });
    head.append(close);
    const list = el("div", "bookmark-list");
    if (!this.pack.bookmarks.length) list.append(el("p", "hint", "Save a message and it stays with your account."));
    for (const bookmark of this.pack.bookmarks) {
      const row = el("button", "bookmark-row");
      row.type = "button";
      row.append(el("strong", "", this.maskText(bookmark.authorName)), el("span", "", this.bookmarkExcerpt(bookmark)));
      row.addEventListener("click", () => {
        this.bookmarksOpen = false;
        this.paintBookmarks();
        void this.openChannel(bookmark.channelId);
      });
      list.append(row);
    }
    card.append(head, list);
    overlay.append(card);
  },
  onBookmark(message: RawMessage) {
    this.pack.bookmarks = toggleBookmark(this.pack.bookmarks, {
      messageId: message.id,
      channelId: message.channelId,
      authorName: message.authorName,
      excerpt: message.content,
      savedAt: Date.now(),
    });
    this.savePack();
    this.msgSig = "";
    this.paintMessages();
    const kept = isBookmarked(this.pack.bookmarks, message.channelId, message.id);
    const reminder = reminderFor(this.reminders, message.channelId, message.id);
    void this.pushSaved(message.channelId, message.id, kept || Boolean(reminder), reminder ? new Date(reminder.remindAt).toISOString() : null);
  },
  async onTranslate(message: RawMessage) {
    if (this.translated[message.id]) {
      delete this.translated[message.id];
      this.msgSig = "";
      this.paintMessages();
      return;
    }
    const { translateText } = await import("../pack/translate");
    const result = translateText(message.content, this.pack.translateLang, this.pack.glossary);
    if (!result.matched) {
      this.toast("Translate", "No local translation for that line. Add one in the plugin’s settings.");
      return;
    }
    this.translated[message.id] = result.text;
    this.msgSig = "";
    this.paintMessages();
  },
  onHideAuthor(message: RawMessage) {
    this.pack.hiddenAuthors = toggleHidden(this.pack.hiddenAuthors, { id: message.authorId, name: message.authorName });
    this.savePack();
    this.msgSig = "";
    this.paintMessages();
    const hidden = this.pack.hiddenAuthors.some((author) => author.id === message.authorId);
    this.toast(hidden ? "Hidden" : "Visible", hidden ? `${message.authorName} is hidden on this device.` : `${message.authorName} is visible again.`);
  },
  absorbMessage(message: RawMessage) {
    if (message.authorId && message.authorName && message.authorName !== "Unknown" && !this.userNames[message.authorId]) {
      this.userNames[message.authorId] = message.authorName;
    }
    for (const mention of message.mentionUsers ?? []) {
      if (mention.id && mention.name && mention.name !== "someone" && !this.userNames[mention.id]) this.userNames[mention.id] = mention.name;
    }
  },
  noteChannel(channel: Channel) {
    if (channel.lastMessageId) this.channelLast[channel.id] = channel.lastMessageId;
    this.refreshBehind(channel.id);
  },
  refreshBehind(id: string) {
    this.behind[id] = id === this.channelId ? false : channelIsBehind(this.channelLast[id], this.lastRead[id]);
  },
  ackChannel(channelId: string, messageId: string) {
    if (!channelId || !messageId || this.holdRead()) return;
    this.lastRead[channelId] = messageId;
    this.behind[channelId] = false;
    this.localUnread[channelId] = 0;
    this.localMentions[channelId] = 0;
    this.markers[channelId] = { lastMessageId: messageId, mentionCount: 0 };
    this.refreshChannelBadge(channelId);
    if (this.demo || messageId.startsWith("local-")) return;
    void invoke("ack_message", { channelId, messageId }).catch(() => undefined);
  },
  paintNewBar() {
    if (!this.newBar) return;
    this.newBar.hidden = this.freshCount <= 0;
    this.newBar.textContent = this.freshCount > 1 ? `${this.freshCount} new messages` : "New messages";
  },
  jumpToBottom() {
    this.freshCount = 0;
    this.nearBottom = true;
    this.pinnedToBottom = true;
    this.scroll = "bottom";
    this.msgSig = "";
    const last = this.pages[this.channelId ?? ""]?.at(-1);
    if (this.channelId && last) this.ackChannel(this.channelId, last.id);
    this.paintNewBar();
    this.paintMessages();
  },
  async jumpToMessage(channelId: string, messageId: string) {
    if (!channelId || !messageId) return;
    this.jumpId = messageId;
    this.pinnedToBottom = false;
    this.nearBottom = false;
    if (this.channelId !== channelId) await this.openChannel(channelId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const loaded = this.pages[channelId] ?? [];
      if (loaded.some((message) => message.id === messageId) || !this.more[channelId]) break;
      await this.loadOlder(true);
    }
    const list = this.pages[channelId] ?? [];
    if (!list.some((message) => message.id === messageId)) {
      this.toast("Message", "That message isn't in the loaded history.");
      return;
    }
    const loadedList = this.pages[channelId] ?? [];
    const index = loadedList.findIndex((message) => message.id === messageId);
    if (index >= 0) {
      const row = rowEstimate(this.config.appearance.density);
      let offset = 0;
      for (let cursor = 0; cursor < index; cursor += 1) offset += this.messageHeights.get(loadedList[cursor].id) || row;
      this.messagesEl.scrollTop = Math.max(0, offset - (this.messagesEl.clientHeight || 640) / 2);
    }
    this.scroll = "none";
    this.msgSig = "";
    this.paintMessages();
    const node = this.messagesEl.querySelector(`[data-id="${messageId}"]`);
    if (node instanceof HTMLElement) {
      this.lockScroll(() => node.scrollIntoView({ block: "center" }));
    }
    this.syncMessageWindow();
    window.setTimeout(() => {
      if (this.jumpId === messageId) {
        this.jumpId = null;
        this.msgSig = "";
        this.paintMessages();
      }
    }, 1200);
  },
  threadsFor(parentId: string): Channel[] {
    const live = !this.guildId ? [] : this.channelsOf(this.guildId).filter((channel) => channel.kind === "thread" && channel.parentId === parentId);
    return this.threadCore?.mergeThreadChannels(parentId, live) ?? live;
  },
  mergeThreads(guildId: string, parentId: string, threads: Channel[]) {
    const guild = guildId || this.guildForChannel(parentId) || this.guildId;
    if (!guild || !threads.length) return;
    const existing = this.liveChannels[guild] ?? [];
    const incoming = threads.map((thread) => ({ ...thread, kind: "thread" as const, parentId: thread.parentId || parentId || null }));
    const ids = new Set(incoming.map((thread) => thread.id));
    this.liveChannels[guild] = [...existing.filter((channel) => !ids.has(channel.id)), ...incoming];
    this.msgSig = "";
    if (this.guildId === guild) this.paint();
  },
  async loadThreads(channelId: string) {
    if (this.bench) return;
    const mod = await this.ensureThreadCore();
    mod.bindParityHost(this.parityHost());
    if (this.demo || !this.guildId) return;
    try {
      const threads = await invoke<Channel[]>("fetch_threads", { channelId });
      this.mergeThreads(this.guildId, channelId, threads.map(normalizeChannel));
    } catch {
      /* Active threads are optional. */
    }
    try {
      const index = await invoke<ThreadIndexWire>("fetch_thread_index", { channelId });
      mod.applyThreadIndex(index);
      const threads = index.threads.map((thread) => normalizeChannel({
        id: thread.id,
        name: thread.name,
        kind: "thread",
        parentId: thread.parentId || channelId,
        position: 0,
        rawKind: thread.rawKind,
        archived: thread.archived,
        locked: thread.locked,
        invitable: thread.invitable,
        autoArchiveDuration: thread.autoArchiveDuration,
        messageCount: thread.messageCount,
        memberCount: thread.memberCount,
        lastMessageId: thread.lastMessageId,
        ownerId: thread.ownerId,
        flags: thread.flags,
        appliedTags: thread.appliedTags,
        starterContent: thread.starterContent,
        starterImage: thread.starterImage,
      }));
      this.mergeThreads(this.guildId, channelId, threads);
      if (index.parent?.rawKind) {
        const parent = this.channelById(channelId);
        if (parent) Object.assign(parent, {
          rawKind: index.parent.rawKind,
          flags: index.parent.flags,
          topic: index.parent.topic || parent.topic,
          availableTags: index.parent.availableTags,
          defaultSortOrder: index.parent.defaultSortOrder,
        });
      }
      this.msgSig = "";
      if (this.channelId === channelId) this.paintMessages();
    } catch {
      /* Archived threads and forum tags are optional. */
    }
  },
  ensureThreadChannel(thread: { id: string; name: string }) {
    if (!this.guildId) return;
    const list = this.liveChannels[this.guildId] ?? [];
    if (list.some((channel) => channel.id === thread.id)) return;
    this.liveChannels[this.guildId] = [
      ...list,
      { id: thread.id, name: thread.name, kind: "thread", parentId: this.channelId, position: 0 },
    ];
  },
  forumBoard(channelId: string): HTMLElement | null {
    this.bindThreadHost();
    const channel = this.currentChannel();
    if (!channel || channel.id !== channelId) return null;
    if (channel.kind !== "forum" && channel.kind !== "media" && channel.rawKind !== 16) return null;
    const threads = threadsNow();
    if (!threads) {
      void loadThreadsUi().then(() => {
        if (this.channelId === channelId) this.paintMessages();
      });
      return null;
    }
    return threads.renderForumSurface(channelId);
  },
  /** Stream A: + Create Thread. */
  onCreateThread(input?: unknown) {
    const payload = input ?? { channelId: this.channelId };
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreateThread(payload);
    });
  },
  /** Stream A: + Create Poll. */
  onCreatePoll(input?: unknown) {
    const payload = input ?? { channelId: this.channelId };
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreatePoll(payload);
    });
  },
  /** Stream B: Create Event, and the events list behind the sidebar row. */
  onCreateEvent(input?: unknown) {
    const payload = input ?? this.guildId ?? "";
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreateEvent(payload);
    });
  },
  openEvents(input?: unknown) {
    const payload = input ?? this.guildId ?? "";
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.openEvents(payload);
    });
  },
  ensureThreadCore(): Promise<typeof import("../threads")> {
    if (this.threadCore) return Promise.resolve(this.threadCore);
    if (!this.threadCoreTask) {
      this.threadCoreTask = import("../threads").then((mod) => {
        this.threadCore = mod;
        return mod;
      });
    }
    return this.threadCoreTask;
  },
  bindThreadHost() {
    this.threadCore?.bindParityHost(this.parityHost());
  },
  parityHost(): ParityHost {
    const pending = this.threadCore?.readPendingFriendCount(socialApi, (globalThis as { __larkPendingFriends?: unknown }).__larkPendingFriends) ?? 0;
    return {
      channelId: this.channelId,
      guildId: this.guildId,
      meId: this.meId(),
      demo: this.demo,
      voiceChannelId: this.voice?.channelId ?? null,
      channel: (id) => this.channelById(id),
      channels: () => (this.guildId ? this.channelsOf(this.guildId) : []),
      dms: () => this.dmChannels().map((channel) => ({
        id: channel.id,
        name: channel.name,
        kind: channel.kind,
        recipientIds: channel.recipientIds?.length ? channel.recipientIds : (channel.recipients ?? []).map((item) => item.id),
        preview: this.dmPreviewLabel(channel.id),
      })),
      friendIds: () => {
        if (this.demo) return people.filter((person) => person.id !== this.meId()).map((person) => person.id);
        if (this.relationshipsRetry !== Number.POSITIVE_INFINITY) return null;
        return this.relationships.filter((row) => row.kind === "friend").map((row) => row.id);
      },
      spamFilter: this.config.preferences.spam_filter,
      messages: (id) => (this.pages[id] ?? []).map((message) => ({
        id: message.id,
        content: message.content,
        authorName: message.authorName,
        authorId: message.authorId,
        poll: message.poll,
      })),
      bookmarks: this.pack.bookmarks,
      reminders: this.reminders,
      pendingFriendCount: pending,
      unreads: () => {
        const channels = [...(this.guildId ? this.channelsOf(this.guildId) : []), ...this.dms()];
        return channels
          .map((channel) => ({
            id: channel.id,
            name: channel.name,
            kind: channel.kind,
            unread: this.unread[channel.id] ?? channel.unread ?? 0,
            mentions: this.mentions[channel.id] ?? channel.mentions ?? 0,
            lastMessageId: channel.lastMessageId ?? this.channelLast[channel.id] ?? this.markers[channel.id]?.lastMessageId ?? null,
          }))
          .filter((channel) => channel.unread > 0 || channel.mentions > 0);
      },
      mask: (text) => this.maskText(text),
      invoke: (command, args) => invoke(command, args),
      openChannel: (id) => {
        void this.openChannel(id);
      },
      jump: (channelId, messageId) => {
        void this.jumpToMessage(channelId, messageId);
      },
      toast: (title, body) => this.toast(title, body),
      markAllRead: (states) => {
        for (const state of states) {
          this.lastRead[state.channelId] = state.messageId;
          this.behind[state.channelId] = false;
          this.localUnread[state.channelId] = 0;
          this.localMentions[state.channelId] = 0;
          this.markers[state.channelId] = { lastMessageId: state.messageId, mentionCount: 0 };
          this.refreshChannelBadge(state.channelId);
        }
        this.syncBadge();
        this.paintChannels();
        this.paintRail();
      },
      refresh: () => {
        this.msgSig = "";
        this.paint();
      },
      rememberThread: (thread) => {
        const guild = this.guildId || (thread.parentId ? this.guildForChannel(thread.parentId) : "") || "";
        if (!guild) return;
        this.mergeThreads(guild, thread.parentId ?? "", [normalizeChannel(thread)]);
      },
    };
  },
});
