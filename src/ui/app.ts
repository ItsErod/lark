import { outgoingError } from "../compose";
import { defaultConfig, sanitizeConfig } from "../config";
import { ARCHIVE, CRIT, booth, history, ME, NORTHWIND, channels as demoChannels, dms as demoDms, guilds as demoGuilds, pageMessages, people, pins as demoPins } from "../demo/data";
import { rememberEmoji, frecency, EMOJI, type EmojiUse } from "../emoji";
import { bumpsUnread, effectiveLevel, shouldDesktopNotify } from "../notify";
import {
  canViewChannel,
  channelFlags,
  dockBadge,
  folderBadge,
  inviteCode,
  layoutRail,
  mentionsUser,
  normalizeFolder,
  type ChannelOverwrite,
  type DiscordNotify,
  type GuildAccess,
  type GuildFolder,
  type GuildPref,
  type ReadMarker,
} from "../shell";
import { noteActivity, stepAway, type AwayClock } from "../pack/away";
import { isBookmarked, toggleBookmark } from "../pack/bookmarks";
import { hiddenIds, toggleHidden } from "../pack/hidden";
import { allowKeywordNotify, cleanWords, firstHit, shouldKeywordNotify, wordsFor } from "../pack/keywords";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "../pack/playing";
import { formatRelative } from "../pack/relative";
import { backoff, cancelSend, queueSend, takeDue } from "../pack/schedule";
import { defaultPack, PACK_IDS, sanitizePack, settingsFor, type PackState } from "../pack/state";
import { commandCatalog, matchCommands } from "../palette";
import { browserPlatform, fontStack, type PlatformInfo } from "../platform";
import { describePlugin, enabledSources, parseCatalog, validPluginId, type PluginCatalogItem, type PluginHooks, type PluginSource } from "../plugins";
import { buildViewMessage, type ViewMessage } from "../render/message";
import { FrameClock } from "../frame";
import { captureBackend, encoderName, formatBitrate, planShare } from "../share";
import { fuzzyScore } from "../search";
import { formatShortcut, matchShortcut, shortcutConflicts, shortcutFromEvent } from "../shortcuts";
import type { AppConfig, Channel, Guild, NotifyLevel, Person, RawMessage, Shortcuts } from "../types";
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
  applyMemberOps,
  emptyMemberList,
  groupMembers,
  highestIndex,
  memberSubtitle,
  rangesForScroll,
  roleColor,
  sortDms,
  sortPeople,
  visibleRows,
  type MemberListState,
  type MemberListWire,
  type RoleInfo,
} from "../members";
import { memberNote, mergeGuilds, mergePeople, personFromMember, type RawMember } from "../roster";
import {
  anchoredScrollTop,
  anchorAfterGrowth,
  capMessages,
  isNearBottom,
  messageListPlan,
  nextScrollTop,
  PANEL_SCROLL_SELECTOR,
  pixelDelta,
  shouldLoadOlder,
} from "../scroll";
import { commandError, gateQr, QR_CAPTION } from "../signin";
import { clear, colorFor, el, icon, portrait, paths } from "./dom";
import { renderMessage } from "./messages";
import { renderProfileCard, type ProfileRole, type WireProfile } from "./profile";
import { patchSignIn, renderSignIn } from "./signin";

interface VoiceMember {
  id: string;
  name: string;
  speaking: boolean;
  volume: number;
}

interface VoiceSession {
  channelId: string;
  guildId: string | null;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
  muted: boolean;
  deafened: boolean;
  members: VoiceMember[];
}

interface PerfMarks {
  ready: number;
  lastSwitch: number;
  lastInput: number;
  displayHz: number;
  benchFrames: (ms: number) => Promise<{ paints: number; hz: number }>;
}

type ScrollMode = "none" | "bottom" | "preserve";
type Section = "account" | "appearance" | "voice" | "notifications" | "shortcuts" | "lark";

interface LocalFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  url: string;
}

export function mount(root: HTMLElement) {
  const app = new LarkApp(root);
  void app.start();
}

class LarkApp {
  private config: AppConfig = defaultConfig();
  private platform: PlatformInfo = browserPlatform();
  private view: "gate" | "app" = "gate";
  private demo = false;
  private guildId: string | null = NORTHWIND;
  private channelId: string | null = null;
  private pages: Record<string, RawMessage[]> = {};
  private more: Record<string, boolean> = {};
  private unread: Record<string, number> = {};
  private mentions: Record<string, number> = {};
  private divider: Record<string, string | null> = {};
  private loading = false;
  private error: string | null = null;
  private reply: RawMessage | null = null;
  private editing: RawMessage | null = null;
  private pendingDelete: RawMessage | null = null;
  private files: LocalFile[] = [];
  private pickerFor: string | null = null;
  private switcher = false;
  private switcherIndex = 0;
  private settings = false;
  private section: Section = "appearance";
  private rebinding: keyof Shortcuts | null = null;
  private narrow = false;
  private drawer = false;
  private lightbox: string | null = null;
  private catalog: PluginCatalogItem[] = [];
  private loaded = new Map<string, PluginSource>();
  private pack: PackState = defaultPack();
  private translated: Record<string, string> = {};
  private away: AwayClock = { lastActivity: Date.now(), away: false, lastWrite: 0, savedStatus: "online" };
  private playingShown = "";
  private playingWrite = 0;
  private keywordLast: Record<string, number> = {};
  private sendingScheduled = false;
  private scheduling = false;
  private bookmarksOpen = false;
  private clock = Date.now();
  private scroll: ScrollMode = "none";
  private scrollLock = 0;
  private pinnedToBottom = true;
  private messagePaints: number[] = [];
  private statusFlaps: number[] = [];
  private typingTimer = 0;
  private appliedTheme = "";
  private msgSig = "";
  private openedAt = 0;
  private tokenNote = "";
  private signInBusy = "";
  private qrSvg = "";
  private qrStatus = QR_CAPTION;
  private qrWatching = false;
  private connection = "Demo";
  private focused = true;
  private typingSent = 0;
  private me: Person = { id: ME, name: "You", status: "online" };
  private liveGuilds: Guild[] = [];
  private liveChannels: Record<string, Channel[]> = {};
  private liveDms: Channel[] = [];
  private liveMembers: Person[] = [];
  private membersByGuild: Record<string, Person[]> = {};
  private memberLists: Record<string, MemberListState> = {};
  private memberPhase: Record<string, "loading" | "done"> = {};
  private memberRanges = "";
  private memberScrollTimer = 0;
  private peopleTimer = 0;
  private rolesByGuild: Record<string, RoleInfo[]> = {};
  private friends: Person[] = [];
  private friendsOpen = false;
  private directory: Record<string, Person> = {};
  private wireProfile: WireProfile | null = null;
  private liveRoles: Record<string, string> = {};
  private userNames: Record<string, string> = {};
  private typingNames: { channelId: string; name: string; until: number }[] = [];
  private shell!: HTMLElement;
  private rail!: HTMLElement;
  private channelPane!: HTMLElement;
  private chatHead!: HTMLElement;
  private messagesEl!: HTMLElement;
  private typingEl!: HTMLElement;
  private membersEl!: HTMLElement;
  private composer!: HTMLTextAreaElement;
  private composerBanner!: HTMLElement;
  private composerMeta!: HTMLElement;
  private gate!: HTMLElement;
  private switcherEl!: HTMLElement;
  private settingsEl!: HTMLElement;
  private lightboxEl!: HTMLElement;
  private toastWrap!: HTMLElement;
  private stage!: HTMLElement;
  private splitPane!: HTMLElement;
  private voiceDock!: HTMLElement;
  private countEl: HTMLElement | null = null;
  private splitId: string | null = null;
  private voice: VoiceSession | null = null;
  private shareOn = false;
  private shareMotion = false;
  private pttHeld = false;
  private recent: string[] = [];
  private drafts: Record<string, string> = {};
  private emojiUses: EmojiUse[] = [];
  private searchOpen = false;
  private pinsOpen = false;
  private themeOpen = false;
  private themeFilter = "";
  private extraThemeIds: string[] = [];
  private themeCache = new Map<string, string>();
  private imported = new Map<string, string>();
  private materialWanted: string | null = null;
  private popout: Person | null = null;
  private statusOpen = false;
  private folders: GuildFolder[] = [];
  private folderOpen: Record<string, boolean> = {};
  private collapsedCats = new Set<string>();
  private catSeeded = false;
  private markers: Record<string, ReadMarker> = {};
  private localUnread: Record<string, number> = {};
  private localMentions: Record<string, number> = {};
  private access: Record<string, GuildAccess> = {};
  private discordNotify: DiscordNotify = { guilds: {}, dms: {} };
  private invite: { code: string; name: string; detail: string; icon: string } | null = null;
  private inviteEl!: HTMLElement;
  private audioInputs: { id: string; label: string }[] = [];
  private audioOutputs: { id: string; label: string }[] = [];
  private videoInputs: { id: string; label: string }[] = [];
  private badgeSent = -1;
  private upload = 0;
  private draftTimer = 0;
  private frames = new FrameClock();

  constructor(private root: HTMLElement) {}

  async start() {
    this.narrow = this.root.clientWidth < 880;
    const saved = localStorage.getItem("lark.config.v1");
    if (saved) {
      try {
        this.config = sanitizeConfig(JSON.parse(saved));
      } catch {
        this.config = defaultConfig();
      }
    }
    try {
      this.pack = sanitizePack(JSON.parse(localStorage.getItem("lark.pack.v1") ?? "{}"));
    } catch {
      this.pack = defaultPack();
    }
    this.away.lastActivity = Date.now();
    this.imported = loadImportedThemes(localStorage.getItem("lark.imported-themes.v1"));
    for (const [id, css] of this.imported) this.themeCache.set(id, css);
    this.extraThemeIds = [...this.imported.keys()];
    this.seedUnreads();
    this.folderOpen = readStringMap("lark.folders.v1");
    try {
      const cats = JSON.parse(localStorage.getItem("lark.categories.v1") ?? "null");
      if (Array.isArray(cats)) {
        this.collapsedCats = new Set(cats.filter((id): id is string => typeof id === "string"));
        this.catSeeded = true;
      }
    } catch {
      this.collapsedCats = new Set();
    }
    this.drafts = readJson("lark.drafts.v1") as Record<string, string>;
    try {
      const parsed = JSON.parse(localStorage.getItem("lark.emoji.v1") ?? "[]");
      if (Array.isArray(parsed)) this.emojiUses = parsed;
    } catch {
      this.emojiUses = [];
    }
    const cached = readJson("lark.cache.v1") as { pages?: Record<string, RawMessage[]> };
    if (cached.pages) {
      for (const [id, messages] of Object.entries(cached.pages)) {
        if (Array.isArray(messages)) this.pages[id] = messages.slice(-80);
      }
    }
    this.build();
    await this.loadPlugins();
    await this.applyTheme();
    window.setInterval(() => void this.applyTheme(), 1000);
    this.frames.setCap(this.config.desktop.frame_cap);
    const params = new URLSearchParams(location.search);
    if (!isTauri() && params.has("notice")) {
      this.tokenNote = "Discord rejected the token (HTTP 401). Lark sent it only to discord.com. It may be expired, revoked, or still wrapped in quotes.";
    }
    if (params.has("demo")) this.enterDemo();
    else {
      const initial = gateQr(isTauri());
      this.qrSvg = initial.svg;
      this.qrStatus = initial.status;
      this.paint();
    }
    if (isTauri()) await this.bootDesktop();
    const perf: PerfMarks = {
      ready: performance.now(),
      lastSwitch: 0,
      lastInput: 0,
      displayHz: 0,
      benchFrames: (ms) => this.frames.bench(ms),
    };
    (window as unknown as { __lark: PerfMarks }).__lark = perf;
    void this.frames.measureDisplay().then((hz) => {
      perf.displayHz = hz;
      if (this.settings && this.section === "lark") this.renderSettings();
    });
    new ResizeObserver(() => {
      const narrow = this.root.clientWidth < 880;
      if (narrow !== this.narrow) {
        this.narrow = narrow;
        if (!narrow) this.drawer = false;
        this.paint();
      }
    }).observe(this.root);
  }

  private seedUnreads() {
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
  }

  private async bootDesktop() {
    try {
      const info = await invoke<PlatformInfo & { os: string; credentialStore: string; configDir: string; themesDir: string; pluginsDir: string; configFile: string; notificationNote: string }>("app_paths");
      this.platform = {
        os: info.os === "macos" || info.os === "windows" || info.os === "linux" ? info.os : "other",
        credentialStore: info.credentialStore,
        configDir: info.configDir,
        themesDir: info.themesDir,
        pluginsDir: info.pluginsDir,
        configFile: info.configFile,
        notificationNote: info.notificationNote,
      };
      this.config = sanitizeConfig(await invoke("get_config"));
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
      });
      if (await invoke<boolean>("has_token")) {
        this.connection = "Connecting";
        this.signInBusy = "Checking the saved token with Discord…";
        this.paint();
        await invoke("connect");
        this.signInBusy = "Connecting to Discord…";
        if (this.view === "gate") this.paintGate();
      }
      if (this.view === "gate" && !this.signInBusy) this.ensureQr();
    } catch (err) {
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Desktop bridge unavailable.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  }

  private async reloadConfig() {
    this.config = sanitizeConfig(await invoke("get_config"));
    this.paint();
  }

  private build() {
    this.root.replaceChildren();
    this.gate = el("section", "gate");
    this.shell = el("div", "shell");
    this.rail = el("nav", "rail");
    this.rail.setAttribute("aria-label", "Servers");
    this.channelPane = el("aside", "channels");
    const chat = el("main", "chat");
    this.chatHead = el("header", "chat-head");
    this.messagesEl = el("div", "messages");
    this.messagesEl.setAttribute("aria-label", "Messages");
    this.typingEl = el("div", "typing");
    const composerWrap = el("div", "composer-wrap");
    const composer = el("form", "composer");
    this.composerBanner = el("div", "composer-banner");
    this.composer = el("textarea");
    this.composer.rows = 1;
    this.composer.placeholder = "Message";
    this.composer.setAttribute("aria-label", "Message");
    this.composerMeta = el("div", "composer-meta");
    composer.append(this.composerBanner, this.composer, this.composerMeta);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send();
    });
    composerWrap.append(composer);
    this.voiceDock = el("section", "voice-dock");
    this.voiceDock.hidden = true;
    chat.append(this.chatHead, this.messagesEl, this.typingEl, this.voiceDock, composerWrap);
    this.splitPane = el("section", "split");
    this.splitPane.hidden = true;
    this.stage = el("div", "stage");
    this.stage.append(chat, this.splitPane);
    this.membersEl = el("aside", "members");
    this.shell.append(this.rail, this.channelPane, this.stage, this.membersEl);
    this.switcherEl = el("div", "overlay");
    this.switcherEl.hidden = true;
    this.settingsEl = el("div", "overlay");
    this.settingsEl.hidden = true;
    this.lightboxEl = el("div", "overlay lightbox");
    this.lightboxEl.hidden = true;
    this.lightboxEl.addEventListener("click", () => {
      this.lightbox = null;
      this.paintLightbox();
    });
    this.toastWrap = el("div", "toast-wrap");
    this.inviteEl = el("div", "overlay");
    this.inviteEl.hidden = true;
    this.root.append(this.gate, this.shell, this.switcherEl, this.settingsEl, this.lightboxEl, this.inviteEl, this.toastWrap);
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
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.send();
      }
    });
    this.composer.addEventListener("input", () => {
      this.composer.style.height = "auto";
      this.composer.style.height = `${Math.min(this.composer.scrollHeight, 160)}px`;
      if (this.countEl) this.countEl.textContent = `${[...this.composer.value].length} / 2000`;
      const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
      if (perf) perf.lastInput = performance.now();
      this.saveDraft();
      if (this.demo || !this.channelId || this.hookOn("silentTyping")) return;
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
      void this.takeFiles(event.dataTransfer?.files ?? null);
    });
    window.addEventListener("keydown", (event) => {
      this.away = noteActivity(this.away, Date.now());
      this.onKey(event);
    });
    window.addEventListener("keyup", (event) => this.onKeyUp(event));
    window.addEventListener("pointerdown", () => {
      this.away = noteActivity(this.away, Date.now());
    }, { passive: true });
    window.setInterval(() => this.tickPlugins(), 5000);
    window.setInterval(() => this.tickClock(), 30_000);
    this.messagesEl.addEventListener("scroll", () => {
      if (this.scrollLock > 0) return;
      const top = this.messagesEl.scrollTop;
      this.pinnedToBottom = isNearBottom(top, this.messagesEl.scrollHeight, this.messagesEl.clientHeight);
      if (shouldLoadOlder({
        scrollTop: top,
        locked: false,
        loading: this.loading,
        hasMore: Boolean(this.channelId && this.more[this.channelId]),
        sinceOpenMs: performance.now() - this.openedAt,
      })) void this.loadOlder();
    }, { passive: true });
    this.root.addEventListener("wheel", (event) => this.onWheel(event), { passive: false, capture: true });
  }

  /** Keep the wheel inside the panel under the pointer. The window does not scroll. */
  private onWheel(event: WheelEvent) {
    const target = event.target;
    if (!(target instanceof Element)) {
      event.preventDefault();
      return;
    }
    const field = target.closest("textarea");
    if (field instanceof HTMLTextAreaElement && field.scrollHeight > field.clientHeight + 1) return;
    const scroller = target.closest(PANEL_SCROLL_SELECTOR);
    if (!(scroller instanceof HTMLElement)) {
      event.preventDefault();
      return;
    }
    const delta = pixelDelta(event.deltaY, event.deltaMode, scroller.clientHeight);
    if (!delta) {
      event.preventDefault();
      return;
    }
    const next = nextScrollTop(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight, delta);
    if (next === scroller.scrollTop && scroller.scrollHeight <= scroller.clientHeight + 1) {
      event.preventDefault();
      return;
    }
    scroller.scrollTop = next;
    event.preventDefault();
  }

  private enterDemo() {
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
    this.paint();
    void this.openChannel(CRIT);
  }

  private paint() {
    this.applyAppearance();
    this.gate.hidden = this.view !== "gate";
    this.shell.hidden = this.view !== "app";
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
    this.paintLightbox();
    this.paintBookmarks();
    this.paintInvite();
  }

  private applyAppearance() {
    const appearance = this.config.appearance;
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
    const rail = appearance.show_server_rail ? "72px" : "0px";
    const channelW = appearance.channel_list === "hidden" ? "0px" : "240px";
    const dmSidebar = !this.guildId && !this.friendsOpen && this.currentChannelIsDm();
    const members = appearance.show_member_list && !this.narrow && (this.guildId || dmSidebar) ? "240px" : "0px";
    this.rail.hidden = !appearance.show_server_rail;
    this.channelPane.hidden = appearance.channel_list === "hidden" && !this.drawer;
    this.membersEl.hidden = members === "0px";
    if (this.stage) {
      this.stage.classList.toggle("is-split", Boolean(this.splitId) && !this.narrow);
      this.splitPane.hidden = !this.splitId || this.narrow;
    }
    if (this.narrow) {
      this.shell.style.gridTemplateColumns = `${rail} minmax(0, 1fr)`;
      this.shell.style.gridTemplateAreas = `"rail chat"`;
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
  }

  private async applyTheme() {
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
    } catch {
      /* Keep the last good theme. */
    }
  }

  private async fetchThemeCss(name: string): Promise<string> {
    if (!THEME_ID.test(name)) throw new Error("invalid theme");
    if (!isTauri()) {
      const imported = this.imported.get(name);
      if (imported) return imported;
    }
    if (isTauri()) return invoke<string>("read_theme", { name });
    const res = await fetch(`/themes/${name}.css`, { cache: "no-store" });
    if (!res.ok) throw new Error("missing theme");
    return res.text();
  }

  private syncMaterial(material: "none" | "vibrancy") {
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
  }

  private async refreshThemeIndex() {
    const ids = [...this.imported.keys()];
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
  }

  private selectTheme(id: string) {
    if (!THEME_ID.test(id)) return;
    for (const name of ["--bg-0", "--bg-2", "--text"]) this.root.style.removeProperty(name);
    this.config.appearance.theme = id;
    this.persist();
    this.paint();
    if (this.settings && this.section === "appearance") this.paintThemeGallery();
  }

  private paintThemeGallery(root: ParentNode = this.settingsEl) {
    const grid = root.querySelector(".theme-gallery");
    if (!(grid instanceof HTMLElement)) return;
    clear(grid);
    const visible = filterThemes(galleryEntries(this.extraThemeIds), this.themeFilter);
    for (const theme of visible) grid.append(this.themeCard(theme));
    const empty = root.querySelector(".theme-empty");
    if (!visible.length) {
      if (!empty) grid.insertAdjacentElement("afterend", el("p", "theme-empty hint", "No theme matches that."));
    } else {
      empty?.remove();
    }
  }

  private themeCard(theme: { id: string; title: string; blurb: string }): HTMLButtonElement {
    const on = this.config.appearance.theme === theme.id;
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
  }

  private async importTheme(file: File) {
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
  }

  private async exportTheme(kind: "css" | "json") {
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
  }

  private paintGate() {
    if (!this.qrSvg && !isTauri()) {
      const initial = gateQr(false);
      this.qrSvg = initial.svg;
      this.qrStatus = initial.status;
    }
    const existing = this.gate.querySelector(".gate-card");
    if (!existing) {
      renderSignIn(this.gate, this.signInState(), {
        onDiscord: () => void this.openDiscordLogin(),
        onBrowser: () => void this.openBrowserLogin(),
        onPreview: () => this.enterDemo(),
        onSave: (token) => void this.saveToken(token),
      });
    } else {
      patchSignIn(this.gate, this.signInState());
    }
  }

  private signInState() {
    return {
      error: this.tokenNote,
      qrSvg: this.qrSvg,
      qrStatus: this.qrStatus,
      store: this.platform.credentialStore,
      busy: this.signInBusy,
    };
  }

  private ensureQr() {
    if (!isTauri() || this.qrWatching || this.view !== "gate") return;
    this.qrWatching = true;
    void invoke("start_qr_login").catch((err) => {
      this.qrWatching = false;
      this.qrStatus = commandError(err, "QR login could not start.");
      if (this.view === "gate") patchSignIn(this.gate, this.signInState());
    });
  }

  private async openDiscordLogin() {
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
  }

  private async openBrowserLogin() {
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
  }

  private onLoginStatus(payload: { phase?: string; detail?: string }) {
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
  }

  private onQrLogin(payload: { phase?: string; detail?: string; svg?: string; username?: string }) {
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
  }

  private async finishConnect() {
    try {
      await invoke("connect");
      this.signInBusy = "Connecting to Discord…";
      if (this.view === "gate") this.paintGate();
    } catch (err) {
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't sign in with the saved token.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  }

  private async saveToken(token: string) {
    if (!isTauri()) {
      this.tokenNote = "This preview can't accept a token. Run the Lark app on macOS or Windows to save one in the system credential store.";
      this.paintGate();
      return;
    }
    this.signInBusy = "Checking the token with Discord…";
    this.tokenNote = "";
    this.qrWatching = false;
    this.paintGate();
    try {
      await invoke("stop_qr_login");
      await invoke("cancel_browser_login");
      await invoke("set_token", { token });
      await invoke("connect");
      this.signInBusy = "Connecting to Discord…";
      if (this.view === "gate") this.paintGate();
    } catch (err) {
      this.view = "gate";
      this.signInBusy = "";
      this.tokenNote = commandError(err, "Couldn't save the token.");
      this.qrWatching = false;
      this.paint();
      this.ensureQr();
    }
  }

  private guilds(): Guild[] {
    return this.demo ? demoGuilds : this.liveGuilds;
  }

  private dms(): Channel[] {
    return sortDms(this.demo ? demoDms : this.liveDms);
  }

  private currentChannelIsDm(): boolean {
    const channel = this.currentChannel();
    return channel?.kind === "dm" || channel?.kind === "group";
  }

  private channelsOf(guildId: string): Channel[] {
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
  }

  private meId(): string {
    return this.demo ? ME : this.me.id;
  }

  private paintRail() {
    clear(this.rail);
    const home = el("button", `rail-button${this.guildId === null ? " is-selected" : ""}`);
    home.type = "button";
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
      if (entry.kind === "guild") this.appendServerButton(servers, entry.guildId);
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
    this.rail.append(home, sep, servers, settings);
  }

  private appendFolder(parent: HTMLElement, entry: { id: string; name: string; color: string | null; guildIds: string[] }) {
    const open = this.folderOpen[entry.id] !== false;
    const wrap = el("div", `folder${open ? " is-open" : ""}`);
    if (entry.color) wrap.style.setProperty("--folder", entry.color);
    const badge = folderBadge(entry.guildIds, (guildId) => {
      const item = this.guildBadge(guildId);
      return { mentions: item.mentions, unread: item.count };
    });
    const button = el("button", `server-button folder-button${open ? " is-open" : ""}`);
    button.type = "button";
    button.title = entry.name;
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
    button.addEventListener("click", () => {
      this.folderOpen[entry.id] = !open;
      localStorage.setItem("lark.folders.v1", JSON.stringify(this.folderOpen));
      this.paintRail();
    });
    wrap.append(button);
    if (open) {
      for (const guildId of entry.guildIds) this.appendServerButton(wrap, guildId);
    }
    parent.append(wrap);
  }

  private appendServerButton(parent: HTMLElement, guildId: string) {
    const guild = this.guilds().find((item) => item.id === guildId);
    if (!guild) return;
    const selected = guild.id === this.guildId;
    const muted = this.guildMuted(guild.id);
    const button = el("button", `server-button${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`);
    button.type = "button";
    button.title = muted ? `${guild.name} (muted)` : guild.name;
    button.setAttribute("aria-label", guild.name);
    const face = el("span", "server-face");
    const iconUrl = guild.iconUrl?.trim();
    if (iconUrl) {
      button.classList.add("has-icon");
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      img.draggable = false;
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
    button.addEventListener("click", () => this.selectGuild(guild.id));
    parent.append(button);
  }

  private guildBadge(guildId: string): { count: number; mentions: number } {
    let count = 0;
    let mentions = 0;
    if (this.guildMuted(guildId)) return { count, mentions };
    for (const channel of this.channelsOf(guildId)) {
      if (channel.kind === "category" || !this.canSeeChannel(guildId, channel)) continue;
      const level = this.levelFor(guildId, channel.id);
      if (level === "mute") continue;
      const mention = this.mentions[channel.id] ?? 0;
      if (level === "mentions") mentions += mention;
      else {
        count += this.unread[channel.id] ?? 0;
        mentions += mention;
      }
    }
    return { count, mentions };
  }

  private guildMuted(guildId: string): boolean {
    return Boolean(this.discordNotify.guilds[guildId]?.muted || this.config.notifications.guilds[guildId]?.muted);
  }

  private levelFor(guildId: string | null, channelId: string) {
    return effectiveLevel(this.config, guildId, channelId, this.discordNotify);
  }

  private canSeeChannel(guildId: string, channel: Channel): boolean {
    const access = this.access[guildId] ?? null;
    const userId = this.meId();
    if (!canViewChannel({ userId, guildId, access, overwrites: channel.overwrites as ChannelOverwrite[] | undefined })) return false;
    if (!channel.parentId) return true;
    const parent = this.channelsOf(guildId).find((item) => item.id === channel.parentId);
    if (!parent) return true;
    return canViewChannel({ userId, guildId, access, overwrites: parent.overwrites as ChannelOverwrite[] | undefined });
  }

  private selectGuild(id: string | null) {
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
  }

  private visibleChannels(): Channel[] {
    if (!this.guildId) return this.dms();
    const guildId = this.guildId;
    return this.channelsOf(guildId).filter((channel) => this.canSeeChannel(guildId, channel));
  }

  private paintChannels() {
    const kept = this.channelPane.querySelector(".channel-scroll")?.scrollTop ?? 0;
    clear(this.channelPane);
    const head = el("div", "channel-head");
    const guild = this.guilds().find((item) => item.id === this.guildId);
    head.append(el("h1", "", guild ? guild.name : "Direct messages"));
    const scroll = el("div", "channel-scroll");
    if (!this.guildId) {
      const friends = el("button", `channel-row${this.friendsOpen ? " is-selected" : ""}`);
      friends.type = "button";
      friends.append(icon(paths.users), el("span", "row-label", "Friends"));
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      if (online) friends.append(el("span", "badge", String(online)));
      friends.addEventListener("click", () => {
        this.friendsOpen = true;
        this.channelId = "";
        this.drawer = false;
        this.msgSig = "";
        this.paint();
      });
      scroll.append(friends, el("div", "category", "Direct messages"));
      const dms = [...this.dms()].sort((a, b) => a.position - b.position);
      if (!dms.length) scroll.append(el("p", "empty", "No direct messages yet."));
      for (const dm of dms) scroll.append(this.channelButton(dm, true));
    } else {
      const list = [...this.visibleChannels()].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const categories = list.filter((channel) => channel.kind === "category");
      const categoryIds = new Set(categories.map((category) => category.id));
      const loose = list.filter((channel) => channel.kind !== "category" && (!channel.parentId || !categoryIds.has(channel.parentId)));
      for (const channel of loose) scroll.append(this.channelButton(channel, false));
      for (const category of categories) {
        const children = list.filter((item) => item.parentId === category.id && item.kind !== "category");
        const collapsed = this.collapsedCats.has(category.id);
        const header = el("button", `category${collapsed ? " is-collapsed" : ""}`);
        header.type = "button";
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        header.append(el("span", "chev", collapsed ? "▸" : "▾"), el("span", "", category.name));
        header.addEventListener("click", () => this.toggleCategory(category.id));
        scroll.append(header);
        if (!collapsed) for (const channel of children) scroll.append(this.channelButton(channel, false));
      }
    }
    const me = this.demo ? people[0] : this.me;
    const profile = el("button", "profile-chip");
    profile.type = "button";
    profile.setAttribute("aria-label", "Set a status");
    const wrap = el("div", "avatar-wrap");
    wrap.append(portrait(me.name, me.id, me.avatarUrl, true), el("i", `status ${me.status ?? "online"}`));
    const who = el("div", "who");
    who.append(el("strong", "", me.name), el("span", "", me.custom || this.connection));
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
    this.channelPane.append(head, scroll, profile);
    scroll.scrollTop = kept;
  }

  private channelButton(channel: Channel, dm: boolean): HTMLButtonElement {
    const muted = this.levelFor(dm ? null : this.guildId, channel.id) === "mute";
    const unreadCount = this.unread[channel.id] ?? 0;
    const mentions = this.mentions[channel.id] ?? 0;
    const unread = unreadCount > 0 || mentions > 0;
    const button = el("button", `${dm ? "dm-row" : "channel-row"}${channel.id === this.channelId ? " is-selected" : ""}${unread ? " is-unread" : ""}${muted ? " is-muted" : ""}${channel.kind === "voice" ? " is-voice" : ""}`);
    button.type = "button";
    if (!dm) button.append(icon(channel.kind === "voice" ? paths.volume : channel.kind === "announcement" ? paths.bell : paths.hash));
    else {
      const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
      const known = recipient ? this.directory[recipient.id] : undefined;
      const wrap = el("div", "avatar-wrap");
      wrap.append(
        portrait(known?.name || recipient?.name || channel.name, recipient?.id || channel.id, known?.avatarUrl || recipient?.avatarUrl, true),
        channel.kind === "dm" ? el("i", `status ${known?.status ?? "offline"}`) : el("i"),
      );
      button.append(wrap);
    }
    button.append(el("span", "row-label", channel.name));
    if (muted) button.append(el("span", "faint", "muted"));
    else if (mentions > 0) button.append(el("span", "badge", String(mentions)));
    button.addEventListener("click", () => {
      this.drawer = false;
      if (channel.kind === "voice") {
        this.joinVoice(channel);
        return;
      }
      void this.openChannel(channel.id);
    });
    return button;
  }

  private currentChannel(): Channel | undefined {
    const lists = this.demo ? Object.values(demoChannels) : Object.values(this.liveChannels);
    return [...this.visibleChannels(), ...this.dms(), ...lists.flat()].find((channel) => channel.id === this.channelId);
  }

  private async openChannel(id: string) {
    const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
    if (perf) perf.lastSwitch = -1;
    const started = performance.now();
    this.channelId = id;
    this.error = null;
    this.reply = null;
    this.editing = null;
    this.pendingDelete = null;
    this.pickerFor = null;
    if (!this.pages[id]) {
      this.loading = true;
      this.paint();
      try {
        await delay(this.pages[id] ? 0 : this.demo ? 16 : 0);
        if (id === ARCHIVE) throw new Error("Couldn't load messages in #archive.");
        const page = this.demo
          ? pageMessages(history[id] ?? [], undefined, 20)
          : await this.livePage(id);
        this.pages[id] = page.messages;
        this.more[id] = page.hasMore;
        const unread = this.unread[id] ?? 0;
        if (unread > 0) this.divider[id] = page.messages[Math.max(0, page.messages.length - unread)]?.id ?? null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Couldn't load messages.";
      } finally {
        this.loading = false;
      }
    } else if (this.more[id] === undefined) {
      this.more[id] = (this.pages[id]?.length ?? 0) >= 20;
    }
    this.localUnread[id] = 0;
    this.localMentions[id] = 0;
    const seen = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
    this.markers[id] = { lastMessageId: seen, mentionCount: 0 };
    this.refreshChannelBadge(id);
    this.scroll = "bottom";
    this.pinnedToBottom = true;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.editing) this.composer.value = draft;
    this.recent = [id, ...this.recent.filter((item) => item !== id)].slice(0, 6);
    if (!this.demo && (this.pages[id]?.length ?? 0) > 0) {
      const last = this.pages[id][this.pages[id].length - 1];
      void invoke("ack_message", { channelId: id, messageId: last.id }).catch(() => undefined);
    }
    this.openedAt = performance.now();
    this.msgSig = "";
    this.friendsOpen = false;
    if (!this.demo && this.guildId) {
      const prefix = `${this.guildId}:${id}:`;
      if (!this.memberRanges.startsWith(prefix)) this.queueMemberSubscribe(this.guildId, id, [[0, 99]]);
    }
    this.paint();
    this.prefetchAround(id);
    this.syncBadge();
    if (perf) perf.lastSwitch = performance.now() - started;
  }

  private async livePage(id: string, before?: string): Promise<{ messages: RawMessage[]; hasMore: boolean }> {
    const batch = await invoke<RawMessage[]>("fetch_messages", { channelId: id, before });
    const messages = [...batch].reverse().map(normalizeMessage);
    return { messages, hasMore: batch.length >= 50 };
  }

  private async loadOlder() {
    const id = this.channelId;
    if (!id || this.loading || !this.more[id] || performance.now() - this.openedAt < 300) return;
    const loaded = this.pages[id] ?? [];
    if (!loaded.length) return;
    this.loading = true;
    try {
      const page = this.demo
        ? pageMessages(history[id] ?? [], loaded[0].id, 20)
        : await this.livePage(id, loaded[0].id);
      this.pages[id] = [...page.messages, ...loaded];
      this.more[id] = page.hasMore;
      this.scroll = "preserve";
      this.msgSig = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load earlier messages.";
      if ((this.pages[id]?.length ?? 0) > 0) this.toast("History", message);
      else this.error = message;
    } finally {
      this.loading = false;
      this.paintMessages();
    }
  }

  private paintHeader() {
    clear(this.chatHead);
    const channel = this.currentChannel();
    const title = el("div", "chat-title");
    const row = el("div", "chat-title");
    row.style.flexDirection = "row";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    if (this.narrow) {
      const menu = el("button", "icon-button");
      menu.type = "button";
      menu.setAttribute("aria-label", "Channels");
      menu.append(icon(paths.panels));
      menu.addEventListener("click", () => {
        this.drawer = !this.drawer;
        this.paint();
      });
      row.append(menu);
    }
    const heading = this.friendsOpen && !this.guildId ? "Friends" : channel ? (channel.kind === "dm" || channel.kind === "group" ? channel.name : `# ${channel.name}`) : "Lark";
    row.append(el("h2", "", heading));
    if (this.demo) row.append(el("span", "demo-pill", "Demo"));
    title.append(row);
    if (channel?.topic) title.append(el("div", "topic", channel.topic));
    const actions = el("div", "head-actions");
    const search = el("button", "icon-button");
    search.type = "button";
    search.title = `Command palette (${formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os)})`;
    search.setAttribute("aria-label", "Command palette");
    search.append(icon(paths.search));
    search.addEventListener("click", () => this.openSwitcher());
    const find = el("button", "icon-button");
    find.type = "button";
    find.setAttribute("aria-label", "Search messages");
    find.append(icon(paths.search));
    find.addEventListener("click", () => {
      this.searchOpen = true;
      this.paintSearch();
    });
    const pin = el("button", "icon-button");
    pin.type = "button";
    pin.setAttribute("aria-label", "Pinned messages");
    pin.textContent = "Pin";
    pin.addEventListener("click", () => {
      this.pinsOpen = !this.pinsOpen;
      this.paintPins();
    });
    const split = el("button", `icon-button${this.splitId ? " is-on" : ""}`);
    split.type = "button";
    split.setAttribute("aria-label", "Split view");
    split.append(icon(paths.panels));
    split.addEventListener("click", () => this.toggleSplit());
    const theme = el("button", "icon-button");
    theme.type = "button";
    theme.setAttribute("aria-label", "Theme editor");
    theme.textContent = "Aa";
    theme.addEventListener("click", () => {
      this.themeOpen = true;
      this.paintTheme();
    });
    const members = el("button", `icon-button${this.config.appearance.show_member_list ? " is-on" : ""}`);
    members.type = "button";
    members.setAttribute("aria-label", "Members");
    members.append(icon(paths.users));
    members.addEventListener("click", () => {
      this.config.appearance.show_member_list = !this.config.appearance.show_member_list;
      this.persist();
      this.paint();
    });
    const bell = el("button", "icon-button");
    bell.type = "button";
    bell.setAttribute("aria-label", "Notification level");
    bell.append(icon(paths.bell));
    bell.addEventListener("click", () => this.cycleNotify());
    const headerButtons = [search, find, pin];
    if (this.hookOn("bookmarks")) {
      const saved = el("button", "text-button");
      saved.type = "button";
      saved.textContent = "Saved";
      saved.setAttribute("aria-label", "Bookmarks");
      saved.addEventListener("click", () => {
        this.bookmarksOpen = !this.bookmarksOpen;
        this.paintBookmarks();
      });
      headerButtons.push(saved);
    }
    headerButtons.push(split, theme, members, bell);
    actions.append(...headerButtons);
    this.chatHead.append(title, actions);
  }

  private cycleNotify() {
    if (!this.channelId) return;
    const order: NotifyLevel[] = ["all", "mentions", "mute"];
    const current = this.levelFor(this.guildId, this.channelId);
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.config.notifications.channels[this.channelId] = next === "mute" ? { muted: true } : { level: next, muted: false };
    this.persist();
    this.toast("Notifications", `${this.currentChannel()?.name ?? "Channel"} is set to ${next}.`);
    this.paint();
  }

  private lockScroll(run: () => void) {
    this.scrollLock += 1;
    try {
      run();
    } finally {
      this.scrollLock -= 1;
    }
  }

  private noteMessagePaint(reason: string) {
    if (reason !== "replace") return;
    const now = performance.now();
    this.messagePaints = this.messagePaints.filter((stamp) => now - stamp < 500);
    this.messagePaints.push(now);
    if (this.messagePaints.length >= 4) {
      console.warn(`[lark] message list rebuilt ${this.messagePaints.length} times in 500ms. A channel view should append, not rebuild in a loop.`);
    }
  }

  private captureScroll() {
    const top = this.messagesEl.scrollTop;
    const height = this.messagesEl.scrollHeight;
    const client = this.messagesEl.clientHeight;
    return { top, height, client, near: this.pinnedToBottom || isNearBottom(top, height, client) };
  }

  private placeScroll(metrics: { top: number; height: number; client: number; near: boolean }, intent: ScrollMode) {
    const next = anchoredScrollTop({
      intent,
      prevTop: metrics.top,
      prevHeight: metrics.height,
      nextHeight: this.messagesEl.scrollHeight,
      clientHeight: metrics.client || this.messagesEl.clientHeight,
      nearBottom: metrics.near,
    });
    this.messagesEl.scrollTop = next;
    this.pinnedToBottom = intent === "bottom" || (intent !== "preserve" && metrics.near);
  }

  private windowMessages(id: string, list: RawMessage[]): RawMessage[] {
    const capped = capMessages(list, this.pinnedToBottom);
    if (!capped.trimmed) return list;
    this.pages[id] = capped.items;
    if (!this.pinnedToBottom && this.scroll === "none") this.scroll = "preserve";
    console.info(`[lark] trimmed channel ${id} to ${capped.items.length} messages`);
    return capped.items;
  }

  private layoutObserver: ResizeObserver | null = null;

  /** Images and embeds change height after decode. Re-pin or hold the line without another render. */
  private watchMessageLayout() {
    this.layoutObserver?.disconnect();
    const scroller = this.messagesEl;
    const column = scroller.querySelector(":scope > .message-column");
    if (!(column instanceof HTMLElement)) return;
    const heights = new Map<Element, number>();
    const nodes = [column, ...column.querySelectorAll("img")].filter((node): node is HTMLElement => node instanceof HTMLElement);
    for (const node of nodes) heights.set(node, node.offsetHeight);
    this.layoutObserver = new ResizeObserver((entries) => {
      if (this.scrollLock > 0) {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) heights.set(entry.target, entry.target.offsetHeight);
        }
        return;
      }
      for (const entry of entries) {
        const node = entry.target;
        if (!(node instanceof HTMLElement)) continue;
        const next = node.offsetHeight;
        const prev = heights.get(node) ?? next;
        heights.set(node, next);
        const delta = next - prev;
        if (Math.abs(delta) < 1) continue;
        if (node === column || this.pinnedToBottom) {
          if (this.pinnedToBottom) {
            this.lockScroll(() => {
              scroller.scrollTop = scroller.scrollHeight;
            });
          }
          continue;
        }
        const above = node.getBoundingClientRect().top < scroller.getBoundingClientRect().top;
        if (!above) continue;
        const top = anchorAfterGrowth({
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          delta,
          pinned: false,
          aboveViewport: true,
        });
        this.lockScroll(() => {
          scroller.scrollTop = top;
        });
      }
    });
    for (const node of nodes) this.layoutObserver.observe(node);
    for (const node of nodes) {
      if (!(node instanceof HTMLImageElement) || node.dataset.anchorBound === "1") continue;
      node.dataset.anchorBound = "1";
      node.dataset.anchorHeight = String(node.offsetHeight);
      const apply = () => this.stickToReadingLine(node);
      node.addEventListener("load", () => {
        apply();
        requestAnimationFrame(apply);
      });
      if (node.complete) requestAnimationFrame(apply);
    }
    this.followPinned();
  }

  private followPinned() {
    this.stickIfPinned();
    requestAnimationFrame(() => {
      this.stickIfPinned();
      requestAnimationFrame(() => this.stickIfPinned());
    });
  }

  private stickIfPinned() {
    if (!this.pinnedToBottom || this.scrollLock > 0) return;
    const scroller = this.messagesEl;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (gap <= 1) return;
    this.lockScroll(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }

  private stickToReadingLine(node: HTMLImageElement) {
    const scroller = this.messagesEl;
    if (this.pinnedToBottom) {
      this.stickIfPinned();
      return;
    }
    const above = node.getBoundingClientRect().top < scroller.getBoundingClientRect().top;
    if (!above) return;
    const delta = node.offsetHeight - Number(node.dataset.anchorHeight ?? node.offsetHeight);
    node.dataset.anchorHeight = String(node.offsetHeight);
    if (Math.abs(delta) < 1) return;
    const top = anchorAfterGrowth({
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      delta,
      pinned: false,
      aboveViewport: true,
    });
    this.lockScroll(() => {
      scroller.scrollTop = top;
    });
  }

  private messageBody(list: RawMessage[]): string {
    return list
      .map((message) => `${message.id}:${message.content}:${message.edited}:${message.reactions?.map((reaction) => reaction.count + (reaction.me ? "y" : "n")).join(".")}`)
      .join("~");
  }

  private appendMessages(parent: HTMLElement, list: RawMessage[], from: number, channelId: string) {
    const ctx = this.renderContext();
    const plugins = this.enabledPlugins();
    const hidden = hiddenIds(this.pack.hiddenAuthors);
    const settings = this.pluginSettings(channelId);
    let lastDay = "";
    let lastAuthor = "";
    let lastTime = 0;
    if (from > 0) {
      const previous = list[from - 1];
      lastDay = new Date(previous.timestamp).toDateString();
      lastAuthor = previous.authorId;
      lastTime = new Date(previous.timestamp).getTime();
    }
    for (let index = from; index < list.length; index += 1) {
      const message = list[index];
      const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
        settings,
        hiddenAuthors: hidden,
        displayContent: this.translated[message.id],
      });
      if (!view) continue;
      const day = new Date(message.timestamp).toDateString();
      const grouped = Boolean(lastAuthor) && view.authorId === lastAuthor && new Date(message.timestamp).getTime() - lastTime < 5 * 60_000 && !view.reply && day === lastDay;
      const node = renderMessage(view, {
        density: this.config.appearance.density,
        grouped,
        showDay: day !== lastDay,
        divider: this.divider[channelId] === message.id,
        remoteEmoji: !this.demo,
        mine: view.authorId === this.meId(),
        onReply: () => {
          this.reply = message;
          this.editing = null;
          this.composer.focus();
          this.paintComposer();
        },
        onEdit: () => this.beginEdit(message),
        onDelete: () => {
          this.pendingDelete = message;
          this.paintComposer();
        },
        onReact: (emoji) => {
          if (emoji === "picker") {
            this.pickerFor = this.pickerFor === message.id ? null : message.id;
            this.msgSig = "";
            this.paintMessages();
            return;
          }
          this.toggleReaction(message, emoji);
        },
        onImage: (url) => {
          this.lightbox = url;
          this.paintLightbox();
        },
        ...this.messageChrome(message, view),
      });
      if (this.pickerFor === message.id) {
        const picker = el("div", "picker");
        const ranked = frecency(this.emojiUses, Date.now()).map((item) => item.emoji);
        const emojis = [...ranked, ...EMOJI.filter((emoji) => !ranked.includes(emoji))].slice(0, 12);
        for (const emoji of emojis) {
          const button = el("button", "icon-button", emoji);
          button.type = "button";
          button.addEventListener("click", () => this.toggleReaction(message, emoji));
          picker.append(button);
        }
        node.append(picker);
      }
      parent.append(node);
      lastDay = day;
      lastAuthor = view.authorId;
      lastTime = new Date(message.timestamp).getTime();
    }
  }

  private paintTyping() {
    const id = this.channelId;
    const now = Date.now();
    const names = id === CRIT && this.demo
      ? ["Jonah Adler is typing"]
      : this.typingNames.filter((item) => item.channelId === id && item.until > now).map((item) => item.name);
    const text = names.length ? names.join(", ") : "";
    if (this.typingEl.textContent !== text) this.typingEl.textContent = text;
    const nextClass = names.length ? "typing dots" : "typing";
    if (this.typingEl.className !== nextClass) this.typingEl.className = nextClass;
  }

  private paintMessages() {
    if (this.friendsOpen && !this.guildId) {
      this.paintFriends();
      return;
    }
    this.paintTyping();
    const id = this.channelId;
    let list = id ? this.pages[id] ?? [] : [];
    if (id && list.length) list = this.windowMessages(id, list);
    const pluginStamp = `${this.pack.bookmarks.length}:${this.pack.hiddenAuthors.length}:${Object.keys(this.translated).length}:${this.hookOn("relativeTime") ? Math.floor(this.clock / 30_000) : 0}:${this.pack.mediaCompact}:${this.pack.mediaPreviews}:${this.config.plugins.enabled.join(",")}`;
    const shownError = this.error && !list.length ? this.error : "";
    const structural = `${id}|${this.loading}|${shownError}|${this.pickerFor}|${this.config.appearance.density}|${pluginStamp}`;
    const body = this.messageBody(list);
    const sig = `${structural}|${body}`;
    if (sig === this.msgSig && this.messagesEl.childElementCount > 0) {
      if (this.scroll === "bottom") {
        this.lockScroll(() => {
          this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
        this.pinnedToBottom = true;
      }
      this.scroll = "none";
      return;
    }
    const intent = this.scroll;
    this.scroll = "none";
    const metrics = this.captureScroll();
    const column = this.messagesEl.querySelector(":scope > .message-column");
    const previousBody = list.length > 1 ? this.messageBody(list.slice(0, -1)) : "";
    const plan = messageListPlan(this.msgSig, structural, previousBody, column instanceof HTMLElement);
    if (plan === "append" && column instanceof HTMLElement && id && list.length) {
      this.noteMessagePaint("append");
      this.lockScroll(() => {
        this.appendMessages(column, list, list.length - 1, id);
        this.placeScroll(metrics, intent);
      });
      this.watchMessageLayout();
      this.msgSig = sig;
      return;
    }
    this.noteMessagePaint("replace");
    this.lockScroll(() => {
      clear(this.messagesEl);
      if (this.loading && !list.length) {
        const skeleton = el("div", "skeleton-wrap");
        for (let i = 0; i < 6; i += 1) skeleton.append(el("div", "skeleton"));
        this.messagesEl.append(skeleton);
      } else if (shownError) {
        const block = el("div", "error-state");
        block.append(el("h2", "", "Couldn't load messages"), el("p", "", shownError));
        const retry = el("button", "primary", "Retry");
        retry.type = "button";
        retry.addEventListener("click", () => {
          if (id) {
            delete this.pages[id];
            void this.openChannel(id);
          }
        });
        block.append(retry);
        this.messagesEl.append(block);
      } else if (!list.length) {
        const name = this.currentChannel()?.name ?? "this channel";
        this.messagesEl.append(el("div", "empty", `#${name} is quiet. The composer is below when you have something to say.`));
      } else if (id) {
        const next = el("div", "message-column");
        this.appendMessages(next, list, 0, id);
        this.messagesEl.append(next);
      }
      this.placeScroll(metrics, intent);
    });
    this.watchMessageLayout();
    this.msgSig = sig;
  }

  private renderContext() {
    const users: Record<string, string> = { ...this.userNames };
    const roster = this.demo ? people : [this.me, ...this.liveMembers];
    for (const person of roster) users[person.id] = person.name;
    const channelNames: Record<string, string> = {};
    const lists = this.demo ? Object.values(demoChannels) : Object.values(this.liveChannels);
    for (const channel of [...lists.flat(), ...this.dms()]) channelNames[channel.id] = channel.name;
    return { users, roles: this.demo ? ({} as Record<string, string>) : this.liveRoles, channels: channelNames, meId: this.meId() };
  }

  private paintFriends() {
    const sig = `friends|${this.friends.map((person) => `${person.id}:${person.status}:${person.custom}:${person.activity}`).join(",")}`;
    if (sig === this.msgSig) return;
    this.msgSig = sig;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    const board = el("div", "friends-board");
    const roster = sortPeople(this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends);
    if (!roster.length) {
      board.append(el("p", "empty", "Friends show up here once Discord sends them. Direct messages stay in the list on the left."));
    }
    const sections: [string, Person[]][] = [
      ["Online", roster.filter((person) => person.status === "online")],
      ["Idle", roster.filter((person) => person.status === "idle")],
      ["Do not disturb", roster.filter((person) => person.status === "dnd")],
      ["Offline", roster.filter((person) => person.status !== "online" && person.status !== "idle" && person.status !== "dnd")],
    ];
    for (const [label, group] of sections) {
      if (!group.length) continue;
      board.append(el("h3", "member-group", `${label} — ${group.length}`));
      for (const person of group) {
        const row = el("button", "friend-row");
        row.type = "button";
        const wrap = el("div", "avatar-wrap");
        wrap.append(portrait(person.name, person.id, person.avatarUrl, false), el("i", `status ${person.status ?? "offline"}`));
        const copy = el("div", "member-copy");
        const line = memberSubtitle(person) || statusLabel(person.status);
        copy.append(el("strong", "", person.name), el("span", "", line));
        row.append(wrap, copy);
        row.addEventListener("click", () => {
          this.openProfile(person);
        });
        row.addEventListener("dblclick", () => void this.openDm(person.id));
        board.append(row);
      }
    }
    this.messagesEl.append(board);
  }

  private paintMembers() {
    const kept = this.membersEl.querySelector(".member-scroll")?.scrollTop ?? 0;
    clear(this.membersEl);
    if (this.membersEl.hidden) return;
    const head = el("div", "member-head");
    const scroll = el("div", "member-scroll");
    if (!this.guildId) {
      head.append(el("h2", "", "In this conversation"));
      const channel = this.currentChannel();
      const ids = channel?.recipients?.map((item) => item.id) ?? channel?.recipientIds ?? [];
      const peopleHere = ids.flatMap((id) => {
        if (this.directory[id]) return [this.directory[id]];
        const recipient = channel?.recipients?.find((item) => item.id === id);
        return recipient ? [{ id: recipient.id, name: recipient.name, avatarUrl: recipient.avatarUrl, bot: recipient.bot, status: "offline" as const }] : [];
      });
      if (!peopleHere.length && channel) {
        scroll.append(this.memberButton({ id: channel.id, name: channel.name, status: "offline" }));
      }
      for (const person of peopleHere) scroll.append(this.memberButton(person));
      this.membersEl.append(head, scroll);
      return;
    }
    const roles = this.rolesByGuild[this.guildId] ?? [];
    const list = this.demo ? null : this.currentMemberList();
    const rows = list && list.rows.size ? visibleRows(list, roles) : null;
    const roster = this.demo ? people : this.liveMembers;
    const sections = rows ? null : groupMembers(roster, roles);
    const count = rows ? rows.filter((row) => row.type === "member").length : roster.length;
    const online = list?.onlineCount || roster.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
    const total = list?.memberCount || roster.length;
    head.append(el("h2", "", "Members"));
    if (total) head.append(el("p", "member-count", `${online.toLocaleString()} online · ${total.toLocaleString()} members`));
    const waiting = Boolean(list && list.memberCount > 0 && !rows?.length);
    const note = waiting ? "Loading members…" : memberNote(true, count, this.memberPhase[this.guildId]);
    if (note && !rows?.length) scroll.append(el("p", "empty", note));
    if (rows) {
      for (const row of rows) {
        if (row.type === "group") {
          const label = el("div", "member-group", `${row.label} — ${row.count}`);
          if (row.color) label.style.color = row.color;
          scroll.append(label);
        } else scroll.append(this.memberButton(row.person, row.color));
      }
      const highest = highestIndex(list);
      if (list && list.memberCount > count && highest >= 0 && highest + 1 < list.memberCount) {
        scroll.append(el("p", "empty", "Scroll for more."));
      }
    } else if (sections) {
      for (const section of sections) {
        const label = el("div", "member-group", `${section.label} — ${section.count}`);
        if (section.color) label.style.color = section.color;
        scroll.append(label);
        for (const person of section.people) scroll.append(this.memberButton(person, roleColor(person.roleIds, roles) || person.color || null));
      }
    }
    scroll.addEventListener("scroll", () => {
      window.clearTimeout(this.memberScrollTimer);
      this.memberScrollTimer = window.setTimeout(() => this.onMemberScroll(scroll), 120);
    }, { passive: true });
    this.membersEl.append(head, scroll);
    scroll.scrollTop = kept;
  }

  private memberButton(person: Person, color?: string | null): HTMLButtonElement {
    const row = el("button", "member-row");
    row.type = "button";
    const wrap = el("div", "avatar-wrap");
    wrap.append(portrait(person.name, person.id, person.avatarUrl, true), el("i", `status ${person.status ?? "offline"}`));
    const copy = el("div", "member-copy");
    const name = el("strong", "", person.name);
    if (color) name.style.color = color;
    const title = el("div", "member-name");
    title.append(name);
    if (person.bot) title.append(el("span", "bot-tag", "BOT"));
    const line = memberSubtitle(person);
    copy.append(title);
    if (line) copy.append(el("span", "", line));
    row.append(wrap, copy);
    row.addEventListener("click", () => this.openProfile(person));
    return row;
  }

  private paintComposer() {
    const wrap = this.composer.closest(".composer-wrap");
    if (wrap instanceof HTMLElement) wrap.hidden = this.friendsOpen && !this.guildId;
    const channel = this.currentChannel();
    this.composer.placeholder = channel ? `Message ${channel.kind === "text" ? "#" : ""}${channel.name}` : "Message";
    clear(this.composerBanner);
    this.composerBanner.hidden = true;
    if (this.pendingDelete) {
      this.composerBanner.hidden = false;
      this.composerBanner.append(el("span", "", "Delete this message?"));
      const yes = el("button", "primary", "Delete");
      yes.type = "button";
      yes.addEventListener("click", () => this.removeMessage(this.pendingDelete!));
      const no = el("button", "ghost", "Cancel");
      no.type = "button";
      no.addEventListener("click", () => {
        this.pendingDelete = null;
        this.paintComposer();
      });
      this.composerBanner.append(yes, no);
    } else if (this.editing) {
      this.composerBanner.hidden = false;
      this.composerBanner.append(el("span", "", "Editing your message"));
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.editing = null;
        this.composer.value = "";
        this.paintComposer();
      });
      this.composerBanner.append(cancel);
    } else if (this.reply) {
      this.composerBanner.hidden = false;
      this.composerBanner.append(el("span", "", `Replying to ${this.reply.authorName}`));
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.reply = null;
        this.paintComposer();
      });
      this.composerBanner.append(cancel);
    }
    if (!this.pendingDelete && !this.editing && this.hookOn("schedule")) {
      this.paintScheduleBanner();
    }
    clear(this.composerMeta);
    const tools = el("div", "composer-tools");
    const file = el("input");
    file.type = "file";
    file.multiple = true;
    file.hidden = true;
    const attach = el("button", "icon-button");
    attach.type = "button";
    attach.setAttribute("aria-label", "Attach files");
    attach.append(icon(paths.paperclip));
    attach.addEventListener("click", () => file.click());
    file.addEventListener("change", () => {
      void this.takeFiles(file.files);
      file.value = "";
    });
    tools.append(attach, file);
    if (this.hookOn("schedule")) {
      const later = el("button", "text-button", "Later");
      later.type = "button";
      later.setAttribute("aria-label", "Send later");
      later.addEventListener("click", () => {
        this.scheduling = !this.scheduling;
        this.paintComposer();
      });
      tools.append(later);
    }
    for (const item of this.files) {
      const chip = el("button", "text-button", item.name);
      chip.type = "button";
      chip.addEventListener("click", () => {
        this.files = this.files.filter((candidate) => candidate !== item);
        this.paintComposer();
      });
      tools.append(chip);
    }
    this.countEl = el("span", "count", `${[...this.composer.value].length} / 2000`);
    const hint = el("span", "hint", "Enter to send");
    if (this.upload > 0 && this.upload < 100) {
      const bar = el("div", "upload");
      bar.style.width = `${this.upload}%`;
      this.composerMeta.append(bar);
    }
    this.composerMeta.append(tools, hint, this.countEl);
  }

  private async takeFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).slice(0, 4);
    this.upload = 10;
    this.paintComposer();
    for (const file of picked) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.files.push({ name: file.name, mime: file.type, bytes, url: URL.createObjectURL(file) });
      this.upload = Math.min(90, this.upload + 30);
      this.paintComposer();
    }
    this.upload = 100;
    this.paintComposer();
    window.setTimeout(() => {
      this.upload = 0;
      this.paintComposer();
    }, 400);
  }

  private async send() {
    const id = this.channelId;
    if (!id) return;
    const content = this.composer.value;
    const error = outgoingError(content, this.files.length, this.files.reduce((sum, file) => sum + file.bytes.byteLength, 0));
    if (error) {
      this.toast("Can't send", error);
      return;
    }
    if (this.editing) {
      this.editing.content = content;
      this.editing.edited = true;
      const stored = (history[id] ?? []).find((message) => message.id === this.editing?.id);
      if (stored) {
        stored.content = content;
        stored.edited = true;
      }
      if (!this.demo) await invoke("edit_message", { channelId: id, messageId: this.editing.id, content });
      this.editing = null;
      this.msgSig = "";
    } else {
      const message: RawMessage = {
        id: `local-${Date.now()}`,
        channelId: id,
        authorId: this.meId(),
        authorName: this.demo ? "Ethan Park" : this.me.name,
        content,
        timestamp: new Date().toISOString(),
        reply: this.reply ? { id: this.reply.id, authorName: this.reply.authorName, preview: this.reply.content.slice(0, 80) } : null,
        kind: this.reply ? "reply" : "default",
        attachments: this.files.map((file, index) => ({
          id: `file-${index}`,
          name: file.name,
          url: file.url,
          contentType: file.mime,
          size: file.bytes.byteLength,
        })),
      };
      history[id] = [...(history[id] ?? []), message];
      this.pages[id] = [...(this.pages[id] ?? []), message];
      this.scroll = "bottom";
      this.pinnedToBottom = true;
      this.paintMessages();
      if (!this.demo) {
        const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
          channelId: id,
          content,
          replyTo: this.reply?.id ?? null,
          files: this.files.map((file) => ({ name: file.name, mime: file.mime, bytes: Array.from(file.bytes) })),
        }));
        message.id = sent.id;
        message.attachments = sent.attachments;
        this.msgSig = "";
      }
      this.reply = null;
    }
    this.composer.value = "";
    if (id) delete this.drafts[id];
    localStorage.setItem("lark.drafts.v1", JSON.stringify(this.drafts));
    this.files = [];
    this.pinnedToBottom = true;
    this.scroll = "bottom";
    this.paintComposer();
    if (!this.msgSig) this.paintMessages();
  }

  private beginEdit(message: RawMessage) {
    this.editing = message;
    this.reply = null;
    this.composer.value = message.content;
    this.composer.focus();
    this.paintComposer();
  }

  private editLast() {
    const list = this.pages[this.channelId ?? ""] ?? [];
    const mine = [...list].reverse().find((message) => message.authorId === this.meId());
    if (mine) this.beginEdit(mine);
  }

  private removeMessage(message: RawMessage) {
    const id = message.channelId;
    history[id] = (history[id] ?? []).filter((item) => item.id !== message.id);
    this.pages[id] = (this.pages[id] ?? []).filter((item) => item.id !== message.id);
    this.pendingDelete = null;
    if (!this.demo) void invoke("delete_message", { channelId: id, messageId: message.id });
    this.msgSig = "";
    this.paintMessages();
    this.paintComposer();
  }

  private toggleReaction(message: RawMessage, emoji: string) {
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    let add = true;
    this.emojiUses = rememberEmoji(this.emojiUses, emoji, Date.now());
    localStorage.setItem("lark.emoji.v1", JSON.stringify(this.emojiUses));
    if (existing?.me) {
      existing.count -= 1;
      existing.me = false;
      add = false;
      if (existing.count <= 0) message.reactions = reactions.filter((reaction) => reaction !== existing);
    } else if (existing) {
      existing.count += 1;
      existing.me = true;
    } else {
      reactions.push({ emoji, count: 1, me: true });
      message.reactions = reactions;
    }
    if (!this.demo && this.channelId) {
      void invoke("toggle_reaction", { channelId: this.channelId, messageId: message.id, emoji, emojiId: null, add });
    }
    this.pickerFor = null;
    this.msgSig = "";
    this.paintMessages();
  }

  private openSwitcher() {
    this.switcher = true;
    this.switcherIndex = 0;
    this.switcherEl.hidden = false;
    clear(this.switcherEl);
    const card = el("div", "switcher-card");
    const input = el("input");
    input.placeholder = "Jump, or type a command";
    input.setAttribute("aria-label", "Command palette");
    const results = el("div", "switcher-results");
    const foot = el("div", "switcher-foot", `${formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os)} to open · Enter to jump · Esc to close`);
    const render = () => {
      const hits = this.switcherHits(input.value);
      clear(results);
      if (!hits.length) results.append(el("div", "empty", "No matches."));
      hits.forEach((hit, index) => {
        const button = el("button", `switcher-hit${index === this.switcherIndex ? " is-active" : ""}`);
        button.type = "button";
        button.append(el("strong", "", hit.label), el("span", "faint", hit.hint));
        button.addEventListener("click", () => this.commitHit(hit));
        results.append(button);
      });
      this.switcherHitsCache = hits;
    };
    input.addEventListener("input", () => {
      this.switcherIndex = 0;
      render();
    });
    card.append(input, results, foot);
    this.switcherEl.append(card);
    this.switcherEl.onclick = (event) => {
      if (event.target === this.switcherEl) this.closeSwitcher();
    };
    render();
    input.focus();
  }

  private switcherHitsCache: { id: string; guildId: string | null; label: string; hint: string; command?: string }[] = [];

  private switcherHits(query: string) {
    const hits: { id: string; guildId: string | null; label: string; hint: string; score: number; command?: string }[] = [];
    for (const command of matchCommands(query, commandCatalog())) {
      hits.push({ id: `cmd:${command.id}`, guildId: null, label: command.label, hint: command.hint, score: query.trim() ? 80 : 40, command: command.id });
    }
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      const guild = this.guilds().find((item) => item.id === guildId);
      for (const channel of list) {
        if (channel.kind === "category" || !this.canSeeChannel(guildId, channel)) continue;
        const score = fuzzyScore(query, `${guild?.name ?? ""} ${channel.name}`);
        if (score === null) continue;
        hits.push({ id: channel.id, guildId, label: channel.kind === "voice" ? channel.name : `# ${channel.name}`, hint: guild?.name ?? "", score });
      }
    }
    for (const dm of this.dms()) {
      const score = fuzzyScore(query, dm.name);
      if (score === null) continue;
      hits.push({ id: dm.id, guildId: null, label: dm.name, hint: dm.kind === "group" ? "Group DM" : "Direct message", score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 16);
  }

  private moveSwitcher(delta: number) {
    const hits = this.switcherHitsCache;
    if (!hits.length) return;
    this.switcherIndex = (this.switcherIndex + delta + hits.length) % hits.length;
    this.switcherEl.querySelectorAll(".switcher-hit").forEach((node, index) => node.classList.toggle("is-active", index === this.switcherIndex));
  }

  private commitSwitcher() {
    const hit = this.switcherHitsCache[this.switcherIndex];
    if (hit) this.commitHit(hit);
  }

  private commitHit(hit: { id: string; guildId: string | null; command?: string }) {
    if (hit.command) {
      this.closeSwitcher();
      this.runCommand(hit.command);
      return;
    }
    this.closeSwitcher();
    this.guildId = hit.guildId;
    void this.openChannel(hit.id);
  }

  private closeSwitcher() {
    this.switcher = false;
    this.switcherEl.hidden = true;
    clear(this.switcherEl);
  }

  private openSettings() {
    this.settings = true;
    this.settingsEl.hidden = false;
    this.renderSettings();
    if (this.section === "appearance") void this.refreshThemeIndex();
  }

  private closeSettings() {
    this.settings = false;
    this.rebinding = null;
    this.settingsEl.hidden = true;
    this.paint();
  }

  private renderSettings() {
    clear(this.settingsEl);
    const card = el("div", "settings-card");
    const nav = el("nav", "settings-nav");
    const sections: [Section, string][] = [
      ["account", "My Account"],
      ["appearance", "Appearance"],
      ["voice", "Voice & Video"],
      ["notifications", "Notifications"],
      ["shortcuts", "Keybinds"],
      ["lark", "Lark"],
    ];
    for (const [id, label] of sections) {
      const button = el("button", this.section === id ? "is-on" : "", label);
      button.type = "button";
      button.addEventListener("click", () => {
        this.section = id;
        this.renderSettings();
        if (id === "appearance") void this.refreshThemeIndex();
      });
      nav.append(button);
    }
    const body = el("div", "settings-body");
    body.append(this.settingsSection());
    card.append(nav, body);
    this.settingsEl.append(card);
    this.settingsEl.onclick = (event) => {
      if (event.target === this.settingsEl) this.closeSettings();
    };
  }

  private settingsSection(): HTMLElement {
    const wrap = el("div");
    if (this.section === "appearance") {
      wrap.append(el("h2", "", "Appearance"), el("p", "lede", "Each card is that theme's own colours. One click applies it."));
      const filter = el("input", "theme-filter");
      filter.type = "search";
      filter.placeholder = "Filter themes";
      filter.value = this.themeFilter;
      filter.setAttribute("aria-label", "Filter themes");
      filter.addEventListener("input", () => {
        this.themeFilter = filter.value;
        this.paintThemeGallery();
      });
      wrap.append(filter);
      const grid = el("div", "theme-gallery");
      wrap.append(grid);
      this.paintThemeGallery(wrap);
      const actions = el("div", "theme-actions");
      const exportCss = el("button", "text-button", "Export CSS");
      exportCss.type = "button";
      exportCss.addEventListener("click", () => void this.exportTheme("css"));
      const exportJson = el("button", "text-button", "Export JSON");
      exportJson.type = "button";
      exportJson.addEventListener("click", () => void this.exportTheme("json"));
      const importBtn = el("button", "text-button", "Import");
      importBtn.type = "button";
      const file = el("input", "theme-file");
      file.type = "file";
      file.accept = ".css,.json,text/css,application/json";
      file.setAttribute("aria-label", "Import theme file");
      file.tabIndex = -1;
      file.addEventListener("change", () => {
        const picked = file.files?.[0];
        file.value = "";
        if (picked) void this.importTheme(picked);
      });
      importBtn.addEventListener("click", () => file.click());
      actions.append(exportCss, exportJson, importBtn, file);
      wrap.append(actions, el("p", "hint", "CSS and JSON carry the same colours. Frosted uses the system material on macOS and Windows, and stays opaque elsewhere. Themes do not blur or animate the message list."));
      wrap.append(el("div", "hint", "Font"));
      wrap.append(this.choice(["inter", "system", "serif", "mono"], this.config.appearance.font_family, (value) => {
        this.config.appearance.font_family = value as AppConfig["appearance"]["font_family"];
        this.persist();
        this.paint();
      }));
      const size = el("input");
      size.type = "range";
      size.min = "12";
      size.max = "20";
      size.value = String(this.config.appearance.font_size);
      size.addEventListener("input", () => {
        this.config.appearance.font_size = Number(size.value);
        this.persist();
        this.applyAppearance();
      });
      wrap.append(el("div", "hint", "Size"), size);
      wrap.append(el("h3", "", "Display"));
      wrap.append(el("div", "hint", "Density"));
      wrap.append(this.choice(["cozy", "compact", "irc"], this.config.appearance.density, (value) => {
        this.config.appearance.density = value as AppConfig["appearance"]["density"];
        this.persist();
        this.msgSig = "";
        this.paint();
      }));
      wrap.append(el("div", "hint", "Channel list"));
      wrap.append(this.choice(["left", "right", "hidden"], this.config.appearance.channel_list, (value) => {
        this.config.appearance.channel_list = value as AppConfig["appearance"]["channel_list"];
        this.persist();
        this.paint();
      }));
      wrap.append(this.toggle("Member list", this.config.appearance.show_member_list, (value) => {
        this.config.appearance.show_member_list = value;
        this.persist();
        this.paint();
      }));
      wrap.append(this.toggle("Server rail", this.config.appearance.show_server_rail, (value) => {
        this.config.appearance.show_server_rail = value;
        this.persist();
        this.paint();
      }));
    } else if (this.section === "voice") {
      wrap.append(el("h2", "", "Voice & Video"), el("p", "lede", "Push to talk, voice activity, and a cheap noise gate. Echo cancellation stays off; it needs a heavy audio processor."));
      wrap.append(this.choice(["vad", "ptt"], this.config.voice.mode, (value) => {
        this.config.voice.mode = value === "ptt" ? "ptt" : "vad";
        this.persist();
      }));
      const sense = el("input");
      sense.type = "range";
      sense.min = "0";
      sense.max = "100";
      sense.value = String(this.config.voice.sensitivity);
      sense.addEventListener("input", () => {
        this.config.voice.sensitivity = Number(sense.value);
        this.persist();
      });
      wrap.append(el("div", "hint", "Voice activity sensitivity"), sense);
      wrap.append(this.toggle("Noise suppression", this.config.voice.noise_suppression, (value) => {
        this.config.voice.noise_suppression = value;
        this.persist();
      }));
      wrap.append(el("h3", "", "Devices"));
      wrap.append(el("p", "lede", "Lark stores the device you pick. Voice uses these ids when it opens the microphone."));
      wrap.append(this.devicePicker("Input", this.config.voice.input_device, this.audioInputs, (value) => {
        this.config.voice.input_device = value;
        this.persist();
      }));
      wrap.append(this.devicePicker("Output", this.config.voice.output_device, this.audioOutputs, (value) => {
        this.config.voice.output_device = value;
        this.persist();
      }));
      wrap.append(this.devicePicker("Camera", this.config.voice.video_device, this.videoInputs, (value) => {
        this.config.voice.video_device = value;
        this.persist();
      }));
      const listDevices = el("button", "text-button", "List microphones and cameras");
      listDevices.type = "button";
      listDevices.addEventListener("click", () => void this.listDevices());
      wrap.append(listDevices);
    } else if (this.section === "shortcuts") {
      wrap.append(el("h2", "", "Keybinds"), el("p", "lede", "mod is ⌘ on macOS and Ctrl on Windows. Click a shortcut, then press the new keys."));
      const fixed = el("div", "shortcut-row");
      fixed.append(el("span", "", "mark read"), el("span", "kbd", "Esc"));
      wrap.append(fixed);
      wrap.append(el("p", "hint", "Esc closes whatever is open first. With nothing open, it marks the channel read, then the rest of the list."));
      const conflicts = shortcutConflicts(this.config.shortcuts);
      if (conflicts.length) wrap.append(el("div", "warning", conflicts.join(" ")));
      for (const [action, shortcut] of Object.entries(this.config.shortcuts) as [keyof Shortcuts, string][]) {
        const row = el("div", "shortcut-row");
        row.append(el("span", "", action.replaceAll("_", " ")));
        const button = el("button", "kbd", this.rebinding === action ? "Press keys" : formatShortcut(shortcut, this.platform.os));
        button.type = "button";
        button.addEventListener("click", () => {
          this.rebinding = action;
          this.renderSettings();
        });
        row.append(button);
        wrap.append(row);
      }
    } else if (this.section === "notifications") {
      wrap.append(el("h2", "", "Notifications"), el("p", "lede", this.platform.notificationNote));
      wrap.append(el("div", "hint", "Default"));
      wrap.append(this.choice(["all", "mentions", "mute"], this.config.notifications.default, (value) => {
        this.config.notifications.default = value as NotifyLevel;
        this.persist();
      }));
      const test = el("button", "primary", "Send a test notification");
      test.type = "button";
      test.addEventListener("click", () => void this.notify("Lark", "Notifications are on. Mute still wins."));
      wrap.append(test);
      const words = el("input");
      words.value = this.config.notifications.keywords.join(", ");
      words.setAttribute("aria-label", "Highlight keywords");
      words.addEventListener("change", () => {
        this.config.notifications.keywords = words.value.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 20);
        this.persist();
        this.msgSig = "";
      });
      wrap.append(el("div", "hint", "Highlight keywords"), words);
      wrap.append(el("div", "platform-grid", ""));
      const grid = wrap.lastElementChild as HTMLElement;
      clear(grid);
      grid.append(this.platformCard("macOS", "Banners and Notification Center", "⌘"));
      grid.append(this.platformCard("Windows", "Toasts in Action Center", "Ctrl"));
    } else if (this.section === "lark") {
      wrap.append(el("h2", "", "Lark"), el("p", "lede", "Frame cap, tray, and plugins. Plugins stay off until you turn them on."));
      wrap.append(this.toggle("Minimise to tray", this.config.desktop.minimize_to_tray, (value) => {
        this.config.desktop.minimize_to_tray = value;
        this.persist();
        if (isTauri()) void invoke("set_minimize_to_tray", { enabled: value });
      }));
      wrap.append(this.toggle("Open at login", this.config.desktop.autostart, (value) => {
        this.config.desktop.autostart = value;
        this.persist();
        if (isTauri()) void invoke("set_autostart", { enabled: value });
      }));
      wrap.append(el("p", "lede", "Frame rate. Scrolling and transitions follow the monitor, up to this cap. Lark paints only when something on screen changes."));
      const caps: [number, string][] = [
        [0, "Match"],
        [240, "240"],
        [165, "165"],
        [144, "144"],
        [120, "120"],
        [60, "60"],
      ];
      const row = el("div", "choice-row");
      for (const [value, label] of caps) {
        const on = this.config.desktop.frame_cap === value;
        const button = el("button", on ? "text-button is-on" : "text-button", label);
        button.type = "button";
        button.addEventListener("click", () => {
          this.config.desktop.frame_cap = value;
          this.frames.setCap(value);
          this.persist();
          this.renderSettings();
        });
        row.append(button);
      }
      wrap.append(row);
      const hz = this.frames.displayHz;
      wrap.append(el("p", "hint", hz
        ? `This display is about ${hz} Hz. The hard cap is 240.`
        : "Measuring the display. The hard cap is 240."));
      wrap.append(el("h3", "", "Plugins"));
      const pack = new Set<string>(PACK_IDS);
      let headed = false;
      for (const plugin of this.catalog) {
        if (!headed && pack.has(plugin.id)) {
          headed = true;
          wrap.append(el("h3", "", "Pack"));
          wrap.append(el("p", "lede", "Reading tools stay on this device. Send later and the status plugins use the same single Discord requests as the composer and the profile chip, paced so they cannot burst."));
        }
        const enabled = this.config.plugins.enabled.includes(plugin.id);
        wrap.append(this.toggle(`${plugin.name} — ${plugin.description}`, enabled, (value) => this.setPluginEnabled(plugin.id, value)));
        if (enabled) this.appendPluginPanel(wrap, plugin.id);
      }
    } else {
      const me = this.demo ? people[0] : this.me;
      wrap.append(el("h2", "", "My Account"));
      const who = el("div", "settings-account");
      who.append(portrait(me.name, me.id, me.avatarUrl));
      const copy = el("div");
      copy.append(el("strong", "", me.name), el("div", "hint", me.custom || statusLabel(me.status)), el("div", "hint", me.id));
      who.append(copy);
      wrap.append(who, el("p", "lede", "Name, avatar, and id come from Discord. Lark does not edit them. The token never goes in the config file, logs, or a plugin."));
      const grid = el("div", "platform-grid");
      grid.append(this.platformCard("macOS", "macOS Keychain", "~/Library/Application Support/dev.lark.desktop"));
      grid.append(this.platformCard("Windows", "Windows Credential Manager", "%APPDATA%\\dev.lark.desktop"));
      wrap.append(grid);
      wrap.append(el("p", "hint", `This session: ${this.platform.credentialStore}. Config folder: ${this.platform.configDir}`));
      if (isTauri()) {
        const forget = el("button", "ghost", "Forget token");
        forget.type = "button";
        forget.addEventListener("click", () => void this.forgetToken());
        wrap.append(forget);
      }
    }
    return wrap;
  }

  private platformCard(title: string, body: string, extra: string): HTMLElement {
    const current = (title === "macOS" && this.platform.os === "macos") || (title === "Windows" && this.platform.os === "windows");
    const card = el("article", `platform-card${current ? " is-current" : ""}`);
    card.append(el("strong", "", title), el("div", "", body), el("div", "hint", extra));
    return card;
  }

  private devicePicker(label: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrap = el("label", "device");
    wrap.append(el("span", "", label));
    const select = el("select");
    select.setAttribute("aria-label", label);
    const def = el("option", "", "System default");
    def.value = "";
    select.append(def);
    const known = new Set(options.map((option) => option.id));
    if (current && !known.has(current)) {
      const extra = el("option", "", current);
      extra.value = current;
      select.append(extra);
    }
    for (const option of options) {
      const node = el("option", "", option.label);
      node.value = option.id;
      select.append(node);
    }
    select.value = current;
    select.addEventListener("change", () => onChange(select.value));
    wrap.append(select);
    return wrap;
  }

  private choice(values: string[], current: string, onPick: (value: string) => void): HTMLElement {
    const row = el("div", "choice-row");
    for (const value of values) {
      const button = el("button", value === current ? "text-button is-on" : "text-button", value);
      button.type = "button";
      button.addEventListener("click", () => onPick(value));
      row.append(button);
    }
    return row;
  }

  private toggle(label: string, on: boolean, change: (value: boolean) => void): HTMLElement {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", label));
    const button = el("button", on ? "text-button is-on" : "text-button", on ? "On" : "Off");
    button.type = "button";
    button.addEventListener("click", () => {
      const result = change(!on) as void | Promise<void>;
      if (result && typeof (result as Promise<void>).then === "function") {
        void result.then(() => {
          if (this.settings) this.renderSettings();
        });
        return;
      }
      if (this.settings) this.renderSettings();
    });
    row.append(button);
    return row;
  }

  private async forgetToken() {
    try {
      await invoke("clear_token");
    } catch (err) {
      const message = commandError(err, "Couldn't remove the saved token.");
      this.tokenNote = message;
      this.toast("Sign out", message);
      return;
    }
    this.view = "gate";
    this.demo = false;
    this.qrWatching = false;
    const initial = gateQr(isTauri());
    this.qrSvg = initial.svg;
    this.qrStatus = initial.status;
    this.tokenNote = "";
    this.signInBusy = "";
    this.connection = "Signed out";
    this.closeSettings();
    this.paint();
    this.ensureQr();
  }

  private paintLightbox() {
    this.lightboxEl.hidden = !this.lightbox;
    clear(this.lightboxEl);
    if (!this.lightbox) return;
    const img = el("img");
    img.src = this.lightbox;
    img.alt = "Attachment";
    this.lightboxEl.append(img);
  }

  private toast(title: string, body: string) {
    const toast = el("div", "toast");
    toast.append(el("strong", "", title), el("span", "", body));
    this.toastWrap.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  private async notify(title: string, body: string) {
    this.toast(title, body);
    if (!isTauri()) return;
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (granted) mod.sendNotification({ title, body });
  }

  private onKey(event: KeyboardEvent) {
    if (this.rebinding) {
      event.preventDefault();
      const shortcut = shortcutFromEvent(event, this.platform.os);
      if (!shortcut) return;
      this.config.shortcuts[this.rebinding] = shortcut;
      this.rebinding = null;
      this.persist();
      this.renderSettings();
      return;
    }
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
      if (this.popout) {
        this.popout = null;
        this.statusOpen = false;
        this.wireProfile = null;
        this.paintPopout();
      } else if (this.settings) this.closeSettings();
      else if (this.lightbox) {
        this.lightbox = null;
        this.paintLightbox();
      } else if (this.invite) {
        this.invite = null;
        this.paintInvite();
      } else if (this.themeOpen) {
        this.themeOpen = false;
        this.paintTheme();
      } else if (this.searchOpen) {
        this.searchOpen = false;
        this.paintSearch();
      } else if (this.pinsOpen) {
        this.pinsOpen = false;
        this.paintPins();
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
      } else {
        const field = event.target as HTMLElement | null;
        const typingField = field === this.composer || field?.tagName === "INPUT" || field?.tagName === "TEXTAREA";
        if (!typingField) this.markReadFromEscape();
      }
      return;
    }
    const os = this.platform.os;
    const shortcuts = this.config.shortcuts;
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
    else if (matchShortcut(event, shortcuts.next_unread, os)) this.nextUnread();
    else if (matchShortcut(event, shortcuts.toggle_mute, os)) {
      event.preventDefault();
      this.toggleMute();
    } else if (matchShortcut(event, shortcuts.toggle_deafen, os)) {
      event.preventDefault();
      this.toggleDeafen();
    } else if (this.voice && this.config.voice.mode === "ptt" && matchShortcut(event, shortcuts.push_to_talk, os)) {
      event.preventDefault();
      this.pttHeld = true;
      this.refreshSpeaking();
    }
    else if (target === this.composer && matchShortcut(event, shortcuts.edit_last, os) && !this.composer.value) {
      event.preventDefault();
      this.editLast();
    }
  }

  private cycle(delta: number) {
    const list = this.visibleChannels().filter((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group" || channel.kind === "announcement" || channel.kind === "forum");
    if (!list.length) return;
    const index = list.findIndex((channel) => channel.id === this.channelId);
    const next = list[(index + delta + list.length) % list.length];
    if (next) void this.openChannel(next.id);
  }

  private nextUnread() {
    const list = this.visibleChannels().filter((channel) => (this.unread[channel.id] ?? 0) > 0 || (this.mentions[channel.id] ?? 0) > 0);
    if (list[0]) void this.openChannel(list[0].id);
  }

  private async loadPlugins() {
    try {
      if (isTauri() && !import.meta.env.DEV) {
        const files = await invoke<{ id: string; name: string; description: string }[]>("list_plugins");
        this.catalog = files
          .filter((file) => validPluginId(file.id))
          .map((file) => ({ id: file.id, name: file.name || file.id, description: file.description || "" }));
      } else {
        const manifest = await fetch("/plugins/manifest.json", { cache: "no-store" }).then((res) => res.json());
        this.catalog = parseCatalog(manifest);
      }
    } catch {
      this.catalog = [];
    }
    await Promise.all(this.config.plugins.enabled.map((id) => this.ensurePlugin(id)));
  }

  private async ensurePlugin(id: string): Promise<boolean> {
    if (!validPluginId(id)) return false;
    if (this.loaded.has(id)) return true;
    try {
      let source = "";
      if (isTauri() && !import.meta.env.DEV) source = await invoke<string>("read_plugin", { id });
      else {
        const res = await fetch(`/plugins/${id}.js`, { cache: "no-store" });
        if (!res.ok) return false;
        source = await res.text();
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
  }

  private persist() {
    localStorage.setItem("lark.config.v1", JSON.stringify(this.config));
    if (isTauri()) void invoke("save_config", { config: this.config });
  }

  private async ensureGuild(guildId: string) {
    await this.ensureChannels(guildId);
    await this.ensureMembers(guildId);
  }

  private async ensureChannels(guildId: string) {
    if (this.liveChannels[guildId]) return;
    try {
      const channels = await invoke<Channel[]>("fetch_guild_channels", { guildId });
      this.liveChannels[guildId] = channels.map(normalizeChannel);
      if (this.guildId === guildId) this.paint();
    } catch {
      /* GUILD_CREATE may still fill the list. */
    }
  }

  private async ensureMembers(guildId: string) {
    if (this.memberPhase[guildId] !== "done") this.memberPhase[guildId] = "loading";
    try {
      const roles = await invoke<RoleInfo[]>("fetch_roles", { guildId });
      this.rememberRoles(guildId, roles);
    } catch {
      /* GUILD_CREATE still delivers role colors. */
    }
    const channelId = this.guildId === guildId ? this.channelId : "";
    if (channelId) this.queueMemberSubscribe(guildId, channelId, [[0, 99]]);
    window.setTimeout(() => {
      if (this.memberPhase[guildId] === "loading" && !this.guildHasMembers(guildId)) {
        this.memberPhase[guildId] = "done";
        if (this.guildId === guildId) this.paintMembers();
      }
    }, 8000);
    if (this.guildId === guildId) this.paintMembers();
  }

  private guildHasMembers(guildId: string): boolean {
    if (this.membersByGuild[guildId]?.length) return true;
    return Object.entries(this.memberLists).some(([key, list]) => key.startsWith(`${guildId}:`) && list.rows.size > 0);
  }

  private queueMemberSubscribe(guildId: string, channelId: string, ranges: [number, number][]) {
    const key = `${guildId}:${channelId}:${ranges.map((range) => range.join("-")).join(",")}`;
    if (key === this.memberRanges) return;
    this.memberRanges = key;
    void invoke("request_members", { guildId, channelId, ranges }).catch(() => undefined);
  }

  private onMemberScroll(scroll: HTMLElement) {
    if (this.demo || !this.guildId || !this.channelId) return;
    const list = this.currentMemberList();
    const hint = (list?.memberCount ?? 0) + (list?.groups.length ?? 0);
    const nearEnd = scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 120;
    if (!nearEnd && scroll.scrollTop < 48) return;
    const ranges = rangesForScroll(scroll.scrollTop, scroll.clientHeight || 640, hint);
    this.queueMemberSubscribe(this.guildId, this.channelId, ranges);
  }

  private onMemberList(guildId: string, event: MemberListWire) {
    const listId = event.listId || this.channelId || "everyone";
    const key = `${guildId}:${listId}`;
    const state = this.memberLists[key] ?? emptyMemberList(listId);
    applyMemberOps(state, { ...event, listId });
    this.memberLists[key] = state;
    for (const row of state.rows.values()) {
      if (row.kind !== "member") continue;
      this.directory[row.person.id] = row.person;
      this.userNames[row.person.id] = row.person.name;
    }
    this.memberPhase[guildId] = "done";
    if (this.guildId === guildId) this.paintMembers();
  }

  private currentMemberList(): MemberListState | null {
    if (!this.guildId) return null;
    const exact = this.memberLists[`${this.guildId}:${this.channelId}`];
    if (exact?.rows.size) return exact;
    const everyone = this.memberLists[`${this.guildId}:everyone`];
    if (everyone?.rows.size) return everyone;
    const prefix = `${this.guildId}:`;
    const found = Object.entries(this.memberLists).find(([key, list]) => key.startsWith(prefix) && list.rows.size);
    return found?.[1] ?? exact ?? everyone ?? null;
  }

  private rememberRoles(guildId: string, roles: RoleInfo[]) {
    const prev = new Map((this.rolesByGuild[guildId] ?? []).map((role) => [role.id, role]));
    for (const role of roles) {
      if (!role?.id) continue;
      prev.set(role.id, {
        id: role.id,
        name: role.name || "role",
        color: role.color || null,
        position: role.position ?? 0,
        hoist: Boolean(role.hoist),
      });
      this.liveRoles[role.id] = role.name || "role";
    }
    this.rolesByGuild[guildId] = [...prev.values()];
  }

  private async ensureHome() {
    try {
      const channels = await invoke<Channel[]>("fetch_dms");
      this.mergeDms(channels.map(normalizeChannel));
    } catch {
      /* READY private channels still fill the list. */
    }
    try {
      const friends = await invoke<RawMember[]>("fetch_friends");
      this.storeFriends(friends.map(personFromMember).filter((person): person is Person => Boolean(person)));
    } catch {
      /* Relationships on READY still fill the friends list. */
    }
    if (!this.guildId) this.paint();
  }

  private mergeDms(incoming: Channel[]) {
    const byId = new Map(this.liveDms.map((channel) => [channel.id, channel]));
    for (const channel of incoming) {
      if (channel.kind !== "dm" && channel.kind !== "group") continue;
      const prev = byId.get(channel.id);
      byId.set(channel.id, prev ? {
        ...prev,
        ...channel,
        recipients: channel.recipients?.length ? channel.recipients : prev.recipients,
        recipientIds: channel.recipientIds?.length ? channel.recipientIds : prev.recipientIds,
        lastMessageId: channel.lastMessageId || prev.lastMessageId,
      } : channel);
      for (const recipient of channel.recipients ?? []) {
        const known = this.directory[recipient.id];
        this.directory[recipient.id] = {
          id: recipient.id,
          name: known?.name || recipient.name,
          bot: recipient.bot,
          status: known?.status ?? "offline",
          custom: known?.custom,
          activity: known?.activity,
          avatarUrl: recipient.avatarUrl || known?.avatarUrl || null,
        };
        this.userNames[recipient.id] = this.directory[recipient.id].name;
      }
    }
    this.liveDms = [...byId.values()];
  }

  private storeFriends(incoming: Person[]) {
    const byId = new Map(this.friends.map((person) => [person.id, person]));
    for (const person of incoming) {
      const prev = byId.get(person.id);
      const next = prev ? {
        ...prev,
        ...person,
        status: person.status || prev.status,
        custom: person.custom || prev.custom,
        activity: person.activity || prev.activity,
        avatarUrl: person.avatarUrl || prev.avatarUrl,
      } : person;
      byId.set(person.id, next);
      this.directory[person.id] = next;
      this.userNames[person.id] = next.name;
    }
    this.friends = [...byId.values()];
  }

  private notePresence(userId: string, status: Person["status"], custom: string, activity: string) {
    const apply = (person: Person) => {
      person.status = status;
      person.custom = custom;
      person.activity = activity;
    };
    const known = this.directory[userId];
    if (known) apply(known);
    else this.directory[userId] = { id: userId, name: this.userNames[userId] || "Someone", status, custom, activity };
    const friend = this.friends.find((person) => person.id === userId);
    if (friend) apply(friend);
    for (const bucket of Object.values(this.membersByGuild)) {
      const person = bucket.find((item) => item.id === userId);
      if (person) apply(person);
    }
    for (const list of Object.values(this.memberLists)) {
      for (const row of list.rows.values()) {
        if (row.kind === "member" && row.person.id === userId) apply(row.person);
      }
    }
    if (this.me.id === userId) apply(this.me);
  }

  private schedulePeoplePaint() {
    if (this.peopleTimer) return;
    this.peopleTimer = window.setTimeout(() => {
      this.peopleTimer = 0;
      if (this.view !== "app") return;
      this.paintMembers();
      if (!this.guildId) this.paintChannels();
      if (this.friendsOpen && !this.guildId) {
        this.msgSig = "";
        this.paintMessages();
      }
    }, 50);
  }

  private async openDm(userId: string) {
    const existing = this.dms().find((channel) => channel.kind === "dm" && (channel.recipientIds?.includes(userId) || channel.recipients?.some((item) => item.id === userId)));
    if (existing) {
      this.friendsOpen = false;
      void this.openChannel(existing.id);
      return;
    }
    if (this.demo) return;
    try {
      const channel = normalizeChannel(await invoke<Channel>("open_dm", { userId }));
      this.mergeDms([channel]);
      this.friendsOpen = false;
      void this.openChannel(channel.id);
    } catch (err) {
      this.toast("Direct message", err instanceof Error ? err.message : "Couldn't open that conversation.");
    }
  }

  private openProfile(person: Person, statusPicker = false) {
    this.popout = person;
    this.statusOpen = statusPicker;
    this.wireProfile = this.wireProfile?.id === person.id ? this.wireProfile : null;
    this.paintPopout();
    if (this.demo) return;
    const userId = person.id;
    const guildId = this.guildId;
    void invoke<WireProfile>("fetch_profile", { userId, guildId }).then((profile) => {
      if (this.popout?.id !== userId) return;
      this.wireProfile = profile;
      if (profile.avatarUrl) person.avatarUrl = profile.avatarUrl;
      if (profile.nick) person.name = profile.nick;
      this.paintPopout();
    }).catch(() => undefined);
  }

  private profileRoles(person: Person): ProfileRole[] {
    const ids = this.wireProfile?.id === person.id ? this.wireProfile.roleIds ?? person.roleIds : person.roleIds;
    const roles = this.guildId ? this.rolesByGuild[this.guildId] ?? [] : [];
    return roles
      .filter((role) => ids?.includes(role.id) && role.id !== this.guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color || null }));
  }

  private storeMembers(guildId: string, incoming: Person[]) {
    if (!incoming.length) return;
    this.membersByGuild[guildId] = mergePeople(this.membersByGuild[guildId] ?? [], incoming);
    this.memberPhase[guildId] = "done";
    for (const person of this.membersByGuild[guildId]) {
      this.userNames[person.id] = person.name;
      this.directory[person.id] = { ...this.directory[person.id], ...person, avatarUrl: person.avatarUrl || this.directory[person.id]?.avatarUrl };
    }
    if (this.guildId === guildId) {
      this.liveMembers = this.membersByGuild[guildId];
      this.paintMembers();
    }
  }

  private rememberGuild(guild: Guild) {
    this.liveGuilds = mergeGuilds([guild], this.liveGuilds);
    this.paintRail();
    if (guild.id === this.guildId) this.paintChannels();
  }

  private paintConnection() {
    const next = this.me.custom || this.connection;
    const label = this.channelPane.querySelector(".profile-chip .who span");
    if (label instanceof HTMLElement) {
      if (label.textContent !== next) label.textContent = next;
      return;
    }
    this.paintChannels();
  }

  private noteGatewayStatus(state: string | undefined) {
    const now = performance.now();
    this.statusFlaps = this.statusFlaps.filter((stamp) => now - stamp < 10_000);
    this.statusFlaps.push(now);
    if (this.statusFlaps.length >= 4) {
      console.warn(`[lark] gateway status changed ${this.statusFlaps.length} times in 10s (${state ?? "unknown"}). Reconnects should resume and leave the open channel alone.`);
    }
  }

  private onDiscord(payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const event = payload as {
      kind?: string;
      state?: string;
      detail?: string;
      user?: { id: string; name: string; bot: boolean; avatarUrl?: string | null };
      guilds?: Guild[];
      guild?: Guild;
      members?: RawMember[];
      dms?: Channel[];
      guildId?: string;
      channels?: Channel[];
      message?: RawMessage;
      channelId?: string;
      messageId?: string;
      content?: string;
      edited?: boolean;
      userId?: string;
      username?: string;
      emoji?: string;
      added?: boolean;
    };
    if (event.kind === "status") {
      const next = event.state === "connected" ? "Connected" : event.state ?? "Offline";
      if (next !== this.connection) this.noteGatewayStatus(event.state);
      this.connection = next;
      if (event.state === "failed") {
        this.view = "gate";
        this.demo = false;
        this.signInBusy = "";
        this.tokenNote = event.detail || "Discord closed the connection.";
        this.qrWatching = false;
        this.paint();
        this.ensureQr();
        return;
      }
      if (this.view === "gate" && event.detail) {
        this.signInBusy = event.detail;
        this.paintGate();
      }
      if (this.view === "app") this.paintConnection();
    } else if (event.kind === "ready" && event.user) {
      this.demo = false;
      this.view = "app";
      this.tokenNote = "";
      this.signInBusy = "";
      this.qrWatching = false;
      if (isTauri()) {
        void invoke("stop_qr_login").catch(() => undefined);
        void invoke("cancel_browser_login").catch(() => undefined);
      }
      this.me = {
        id: event.user.id,
        name: event.user.name,
        bot: event.user.bot,
        status: "online",
        avatarUrl: event.user.avatarUrl,
      };
      this.userNames[this.me.id] = this.me.name;
      this.directory[this.me.id] = this.me;
      this.liveGuilds = mergeGuilds(event.guilds ?? [], this.liveGuilds);
      this.mergeDms((event.dms ?? []).map(normalizeChannel));
      this.connection = "Connected";
      void this.ensureHome();
      if (!this.guildId || !this.liveGuilds.some((guild) => guild.id === this.guildId)) {
        this.guildId = this.liveGuilds[0]?.id ?? null;
      }
      if (this.guildId) this.liveMembers = this.membersByGuild[this.guildId] ?? [];
      const keepChannel = Boolean(this.channelId && (this.pages[this.channelId]?.length ?? 0) > 0);
      this.paint();
      for (const guild of this.liveGuilds) {
        if (!this.liveChannels[guild.id]) void this.ensureChannels(guild.id);
      }
      if (this.guildId && !(this.membersByGuild[this.guildId]?.length)) void this.ensureMembers(this.guildId);
      if (!keepChannel) {
        const first = this.visibleChannels().find((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group");
        if (first) void this.openChannel(first.id);
      } else {
        console.info(`[lark] gateway ready kept channel ${this.channelId}`);
      }
    } else if (event.kind === "guild" && event.guild?.id) {
      this.rememberGuild(event.guild);
    } else if (event.kind === "members" && event.guildId && event.members) {
      const roster = event.members.map(personFromMember).filter((person): person is Person => Boolean(person));
      this.storeMembers(event.guildId, roster);
    } else if (event.kind === "memberList" && event.guildId) {
      this.onMemberList(event.guildId, event as MemberListWire);
    } else if (event.kind === "roles" && event.guildId) {
      this.rememberRoles(event.guildId, ((event as { roles?: RoleInfo[] }).roles ?? []));
      if (this.guildId === event.guildId) this.paintMembers();
    } else if (event.kind === "role" && event.guildId) {
      const payload = event as { role?: RoleInfo; removed?: boolean };
      if (payload.removed && payload.role?.id) {
        this.rolesByGuild[event.guildId] = (this.rolesByGuild[event.guildId] ?? []).filter((role) => role.id !== payload.role?.id);
        delete this.liveRoles[payload.role.id];
      } else if (payload.role) this.rememberRoles(event.guildId, [payload.role]);
      if (this.guildId === event.guildId) this.paintMembers();
    } else if (event.kind === "directChannel") {
      const payload = event as { channel?: Channel; removed?: boolean };
      if (payload.removed && payload.channel) this.liveDms = this.liveDms.filter((channel) => channel.id !== payload.channel?.id);
      else if (payload.channel) this.mergeDms([normalizeChannel(payload.channel)]);
      if (!this.guildId) this.paintChannels();
    } else if (event.kind === "friends") {
      const friends = ((event as { friends?: RawMember[] }).friends ?? []).map(personFromMember).filter((person): person is Person => Boolean(person));
      this.storeFriends(friends);
      this.schedulePeoplePaint();
    } else if (event.kind === "friendRemoved") {
      const userId = String((event as { userId?: string }).userId ?? "");
      this.friends = this.friends.filter((person) => person.id !== userId);
      this.schedulePeoplePaint();
    } else if (event.kind === "channels" && event.guildId && event.channels) {
      const incoming = event.channels.map(normalizeChannel);
      if ((event as { replace?: boolean }).replace === false) {
        const prev = this.liveChannels[event.guildId] ?? [];
        const byId = new Map(prev.map((channel) => [channel.id, channel]));
        for (const channel of incoming) byId.set(channel.id, channel);
        this.liveChannels[event.guildId] = [...byId.values()];
      } else this.liveChannels[event.guildId] = incoming;
      for (const channel of this.liveChannels[event.guildId] ?? []) this.refreshChannelBadge(channel.id);
      if (event.guildId === this.guildId && !this.channelId) {
        const first = this.visibleChannels().find((channel) => channel.kind === "text");
        if (first) void this.openChannel(first.id);
        else this.paint();
      } else if (event.guildId === this.guildId) {
        this.paintChannels();
        this.paintHeader();
      }
    } else if (event.kind === "channelGone" && event.guildId && event.channelId) {
      this.liveChannels[event.guildId] = (this.liveChannels[event.guildId] ?? []).filter((channel) => channel.id !== event.channelId);
      if (event.guildId === this.guildId) {
        this.paintChannels();
        this.paintHeader();
      }
      this.paintRail();
      this.syncBadge();
    } else if (event.kind === "folders") {
      const folders = ((event as { folders?: { id?: string | number | null; name?: string | null; color?: string | null; guildIds?: string[] }[] }).folders ?? [])
        .map((folder) => normalizeFolder(folder))
        .filter((folder): folder is GuildFolder => Boolean(folder));
      if (folders.length) this.folders = folders;
      this.paintRail();
    } else if (event.kind === "guildAccess") {
      const access = (event as { access?: { guildId?: string; owner?: boolean; permissions?: string; roles?: { id: string; permissions: string }[]; myRoles?: string[] } }).access;
      if (access?.guildId) {
        this.access[access.guildId] = {
          owner: Boolean(access.owner),
          permissions: access.permissions ?? "",
          roles: access.roles ?? [],
          myRoles: access.myRoles ?? [],
        };
        if (access.guildId === this.guildId) {
          this.paintChannels();
          this.paintHeader();
        }
        this.paintRail();
        this.syncBadge();
      }
    } else if (event.kind === "guildNotify") {
      this.applyNotify((event as { entries?: Parameters<LarkApp["applyNotify"]>[0] }).entries ?? []);
      this.paintRail();
      this.paintChannels();
      this.syncBadge();
    } else if (event.kind === "messageCreate" && event.message) {
      const message = normalizeMessage(event.message);
      this.userNames[message.authorId] = message.authorName;
      const bucket = this.pages[message.channelId] ?? [];
      if (!bucket.some((item) => item.id === message.id)) this.pages[message.channelId] = [...bucket, message];
      const guildId = message.guildId || this.guildForChannel(message.channelId);
      const pref = guildId ? this.discordNotify.guilds[guildId] : undefined;
      const mentionsMe = mentionsUser({
        mentionIds: message.mentionIds ?? [],
        mentionRoles: message.mentionRoles ?? [],
        mentionEveryone: Boolean(message.mentionEveryone),
        meId: this.meId(),
        myRoles: guildId ? this.access[guildId]?.myRoles ?? [] : [],
        suppressEveryone: pref?.suppressEveryone ?? false,
        suppressRoles: pref?.suppressRoles ?? false,
        direct: !guildId,
      });
      const level = this.levelFor(guildId, message.channelId);
      if (message.channelId === this.channelId) {
        this.localUnread[message.channelId] = 0;
        this.localMentions[message.channelId] = 0;
        this.markers[message.channelId] = { lastMessageId: message.id, mentionCount: 0 };
        this.refreshChannelBadge(message.channelId);
      } else if (message.authorId !== this.meId() && bumpsUnread(level, mentionsMe)) {
        this.localUnread[message.channelId] = (this.localUnread[message.channelId] ?? 0) + 1;
        if (mentionsMe) this.localMentions[message.channelId] = (this.localMentions[message.channelId] ?? 0) + 1;
        this.refreshChannelBadge(message.channelId);
      }
      const alreadyNotified = shouldDesktopNotify({
        level,
        mentionsMe,
        fromMe: message.authorId === this.meId(),
        windowFocused: this.focused,
        channelId: message.channelId,
        activeChannelId: this.channelId,
      });
      if (alreadyNotified) void this.notify(message.authorName, message.content || "Sent an attachment");
      this.considerKeyword(message, level, mentionsMe, alreadyNotified);
      if (message.channelId === this.channelId) {
        this.scroll = this.pinnedToBottom ? "bottom" : "none";
        this.paintMessages();
      } else if ((this.unread[message.channelId] ?? 0) > 0 || (this.mentions[message.channelId] ?? 0) > 0) {
        this.paintRail();
        this.paintChannels();
      }
    } else if (event.kind === "messageUpdate" && event.channelId && event.messageId) {
      const list = this.pages[event.channelId];
      const message = list?.find((item) => item.id === event.messageId);
      if (message && event.content !== undefined) {
        message.content = event.content;
        message.edited = true;
        if (event.channelId === this.channelId) this.paintMessages();
      }
    } else if (event.kind === "messageDelete" && event.channelId && event.messageId) {
      const list = this.pages[event.channelId];
      if (list) {
        this.pages[event.channelId] = list.filter((item) => item.id !== event.messageId);
        if (event.channelId === this.channelId) this.paintMessages();
      }
    } else if (event.kind === "reaction" && event.channelId && event.messageId && event.emoji) {
      const message = this.pages[event.channelId]?.find((item) => item.id === event.messageId);
      if (message) {
        const reactions = message.reactions ?? [];
        const existing = reactions.find((item) => item.emoji === event.emoji);
        const mine = event.userId === this.meId();
        if (event.added) {
          if (existing) {
            existing.count += 1;
            if (mine) existing.me = true;
          } else reactions.push({ emoji: event.emoji, count: 1, me: mine });
        } else if (existing) {
          existing.count = Math.max(0, existing.count - 1);
          if (mine) existing.me = false;
        }
        message.reactions = reactions.filter((item) => item.count > 0);
        if (event.channelId === this.channelId) this.paintMessages();
      }
    } else if (event.kind === "presence" && event.userId) {
      const status = asStatus(String((event as { status?: string }).status ?? "offline"));
      const custom = String((event as { custom?: string }).custom ?? "");
      const activity = String((event as { activity?: string }).activity ?? "");
      this.notePresence(event.userId, status, custom, activity);
      if (this.guildId && this.membersByGuild[this.guildId]) this.liveMembers = this.membersByGuild[this.guildId];
      this.schedulePeoplePaint();
    } else if (event.kind === "readState" && event.channelId) {
      const mention = Number((event as { mentionCount?: number }).mentionCount ?? 0);
      const last = String((event as { lastMessageId?: string }).lastMessageId ?? "");
      this.markers[event.channelId] = { lastMessageId: last, mentionCount: mention };
      if (event.channelId === this.channelId) {
        this.localUnread[event.channelId] = 0;
        this.localMentions[event.channelId] = 0;
      }
      this.refreshChannelBadge(event.channelId);
      this.syncBadge();
      this.paintChannels();
      this.paintRail();
    } else if (event.kind === "voiceState") {
      const userId = event.userId ?? "";
      const channelId = String((event as { channelId?: string }).channelId ?? "");
      if (this.voice && userId && userId !== this.meId()) {
        const existing = this.voice.members.find((member) => member.id === userId);
        if (channelId && channelId === this.voice.channelId && !existing) {
          this.voice.members.push({ id: userId, name: this.userNames[userId] ?? "Someone", speaking: false, volume: 100 });
        }
        if (existing && !channelId) this.voice.members = this.voice.members.filter((member) => member.id !== userId);
        this.paintVoice();
      }
    } else if (event.kind === "voiceLink" ) {
      const state = String((event as { state?: string }).state ?? "");
      if (this.voice && (state === "connected" || state === "connecting" || state === "reconnecting")) {
        this.voice.status = state;
        this.paintVoice();
      }
      if (state === "left") this.voice = null;
    } else if (event.kind === "typing" && event.channelId && event.userId !== this.meId()) {
      const name = event.username || this.userNames[event.userId ?? ""] || "Someone";
      this.typingNames = this.typingNames.filter((item) => item.channelId !== event.channelId || item.name !== name);
      this.typingNames.push({ channelId: event.channelId, name, until: Date.now() + 8000 });
      window.clearTimeout(this.typingTimer);
      this.paintTyping();
      this.typingTimer = window.setTimeout(() => this.paintTyping(), 8100);
    }
  }

  private onKeyUp(event: KeyboardEvent) {
    if (!this.voice || this.config.voice.mode !== "ptt") return;
    if (matchShortcut(event, this.config.shortcuts.push_to_talk, this.platform.os)) {
      this.pttHeld = false;
      this.refreshSpeaking();
    }
  }

  private saveDraft() {
    const id = this.channelId;
    if (!id) return;
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.drafts[id] = this.composer.value;
      localStorage.setItem("lark.drafts.v1", JSON.stringify(this.drafts));
    }, 120);
  }

  private rememberCache() {
    const pages: Record<string, RawMessage[]> = {};
    for (const id of this.recent) {
      const list = this.pages[id];
      if (list) pages[id] = list.slice(-40).map((message) => ({ ...message, attachments: (message.attachments ?? []).map((file) => ({ ...file, url: file.url.startsWith("blob:") ? "" : file.url })) }));
    }
    localStorage.setItem("lark.cache.v1", JSON.stringify({ pages }));
  }

  private prefetchAround(id: string) {
    const list = this.visibleChannels().filter((channel) => channel.kind === "text" || channel.kind === "thread" || channel.kind === "forum");
    const index = list.findIndex((channel) => channel.id === id);
    const neighbors = [list[index - 1], list[index + 1]].filter(Boolean);
    const load = () => {
      for (const channel of neighbors) {
        if (this.pages[channel.id] || Object.keys(this.pages).length > 8) continue;
        if (this.demo) {
          if (channel.id === ARCHIVE) continue;
          const page = pageMessages(history[channel.id] ?? [], undefined, 20);
          this.pages[channel.id] = page.messages;
          this.more[channel.id] = page.hasMore;
        }
      }
      const keys = Object.keys(this.pages);
      if (keys.length > 8) {
        for (const key of keys) {
          if (key !== this.channelId && key !== this.splitId && !this.recent.includes(key)) delete this.pages[key];
        }
      }
      this.rememberCache();
    };
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 40));
    idle(load);
  }

  private joinVoice(channel: Channel) {
    const self: VoiceMember = { id: this.meId(), name: this.demo ? "Ethan Park" : this.me.name, speaking: false, volume: 100 };
    const others: VoiceMember[] = this.demo
      ? booth.map((person) => ({ ...person, volume: this.volumes(person.id) }))
      : [];
    this.voice = {
      channelId: channel.id,
      guildId: this.guildId,
      name: channel.name,
      status: "connecting",
      muted: false,
      deafened: false,
      members: [self, ...others],
    };
    this.paintVoice();
    window.setTimeout(() => {
      if (!this.voice || this.voice.channelId !== channel.id) return;
      this.voice.status = "connected";
      this.refreshSpeaking();
      this.paintVoice();
    }, 180);
    if (!this.demo) {
      void invoke("join_voice", { guildId: this.guildId, channelId: channel.id, mute: false, deaf: false }).catch((err) => {
        this.toast("Voice", err instanceof Error ? err.message : "Couldn't join.");
      });
    }
  }

  private volumes(id: string): number {
    return this.voice?.members.find((member) => member.id === id)?.volume ?? 100;
  }

  private leaveVoice() {
    this.voice = null;
    this.shareOn = false;
    this.pttHeld = false;
    if (!this.demo) void invoke("leave_voice").catch(() => undefined);
    this.paintVoice();
  }

  private toggleMute() {
    if (!this.voice) return;
    this.voice.muted = !this.voice.muted;
    if (this.voice.muted) this.voice.deafened = false;
    this.refreshSpeaking();
    this.pushVoiceState();
    this.paintVoice();
  }

  private toggleDeafen() {
    if (!this.voice) return;
    this.voice.deafened = !this.voice.deafened;
    if (this.voice.deafened) this.voice.muted = true;
    this.refreshSpeaking();
    this.pushVoiceState();
    this.paintVoice();
  }

  private pushVoiceState() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_self", { mute: this.voice.muted, deaf: this.voice.deafened }).catch(() => undefined);
  }

  private refreshSpeaking() {
    if (!this.voice) return;
    const self = this.voice.members[0];
    if (!self) return;
    const vad = this.config.voice.mode === "vad" && this.config.voice.sensitivity > 5;
    self.speaking = !this.voice.muted && (this.config.voice.mode === "ptt" ? this.pttHeld : vad);
  }

  private toggleSplit() {
    if (this.splitId) {
      this.splitId = null;
    } else {
      const next = this.visibleChannels().find((channel) => channel.kind !== "voice" && channel.kind !== "category" && channel.id !== this.channelId);
      this.splitId = next?.id ?? null;
      if (this.splitId && !this.pages[this.splitId]) void this.preload(this.splitId);
    }
    this.paint();
  }

  private async preload(id: string) {
    if (this.pages[id] || id === ARCHIVE) return;
    if (this.demo) {
      const page = pageMessages(history[id] ?? [], undefined, 20);
      this.pages[id] = page.messages;
      this.paintSplit();
      return;
    }
    const page = await this.livePage(id);
    this.pages[id] = page.messages;
    this.paintSplit();
  }

  private runCommand(id: string) {
    if (id === "settings") this.openSettings();
    else if (id === "search") {
      this.searchOpen = true;
      this.paintSearch();
    } else if (id === "split") this.toggleSplit();
    else if (id === "theme") {
      this.themeOpen = true;
      this.paintTheme();
    } else if (id === "themes") {
      this.section = "appearance";
      this.openSettings();
    } else if (id === "mute") this.toggleMute();
    else if (id === "deafen") this.toggleDeafen();
    else if (id === "leave-voice") this.leaveVoice();
    else if (id === "members") {
      this.config.appearance.show_member_list = !this.config.appearance.show_member_list;
      this.persist();
      this.paint();
    } else if (id === "irc") {
      this.config.appearance.density = this.config.appearance.density === "irc" ? "cozy" : "irc";
      this.persist();
      this.msgSig = "";
      this.paint();
    } else if (id === "pins") {
      this.pinsOpen = true;
      this.paintPins();
    } else if (id === "status") {
      this.statusOpen = true;
      this.popout = this.demo ? people[0] : this.me;
      this.paintPopout();
    }
  }

  private paintVoice() {
    const dock = this.voiceDock;
    if (!dock) return;
    dock.hidden = !this.voice;
    clear(dock);
    if (!this.voice) return;
    const head = el("div", "voice-head");
    head.append(el("strong", "", this.voice.name), el("span", "faint", this.voice.status));
    const leave = el("button", "ghost", "Leave");
    leave.type = "button";
    leave.addEventListener("click", () => this.leaveVoice());
    head.append(leave);
    dock.append(head);
    const controls = el("div", "voice-controls");
    controls.append(this.voiceButton(this.voice.muted ? "Unmute" : "Mute", () => this.toggleMute()));
    controls.append(this.voiceButton(this.voice.deafened ? "Undeafen" : "Deafen", () => this.toggleDeafen()));
    controls.append(this.voiceButton(this.config.voice.mode === "ptt" ? "Push to talk" : "Voice activity", () => {
      this.config.voice.mode = this.config.voice.mode === "ptt" ? "vad" : "ptt";
      this.persist();
      this.refreshSpeaking();
      this.paintVoice();
    }));
    dock.append(controls);
    const sense = el("label", "voice-sense");
    sense.append(el("span", "", "Sensitivity"));
    const range = el("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = String(this.config.voice.sensitivity);
    range.addEventListener("input", () => {
      this.config.voice.sensitivity = Number(range.value);
      this.persist();
      this.refreshSpeaking();
    });
    sense.append(range);
    dock.append(sense);
    const devices = el("div", "voice-devices");
    devices.append(this.deviceSelect("Microphone", ["Default microphone", "Studio USB", "Built-in"], this.config.voice.input_device, (value) => {
      this.config.voice.input_device = value;
      this.persist();
    }));
    devices.append(this.deviceSelect("Speakers", ["Default speakers", "Headphones"], this.config.voice.output_device, (value) => {
      this.config.voice.output_device = value;
      this.persist();
    }));
    dock.append(devices);
    const peopleEl = el("div", "voice-people");
    for (const member of this.voice.members) {
      const row = el("div", `voice-person${member.speaking ? " is-speaking" : ""}`);
      row.append(el("span", "speaking-dot", member.speaking ? "Speaking" : "Quiet"), el("strong", "", member.name));
      if (member.id !== this.meId()) {
        const vol = el("input");
        vol.type = "range";
        vol.min = "0";
        vol.max = "200";
        vol.value = String(member.volume);
        vol.setAttribute("aria-label", `Volume for ${member.name}`);
        vol.addEventListener("input", () => {
          member.volume = Number(vol.value);
        });
        row.append(vol);
      }
      peopleEl.append(row);
    }
    dock.append(peopleEl);
    const share = el("div", "share-row");
    const toggle = el("button", this.shareOn ? "text-button is-on" : "text-button", this.shareOn ? "Stop sharing" : "Share screen");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Share screen");
    toggle.addEventListener("click", () => {
      this.shareOn = !this.shareOn;
      this.shareMotion = false;
      if (!this.demo) void invoke(this.shareOn ? "start_screen_share" : "stop_screen_share").catch(() => undefined);
      this.paintVoice();
    });
    share.append(toggle);
    if (this.shareOn) {
      const motion = el("button", "ghost", this.shareMotion ? "Screen is changing" : "Screen is still");
      motion.type = "button";
      motion.addEventListener("click", () => {
        this.shareMotion = !this.shareMotion;
        this.paintVoice();
      });
      const plan = planShare(this.shareMotion ? 0.22 : 0, this.shareMotion ? 4 : 0);
      const stats = el("p", "share-stats", plan.send
        ? `${plan.fps} fps · ${formatBitrate(plan.bitrate)} · ${Math.round(plan.dirtyRatio * 100)}% changed · ${encoderName(this.platform.os)}`
        : `Idle · 0 packets · ${captureBackend(this.platform.os)}`);
      share.append(motion, stats);
    }
    dock.append(share, el("p", "hint", this.config.voice.noise_suppression ? "Noise gate on. Echo cancellation is not running." : "Noise gate off."));
  }

  private voiceButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "text-button", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  private deviceSelect(label: string, options: string[], current: string, onChange: (value: string) => void): HTMLElement {
    const wrap = el("label", "device");
    wrap.append(el("span", "", label));
    const select = el("select");
    for (const option of options) {
      const node = el("option", "", option);
      node.value = option;
      if (option === current) node.selected = true;
      select.append(node);
    }
    select.addEventListener("change", () => onChange(select.value));
    wrap.append(select);
    return wrap;
  }

  private paintSplit() {
    clear(this.splitPane);
    if (!this.splitId || this.narrow) return;
    const channel = this.channelById(this.splitId);
    const head = el("header", "chat-head");
    head.append(el("h2", "", channel ? `# ${channel.name}` : "Split"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.splitId = null;
      this.paint();
    });
    head.append(close);
    const body = el("div", "messages");
    const list = this.pages[this.splitId] ?? [];
    if (!list.length) body.append(el("div", "empty", "Nothing loaded in this pane yet."));
    else {
      const ctx = this.renderContext();
      const plugins = this.enabledPlugins();
      const hidden = hiddenIds(this.pack.hiddenAuthors);
      const settings = this.pluginSettings(this.splitId);
      for (const message of list.slice(-30)) {
        const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
          settings,
          hiddenAuthors: hidden,
          displayContent: this.translated[message.id],
        });
        if (!view) continue;
        body.append(renderMessage(view, {
          density: this.config.appearance.density,
          grouped: false,
          showDay: false,
          divider: false,
          remoteEmoji: !this.demo,
          mine: false,
          onReply: () => undefined,
          onEdit: () => undefined,
          onDelete: () => undefined,
          onReact: () => undefined,
          onImage: (url) => {
            this.lightbox = url;
            this.paintLightbox();
          },
          ...this.messageChrome(message, view),
        }));
      }
    }
    this.splitPane.append(head, body);
  }

  private channelById(id: string): Channel | undefined {
    const dm = this.dms().find((channel) => channel.id === id);
    if (dm) return dm;
    for (const guild of this.guilds()) {
      const found = this.channelsOf(guild.id).find((channel) => channel.id === id);
      if (found) return found;
    }
    return undefined;
  }

  private paintSearch() {
    let overlay = document.getElementById("lark-search");
    if (!this.searchOpen) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = el("div", "overlay");
      overlay.id = "lark-search";
      this.root.append(overlay);
    }
    clear(overlay);
    const card = el("div", "switcher-card");
    const input = el("input");
    input.placeholder = "Search this server";
    input.setAttribute("aria-label", "Search messages");
    const results = el("div", "switcher-results");
    const render = () => {
      clear(results);
      const query = input.value.trim().toLowerCase();
      const pools = this.demo ? Object.values(history).flat() : Object.values(this.pages).flat();
      const hits = pools.filter((message) => query && message.content.toLowerCase().includes(query)).slice(0, 20);
      if (!query) results.append(el("div", "empty", "Type to search loaded messages. A live server uses Discord search, one query at a time."));
      else if (!hits.length) results.append(el("div", "empty", "No matches in what's loaded."));
      for (const hit of hits) {
        const button = el("button", "switcher-hit");
        button.type = "button";
        button.append(el("strong", "", hit.authorName), el("span", "faint", hit.content.slice(0, 120)));
        button.addEventListener("click", () => {
          this.searchOpen = false;
          this.paintSearch();
          void this.openChannel(hit.channelId);
        });
        results.append(button);
      }
    };
    input.addEventListener("input", render);
    card.append(input, results);
    overlay.append(card);
    overlay.onclick = (event) => {
      if (event.target === overlay) {
        this.searchOpen = false;
        this.paintSearch();
      }
    };
    render();
    input.focus();
  }

  private paintPins() {
    let panel = document.getElementById("lark-pins");
    if (!this.pinsOpen || !this.channelId) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-pins";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Pins"));
    const ids = this.demo ? demoPins[this.channelId] ?? [] : [];
    const list = (this.pages[this.channelId] ?? history[this.channelId] ?? []).filter((message) => ids.includes(message.id));
    if (!list.length) panel.append(el("p", "empty", "Nothing pinned in this channel."));
    for (const message of list) panel.append(el("p", "", `${message.authorName}: ${message.content.slice(0, 140)}`));
    if (!this.demo && this.channelId) {
      void invoke<RawMessage[]>("fetch_pins", { channelId: this.channelId }).then((messages) => {
        if (!panel) return;
        for (const message of messages) panel.append(el("p", "", message.content.slice(0, 140)));
      }).catch(() => undefined);
    }
  }

  private paintTheme() {
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
  }

  private paintPopout() {
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
    const person = this.popout;
    const details = this.wireProfile?.id === person.id ? this.wireProfile : null;
    const mutualNames = (details?.mutualGuilds ?? [])
      .map((guild) => this.guilds().find((item) => item.id === guild.id)?.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8);
    renderProfileCard(pop, {
      person,
      self: person.id === this.meId(),
      statusPicker: this.statusOpen && person.id === this.meId(),
      roles: this.profileRoles(person),
      details: details ? {
        id: details.id,
        name: details.name,
        username: details.username,
        avatarUrl: details.avatarUrl,
        bannerUrl: details.bannerUrl,
        accent: details.accent,
        bio: details.bio ?? "",
        pronouns: details.pronouns ?? "",
        nick: details.nick,
        mutualNames,
        mutualGuilds: details.mutualGuilds?.length ?? 0,
        mutualFriends: details.mutualFriends ?? 0,
        joinedAt: details.joinedAt,
      } : null,
    }, {
      onClose: () => {
        this.popout = null;
        this.statusOpen = false;
        this.wireProfile = null;
        this.paintPopout();
      },
      onMessage: person.id === this.meId() ? undefined : () => {
        this.popout = null;
        this.paintPopout();
        void this.openDm(person.id);
      },
      onStatus: (status, custom) => this.setStatus(status, custom),
    });
  }

  private enabledPlugins(): PluginSource[] {
    return enabledSources(this.config.plugins.enabled, this.loaded);
  }

  private hookOn(flag: keyof PluginHooks): boolean {
    return this.enabledPlugins().some((plugin) => plugin.hooks[flag] === true);
  }

  private quickReactionEmoji(): string[] {
    for (const plugin of this.enabledPlugins()) {
      if (plugin.hooks.quickReactions.length) return plugin.hooks.quickReactions;
    }
    return [];
  }

  private pluginSettings(channelId: string): Record<string, Record<string, string>> {
    const settings: Record<string, Record<string, string>> = {};
    for (const plugin of this.enabledPlugins()) {
      const record = settingsFor(this.pack, plugin.id, channelId);
      if (Object.keys(record).length) settings[plugin.id] = record;
    }
    return settings;
  }

  private messageChrome(message: RawMessage, view: ViewMessage) {
    return {
      now: this.clock,
      quickReactions: this.quickReactionEmoji(),
      bookmarked: isBookmarked(this.pack.bookmarks, message.channelId, message.id),
      translated: Boolean(this.translated[message.id]),
      onBookmark: view.effects.includes("bookmark") ? () => this.onBookmark(message) : undefined,
      onTranslate: view.effects.includes("translate") ? () => void this.onTranslate(message) : undefined,
      onHideAuthor: this.hookOn("hideUsers") ? () => this.onHideAuthor(message) : undefined,
    };
  }

  private savePack() {
    localStorage.setItem("lark.pack.v1", JSON.stringify(this.pack));
  }

  private async setPluginEnabled(id: string, enabled: boolean) {
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
    this.paint();
  }

  private appendPluginPanel(wrap: HTMLElement, id: string) {
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
          const words = this.pack.keywordChannels[this.channelId!]?.words ?? [];
          this.pack.keywordChannels[this.channelId!] = { words, level: next };
          this.persist();
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
    }
  }

  private paintScheduleBanner() {
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
        localStorage.setItem("lark.drafts.v1", JSON.stringify(this.drafts));
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
    this.composerBanner.append(el("span", "", `Sends ${when} · ${next.content.slice(0, 80)}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.setAttribute("aria-label", "Cancel scheduled message");
    cancel.addEventListener("click", () => {
      this.pack.schedule = cancelSend(this.pack.schedule, next.id);
      this.savePack();
      this.paintComposer();
    });
    this.composerBanner.append(cancel);
  }

  private paintBookmarks() {
    let overlay = document.getElementById("lark-bookmarks");
    if (!this.bookmarksOpen || !this.hookOn("bookmarks")) {
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
    head.append(el("strong", "", "Bookmarks"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.bookmarksOpen = false;
      this.paintBookmarks();
    });
    head.append(close);
    const list = el("div", "bookmark-list");
    if (!this.pack.bookmarks.length) list.append(el("p", "hint", "Save a message and it stays on this device."));
    for (const bookmark of this.pack.bookmarks) {
      const row = el("button", "bookmark-row");
      row.type = "button";
      row.append(el("strong", "", bookmark.authorName), el("span", "", bookmark.excerpt || "Empty message"));
      row.addEventListener("click", () => {
        this.bookmarksOpen = false;
        this.paintBookmarks();
        void this.openChannel(bookmark.channelId);
      });
      list.append(row);
    }
    card.append(head, list);
    overlay.append(card);
  }

  private onBookmark(message: RawMessage) {
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
  }

  private async onTranslate(message: RawMessage) {
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
  }

  private onHideAuthor(message: RawMessage) {
    this.pack.hiddenAuthors = toggleHidden(this.pack.hiddenAuthors, { id: message.authorId, name: message.authorName });
    this.savePack();
    this.msgSig = "";
    this.paintMessages();
    const hidden = this.pack.hiddenAuthors.some((author) => author.id === message.authorId);
    this.toast(hidden ? "Hidden" : "Visible", hidden ? `${message.authorName} is hidden on this device.` : `${message.authorName} is visible again.`);
  }

  private considerKeyword(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, alreadyNotified: boolean) {
    if (!this.hookOn("keywords")) return;
    const words = wordsFor(this.pack.keywordGlobal, this.pack.keywordChannels, message.channelId);
    const hit = firstHit(message.content, words);
    if (!shouldKeywordNotify({
      level,
      mentionsMe,
      fromMe: message.authorId === this.meId(),
      windowFocused: this.focused,
      sameChannel: message.channelId === this.channelId,
      hit: Boolean(hit),
      alreadyNotified,
    })) return;
    const gate = allowKeywordNotify(`${message.channelId}:${hit}`, Date.now(), this.keywordLast);
    this.keywordLast = gate.last;
    if (!gate.ok || !hit) return;
    void this.notify(message.authorName, message.content || hit);
  }

  private tickClock() {
    if (!this.hookOn("relativeTime") || this.view !== "app") return;
    this.clock = Date.now();
    this.msgSig = "";
    this.paintMessages();
  }

  private tickPlugins() {
    if (this.view !== "app") return;
    this.tickAway();
    this.tickPlaying();
    void this.tickSchedule();
  }

  private tickAway() {
    if (!this.hookOn("autoAway")) return;
    const step = stepAway(this.away, Date.now(), this.pack.awayMinutes * 60_000);
    this.away = step.state;
    if (!step.write || step.write === this.me.status) return;
    this.setStatus(step.write, this.me.custom ?? "", "plugin");
  }

  private tickPlaying() {
    if (!this.hookOn("nowPlaying")) return;
    const session = navigator.mediaSession?.metadata;
    if (!session?.title) return;
    this.writePlaying(playingLine(session.title, session.artist ?? ""), false);
  }

  private writePlaying(line: string, fromButton: boolean) {
    if (!line) {
      if (fromButton) this.toast("Now playing", "Add a track title first.");
      return;
    }
    if (!canReplaceCustom(this.me.custom ?? "", this.pack.playingReplace)) {
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
  }

  private async tickSchedule() {
    if (this.sendingScheduled || !this.hookOn("schedule")) return;
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
  }

  private async postPlain(channelId: string, content: string): Promise<boolean> {
    const message: RawMessage = {
      id: `local-${Date.now()}`,
      channelId,
      authorId: this.meId(),
      authorName: this.demo ? "Ethan Park" : this.me.name,
      content,
      timestamp: new Date().toISOString(),
    };
    history[channelId] = [...(history[channelId] ?? []), message];
    this.pages[channelId] = [...(this.pages[channelId] ?? []), message];
    if (!this.demo) {
      try {
        const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
          channelId,
          content,
          replyTo: null,
          files: [],
        }));
        message.id = sent.id;
      } catch {
        history[channelId] = (history[channelId] ?? []).filter((item) => item !== message);
        this.pages[channelId] = (this.pages[channelId] ?? []).filter((item) => item !== message);
        return false;
      }
    }
    if (channelId === this.channelId) {
      this.msgSig = "";
      this.scroll = "bottom";
      this.pinnedToBottom = true;
      this.paintMessages();
    }
    return true;
  }

  private setStatus(status: NonNullable<Person["status"]>, custom: string, source: "user" | "plugin" = "user") {
    const changed = this.me.status !== status || (this.me.custom ?? "") !== custom;
    this.me = { ...this.me, status, custom };
    if (source === "user" && (status === "online" || status === "idle" || status === "dnd" || status === "invisible")) {
      this.away = { ...this.away, savedStatus: status, away: status === "idle" };
    }
    if (this.demo) {
      people[0].status = status;
      people[0].custom = custom;
    } else if (changed) {
      void invoke("set_presence", { status: status === "invisible" ? "invisible" : status, custom }).catch(() => undefined);
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
  }

  private syncBadge() {
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
    const count = dockBadge(entries);
    if (count === this.badgeSent) return;
    this.badgeSent = count;
    if (isTauri()) void invoke("set_unread", { count }).catch(() => undefined);
  }

  private refreshChannelBadge(channelId: string) {
    const channel = this.channelById(channelId);
    const flags = channelFlags({
      lastMessageId: channel?.lastMessageId,
      marker: this.markers[channelId],
      localUnread: this.localUnread[channelId] ?? 0,
      localMentions: this.localMentions[channelId] ?? 0,
      viewing: channelId === this.channelId,
    });
    if (flags.unread) this.unread[channelId] = flags.unread;
    else delete this.unread[channelId];
    if (flags.mentions) this.mentions[channelId] = flags.mentions;
    else delete this.mentions[channelId];
  }

  private toggleCategory(channelId: string) {
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
  }

  private applyNotify(entries: {
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
        for (const [id, pref] of Object.entries(channels)) this.discordNotify.dms[id] = pref;
        continue;
      }
      const level = entry.level === "all" || entry.level === "mentions" || entry.level === "mute" ? entry.level : null;
      this.discordNotify.guilds[entry.guildId] = {
        muted: Boolean(entry.muted),
        level,
        suppressEveryone: Boolean(entry.suppressEveryone),
        suppressRoles: Boolean(entry.suppressRoles),
        channels,
      };
    }
  }

  private markReadFromEscape() {
    const current = this.channelId;
    const pending = (id: string) => (this.unread[id] ?? 0) + (this.mentions[id] ?? 0);
    if (current && pending(current) > 0) {
      this.markRead([current]);
      return;
    }
    const ids = this.visibleChannels().filter((channel) => channel.kind !== "category" && pending(channel.id) > 0).map((channel) => channel.id);
    if (ids.length) this.markRead(ids);
  }

  private markRead(ids: string[]) {
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
  }

  private openInvite(code: string) {
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
  }

  private paintInvite() {
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
  }

  private async listDevices() {
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
  }

  private guildForChannel(channelId: string): string | null {
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      if (list.some((channel) => channel.id === channelId)) return guildId;
    }
    return null;
  }
}

function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function statusLabel(status: Person["status"]): string {
  if (status === "dnd") return "Do not disturb";
  if (status === "idle") return "Idle";
  if (status === "online") return "Online";
  if (status === "invisible") return "Invisible";
  return "Offline";
}

function localInputValue(time: number): string {
  const date = new Date(time);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readStringMap(key: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readJson(key: string): Record<string, never> & { pages?: Record<string, RawMessage[]> } {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rgbToHex(value: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) return "";
  const hex = (part: string) => Number(part).toString(16).padStart(2, "0");
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

function normalizeMessage(message: RawMessage): RawMessage {
  const kind = message.kind === "reply" || message.kind === "join" || message.kind === "system" ? message.kind : "default";
  return {
    ...message,
    kind,
    attachments: message.attachments ?? [],
    embeds: message.embeds ?? [],
    reactions: message.reactions ?? [],
    mentionIds: message.mentionIds ?? [],
  };
}

const CHANNEL_KINDS = new Set<Channel["kind"]>(["text", "voice", "category", "forum", "dm", "group", "announcement", "thread"]);

function normalizeChannel(channel: Channel): Channel {
  return {
    ...channel,
    kind: CHANNEL_KINDS.has(channel.kind) ? channel.kind : "text",
    parentId: channel.parentId ?? null,
    topic: channel.topic ?? null,
    recipientIds: channel.recipientIds ?? [],
    recipients: channel.recipients ?? [],
    lastMessageId: channel.lastMessageId ?? null,
  };
}

function asStatus(status: string): Person["status"] {
  if (status === "online" || status === "idle" || status === "dnd") return status;
  return "offline";
}
