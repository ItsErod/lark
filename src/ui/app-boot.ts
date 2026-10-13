import { reportCrash } from "../crash";
import { defaultConfig, sanitizeConfig } from "../config";
import { CRIT, booth, history, NORTHWIND, channels as demoChannels, dms as demoDms, pageMessages, people } from "../demo/data";
import {
  inQuietHours
} from "../smart-notify";
import {
  inviteCode
} from "../shell";
import { noteActivity } from "../pack/away";
import { ensurePhrases, localizeTree, setLocale } from "../i18n";
import { composerCount } from "../pack/words";
import { defaultPack, sanitizePack } from "../pack/state";
import { sanitizeReminders } from "../reminders";
import { fontStack, type PlatformInfo } from "../platform";
import {
  readLocalStore, STORE_LOCAL_KEY
} from "../store";
import {
  cleanGameName,
  compactGameChrome,
  gameShellWidths
} from "../game";
import { HISTORY_PAGE, initialHistory } from "../history";
import {
  PLACE_KEY,
  SLOW_CONNECT_MS,
  SPLASH_CAP_MS,
  STARTUP_CHANNEL_WAIT_MS,
  channelsReady,
  landingTarget,
  parsePlace,
  preferredGuild,
  shouldShowSplash,
  splashReleaseDelay,
  startupLabel,
  startupProgress,
  type SavedPlace,
  type StartupMilestone,
} from "../startup";
import {
  HARDWARE_STORAGE_KEY, loadHardwareState
} from "../hardware";
import {
  CLIP_DRAG, isClipFileName
} from "../clips";
import {
  CALL_PIP_KEY,
  CALL_SPLIT_KEY,
  CALL_STRIP_KEY, readPipCorner,
  readSplitRatio,
  readStripOpen
} from "../call-layout";
import { speakColor } from "../voice-stage";
import type { RawMessage } from "../types";
import {
  applyRootOverrides,
  filterThemes,
  galleryEntries,
  loadImportedThemes,
  parseThemeCss,
  previewVars,
  serializeImportedThemes,
  themeFromJson,
  themeIdFromFilename,
  themeTitle,
  themeToJson,
  THEME_ID,
  validateThemeCss,
} from "../themes";
import {
  isNearBottom, shouldLoadOlder
} from "../scroll";
import { commandError, gateQr, QR_CAPTION } from "../signin";
import { hydrateMix, replaceGuildVoice, setSpeaking } from "../voice";
import { clear, el } from "./dom";
import {
  parseFlag,
  parseIdMap
} from "../server-model";
import { loadSettingsPages } from "./lazy-chrome";
import { patchSignIn, renderSignIn } from "./signin";
import {
  applyUserChrome
} from "../user-settings";
import type { PerfMarks } from "./app-shared";
import { downloadFile, isTauri, invoke, readStringMap, readJson } from "./app-shared";
import { defineMethods } from "./app-shared";
import type { LarkApp } from "./app";

export const bootMethods = defineMethods({
  async start() {
    const perf: PerfMarks = {
      ready: 0,
      lastSwitch: 0,
      lastInput: 0,
      lastLoad: 0,
      switchAt: 0,
      displayHz: 0,
      benchFrames: (ms) => this.frames.bench(ms),
    };
    (window as unknown as { __lark: PerfMarks }).__lark = perf;
    (globalThis as { larkCreateEvent?: (guildId: string) => void }).larkCreateEvent = (guildId) => {
      this.onCreateEvent(guildId);
    };
    this.narrow = this.root.clientWidth < 880;
    const saved = localStorage.getItem("lark.config.v1");
    if (saved) {
      try {
        this.config = sanitizeConfig(JSON.parse(saved));
      } catch {
        this.config = defaultConfig();
      }
    }
    this.hardware = loadHardwareState(this.config.desktop.hardware_status, localStorage.getItem(HARDWARE_STORAGE_KEY));
    this.gameMode = this.config.desktop.game_mode;
    try {
      this.pack = sanitizePack(JSON.parse(localStorage.getItem("lark.pack.v1") ?? "{}"));
    } catch {
      this.pack = defaultPack();
    }
    this.armSessionClock();
    this.away.lastActivity = Date.now();
    this.imported = loadImportedThemes(localStorage.getItem("lark.imported-themes.v1"));
    this.preferBuiltin = localStorage.getItem("lark.theme.builtin") === "1";
    for (const [id, css] of this.imported) this.themeCache.set(id, css);
    this.extraThemeIds = [...this.imported.keys()];
    this.seedUnreads();
    this.folderOpen = readStringMap("lark.folders.v1");
    this.favorites = parseIdMap(localStorage.getItem("lark.favorites.v1"));
    this.pinnedChannels = parseIdMap(localStorage.getItem("lark.channel-pins.v1"));
    this.bootLists();
    this.bootModView();
    this.hideMuted = parseFlag(localStorage.getItem("lark.hide-muted.v1"));
    const params = new URLSearchParams(location.search);
    this.bench = params.has("bench");
    this.statBoot = Date.now();
    try { this.statOff = localStorage.getItem("lark.stats.off") === "1"; } catch { this.statOff = true; }
    if (!params.has("demo")) {
      const stored = this.ensureFolderSync().load();
      if (stored) this.folders = stored.folders;
    }
    try {
      const cats = JSON.parse(localStorage.getItem("lark.categories.v1") ?? "null");
      if (Array.isArray(cats)) {
        this.collapsedCats = new Set(cats.filter((id): id is string => typeof id === "string"));
        this.catSeeded = true;
      }
    } catch {
      this.collapsedCats = new Set();
    }
    try {
      this.reminders = sanitizeReminders(JSON.parse(localStorage.getItem("lark.reminders.v1") ?? "[]"));
    } catch {
      this.reminders = [];
    }
    this.loadMissed();
    this.quietOn = inQuietHours(this.config.notifications.quiet, new Date());
    void this.pullSaved();
    void this.hydrateDrafts();
    try {
      const parsed = JSON.parse(localStorage.getItem("lark.emoji.v1") ?? "[]");
      if (Array.isArray(parsed)) this.emojiUses = parsed;
    } catch {
      this.emojiUses = [];
    }
    const cached = readJson("lark.cache.v1") as { pages?: Record<string, RawMessage[]> };
    if (cached.pages) {
      for (const [id, messages] of Object.entries(cached.pages)) {
        if (!Array.isArray(messages) || !messages.length) continue;
        const trimmed = messages.length > HISTORY_PAGE;
        this.pages[id] = initialHistory(messages as RawMessage[]);
        if (trimmed) this.more[id] = true;
      }
      this.reindexLoaded();
    }
    try {
      this.savedPlace = parsePlace(JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null"));
    } catch {
      this.savedPlace = { guildId: null, channelId: null };
    }
    try {
      this.stripOpen = readStripOpen(localStorage.getItem(CALL_STRIP_KEY));
      this.pipCorner = readPipCorner(localStorage.getItem(CALL_PIP_KEY));
      this.splitRatio = readSplitRatio(localStorage.getItem(CALL_SPLIT_KEY));
    } catch {
      this.stripOpen = false;
    }
    this.build();
    const warmCatalog = () => {
      void this.loadPlugins();
      void this.applyTheme();
    };
    if (params.has("bench")) window.setTimeout(warmCatalog, 8000);
    else warmCatalog();
    if (!params.has("bench")) {
      const idle = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 0 }), 400));
      idle(() => {
        void loadSettingsPages();
        void import("./guild-pages");
        void import("./channel-settings");
      });
    }
    this.syncGameEffects();
    this.frames.setCap(this.config.desktop.frame_cap);
    if (!isTauri() && params.has("notice")) {
      this.tokenNote = "Discord rejected the token (HTTP 401). Lark sent it only to discord.com. It may be expired, revoked, or still wrapped in quotes.";
    }
    if (!isTauri() && params.has("splash")) this.showPreviewSplash();
    else if (params.has("demo")) {
      if (params.has("streamer")) this.config.privacy.streamer = true;
      this.enterDemo();
    }
    else {
      const initial = await gateQr(isTauri());
      this.qrSvg = initial.svg;
      this.qrStatus = initial.status;
      this.paint();
    }
    if (isTauri()) await this.bootDesktop();
    perf.ready = performance.now();
    void this.frames.measureDisplay().then((hz) => {
      perf.displayHz = hz;
      if (this.settings && this.section === "window") this.renderSettings();
    });
    new ResizeObserver(() => {
      const narrow = this.root.clientWidth < 880;
      if (narrow !== this.narrow) {
        this.narrow = narrow;
        if (!narrow) this.drawer = false;
        this.paint();
      }
    }).observe(this.root);
    this.scheduleLate();
  },
  seedUnreads() {
    for (const list of Object.values(demoChannels)) {
      for (const channel of list) {
        this.localUnread[channel.id] = channel.unread ?? 0;
        this.localMentions[channel.id] = channel.mentions ?? 0;
        this.refreshChannelBadge(channel.id);
      }
    }
    for (const dm of demoDms) {
      this.localUnread[dm.id] = dm.unread ?? 0;
      this.localMentions[dm.id] = dm.mentions ?? 0;
      this.refreshChannelBadge(dm.id);
    }
  },
  async bootDesktop() {
    try {
      const info = await invoke<PlatformInfo & { os: string; credentialStore: string; configDir: string; themesDir: string; pluginsDir: string; clipsDir: string; configFile: string; notificationNote: string }>("app_paths");
      this.platform = {
        os: info.os === "macos" || info.os === "windows" || info.os === "linux" ? info.os : "other",
        credentialStore: info.credentialStore,
        configDir: info.configDir,
        themesDir: info.themesDir,
        pluginsDir: info.pluginsDir,
        clipsDir: info.clipsDir,
        configFile: info.configFile,
        notificationNote: info.notificationNote,
      };
      this.config = sanitizeConfig(await invoke("get_config"));
      this.syncGameEffects();
      const { listen } = await import("@tauri-apps/api/event");
      await listen("theme-changed", () => {
        this.themeCache.clear();
        for (const [id, css] of this.imported) this.themeCache.set(id, css);
        void this.applyTheme();
      });
      await listen<{ kind: string }>("config-changed", () => {
        if (!this.settings) void this.reloadConfig();
      });
      await listen("discord", (event) => this.onDiscord(event.payload));
      await listen("voice-overlay-hotkey", () => this.toggleVoiceOverlay());
      await listen("perf-overlay-hotkey", () => this.togglePerfOverlay());
      await listen("game-mode-hotkey", () => this.toggleGameMode());
      await listen("voice-mute-hotkey", () => {
        if (this.acceptAudioHotkey("mute")) this.toggleMute();
      });
      await listen("voice-deafen-hotkey", () => {
        if (this.acceptAudioHotkey("deafen")) this.toggleDeafen();
      });
      await listen("voice-overlay-dismissed", () => this.setVoiceOverlay(false, true));
      await listen<{ ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }>("clip-ready", (event) => {
        this.onClipReady(event.payload);
      });
      await listen<{ name?: string; percent?: number }>("clip-compress", (event) => {
        if (!event.payload?.name || typeof event.payload.percent !== "number") return;
        this.clipProgress = { name: event.payload.name, percent: event.payload.percent };
        if (this.clipsOpen || (this.settings && this.section === "clips")) this.paint();
      });
      await listen<{ id?: string; error?: string }>("soundboard", (event) => {
        if (event.payload.error) this.toast("Soundboard", event.payload.error);
      });
      await listen<{ phase?: string; detail?: string; svg?: string; username?: string }>("login-status", (event) => {
        this.onLoginStatus(event.payload);
      });
      await listen<{ phase?: string; detail?: string; svg?: string; username?: string }>("qr-login", (event) => {
        this.onQrLogin(event.payload);
      });
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      this.focused = await win.isFocused();
      await win.onFocusChanged(({ payload }) => {
        this.focused = payload;
        if (payload) this.surfaceMissed("focus");
      });
      await win.onResized(() => {
        void win.isMinimized().then((minimized) => this.noteShareVisibility(minimized || document.hidden));
      });
      if (await invoke<boolean>("has_token")) {
        this.connection = "Connecting";
        this.beginStartup(true);
        await invoke("connect");
        if (!this.demo) this.ensureFolderSync().retry();
      }
      if (this.view === "gate" && !this.signInBusy) this.ensureQr();
    } catch (err) {
      this.abortStartup();
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Desktop bridge unavailable.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  },
  async reloadConfig() {
    this.config = sanitizeConfig(await invoke("get_config"));
    this.syncGameEffects();
    this.paint();
  },
  build() {
    this.root.replaceChildren();
    this.gate = el("section", "gate");
    this.shell = el("div", "shell");
    this.rail = el("nav", "rail");
    this.rail.setAttribute("aria-label", "Servers");
    this.rail.addEventListener("pointerdown", (event) => this.onRailPointerDown(event));
    this.rail.addEventListener("pointermove", (event) => this.onRailPointerMove(event));
    this.rail.addEventListener("pointerup", (event) => this.onRailPointerUp(event));
    this.rail.addEventListener("pointercancel", (event) => this.onRailPointerUp(event));
    this.rail.addEventListener("contextmenu", (event) => this.onRailContextMenu(event));
    this.root.addEventListener("pointerdown", (event) => {
      if (this.folderMenuEl && !this.folderMenuEl.contains(event.target as Node)) this.closeFolderMenu();
    });
    this.channelPane = el("aside", "channels");
    const chat = el("main", "chat");
    this.chatHead = el("header", "chat-head");
    this.messagesEl = el("div", "messages");
    this.messagesEl.setAttribute("aria-label", "Messages");
    this.typingEl = el("div", "typing");
    const composerWrap = el("div", "composer-wrap");
    const composer = el("form", "composer");
    this.suggestEl = el("div", "suggest");
    this.suggestEl.hidden = true;
    this.clipBanner = el("div", "composer-banner clip-banner");
    this.clipBanner.hidden = true;
    this.composerBanner = el("div", "composer-banner");
    this.composer = el("textarea");
    this.composer.rows = 1;
    this.composer.placeholder = "Message";
    this.composer.setAttribute("aria-label", "Message");
    this.composerMeta = el("div", "composer-meta");
    composer.append(this.suggestEl, this.clipBanner, this.composerBanner, this.composer, this.composerMeta);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send();
    });
    composerWrap.append(composer);
    this.callStrip = el("div", "call-strip");
    this.callStrip.hidden = true;
    this.callSplit = el("section", "call-split");
    this.callSplit.hidden = true;
    this.callSplitBar = el("div", "call-split-bar");
    this.voiceDock = el("section", "voice-stage");
    this.callSplit.append(this.callSplitBar, this.voiceDock);
    this.callHandle = el("div", "call-handle");
    this.callHandle.hidden = true;
    this.callHandle.setAttribute("role", "separator");
    this.callHandle.setAttribute("aria-orientation", "horizontal");
    this.callHandle.setAttribute("aria-label", "Resize call view");
    this.callPip = el("div", "call-pip");
    this.callPip.dataset.callPip = "";
    this.callPip.hidden = true;
    this.callPip.setAttribute("aria-label", "Call preview");
    this.shareLayer = el("div", "share-layer");
    this.shareLayer.hidden = true;
    this.newBar = el("button", "new-bar", "New messages");
    this.newBar.type = "button";
    this.newBar.hidden = true;
    this.newBar.addEventListener("click", () => this.jumpToBottom());
    this.boardHost = el("div", "dash-board-host");
    this.boardHost.hidden = true;
    chat.append(this.chatHead, this.callStrip, this.callSplit, this.callHandle, this.boardHost, this.messagesEl, this.typingEl, composerWrap, this.newBar);
    this.splitPane = el("section", "split");
    this.splitPane.hidden = true;
    this.stage = el("div", "stage");
    this.stage.append(chat, this.splitPane);
    this.membersEl = el("aside", "members");
    this.shell.append(this.rail, this.channelPane, this.stage, this.membersEl);
    this.switcherEl = el("div", "overlay");
    this.switcherEl.hidden = true;
    this.settingsEl = el("div", "settings-layer");
    this.settingsEl.hidden = true;
    this.clipDialog = el("div", "overlay");
    this.clipDialog.hidden = true;
    this.settingsEl.setAttribute("role", "dialog");
    this.settingsEl.setAttribute("aria-modal", "true");
    this.settingsEl.setAttribute("aria-label", "Settings");
    this.lightboxEl = el("div", "overlay lightbox");
    this.lightboxEl.hidden = true;
    this.lightboxEl.addEventListener("click", () => {
      this.lightbox = null;
      this.paintLightbox();
    });
    this.youtubeFloatEl = el("div", "yt-pip");
    this.youtubeFloatEl.hidden = true;
    this.youtubeFloatEl.setAttribute("role", "dialog");
    this.youtubeFloatEl.setAttribute("aria-label", "YouTube");
    this.hudEl = el("div", "voice-hud-host");
    this.hudEl.hidden = true;
    this.voiceMenuEl = el("div", "voice-menu");
    this.voiceMenuEl.hidden = true;
    this.voiceGearEl = el("div", "voice-gear");
    this.voiceGearEl.hidden = true;
    this.toastWrap = el("div", "toast-wrap");
    this.updateBannerEl = el("div", "update-banner");
    this.updateBannerEl.hidden = true;
    this.updateBannerEl.setAttribute("role", "status");
    this.updateBannerEl.setAttribute("aria-live", "polite");
    this.toastWrap.append(this.updateBannerEl);
    this.interfaceToastEl = el("div", "interface-toast");
    this.interfaceToastEl.hidden = true;
    this.interfaceToastEl.setAttribute("role", "status");
    this.interfaceToastEl.setAttribute("aria-live", "polite");
    this.toastWrap.append(this.interfaceToastEl);
    this.inviteEl = el("div", "overlay");
    this.inviteEl.hidden = true;
    this.splashEl = el("section", "startup");
    this.splashEl.hidden = true;
    this.splashEl.setAttribute("role", "status");
    this.splashEl.setAttribute("aria-live", "polite");
    this.splashEl.setAttribute("aria-busy", "true");
    const splashCard = el("div", "startup-card");
    this.splashStatus = el("p", "startup-status", "Connecting to Discord");
    this.splashTrack = el("div", "startup-track");
    this.splashTrack.setAttribute("role", "progressbar");
    this.splashTrack.setAttribute("aria-valuemin", "0");
    this.splashTrack.setAttribute("aria-valuemax", "100");
    this.splashTrack.setAttribute("aria-valuenow", "0");
    this.splashTrack.setAttribute("aria-label", "Loading Lark");
    this.splashBar = el("div", "startup-bar");
    this.splashTrack.append(this.splashBar);
    splashCard.append(el("div", "mark", "L"), el("h1", "", "Lark"), this.splashStatus, this.splashTrack);
    this.splashEl.append(splashCard);
    this.root.append(this.gate, this.shell, this.switcherEl, this.settingsEl, this.clipDialog, this.lightboxEl, this.youtubeFloatEl, this.inviteEl, this.hudEl, this.callPip, this.shareLayer, this.voiceMenuEl, this.voiceGearEl, this.toastWrap, this.splashEl);
    this.bindCallChrome();
    document.addEventListener("visibilitychange", () => this.noteShareVisibility(document.hidden));
    this.root.addEventListener("pointerdown", (event) => this.dismissVoiceFloats(event));
    this.stage.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!(link instanceof HTMLAnchorElement)) return;
      const code = inviteCode(link.href);
      if (!code) return;
      event.preventDefault();
      this.openInvite(code);
    });
    this.composer.addEventListener("keydown", (event) => {
      if (this.suggest.length && !this.suggestEl.hidden) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : this.suggest.length - 1;
          this.suggestIndex = (this.suggestIndex + step) % this.suggest.length;
          this.refreshSuggest();
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          this.commitSuggest();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this.closeSuggest();
          return;
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.send();
      }
    });
    this.composer.addEventListener("input", () => {
      const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
      if (perf) perf.lastInput = performance.now();
      if (!this.composerFrame) {
        this.composerFrame = requestAnimationFrame(() => {
          this.composerFrame = 0;
          this.composer.style.height = "auto";
          this.composer.style.height = `${Math.min(this.composer.scrollHeight, 160)}px`;
          if (this.countEl) this.countEl.textContent = composerCount(this.composer.value, this.hookOn("wordCount"));
          this.saveDraft();
          this.refreshSuggest();
        });
      }
      if (this.demo || !this.channelId || this.hookOn("silentTyping") || this.hideActivity()) return;
      const now = Date.now();
      if (now - this.typingSent > 8000) {
        this.typingSent = now;
        void invoke("typing", { channelId: this.channelId });
      }
    });
    this.composer.addEventListener("paste", (event) => {
      const files = event.clipboardData?.files;
      if (files && files.length) {
        event.preventDefault();
        void this.takeFiles(files);
      }
    });
    composerWrap.addEventListener("dragover", (event) => {
      event.preventDefault();
      composerWrap.classList.add("is-drop");
    });
    composerWrap.addEventListener("dragleave", () => composerWrap.classList.remove("is-drop"));
    composerWrap.addEventListener("drop", (event) => {
      event.preventDefault();
      composerWrap.classList.remove("is-drop");
      const dragged = event.dataTransfer?.getData(CLIP_DRAG) || "";
      const plain = event.dataTransfer?.getData("text/plain") || "";
      const name = dragged || (isClipFileName(plain) ? plain : "");
      if (name) {
        void this.attachClipByName(name);
        return;
      }
      void this.takeFiles(event.dataTransfer?.files ?? null);
    });
    this.root.addEventListener("click", (event) => this.cleanClickedLink(event), true);
    window.addEventListener("keydown", (event) => {
      this.away = noteActivity(this.away, Date.now());
      this.onKey(event);
    });
    window.addEventListener("keyup", (event) => this.onKeyUp(event));
    window.addEventListener("pointerdown", () => {
      this.away = noteActivity(this.away, Date.now());
    }, { passive: true });
    this.bindPolls();
    this.startUpdates();
    this.messagesEl.addEventListener("scroll", () => {
      if (this.scrollLock > 0) return;
      const top = this.messagesEl.scrollTop;
      this.pinnedToBottom = isNearBottom(top, this.messagesEl.scrollHeight, this.messagesEl.clientHeight);
      this.nearBottom = this.pinnedToBottom;
      if (this.nearBottom && this.freshCount) {
        this.freshCount = 0;
        this.paintNewBar();
        const last = this.pages[this.channelId ?? ""]?.at(-1);
        if (this.channelId && last) this.ackChannel(this.channelId, last.id);
      }
      if (shouldLoadOlder({
        scrollTop: top,
        locked: false,
        loading: this.loading,
        hasMore: Boolean(this.channelId && this.more[this.channelId]),
        sinceOpenMs: performance.now() - this.openedAt,
      })) void this.loadOlder();
      if (this.messageFrame) return;
      this.messageFrame = requestAnimationFrame(() => {
        this.messageFrame = 0;
        this.syncMessageWindow();
        this.noteLocalReceipts();
      });
    }, { passive: true });
  },
  enterDemo() {
    this.demo = true;
    this.view = "app";
    this.connection = "Sample data";
    this.guildId = NORTHWIND;
    this.folders = [{ id: "studio", name: "Studios", color: "#e2a15a", guildIds: [NORTHWIND, "100000000000000011"] }];
    this.access[NORTHWIND] = {
      owner: false,
      permissions: "1024",
      roles: [{ id: NORTHWIND, permissions: "1024" }],
      myRoles: [],
    };
    this.notes["100000000000000002"] = "Prefers the booth quiet.";
    for (const person of people) {
      this.directory[person.id] = person;
      this.userNames[person.id] = person.name;
    }
    const shareMode = new URLSearchParams(location.search).get("share");
    this.seedDemoVoice(shareMode === "live");
    const named = cleanGameName(new URLSearchParams(location.search).get("game") ?? "");
    if (named && this.config.desktop.detect_games) this.noteGame(named);
    this.revealShell();
    this.splashEl.hidden = true;
    const openClips = new URLSearchParams(location.search).has("clips");
    void this.openChannel(CRIT).then(() => {
      if (openClips) this.openClips();
      if (shareMode === "dialog" || shareMode === "live") this.openDemoShare(shareMode);
    });
  },
  seedDemoVoice(sharing = false) {
    const channelId = demoChannels[NORTHWIND].find((channel) => channel.kind === "voice")?.id;
    if (!channelId) return;
    const focusBooth = new URLSearchParams(location.search).get("booth") === "focus";
    replaceGuildVoice(this.voiceRoster, NORTHWIND, [
      { guildId: NORTHWIND, channelId, userId: booth[0].id, name: booth[0].name },
      { guildId: NORTHWIND, channelId, userId: booth[1].id, name: booth[1].name, selfMute: true, ...(sharing || focusBooth ? { selfStream: true } : {}) },
      { guildId: NORTHWIND, channelId, userId: "100000000000000004", name: "Priya Shah" },
    ]);
    setSpeaking(this.voiceRoster, booth[0].id, true);
    hydrateMix(this.voiceRoster, this.config.voice.levels);
  },
  /** Cold connect (no shell yet) covers the window immediately. A live shell waits out a short reconnect. */
  beginStartup(cold: boolean) {
    if (this.holdShell) return;
    this.holdShell = true;
    this.splashLeaving = false;
    this.landingWarmStarted = false;
    this.channelCheckQueued = false;
    this.startupCold = cold || !this.shellShown;
    this.resumeOverlay = this.shellShown && !this.startupCold;
    this.startupMilestone = "connect";
    this.startupStepAt = performance.now();
    this.splashShownAt = this.startupStepAt;
    this.gate.hidden = true;
    if (!this.shellShown) this.shell.hidden = true;
    this.syncSplash();
    this.armSplashCap();
  },
  /** Browser preview of the cold-start splash, then the sample shell. */
  showPreviewSplash() {
    this.beginStartup(true);
    const steps: StartupMilestone[] = ["ready", "channels"];
    let index = 0;
    const tick = () => {
      if (!this.holdShell) return;
      if (index >= steps.length) {
        this.demo = true;
        this.view = "app";
        this.connection = "Sample data";
        this.guildId = NORTHWIND;
        this.folders = [{ id: "studio", name: "Studios", color: "#e2a15a", guildIds: [NORTHWIND, "100000000000000011"] }];
        this.access[NORTHWIND] = {
          owner: false,
          permissions: "1024",
          roles: [{ id: NORTHWIND, permissions: "1024" }],
          myRoles: [],
        };
        this.seedDemoVoice();
        const page = pageMessages(history[CRIT] ?? [], undefined, HISTORY_PAGE);
        this.pages[CRIT] = page.messages;
        this.more[CRIT] = page.hasMore;
        this.channelId = CRIT;
        this.startupMilestone = "channels";
        this.startupStepAt = performance.now();
        this.finishStartup();
        return;
      }
      this.startupMilestone = steps[index];
      this.startupStepAt = performance.now();
      index += 1;
      this.syncSplash();
      window.setTimeout(tick, 800);
    };
    window.setTimeout(tick, 800);
  },
  noteGatewayLiveness(state: string | undefined) {
    if (state === "failed" || state === "disconnected") {
      this.gatewayDownAt = 0;
      this.clearSlowSplash();
      if (state === "disconnected" && this.holdShell) this.abortStartup();
      return;
    }
    if (state === "connecting" || state === "reconnecting") {
      if (!this.gatewayDownAt) this.gatewayDownAt = performance.now();
      if (!this.shellShown && !this.holdShell) this.beginStartup(true);
      else if (this.shellShown && !this.holdShell && !this.slowSplashTimer) {
        this.slowSplashTimer = window.setTimeout(() => {
          this.slowSplashTimer = 0;
          if (!this.gatewayDownAt || this.holdShell) return;
          const waited = performance.now() - this.gatewayDownAt;
          if (shouldShowSplash(this.shellShown, waited)) this.beginStartup(false);
        }, SLOW_CONNECT_MS);
      }
      return;
    }
    if (state === "connected") {
      this.gatewayDownAt = 0;
      this.clearSlowSplash();
      if (this.holdShell && this.resumeOverlay && this.startupMilestone === "connect") this.finishStartup();
    }
  },
  onStartupReady() {
    this.startupMilestone = "ready";
    this.startupStepAt = performance.now();
    const guildIds = this.liveGuilds.map((guild) => guild.id);
    this.guildId = preferredGuild(guildIds, this.landingPlace().guildId);
    if (this.guildId) this.liveMembers = this.membersByGuild[this.guildId] ?? [];
    void this.ensureHome();
    if (this.guildId && !this.liveChannels[this.guildId]) void this.ensureChannels(this.guildId);
    if (this.guildId && !(this.membersByGuild[this.guildId]?.length)) void this.ensureMembers(this.guildId);
    window.clearTimeout(this.channelGraceTimer);
    this.channelGraceTimer = window.setTimeout(() => this.considerChannels(), STARTUP_CHANNEL_WAIT_MS);
    this.queueChannelCheck();
    this.syncSplash();
  },
  landingPlace(): SavedPlace {
    if (this.shellShown && this.channelId) return { guildId: this.guildId, channelId: this.channelId };
    return this.savedPlace;
  },
  queueChannelCheck() {
    if (!this.holdShell || this.landingWarmStarted || this.channelCheckQueued) return;
    this.channelCheckQueued = true;
    // Let the rest of this gateway burst (channel lists, access) land before choosing a channel.
    window.setTimeout(() => {
      this.channelCheckQueued = false;
      this.considerChannels();
    }, 32);
  },
  considerChannels() {
    if (!this.holdShell || this.landingWarmStarted || this.startupMilestone === "connect") return;
    const guildIds = this.liveGuilds.map((guild) => guild.id);
    const place = this.landingPlace();
    const landingGuildId = preferredGuild(guildIds, place.guildId);
    const savedDm = Boolean(place.channelId && this.liveDms.some((channel) => channel.id === place.channelId));
    if (!savedDm && !channelsReady({
      ready: this.gatewayReadyAt > 0,
      guildIds,
      channeled: new Set(Object.keys(this.liveChannels)),
      landingGuildId,
      readyAt: this.gatewayReadyAt,
      now: Date.now(),
    })) return;
    this.landingWarmStarted = true;
    window.clearTimeout(this.channelGraceTimer);
    this.channelGraceTimer = 0;
    const target = landingTarget({
      place,
      guildIds,
      channelsByGuild: this.visibleChannelMap(),
      dms: this.liveDms.map((channel) => ({ id: channel.id, kind: channel.kind })),
    });
    this.guildId = target.guildId;
    this.channelId = target.channelId;
    if (target.guildId) {
      this.liveMembers = this.membersByGuild[target.guildId] ?? [];
      if (!(this.membersByGuild[target.guildId]?.length)) void this.ensureMembers(target.guildId);
    }
    this.startupMilestone = "channels";
    this.startupStepAt = performance.now();
    this.syncSplash();
    void this.warmLanding(target.channelId);
  },
  visibleChannelMap(): Record<string, { id: string; kind: string }[]> {
    const out: Record<string, { id: string; kind: string }[]> = {};
    for (const [guildId, list] of Object.entries(this.liveChannels)) {
      out[guildId] = list
        .filter((channel) => this.canSeeChannel(guildId, channel))
        .map((channel) => ({ id: channel.id, kind: channel.kind }));
    }
    return out;
  },
  async warmLanding(channelId: string | null) {
    // The splash does not wait on history. openChannel paints the cached page,
    // or a skeleton, and fetches the newest 20 without blocking the first paint.
    void channelId;
    if (!this.holdShell) return;
    this.startupMilestone = "cache";
    this.startupStepAt = performance.now();
    this.finishStartup();
  },
  finishStartup(force = false) {
    if (!this.holdShell) {
      if (force) this.hideSplash();
      return;
    }
    if (force && this.splashFinishTimer) {
      window.clearTimeout(this.splashFinishTimer);
      this.splashFinishTimer = 0;
    }
    const wait = force ? 0 : splashReleaseDelay(performance.now() - this.splashShownAt);
    if (wait > 0) {
      if (this.splashFinishTimer) return;
      this.startupMilestone = "ui";
      this.startupStepAt = performance.now();
      this.syncSplash();
      this.splashFinishTimer = window.setTimeout(() => {
        this.splashFinishTimer = 0;
        this.finishStartup();
      }, wait);
      return;
    }
    const overlay = this.resumeOverlay;
    this.holdShell = false;
    this.shellShown = true;
    this.splashLeaving = true;
    this.resumeOverlay = false;
    window.clearTimeout(this.channelGraceTimer);
    this.channelGraceTimer = 0;
    this.clearSlowSplash();
    this.clearSplashCap();
    if (!overlay) {
      this.view = "app";
      // Channel open paints into the shell. The splash hid that shell, and
      // message paint does not show it, which left a blank window in 2.4.4.
      this.revealShell();
      const id = this.channelId;
      if (id) void this.openChannel(id);
      else this.paint();
    } else this.paintConnection();
    this.syncSplash();
    window.clearTimeout(this.splashHideTimer);
    this.splashHideTimer = window.setTimeout(() => this.hideSplash(), 280);
  },
  hideSplash() {
    this.splashHideTimer = 0;
    this.splashLeaving = false;
    if (!this.splashEl) return;
    this.splashEl.hidden = true;
    this.splashEl.classList.remove("is-leaving");
  },
  abortStartup() {
    const cold = !this.shellShown;
    this.holdShell = false;
    this.splashLeaving = false;
    this.landingWarmStarted = false;
    this.channelCheckQueued = false;
    this.resumeOverlay = false;
    this.clearStartupTimers();
    if (this.splashFrame) {
      cancelAnimationFrame(this.splashFrame);
      this.splashFrame = 0;
    }
    if (this.splashEl) {
      this.splashEl.hidden = true;
      this.splashEl.classList.remove("is-leaving");
    }
    if (cold && this.gate && this.shell) {
      this.view = "gate";
      this.gate.hidden = false;
      this.shell.hidden = true;
    }
  },
  clearSlowSplash() {
    if (!this.slowSplashTimer) return;
    window.clearTimeout(this.slowSplashTimer);
    this.slowSplashTimer = 0;
  },
  clearStartupTimers() {
    this.clearSlowSplash();
    this.clearSplashCap();
    if (this.channelGraceTimer) window.clearTimeout(this.channelGraceTimer);
    if (this.splashFinishTimer) window.clearTimeout(this.splashFinishTimer);
    if (this.splashHideTimer) window.clearTimeout(this.splashHideTimer);
    this.channelGraceTimer = 0;
    this.splashFinishTimer = 0;
    this.splashHideTimer = 0;
  },
  /** Drop the splash if connect, channels, or the first paint never finish. */
  armSplashCap() {
    this.clearSplashCap();
    this.splashCapTimer = window.setTimeout(() => {
      this.splashCapTimer = 0;
      if (!this.holdShell && !this.splashLeaving) return;
      this.finishStartup(true);
    }, SPLASH_CAP_MS);
  },
  clearSplashCap() {
    if (!this.splashCapTimer) return;
    window.clearTimeout(this.splashCapTimer);
    this.splashCapTimer = 0;
  },
  /** Show the gate or the shell. Message paint does not do this on its own. */
  revealShell() {
    if (this.holdShell) return;
    this.gate.hidden = this.view !== "gate";
    this.shell.hidden = this.view !== "app";
  },
  syncSplash() {
    if (!this.splashEl) return;
    const visible = this.holdShell || this.splashLeaving;
    this.splashEl.hidden = !visible;
    this.splashEl.classList.toggle("is-leaving", this.splashLeaving && !this.holdShell);
    this.splashEl.setAttribute("aria-busy", this.holdShell ? "true" : "false");
    const milestone: StartupMilestone = this.splashLeaving && !this.holdShell ? "ui" : this.startupMilestone;
    const elapsed = performance.now() - this.startupStepAt;
    const value = startupProgress(milestone, elapsed);
    const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
    this.splashBar.style.width = `${pct}%`;
    this.splashTrack.setAttribute("aria-valuenow", String(pct));
    const label = startupLabel(milestone, this.startupCold);
    this.splashTrack.setAttribute("aria-valuetext", label);
    this.splashEl.dataset.milestone = milestone;
    if (this.splashStatus.textContent !== label) this.splashStatus.textContent = label;
    if (this.holdShell && !this.splashFrame) {
      this.splashFrame = requestAnimationFrame(() => {
        this.splashFrame = 0;
        if (this.holdShell) this.syncSplash();
      });
    }
  },
  rememberPlace(channelId: string) {
    this.savedPlace = { guildId: this.guildId, channelId };
    localStorage.setItem(PLACE_KEY, JSON.stringify(this.savedPlace));
  },
  paint() {
    try {
      this.paintView();
    } catch (error) {
      reportCrash(error);
    }
  },
  paintView() {
    if (this.holdShell) {
      this.gate.hidden = true;
      this.shell.hidden = !this.shellShown;
      this.syncSplash();
      localizeTree(this.root);
      return;
    }
    this.revealShell();
    this.applyAppearance();
    if (this.view === "gate") this.paintGate();
    if (this.view === "app") {
      this.paintRail();
      this.paintChannels();
      this.paintHeader();
      this.paintMessages();
      this.paintSplit();
      this.paintVoice();
      this.paintMembers();
      this.paintComposer();
      this.syncBadge();
    }
    this.paintClipDialog();
    this.paintLightbox();
    this.paintYoutubeFloat();
    this.paintBookmarks();
    this.paintInvite();
    this.publishVoiceHud();
    if (!this.splashLeaving) this.splashEl.hidden = true;
    localizeTree(this.root);
  },
  applyAppearance() {
    const language = this.config.preferences.language || "en";
    setLocale(language);
    if (language !== "en" && language !== "en-GB") {
      void ensurePhrases().then(() => {
        if ((this.config.preferences.language || "en") === language) localizeTree(this.root);
      });
    }
    const appearance = this.config.appearance;
    document.documentElement.classList.toggle("is-game-mode", this.gameMode);
    document.documentElement.style.setProperty("--speak", speakColor(this.config.voice.speak_color));
    this.root.dataset.density = appearance.density;
    this.root.dataset.narrow = this.narrow ? "on" : "off";
    const guild = this.guilds().find((item) => item.id === this.guildId);
    const accent = guild && this.config.accents[guild.id];
    if (accent) this.root.style.setProperty("--accent", accent);
    else this.root.style.removeProperty("--accent");
    this.root.dataset.drawer = this.drawer ? "on" : "off";
    this.root.style.setProperty("--ui-size", `${appearance.font_size}px`);
    if (appearance.font_family === "inter") this.root.style.removeProperty("font-family");
    else this.root.style.fontFamily = fontStack(appearance.font_family);
    const dmSidebar = !this.guildId && !this.friendsOpen && this.currentChannelIsDm();
    const homeFeed = this.dashboardHome();
    const dashDock = this.dashboardOpen && !homeFeed;
    const compact = compactGameChrome({
      gameMode: this.gameMode,
      inCall: Boolean(this.voice),
      gameDetected: Boolean(this.detectedGame),
    });
    this.root.dataset.gameChrome = compact ? "on" : "off";
    const membersWanted = !compact && !this.narrow && (dashDock || (appearance.show_member_list && (this.guildId || dmSidebar)));
    const widths = gameShellWidths({
      compact,
      showRail: appearance.show_server_rail,
      channelHidden: appearance.channel_list === "hidden",
      membersPx: membersWanted ? (dashDock ? 320 : 240) : 0,
    });
    const rail = `${widths.railPx}px`;
    const channelW = `${widths.channelPx}px`;
    const members = `${widths.membersPx}px`;
    this.rail.hidden = !appearance.show_server_rail;
    this.channelPane.hidden = appearance.channel_list === "hidden" && !this.drawer;
    this.membersEl.hidden = widths.membersPx === 0 && !(this.narrow && dashDock && !compact);
    const callSplit = this.callSurface === "split";
    if (this.stage) {
      this.stage.classList.toggle("is-split", Boolean(this.splitId) && !this.narrow && !callSplit);
      this.splitPane.hidden = !this.splitId || this.narrow || callSplit;
    }
    if (this.narrow) {
      if (dashDock && !compact) {
        this.shell.style.gridTemplateColumns = `${rail} minmax(0, 1fr) 220px`;
        this.shell.style.gridTemplateAreas = `"rail chat members"`;
      } else {
        this.shell.style.gridTemplateColumns = `${rail} minmax(0, 1fr)`;
        this.shell.style.gridTemplateAreas = `"rail chat"`;
      }
    } else if (appearance.channel_list === "right") {
      this.shell.style.gridTemplateColumns = `${rail} minmax(0,1fr) ${channelW} ${members}`;
      this.shell.style.gridTemplateAreas = `"rail chat channels members"`;
    } else {
      this.shell.style.gridTemplateColumns = `${rail} ${channelW} minmax(0,1fr) ${members}`;
      this.shell.style.gridTemplateAreas = `"rail channels chat members"`;
    }
    if (this.appliedTheme !== appearance.theme) {
      this.appliedTheme = appearance.theme;
      void this.applyTheme();
    }
    applyUserChrome(this.root, this.config);
  },
  async applyTheme() {
    if (this.themePreview) {
      this.showThemeCss(this.themePreview.css, this.themePreview.id, false);
      return;
    }
    if (this.preferBuiltin) {
      document.getElementById("lark-theme")?.remove();
      delete document.documentElement.dataset.theme;
      this.syncMaterial("none");
      applyUserChrome(this.root, this.config);
      return;
    }
    const name = this.config.appearance.theme;
    if (!THEME_ID.test(name)) return;
    try {
      const css = await this.fetchThemeCss(name);
      let style = document.getElementById("lark-theme");
      if (!style) {
        style = document.createElement("style");
        style.id = "lark-theme";
        document.head.append(style);
      }
      if (style.textContent !== css) {
        style.textContent = css;
        this.themeCache.set(name, css);
        if (this.settings && this.section === "appearance") this.paintThemeGallery();
      } else {
        this.themeCache.set(name, css);
      }
      document.documentElement.dataset.theme = name;
      this.syncMaterial(parseThemeCss(css).material);
      applyUserChrome(this.root, this.config);
    } catch {
      /* Keep the last good theme. */
    }
  },
  async fetchThemeCss(name: string): Promise<string> {
    if (!THEME_ID.test(name)) throw new Error("invalid theme");
    if (!isTauri()) {
      const imported = this.imported.get(name);
      if (imported) return imported;
      const saved = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY)).themes[name];
      if (saved?.css) return saved.css;
    }
    if (isTauri()) return invoke<string>("read_theme", { name });
    const res = await fetch(`/themes/${name}.css`, { cache: "no-store" });
    if (!res.ok) throw new Error("missing theme");
    return res.text();
  },
  syncMaterial(material: "none" | "vibrancy") {
    if (this.materialWanted === material) return;
    this.materialWanted = material;
    if (!isTauri()) {
      document.documentElement.classList.remove("is-vibrancy");
      return;
    }
    void invoke<boolean>("set_window_material", { material })
      .then((on) => {
        if (this.materialWanted !== material) return;
        document.documentElement.classList.toggle("is-vibrancy", Boolean(on));
      })
      .catch(() => {
        if (this.materialWanted === material) this.materialWanted = null;
        document.documentElement.classList.remove("is-vibrancy");
      });
  },
  async refreshThemeIndex() {
    const ids = [...this.imported.keys()];
    if (!isTauri()) ids.push(...Object.keys(readLocalStore(localStorage.getItem(STORE_LOCAL_KEY)).themes));
    if (isTauri()) {
      try {
        ids.push(...(await invoke<string[]>("list_themes")));
      } catch {
        /* The shipped list still renders. */
      }
    }
    const pending = galleryEntries(ids).filter((theme) => !this.themeCache.has(theme.id));
    await Promise.all(
      pending.map(async (theme) => {
        try {
          this.themeCache.set(theme.id, await this.fetchThemeCss(theme.id));
        } catch {
          /* A listed file can be missing during a refresh. */
        }
      }),
    );
    const changed = ids.length !== this.extraThemeIds.length || ids.some((id, index) => id !== this.extraThemeIds[index]);
    this.extraThemeIds = ids;
    if (this.settings && this.section === "appearance" && (changed || pending.length > 0)) this.paintThemeGallery();
  },
  selectTheme(id: string) {
    if (!THEME_ID.test(id)) return;
    this.themePreview = null;
    this.preferBuiltin = false;
    localStorage.removeItem("lark.theme.builtin");
    for (const name of ["--bg-0", "--bg-2", "--text"]) this.root.style.removeProperty(name);
    this.config.appearance.theme = id;
    this.config.preferences.color_mode = "";
    this.persist();
    this.paint();
    if (this.settings && this.section === "appearance") this.paintThemeGallery();
  },
  paintThemeGallery(this: LarkApp, root: ParentNode = this.settingsEl) {
    const grid = root.querySelector(".theme-gallery");
    if (!(grid instanceof HTMLElement)) return;
    clear(grid);
    const visible = filterThemes(galleryEntries(this.extraThemeIds), this.themeFilter);
    for (const theme of visible) grid.append(this.themeCard(theme));
    const empty = root.querySelector(".theme-empty");
    if (!visible.length) {
      const note = this.themeFilter.trim() ? "No theme matches that." : "No themes installed. The built-in colours stay on.";
      if (!empty) grid.insertAdjacentElement("afterend", el("p", "theme-empty hint", note));
    } else {
      empty?.remove();
    }
  },
  themeCard(theme: { id: string; title: string; blurb: string }): HTMLButtonElement {
    const on = !this.config.preferences.color_mode && this.config.appearance.theme === theme.id;
    const card = el("button", `theme-card${on ? " is-on" : ""}`);
    card.type = "button";
    card.setAttribute("aria-label", `Apply ${theme.title}`);
    card.setAttribute("aria-pressed", on ? "true" : "false");
    const live = el("div", "theme-live");
    live.setAttribute("aria-hidden", "true");
    const css = this.themeCache.get(theme.id);
    if (css) {
      const parsed = parseThemeCss(css);
      live.style.colorScheme = parsed.colorScheme;
      for (const [key, value] of Object.entries(previewVars(css))) live.style.setProperty(key, value);
    } else {
      live.classList.add("is-pending");
    }
    const rail = el("div", "theme-live-rail");
    rail.append(el("i", "is-on"), el("i"), el("i"));
    const channels = el("div", "theme-live-channels");
    channels.append(el("span"), el("span", "is-on"), el("span"));
    const chat = el("div", "theme-live-chat");
    const pips = el("span", "theme-live-pips");
    for (const pip of ["ok", "idle", "busy"] as const) {
      const dot = el("i");
      dot.style.background = `var(--${pip})`;
      pips.append(dot);
    }
    chat.append(el("strong", "", "Lark"), el("b"), el("b", "short"), pips);
    live.append(rail, channels, chat);
    const meta = el("div", "theme-meta");
    meta.append(el("strong", "", theme.title), el("span", "", theme.blurb));
    if (on) meta.append(el("span", "theme-on", "On"));
    card.append(live, meta);
    card.addEventListener("click", () => this.selectTheme(theme.id));
    return card;
  },
  async importTheme(file: File) {
    let text = "";
    try {
      text = await file.text();
    } catch {
      this.toast("Theme", "Couldn't read that file.");
      return;
    }
    if (text.length > 16 * 1024) {
      this.toast("Theme", "Theme file is too large.");
      return;
    }
    let id = "";
    let css = "";
    try {
      const trimmed = text.trim();
      const filenameId = themeIdFromFilename(file.name) ?? undefined;
      if (file.name.toLowerCase().endsWith(".json") || trimmed.startsWith("{")) {
        const parsed = themeFromJson(text, filenameId);
        id = parsed.id;
        css = parsed.css;
      } else {
        if (!filenameId) throw new Error("Name the file with letters, numbers, and hyphens.");
        const problem = validateThemeCss(text);
        if (problem) throw new Error(problem);
        id = filenameId;
        css = text.endsWith("\n") ? text : `${text}\n`;
      }
    } catch (err) {
      this.toast("Theme", err instanceof Error ? err.message : "That file is not a Lark theme.");
      return;
    }
    if (isTauri()) {
      try {
        await invoke("write_theme", { name: id, css });
      } catch (err) {
        this.toast("Theme", err instanceof Error ? err.message : "Couldn't save that theme.");
        return;
      }
    } else {
      this.imported.set(id, css);
      localStorage.setItem("lark.imported-themes.v1", serializeImportedThemes(this.imported));
    }
    this.themeCache.set(id, css);
    if (!this.extraThemeIds.includes(id)) this.extraThemeIds.push(id);
    this.selectTheme(id);
    this.toast("Theme", `Applied ${themeTitle(id)}.`);
  },
  async exportTheme(kind: "css" | "json") {
    const id = this.config.appearance.theme;
    let css = (!isTauri() ? this.imported.get(id) : undefined) ?? this.themeCache.get(id);
    if (!css) {
      try {
        css = await this.fetchThemeCss(id);
        this.themeCache.set(id, css);
      } catch {
        this.toast("Theme", "This theme isn't loaded yet.");
        return;
      }
    }
    const overrides: Record<string, string> = {};
    for (const name of ["--bg-0", "--bg-2", "--text"]) {
      const value = this.root.style.getPropertyValue(name).trim();
      if (value) overrides[name] = value;
    }
    if (this.guildId && this.config.accents[this.guildId]) overrides["--accent"] = this.config.accents[this.guildId];
    const next = applyRootOverrides(css, overrides);
    const body = kind === "json" ? themeToJson(id, next) : next;
    downloadFile(`${id}.${kind}`, body, kind === "json" ? "application/json" : "text/css");
  },
  paintGate() {
    if (this.holdShell || this.splashLeaving) return;
    if (!this.qrSvg && !isTauri()) {
      void gateQr(false).then((initial) => {
        if (this.qrSvg || isTauri()) return;
        this.qrSvg = initial.svg;
        this.qrStatus = initial.status;
        this.paintGate();
      });
    }
    const accounts = this.config.sessions ?? [];
    const sig = accounts.map((account) => `${account.id}:${account.name}`).join(",");
    const existing = this.gate.querySelector(".gate-card");
    const actions = {
      onDiscord: () => void this.openDiscordLogin(),
      onBrowser: () => void this.openBrowserLogin(),
      onPreview: () => this.enterDemo(),
      onSave: (token: string) => void this.saveToken(token),
      onSwitch: (id: string) => void this.switchTo(id),
    };
    if (!existing || sig !== this.gateAccountSig) {
      this.gateAccountSig = sig;
      renderSignIn(this.gate, this.signInState(), actions);
    } else {
      patchSignIn(this.gate, this.signInState());
    }
  },
  signInState() {
    return {
      error: this.tokenNote,
      qrSvg: this.qrSvg,
      qrStatus: this.qrStatus,
      store: this.platform.credentialStore,
      busy: this.signInBusy,
      accounts: this.config.sessions ?? [],
    };
  },
  ensureQr() {
    if (!isTauri() || this.qrWatching || this.view !== "gate") return;
    this.qrWatching = true;
    void invoke("start_qr_login").catch((err) => {
      this.qrWatching = false;
      this.qrStatus = commandError(err, "QR login could not start.");
      if (this.view === "gate") patchSignIn(this.gate, this.signInState());
    });
  },
  async openDiscordLogin() {
    if (!isTauri()) {
      this.tokenNote = "Sign in with Discord opens inside the Lark app on macOS or Windows. This preview only shows the screen.";
      this.paintGate();
      return;
    }
    this.signInBusy = "Opening Discord's login page…";
    this.tokenNote = "";
    this.paintGate();
    try {
      await invoke("cancel_browser_login");
      await invoke("open_discord_login");
    } catch (err) {
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't open Discord's login page.");
      this.paintGate();
    }
  },
  async openBrowserLogin() {
    if (!isTauri()) {
      this.tokenNote = "Sign in in the browser opens Discord in your system browser from the Lark app on macOS or Windows. This preview only shows the screen.";
      this.paintGate();
      return;
    }
    this.signInBusy = "Opening Discord in your browser…";
    this.tokenNote = "";
    this.qrWatching = false;
    this.paintGate();
    try {
      await invoke("stop_qr_login");
      await invoke("open_browser_login");
      this.signInBusy = "Waiting for Discord in your browser. Finish password, captcha, and 2FA there. Lark is waiting for a one-time grant.";
      if (this.view === "gate") this.paintGate();
    } catch (err) {
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't open Discord in the browser.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  },
  onLoginStatus(payload: { phase?: string; detail?: string }) {
    if (payload.phase === "saved") {
      this.signInBusy = "Checking the token with Discord…";
      this.tokenNote = "";
      this.paintGate();
      void this.finishConnect();
      return;
    }
    if (payload.phase === "failed") {
      this.signInBusy = "";
      this.view = "gate";
      this.tokenNote = payload.detail || "Discord sign-in failed.";
      this.paint();
      this.ensureQr();
      return;
    }
    if (payload.detail) {
      this.tokenNote = "";
      this.signInBusy = payload.detail;
      this.paintGate();
    }
  },
  onQrLogin(payload: { phase?: string; detail?: string; svg?: string; username?: string }) {
    if (payload.phase === "qr" && payload.svg) {
      this.qrSvg = payload.svg;
      this.qrStatus = QR_CAPTION;
    } else if (payload.phase === "scanned") {
      this.qrStatus = payload.username ? `Confirm on your phone as ${payload.username}` : "Confirm on your phone";
    } else if (payload.phase === "done") {
      this.qrStatus = "Checking the token with Discord…";
      this.signInBusy = "Checking the token with Discord…";
      this.tokenNote = "";
      void this.finishConnect();
    } else if (payload.phase === "stopped") {
      this.qrWatching = false;
      this.signInBusy = "";
      this.qrSvg = "";
      this.qrStatus = payload.detail || "QR login stopped. Use Sign in in your browser.";
      this.tokenNote = this.qrStatus;
    } else if (payload.phase === "failed") {
      this.qrStatus = payload.detail || "The QR code failed. A new one is coming.";
    }
    if (this.view === "gate") this.paintGate();
  },
  async finishConnect() {
    this.beginStartup(true);
    try {
      await invoke("connect");
    } catch (err) {
      this.abortStartup();
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't sign in with the saved token.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  },
  async saveToken(token: string) {
    if (!isTauri()) {
      this.tokenNote = "This preview can't accept a token. Run the Lark app on macOS or Windows to save one in the system credential store.";
      this.paintGate();
      return;
    }
    this.signInBusy = "Checking the token with Discord…";
    this.tokenNote = "";
    this.qrWatching = false;
    this.beginStartup(true);
    try {
      await invoke("stop_qr_login");
      await invoke("cancel_browser_login");
      await invoke("set_token", { token });
      await invoke("connect");
    } catch (err) {
      this.abortStartup();
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't save the token.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  },
});
