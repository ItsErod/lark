import {
  MISSED_KEY,
  MISSED_SEEN_KEY, digestSummary, inQuietHours,
  matchAlert,
  planNotification,
  releaseHeld,
  rememberMissed,
  sanitizeMissed
} from "../smart-notify";
import {
  cycleServer as stepServer, orderedGuildIds
} from "../shell";
import { describePlugin, validPluginId } from "../plugins";
import {
  hashMatches, readLocalStore,
  sha256Hex, STORE_LOCAL_KEY
} from "../store";
import { matchShortcut, shortcutFromEvent } from "../shortcuts";
import type { NotifyLevel, RawMessage } from "../types";
import { commandError } from "../signin";
import { el } from "./dom";
import {
  playSoftTone, shortcutOk
} from "../user-settings";
import { isTauri, invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const notifyMethods = defineMethods({
  toast(title: string, body: string) {
    const toast = el("div", "toast");
    toast.append(el("strong", "", title), el("span", "", body));
    this.toastWrap.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  },
  loadMissed() {
    try {
      this.missed = sanitizeMissed(JSON.parse(localStorage.getItem(MISSED_KEY) ?? "[]"));
    } catch {
      this.missed = [];
    }
    const seen = Number(localStorage.getItem(MISSED_SEEN_KEY) ?? "0");
    this.missedSeen = Number.isFinite(seen) ? seen : 0;
  },
  saveMissed() {
    localStorage.setItem(MISSED_KEY, JSON.stringify(this.missed));
    localStorage.setItem(MISSED_SEEN_KEY, String(this.missedSeen));
  },
  deliverAlert(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, direct: boolean, body: string): boolean {
    const quiet = inQuietHours(this.config.notifications.quiet, new Date());
    if (this.quietOn && !quiet) {
      this.quietOn = false;
      this.surfaceMissed("quiet");
    } else {
      this.quietOn = quiet;
    }
    const rules = this.config.notifications;
    const matched = matchAlert({
      content: message.content,
      authorId: message.authorId,
      authorName: message.authorName,
      channelId: message.channelId,
      keywords: rules.alert_keywords,
      people: rules.people,
      blocked: rules.blocked,
    });
    const plan = planNotification({
      fromMe: message.authorId === this.meId(),
      windowFocused: this.focused,
      sameChannel: message.channelId === this.channelId,
      desktopEnabled: this.config.preferences.desktop_notifications !== false,
      level,
      mentionsMe,
      direct,
      quiet,
      quietMode: rules.quiet.mode,
      alert: matched.kind !== null,
      blocked: matched.blocked,
      away: !this.focused || document.hidden || this.away.away,
    });
    if (plan.record && message.id) {
      const channel = this.channelById(message.channelId);
      this.missed = rememberMissed(this.missed, {
        id: message.id,
        channelId: message.channelId,
        channel: this.hideDirect() && direct ? "Direct message" : (channel?.name || (direct ? "Direct message" : "Channel")),
        author: this.maskText(message.authorName),
        preview: body,
        at: Date.now(),
        reason: plan.reason,
        held: plan.action === "hold",
      });
      this.saveMissed();
    }
    if (plan.action !== "send") return false;
    void this.notify(this.streamerOn() && direct ? "Direct message" : this.maskText(message.authorName), body);
    if (this.config.preferences.message_sound) playSoftTone("message");
    return true;
  },
  tickSmartNotify() {
    const quiet = inQuietHours(this.config.notifications.quiet, new Date());
    const ended = this.quietOn && !quiet;
    this.quietOn = quiet;
    if (ended) this.surfaceMissed("quiet");
  },
  surfaceMissed(kind: "focus" | "quiet") {
    const held = this.missed.filter((item) => item.held);
    const desktop = this.config.preferences.desktop_notifications !== false;
    let announced = false;
    if (held.length && desktop) {
      const summary = digestSummary(held);
      void this.notify("Quiet hours", summary.body || summary.title);
      this.missed = releaseHeld(this.missed);
      this.missedSeen = Date.now();
      this.saveMissed();
      announced = true;
    } else if (held.length) {
      this.missed = releaseHeld(this.missed);
      this.saveMissed();
    }
    const fresh = this.missed.filter((item) => item.at > this.missedSeen);
    if (!announced && (kind === "focus" || this.focused) && fresh.length) {
      const summary = digestSummary(fresh);
      this.toast(summary.title, summary.body || "Open Notifications for the list.");
      this.missedSeen = Date.now();
      this.saveMissed();
      announced = true;
    }
    if (announced && this.settings && this.section === "notifications") this.renderSettings();
  },
  async notify(title: string, body: string) {
    this.toast(title, body);
    if (!isTauri()) return;
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (granted) mod.sendNotification({ title, body });
  },
  onKey(event: KeyboardEvent) {
    if (this.soundBind) {
      event.preventDefault();
      if (event.key === "Escape") {
        this.soundBind = null;
        this.renderSettings();
        return;
      }
      const shortcut = shortcutFromEvent(event, this.platform.os);
      if (!shortcut) return;
      const clip = this.config.soundboard.clips.find((item) => item.id === this.soundBind);
      if (clip) clip.hotkey = shortcut;
      this.soundBind = null;
      void this.persist();
      this.renderSettings();
      return;
    }
    if (this.rebinding || this.rebindingGame || this.discordRebind) {
      event.preventDefault();
      if (this.discordRebind && (event.key === "Backspace" || event.key === "Delete")) {
        this.config.keybinds[this.discordRebind as keyof typeof this.config.keybinds] = "";
        this.discordRebind = null;
        this.persist();
        this.renderSettings();
        return;
      }
      const shortcut = shortcutFromEvent(event, this.platform.os);
      if (!shortcut) return;
      if (this.discordRebind) {
        const id = this.discordRebind as keyof typeof this.config.keybinds;
        if (shortcutOk(shortcut)) this.config.keybinds[id] = shortcut;
        this.discordRebind = null;
        this.persist();
      } else if (this.rebindingGame) {
        const name = this.rebindingGame;
        this.rebindingGame = null;
        this.patchProfile(name, { ptt_key: shortcut });
      } else if (this.rebinding) {
        this.config.shortcuts[this.rebinding] = shortcut;
        this.rebinding = null;
        this.persist();
      }
      this.renderSettings();
      return;
    }
    if (this.tryPanic(event)) return;
    if (this.switcher) {
      if (event.key === "Escape") this.closeSwitcher();
      else if (event.key === "ArrowDown") this.moveSwitcher(1);
      else if (event.key === "ArrowUp") this.moveSwitcher(-1);
      else if (event.key === "Enter") this.commitSwitcher();
      else return;
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      if (this.shareDialogOpen || this.shareQualityOpen) {
        this.shareDialogOpen = false;
        this.shareQualityOpen = false;
        this.paintShareDialog();
        this.paintVoice();
        return;
      }
      if (this.voiceMenu || this.gearOpen || this.activitiesOpen || this.soundboardOpen) {
        this.voiceMenu = null;
        this.gearOpen = false;
        this.activitiesOpen = false;
        const board = this.soundboardOpen;
        this.soundboardOpen = false;
        this.paintVoiceFloats();
        if (board) this.paintChannels();
        return;
      }
      if (this.popout) {
        this.popout = null;
        this.statusOpen = false;
        this.wireProfile = null;
        this.paintPopout();
      } else if (this.settings) this.closeSettings();
      else if (this.lightbox) {
        this.lightbox = null;
        this.paintLightbox();
      } else if (this.youtubeFloat) {
        this.youtubeFloat = null;
        this.paintYoutubeFloat();
      } else if (this.invite) {
        this.invite = null;
        this.paintInvite();
      } else if (this.themeOpen) {
        this.themeOpen = false;
        this.paintTheme();
      } else if (this.localSearchOpen) {
        this.closeLocalSearch();
      } else if (this.searchOpen) {
        this.searchOpen = false;
        this.paintSearch();
      } else if (this.pinsOpen) {
        this.pinsOpen = false;
        this.paintPins();
      } else if (this.digestOpen) {
        this.digestOpen = false;
        this.paintDigest();
      } else if (this.bookmarksOpen) {
        this.bookmarksOpen = false;
        this.paintBookmarks();
      } else if (this.statusOpen || this.popout) {
        this.statusOpen = false;
        this.popout = null;
        this.paintPopout();
      } else if (this.reply || this.editing || this.pendingDelete) {
        this.reply = null;
        this.editing = null;
        this.pendingDelete = null;
        this.paintComposer();
      } else if (this.callSurface !== "chat") {
        this.dismissCallView();
      } else {
        const field = event.target as HTMLElement | null;
        const typingField = field === this.composer || field?.tagName === "INPUT" || field?.tagName === "TEXTAREA";
        if (!typingField) this.markReadFromEscape();
      }
      return;
    }
    const os = this.platform.os;
    const shortcuts = this.config.shortcuts;
    if (this.hotkeysOff) {
      if (matchShortcut(event, this.config.keybinds.toggle_hotkeys, os)) {
        event.preventDefault();
        this.hotkeysOff = false;
        this.toast("Keybinds", "Hotkeys are on.");
      }
      return;
    }
    if (matchShortcut(event, shortcuts.quick_switcher, os)) {
      event.preventDefault();
      this.openSwitcher();
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing = target === this.composer || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
    if (typing && target !== this.composer) return;
    if (matchShortcut(event, shortcuts.open_settings, os)) {
      event.preventDefault();
      this.openSettings();
    } else if (matchShortcut(event, shortcuts.toggle_members, os)) {
      this.config.appearance.show_member_list = !this.config.appearance.show_member_list;
      this.persist();
      this.paint();
    } else if (matchShortcut(event, shortcuts.toggle_channels, os)) {
      this.config.appearance.channel_list = this.config.appearance.channel_list === "hidden" ? "left" : "hidden";
      this.persist();
      this.paint();
    } else if (matchShortcut(event, shortcuts.focus_composer, os)) {
      this.composer.focus();
    } else if (matchShortcut(event, shortcuts.next_channel, os)) this.cycle(1);
    else if (matchShortcut(event, shortcuts.previous_channel, os)) this.cycle(-1);
    else if (matchShortcut(event, shortcuts.next_server, os)) {
      event.preventDefault();
      this.cycleServer(1);
    } else if (matchShortcut(event, shortcuts.previous_server, os)) {
      event.preventDefault();
      this.cycleServer(-1);
    }
    else if (matchShortcut(event, shortcuts.next_unread, os)) this.nextUnread();
    else if (matchShortcut(event, shortcuts.toggle_mute, os)) {
      event.preventDefault();
      if (this.acceptAudioHotkey("mute")) this.toggleMute();
    } else if (matchShortcut(event, shortcuts.toggle_deafen, os)) {
      event.preventDefault();
      if (this.acceptAudioHotkey("deafen")) this.toggleDeafen();
    } else if (matchShortcut(event, shortcuts.toggle_voice_overlay, os)) {
      event.preventDefault();
      this.toggleVoiceOverlay();
    } else if (matchShortcut(event, shortcuts.toggle_perf_overlay, os)) {
      event.preventDefault();
      this.togglePerfOverlay();
    } else if (matchShortcut(event, shortcuts.toggle_game_mode, os)) {
      event.preventDefault();
      this.toggleGameMode();
    } else if (matchShortcut(event, shortcuts.toggle_call, os)) {
      event.preventDefault();
      this.toggleCallView();
    } else if (matchShortcut(event, shortcuts.save_clip, os)) {
      event.preventDefault();
      void this.saveClip();
    } else if (this.hookOn("clipShare") && matchShortcut(event, this.pack.clipShareKey, os)) {
      event.preventDefault();
      void this.shareLatestClip();
    } else if (this.voice && this.voiceMode() === "ptt" && matchShortcut(event, this.pttShortcut(), os)) {
      event.preventDefault();
      this.pttHeld = true;
      this.refreshSpeaking();
      this.pushTransmit();
    } else if (this.matchSound(event, typing)) {
      event.preventDefault();
    }
    else if (this.runDiscordKeybind(event, os)) {
      event.preventDefault();
    }
    else if (target === this.composer && matchShortcut(event, shortcuts.edit_last, os) && !this.composer.value) {
      event.preventDefault();
      this.editLast();
    }
  },
  cycleServer(delta: number) {
    const ids: (string | null)[] = [null, ...orderedGuildIds(this.guilds().map((guild) => guild.id), this.folders)];
    const next = stepServer(ids, this.guildId, delta);
    if (next !== this.guildId) this.selectGuild(next);
  },
  cycle(delta: number) {
    const list = this.visibleChannels().filter((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group" || channel.kind === "announcement" || channel.kind === "forum");
    if (!list.length) return;
    const index = list.findIndex((channel) => channel.id === this.channelId);
    const next = list[(index + delta + list.length) % list.length];
    if (next) void this.openChannel(next.id);
  },
  nextUnread() {
    const list = this.visibleChannels().filter((channel) => (this.unread[channel.id] ?? 0) > 0 || (this.mentions[channel.id] ?? 0) > 0);
    if (list[0]) void this.openChannel(list[0].id);
  },
  async loadPlugins() {
    try {
      await this.refreshStore();
    } catch {
      this.catalog = [];
      this.installed = [];
    }
    await Promise.all(this.config.plugins.enabled.map((id) => this.ensurePlugin(id)));
    if (isTauri()) void this.listenForStoreLinks();
  },
  async ensurePlugin(id: string): Promise<boolean> {
    if (!validPluginId(id)) return false;
    if (this.loaded.has(id)) return true;
    try {
      let source = "";
      if (isTauri()) source = await invoke<string>("read_plugin", { id });
      else {
        const saved = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY)).plugins[id];
        if (!saved) return false;
        source = saved.source;
        const hash = await sha256Hex(new TextEncoder().encode(source));
        if (!hashMatches(hash, saved.sha256)) return false;
      }
      const plugin = describePlugin(source, id);
      this.loaded.set(id, plugin);
      const item = this.catalog.find((entry) => entry.id === id);
      if (item) {
        item.name = plugin.name;
        item.description = plugin.description;
      } else this.catalog.push({ id, name: plugin.name, description: plugin.description });
      return true;
    } catch {
      return false;
    }
  },
  persist(): Promise<void> {
    localStorage.setItem("lark.config.v1", JSON.stringify(this.config));
    if (!isTauri()) return Promise.resolve();
    return invoke("save_config", { config: this.config }).then(
      () => undefined,
      (err: unknown) => {
        this.toast("Settings", commandError(err, "Couldn't save settings."));
      },
    );
  },
});
