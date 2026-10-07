import { channelIsBehind, firstUnreadId, sameReaction, shouldGroup, typingLine } from "../chat";
import { outgoingError } from "../compose";
import { defaultConfig, sanitizeConfig } from "../config";
import { ARCHIVE, CRIT, booth, history, ME, NORTHWIND, channels as demoChannels, dms as demoDms, guilds as demoGuilds, pageMessages, people, pins as demoPins } from "../demo/data";
import { rememberEmoji, frecency, EMOJI, type EmojiUse } from "../emoji";
import { applyMention, mentionHits, mentionQuery, plainPreview, type MentionHit } from "../mentions";
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
import { emojiCdnUrl } from "../render/content";
import { buildViewMessage, type ViewMessage } from "../render/message";
import { fpsFromMarks, FrameClock, noteFpsMark } from "../frame";
import {
  cleanGameName,
  pollInterval,
  profileFromBase,
  resolveGame,
  shouldPreload,
  type GameBase,
} from "../game";
import { emptyPerfSample, fpsWatch, type PerfSample } from "../perf";
import { CHANNEL_GATEWAY_GRACE_MS, channelRestDelay } from "../guilds";
import { prefetchChannelIds } from "../cache";
import {
  CACHE_WARM_MS,
  PLACE_KEY,
  SLOW_CONNECT_MS,
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
  HARDWARE_STORAGE_KEY,
  clampStatus,
  hardwareSampleDue,
  loadHardwareState,
  noteHardwareEdit,
  serializeHardwareState,
  setHardwareEnabled,
  stepHardware,
  type HardwareState,
} from "../hardware";
import { bytesFromBase64, clipBehaviorNote } from "../clip";
import { captureBackend, encoderName, formatBitrate, planShare } from "../share";
import { fuzzyScore } from "../search";
import { formatShortcut, matchShortcut, shortcutConflicts, shortcutFromEvent } from "../shortcuts";
import type { AppConfig, Channel, GameProfile, Guild, NotifyLevel, Person, RawMessage, Shortcuts } from "../types";
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
  MEMBER_ROW,
  memberSubtitle,
  rangesForScroll,
  roleColor,
  sortDms,
  sortPeople,
  visibleRows,
  type PaintedRow,
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
  shouldLoadOlder,
} from "../scroll";
import { commandError, gateQr, QR_CAPTION } from "../signin";
import { applyVoiceState, participantsIn, replaceGuildVoice, setSpeaking, setVolume, type VoiceParticipant, type VoiceRoster, type VoiceStateInput } from "../voice";
import { voiceHudFrame, type VoiceHudView } from "../voice-hud";
import { rowEstimate, sliceWindow, spanWindow, VIRTUAL_MIN, type SpanWindow } from "../virtual";
import { clear, colorFor, el, icon, portrait, paths } from "./dom";
import { renderVoiceHud } from "./hud";
import { renderMessage } from "./messages";
import { renderProfileCard, type ProfileRole, type WireProfile } from "./profile";
import { patchSignIn, renderSignIn } from "./signin";

interface VoiceMember {
  id: string;
  name: string;
  speaking: boolean;
  volume: number;
  avatarUrl?: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
  serverMute?: boolean;
  serverDeaf?: boolean;
}

interface VoiceSession {
  channelId: string;
  guildId: string | null;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
  detail?: string;
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
  private hardware: HardwareState = { enabled: false, takeover: false, paused: false, owned: "", savedCustom: "" };
  private hardwareSampleAt = 0;
  private hardwareBusy = false;
  private hardwareChecking = false;
  private hardwareLine: string | null = null;
  private hardwarePushFailed = false;
  private hardwarePushAt = 0;
  private detectedGame: string | null = null;
  private gameMode = false;
  private perfSample: PerfSample = emptyPerfSample();
  private fpsMarks: number[] = [];
  private fpsLoop = false;
  private pollTimers: number[] = [];
  private detectBusy = false;
  private appliedVoiceKey = "";
  private perfToggleAt = 0;
  private gameToggleAt = 0;
  private rebindingGame: string | null = null;
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
  private messageHeights = new Map<string, number>();
  private msgStart = 0;
  private msgEnd = 0;
  private messageFrame = 0;
  private channelShape = "";
  private railShape = "";
  private railBadges = "";
  private memberShape = "";
  private memberPaint: PaintedRow[] | null = null;
  private memberFrame = 0;
  private prefetchToken = 0;
  private pageLoads = new Map<string, Promise<{ messages: RawMessage[]; hasMore: boolean }>>();
  private warm = new Set<string>();
  private hudQueued = false;
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
  private channelLoads = new Map<string, Promise<void>>();
  private channelWaiters = new Map<string, Array<() => void>>();
  private gatewayReadyAt = 0;
  private savedPlace: SavedPlace = { guildId: null, channelId: null };
  private splashEl!: HTMLElement;
  private splashStatus!: HTMLElement;
  private splashTrack!: HTMLElement;
  private splashBar!: HTMLElement;
  private holdShell = false;
  private shellShown = false;
  private splashLeaving = false;
  private startupCold = true;
  private resumeOverlay = false;
  private startupMilestone: StartupMilestone = "connect";
  private startupStepAt = 0;
  private splashShownAt = 0;
  private gatewayDownAt = 0;
  private landingWarmStarted = false;
  private channelCheckQueued = false;
  private splashFrame = 0;
  private slowSplashTimer = 0;
  private channelGraceTimer = 0;
  private splashFinishTimer = 0;
  private splashHideTimer = 0;
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
  private lastRead: Record<string, string> = {};
  private channelLast: Record<string, string> = {};
  private behind: Record<string, boolean> = {};
  private freshCount = 0;
  private nearBottom = true;
  private jumpId: string | null = null;
  private suggest: MentionHit[] = [];
  private suggestIndex = 0;
  private suggestStart = 0;
  private suggestKey = "";
  private guildEmojis: Record<string, { id: string; name: string; animated: boolean }[]> = {};
  private emojiQuery = "";
  private pinCache: Record<string, RawMessage[]> = {};
  private searchToken = 0;
  private newBar!: HTMLButtonElement;
  private suggestEl!: HTMLElement;
  private shell!: HTMLElement;
  private rail!: HTMLElement;
  private channelPane!: HTMLElement;
  private chatHead!: HTMLElement;
  private messagesEl!: HTMLElement;
  private typingEl!: HTMLElement;
  private membersEl!: HTMLElement;
  private composer!: HTMLTextAreaElement;
  private composerBanner!: HTMLElement;
  private clipBanner!: HTMLElement;
  private composerMeta!: HTMLElement;
  private gate!: HTMLElement;
  private switcherEl!: HTMLElement;
  private settingsEl!: HTMLElement;
  private lightboxEl!: HTMLElement;
  private toastWrap!: HTMLElement;
  private stage!: HTMLElement;
  private splitPane!: HTMLElement;
  private voiceDock!: HTMLElement;
  private hudEl!: HTMLElement;
  private hudSig = "";
  private hudTicket = 0;
  private hudToggleAt = 0;
  private countEl: HTMLElement | null = null;
  private splitId: string | null = null;
  private voice: VoiceSession | null = null;
  private voiceRoster: VoiceRoster = {};
  private voiceEpoch = 0;
  private cpalInputs: string[] = [];
  private cpalOutputs: string[] = [];
  private shareOn = false;
  private shareMotion = false;
  private pendingClip: { name: string; path: string; bytes: number; spanMs: number } | null = null;
  private clipNotice = "";
  private clipStatus: { recording: boolean; spanMs: number; dir: string; backend: string; error: string; hotkeyError: string } | null = null;
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
    this.hardware = loadHardwareState(this.config.desktop.hardware_status, localStorage.getItem(HARDWARE_STORAGE_KEY));
    this.gameMode = this.config.desktop.game_mode;
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
    try {
      this.savedPlace = parsePlace(JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null"));
    } catch {
      this.savedPlace = { guildId: null, channelId: null };
    }
    this.build();
    await this.loadPlugins();
    await this.applyTheme();
    this.syncGameEffects();
    this.frames.setCap(this.config.desktop.frame_cap);
    const params = new URLSearchParams(location.search);
    if (!isTauri() && params.has("notice")) {
      this.tokenNote = "Discord rejected the token (HTTP 401). Lark sent it only to discord.com. It may be expired, revoked, or still wrapped in quotes.";
    }
    if (!isTauri() && params.has("splash")) this.showPreviewSplash();
    else if (params.has("demo")) this.enterDemo();
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
      await listen("voice-overlay-dismissed", () => this.setVoiceOverlay(false, true));
      await listen<{ ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }>("clip-ready", (event) => {
        this.onClipReady(event.payload);
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
      });
      if (await invoke<boolean>("has_token")) {
        this.connection = "Connecting";
        this.beginStartup(true);
        await invoke("connect");
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
  }

  private async reloadConfig() {
    this.config = sanitizeConfig(await invoke("get_config"));
    this.syncGameEffects();
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
    this.voiceDock = el("section", "voice-dock");
    this.voiceDock.hidden = true;
    this.newBar = el("button", "new-bar", "New messages");
    this.newBar.type = "button";
    this.newBar.hidden = true;
    this.newBar.addEventListener("click", () => this.jumpToBottom());
    chat.append(this.chatHead, this.messagesEl, this.typingEl, this.voiceDock, composerWrap, this.newBar);
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
    this.hudEl = el("div", "voice-hud-host");
    this.hudEl.hidden = true;
    this.toastWrap = el("div", "toast-wrap");
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
    this.root.append(this.gate, this.shell, this.switcherEl, this.settingsEl, this.lightboxEl, this.inviteEl, this.hudEl, this.toastWrap, this.splashEl);
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
      this.composer.style.height = "auto";
      this.composer.style.height = `${Math.min(this.composer.scrollHeight, 160)}px`;
      if (this.countEl) this.countEl.textContent = `${[...this.composer.value].length} / 2000`;
      const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
      if (perf) perf.lastInput = performance.now();
      this.saveDraft();
      this.refreshSuggest();
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
    this.bindPolls();
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
      });
    }, { passive: true });
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
    this.seedDemoVoice();
    const named = cleanGameName(new URLSearchParams(location.search).get("game") ?? "");
    if (named && this.config.desktop.detect_games) this.noteGame(named);
    this.paint();
    void this.openChannel(CRIT);
  }

  private seedDemoVoice() {
    const channelId = demoChannels[NORTHWIND].find((channel) => channel.kind === "voice")?.id;
    if (!channelId) return;
    replaceGuildVoice(this.voiceRoster, NORTHWIND, [
      { guildId: NORTHWIND, channelId, userId: booth[0].id, name: booth[0].name },
      { guildId: NORTHWIND, channelId, userId: booth[1].id, name: booth[1].name, selfMute: true },
    ]);
    setSpeaking(this.voiceRoster, booth[0].id, true);
  }

  /** Cold connect (no shell yet) covers the window immediately. A live shell waits out a short reconnect. */
  private beginStartup(cold: boolean) {
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
  }

  /** Browser preview of the cold-start splash, then the sample shell. */
  private showPreviewSplash() {
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
        const page = pageMessages(history[CRIT] ?? [], undefined, 20);
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
  }

  private noteGatewayLiveness(state: string | undefined) {
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
  }

  private onStartupReady() {
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
  }

  private landingPlace(): SavedPlace {
    if (this.shellShown && this.channelId) return { guildId: this.guildId, channelId: this.channelId };
    return this.savedPlace;
  }

  private queueChannelCheck() {
    if (!this.holdShell || this.landingWarmStarted || this.channelCheckQueued) return;
    this.channelCheckQueued = true;
    // Let the rest of this gateway burst (channel lists, access) land before choosing a channel.
    window.setTimeout(() => {
      this.channelCheckQueued = false;
      this.considerChannels();
    }, 32);
  }

  private considerChannels() {
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
  }

  private visibleChannelMap(): Record<string, { id: string; kind: string }[]> {
    const out: Record<string, { id: string; kind: string }[]> = {};
    for (const [guildId, list] of Object.entries(this.liveChannels)) {
      out[guildId] = list
        .filter((channel) => this.canSeeChannel(guildId, channel))
        .map((channel) => ({ id: channel.id, kind: channel.kind }));
    }
    return out;
  }

  private async warmLanding(channelId: string | null) {
    if (channelId && !(this.pages[channelId]?.length)) {
      try {
        const page = await Promise.race([
          this.livePage(channelId).catch(() => null),
          delay(CACHE_WARM_MS).then(() => null),
        ]);
        if (this.holdShell && page && !this.pages[channelId]?.length) {
          this.pages[channelId] = page.messages;
          this.more[channelId] = page.hasMore;
          for (const message of page.messages) this.absorbMessage(message);
        }
      } catch {
        /* The channel column reports a failed load after the splash. */
      }
    }
    if (!this.holdShell) return;
    this.startupMilestone = "cache";
    this.startupStepAt = performance.now();
    this.finishStartup();
  }

  private finishStartup() {
    if (!this.holdShell) return;
    const wait = splashReleaseDelay(performance.now() - this.splashShownAt);
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
    if (!overlay) {
      this.view = "app";
      const id = this.channelId;
      if (id) void this.openChannel(id);
      else this.paint();
    } else this.paintConnection();
    this.syncSplash();
    window.clearTimeout(this.splashHideTimer);
    this.splashHideTimer = window.setTimeout(() => this.hideSplash(), 280);
  }

  private hideSplash() {
    this.splashHideTimer = 0;
    this.splashLeaving = false;
    if (!this.splashEl) return;
    this.splashEl.hidden = true;
    this.splashEl.classList.remove("is-leaving");
  }

  private abortStartup() {
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
  }

  private clearSlowSplash() {
    if (!this.slowSplashTimer) return;
    window.clearTimeout(this.slowSplashTimer);
    this.slowSplashTimer = 0;
  }

  private clearStartupTimers() {
    this.clearSlowSplash();
    if (this.channelGraceTimer) window.clearTimeout(this.channelGraceTimer);
    if (this.splashFinishTimer) window.clearTimeout(this.splashFinishTimer);
    if (this.splashHideTimer) window.clearTimeout(this.splashHideTimer);
    this.channelGraceTimer = 0;
    this.splashFinishTimer = 0;
    this.splashHideTimer = 0;
  }

  private syncSplash() {
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
  }

  private rememberPlace(channelId: string) {
    this.savedPlace = { guildId: this.guildId, channelId };
    localStorage.setItem(PLACE_KEY, JSON.stringify(this.savedPlace));
  }

  private paint() {
    if (this.holdShell) {
      this.gate.hidden = true;
      this.shell.hidden = !this.shellShown;
      this.syncSplash();
      return;
    }
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
    this.publishVoiceHud();
    if (!this.splashLeaving) this.splashEl.hidden = true;
  }

  private applyAppearance() {
    const appearance = this.config.appearance;
    document.documentElement.classList.toggle("is-game-mode", this.gameMode);
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
    if (this.holdShell || this.splashLeaving) return;
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

  private railShapeSig(): string {
    const guilds = this.guilds().map((guild) => `${guild.id}:${guild.name}:${guild.iconUrl ?? ""}:${this.guildMuted(guild.id) ? "m" : ""}`).join(",");
    const folders = this.folders.map((folder) => `${folder.id ?? ""}:${folder.name ?? ""}:${folder.id ? this.folderOpen[folder.id] !== false : true}:${folder.guildIds.join(".")}`).join(";");
    return `${guilds}|${folders}`;
  }

  private railBadgeStamp(): string {
    const homeMentions = this.dms().reduce((sum, dm) => sum + (this.mentions[dm.id] ?? 0), 0);
    const homeUnread = this.dms().some((dm) => (this.unread[dm.id] ?? 0) > 0 || (this.mentions[dm.id] ?? 0) > 0);
    const guilds = this.guilds().map((guild) => {
      const badge = this.guildBadge(guild.id);
      return `${guild.id}:${badge.mentions}:${badge.count}`;
    }).join(",");
    return `${this.guildId ?? ""}|${homeMentions}:${homeUnread ? 1 : 0}|${guilds}`;
  }

  private patchRail() {
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
    }
  }

  private setBadge(button: HTMLElement, mentions: number) {
    const badge = button.querySelector(":scope > .badge");
    if (mentions > 0) {
      if (badge) badge.textContent = String(mentions);
      else button.append(el("span", "badge", String(mentions)));
      return;
    }
    badge?.remove();
  }

  private paintRail() {
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
    button.dataset.folder = entry.id;
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
    button.dataset.guild = guild.id;
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
      const unread = this.unread[channel.id] ?? 0;
      const pending = unread || (this.behind[channel.id] ? 1 : 0);
      if (level === "mentions") mentions += mention;
      else {
        count += pending;
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

  private channelShapeSig(): string {
    const list = this.guildId ? this.visibleChannels() : this.dms();
    const bits = list.map((channel) => {
      const voice = this.guildId && channel.kind === "voice"
        ? participantsIn(this.voiceRoster, this.guildId, channel.id).map((person) => `${person.userId}${person.selfMute || person.serverMute ? "m" : ""}`).join(".")
        : "";
      const muted = this.levelFor(this.guildId && channel.kind !== "dm" && channel.kind !== "group" ? this.guildId : null, channel.id) === "mute" ? "m" : "";
      const collapsed = this.collapsedCats.has(channel.id) ? "c" : "";
      return `${channel.id}:${channel.name}:${channel.kind}:${channel.parentId ?? ""}:${channel.position}:${muted}:${collapsed}:${voice}`;
    });
    const me = this.demo ? people[0] : this.me;
    return `${this.guildId ?? ""}|${this.friendsOpen ? 1 : 0}|${me.id}|${me.name}|${this.voice?.channelId ?? ""}|${this.voice?.status ?? ""}|${this.voice?.muted ? 1 : 0}|${this.voice?.deafened ? 1 : 0}|${this.voice?.detail ?? ""}|${bits.join(",")}`;
  }

  private patchChannelRows() {
    const me = this.demo ? people[0] : this.me;
    const dot = this.channelPane.querySelector(".profile-chip i.status");
    if (dot) dot.className = `status ${me.status ?? "online"}`;
    const line = this.channelPane.querySelector(".profile-chip .who span");
    if (line) {
      const next = me.custom || this.connection;
      if (line.textContent !== next) line.textContent = next;
    }
    const friends = this.channelPane.querySelector<HTMLElement>("[data-friends]");
    if (friends) {
      friends.classList.toggle("is-selected", this.friendsOpen && !this.channelId);
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      this.setBadge(friends, online);
    }
    for (const node of this.channelPane.querySelectorAll<HTMLElement>("[data-channel]")) {
      const id = node.dataset.channel ?? "";
      const mentions = this.mentions[id] ?? 0;
      const unread = (this.unread[id] ?? 0) > 0 || mentions > 0;
      const quiet = !unread && Boolean(this.behind[id]);
      node.classList.toggle("is-selected", id === this.channelId && !this.friendsOpen);
      node.classList.toggle("is-unread", unread || quiet);
      this.setBadge(node, mentions);
      const userId = node.dataset.user;
      if (!userId) continue;
      const person = this.directory[userId];
      const dot = node.querySelector("i.status");
      if (dot && person) dot.className = `status ${person.status ?? "offline"}`;
    }
  }

  private paintChannels() {
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
    head.append(el("h1", "", guild ? guild.name : "Direct messages"));
    const scroll = el("div", "channel-scroll");
    if (!this.guildId) {
      const friends = el("button", `channel-row${this.friendsOpen ? " is-selected" : ""}`);
      friends.type = "button";
      friends.dataset.friends = "1";
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
      const threads = list.filter((channel) => channel.kind === "thread");
      const categories = list.filter((channel) => channel.kind === "category");
      const categoryIds = new Set(categories.map((category) => category.id));
      const loose = list.filter((channel) => channel.kind !== "category" && channel.kind !== "thread" && (!channel.parentId || !categoryIds.has(channel.parentId)));
      const appendChannel = (channel: Channel) => {
        scroll.append(this.channelBlock(channel));
        for (const thread of threads.filter((item) => item.parentId === channel.id)) scroll.append(this.channelButton(thread, false));
      };
      for (const channel of loose) appendChannel(channel);
      for (const category of categories) {
        const children = list.filter((item) => item.parentId === category.id && item.kind !== "category" && item.kind !== "thread");
        const collapsed = this.collapsedCats.has(category.id);
        const header = el("button", `category${collapsed ? " is-collapsed" : ""}`);
        header.type = "button";
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        header.append(el("span", "chev", collapsed ? "▸" : "▾"), el("span", "", category.name));
        header.addEventListener("click", () => this.toggleCategory(category.id));
        scroll.append(header);
        if (!collapsed) for (const channel of children) appendChannel(channel);
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
    const panel = this.voice ? this.voicePanel() : null;
    if (panel) this.channelPane.append(head, scroll, panel, profile);
    else this.channelPane.append(head, scroll, profile);
    scroll.scrollTop = kept;
  }

  private channelBlock(channel: Channel): HTMLElement {
    const button = this.channelButton(channel, false);
    if (channel.kind !== "voice" || !this.guildId) return button;
    const people = participantsIn(this.voiceRoster, this.guildId, channel.id);
    if (!people.length) return button;
    const block = el("div", "voice-block has-people");
    block.append(button);
    const roster = el("div", "voice-roster");
    for (const person of people) roster.append(this.voiceUserRow(person));
    block.append(roster);
    return block;
  }

  private voiceUserRow(person: VoiceParticipant): HTMLElement {
    const row = el("div", `voice-user${person.speaking ? " is-speaking" : ""}`);
    row.dataset.voiceUser = person.userId;
    row.append(portrait(person.name, person.userId, person.avatarUrl, true));
    row.append(el("span", "voice-user-name", person.name));
    const flags = el("span", "voice-flags");
    if (person.selfDeaf || person.serverDeaf) flags.append(icon(paths.headphonesOff));
    if (person.selfMute || person.serverMute || person.selfDeaf || person.serverDeaf) flags.append(icon(paths.micOff));
    if (flags.childElementCount) row.append(flags);
    return row;
  }

  private voicePanel(): HTMLElement {
    const session = this.voice;
    const panel = el("section", "voice-panel");
    panel.setAttribute("aria-label", "Voice controls");
    const copy = el("div", "voice-panel-copy");
    copy.append(
      el("span", `voice-state is-${session?.status ?? "connecting"}`, voiceStatusLabel(session?.status ?? "connecting")),
      el("strong", "", session?.name ?? "Voice"),
    );
    const detail = session?.detail?.trim();
    if (detail) copy.append(el("span", "voice-detail", detail));
    const actions = el("div", "voice-panel-actions");
    actions.append(this.iconButton("Disconnect", paths.hangup, () => this.leaveVoice(), false));
    actions.append(this.iconButton(session?.muted ? "Unmute" : "Mute", session?.muted ? paths.micOff : paths.mic, () => this.toggleMute(), Boolean(session?.muted)));
    actions.append(this.iconButton(session?.deafened ? "Undeafen" : "Deafen", session?.deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), Boolean(session?.deafened)));
    panel.append(copy, actions);
    return panel;
  }

  private channelButton(channel: Channel, dm: boolean): HTMLButtonElement {
    const muted = this.levelFor(dm ? null : this.guildId, channel.id) === "mute";
    const unreadCount = this.unread[channel.id] ?? 0;
    const mentions = this.mentions[channel.id] ?? 0;
    const unread = unreadCount > 0 || mentions > 0;
    const quiet = !unread && Boolean(this.behind[channel.id]);
    const button = el("button", `${dm ? "dm-row" : "channel-row"}${channel.kind === "thread" ? " is-thread" : ""}${channel.id === this.channelId ? " is-selected" : ""}${unread || quiet ? " is-unread" : ""}${muted ? " is-muted" : ""}${channel.kind === "voice" ? " is-voice" : ""}`);
    button.type = "button";
    button.dataset.channel = channel.id;
    if (!dm) button.append(icon(channel.kind === "voice" ? paths.volume : channel.kind === "announcement" ? paths.bell : paths.hash));
    else {
      const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
      if (recipient) button.dataset.user = recipient.id;
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
    if (this.holdShell) return;
    this.prefetchToken += 1;
    const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
    if (perf) perf.lastSwitch = -1;
    const started = performance.now();
    this.channelId = id;
    this.error = null;
    this.reply = null;
    this.editing = null;
    this.pendingDelete = null;
    this.pickerFor = null;
    if (!this.jumpId) {
      this.freshCount = 0;
      this.nearBottom = true;
    }
    this.paintNewBar();
    this.closeSuggest();
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
        for (const message of page.messages) this.absorbMessage(message);
        const marker = firstUnreadId(page.messages.map((message) => message.id), this.lastRead[id]);
        const unread = this.unread[id] ?? 0;
        if (marker) this.divider[id] = marker;
        else if (unread > 0) this.divider[id] = page.messages[Math.max(0, page.messages.length - unread)]?.id ?? null;
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
    this.behind[id] = false;
    if (!this.jumpId) {
      const seen = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
      this.markers[id] = { lastMessageId: seen, mentionCount: 0 };
    }
    this.refreshChannelBadge(id);
    this.scroll = this.jumpId ? "none" : "bottom";
    this.pinnedToBottom = !this.jumpId;
    this.nearBottom = this.pinnedToBottom;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.editing) this.composer.value = draft;
    this.recent = [id, ...this.recent.filter((item) => item !== id)].slice(0, 6);
    if (!this.demo) this.rememberPlace(id);
    if (!this.jumpId && (this.pages[id]?.length ?? 0) > 0) {
      const last = this.pages[id][this.pages[id].length - 1];
      this.ackChannel(id, last.id);
    }
    const opened = this.currentChannel();
    if (opened && (opened.kind === "text" || opened.kind === "forum" || opened.kind === "announcement" || opened.kind === "thread")) {
      void this.loadThreads(id);
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

  private livePage(id: string, before?: string): Promise<{ messages: RawMessage[]; hasMore: boolean }> {
    const key = before ? `${id}:before:${before}` : id;
    const pending = this.pageLoads.get(key);
    if (pending) return pending;
    const task = this.fetchLivePage(id, before).finally(() => {
      if (this.pageLoads.get(key) === task) this.pageLoads.delete(key);
    });
    this.pageLoads.set(key, task);
    return task;
  }

  private async fetchLivePage(id: string, before?: string): Promise<{ messages: RawMessage[]; hasMore: boolean }> {
    const batch = await invoke<RawMessage[]>("fetch_messages", { channelId: id, before });
    const messages = [...batch].reverse().map(normalizeMessage);
    for (const message of messages) this.absorbMessage(message);
    return { messages, hasMore: batch.length >= 50 };
  }

  private async loadOlder(force = false) {
    const id = this.channelId;
    if (!id || this.loading || !this.more[id] || (!force && performance.now() - this.openedAt < 300)) return;
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
    if (this.holdShell) return;
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
    this.layoutObserver = new ResizeObserver((entries) => {
      if (this.scrollLock > 0) {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) heights.set(entry.target, entry.contentRect.height);
        }
        return;
      }
      for (const entry of entries) {
        const node = entry.target;
        if (!(node instanceof HTMLElement)) continue;
        const next = entry.contentRect.height;
        const prev = heights.get(node);
        heights.set(node, next);
        if (prev === undefined) continue;
        const wrap = node.closest(".message-wrap");
        if (wrap instanceof HTMLElement && wrap.dataset.mid) {
          const measured = wrap.offsetHeight;
          if (measured > 0) this.messageHeights.set(wrap.dataset.mid, measured);
        }
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
      .map((message) => `${message.id}:${message.content}:${message.edited}:${message.embeds?.length ?? 0}:${message.stickers?.length ?? 0}:${message.reactions?.map((reaction) => `${reaction.emoji}${reaction.emojiId ?? ""}:${reaction.count}${reaction.me ? "y" : "n"}`).join(".")}`)
      .join("~");
  }

  private messageSpan(list: RawMessage[], scrollTop: number, pinned: boolean): SpanWindow {
    const heights = new Array<number>(list.length);
    for (let index = 0; index < list.length; index += 1) heights[index] = this.messageHeights.get(list[index].id) ?? 0;
    const focus = this.jumpId ? list.findIndex((message) => message.id === this.jumpId) : -1;
    return spanWindow(
      list.length,
      heights,
      scrollTop,
      this.messagesEl.clientHeight || 640,
      rowEstimate(this.config.appearance.density),
      6,
      pinned,
      focus,
    );
  }

  private spacerBox(list: RawMessage[], start: number, end: number): { top: number; bottom: number } {
    const row = rowEstimate(this.config.appearance.density);
    let top = 0;
    for (let index = 0; index < start; index += 1) top += this.messageHeights.get(list[index].id) || row;
    let bottom = 0;
    for (let index = end; index < list.length; index += 1) bottom += this.messageHeights.get(list[index].id) || row;
    return { top, bottom };
  }

  private applySpacers(column: HTMLElement, box: { top: number; bottom: number }) {
    const spacers = column.querySelectorAll(":scope > .virtual-spacer");
    const top = spacers[0];
    const bottom = spacers[1];
    if (top instanceof HTMLElement) top.style.height = `${box.top}px`;
    if (bottom instanceof HTMLElement) bottom.style.height = `${box.bottom}px`;
  }

  private measureHost(host: HTMLElement) {
    for (const node of host.querySelectorAll<HTMLElement>(":scope > .message-wrap")) {
      const mid = node.dataset.mid;
      if (!mid) continue;
      const height = node.offsetHeight;
      if (height > 0) this.messageHeights.set(mid, height);
    }
  }

  private syncMessageWindow() {
    if (this.scrollLock > 0) return;
    const id = this.channelId;
    const list = id ? this.pages[id] ?? [] : [];
    if (!id || list.length <= VIRTUAL_MIN) return;
    const column = this.messagesEl.querySelector(":scope > .message-column");
    const host = column?.querySelector(":scope > .virtual-host");
    if (!(column instanceof HTMLElement) || !(host instanceof HTMLElement)) return;
    const span = this.messageSpan(list, this.messagesEl.scrollTop, this.pinnedToBottom);
    if (span.start === this.msgStart && span.end === this.msgEnd) return;
    const anchor = host.querySelector<HTMLElement>(":scope > .message-wrap");
    const anchorId = anchor?.dataset.mid ?? "";
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    const prevTop = Number.parseFloat((column.querySelector(":scope > .virtual-spacer") as HTMLElement | null)?.style.height || "0") || 0;
    this.lockScroll(() => {
      clear(host);
      this.appendMessages(host, list, span.start, id, span.end);
      this.msgStart = span.start;
      this.msgEnd = span.end;
      this.measureHost(host);
      const box = this.spacerBox(list, span.start, span.end);
      this.applySpacers(column, box);
      const next = anchorId ? host.querySelector<HTMLElement>(`[data-mid="${anchorId}"]`) : null;
      if (this.pinnedToBottom) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      else if (next) this.messagesEl.scrollTop += next.getBoundingClientRect().top - before;
      else this.messagesEl.scrollTop += box.top - prevTop;
    });
    this.watchMessageLayout();
  }

  private appendMessages(parent: HTMLElement, list: RawMessage[], from: number, channelId: string, to = list.length) {
    const ctx = this.renderContext();
    const plugins = this.enabledPlugins();
    const hidden = hiddenIds(this.pack.hiddenAuthors);
    const settings = this.pluginSettings(channelId);
    let lastDay = "";
    let previous: { authorId: string; timestamp: string; kind?: string } | undefined;
    if (from > 0) {
      const prior = list[from - 1];
      lastDay = new Date(prior.timestamp).toDateString();
      previous = { authorId: prior.authorId, timestamp: prior.timestamp, kind: prior.kind };
    }
    for (let index = from; index < to; index += 1) {
      const message = list[index];
      const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
        settings,
        hiddenAuthors: hidden,
        displayContent: this.translated[message.id],
      });
      if (!view) continue;
      const day = new Date(message.timestamp).toDateString();
      const grouped = shouldGroup(previous, message, day === lastDay);
      const node = renderMessage(view, {
        density: this.config.appearance.density,
        grouped,
        showDay: day !== lastDay,
        divider: this.divider[channelId] === message.id,
        remoteEmoji: !this.demo,
        mine: view.authorId === this.meId(),
        jumped: this.jumpId === message.id,
        onReply: () => {
          this.reply = message;
          this.editing = null;
          this.composer.focus();
          this.paintComposer();
        },
        onJump: () => {
          if (message.reply) void this.jumpToMessage(message.channelId, message.reply.id);
        },
        onEdit: () => this.beginEdit(message),
        onDelete: () => {
          this.pendingDelete = message;
          this.paintComposer();
        },
        onPin: () => void this.pinMessage(message),
        onThread: () => {
          if (!message.thread) return;
          this.ensureThreadChannel(message.thread);
          void this.openChannel(message.thread.id);
        },
        onReact: (emoji, emojiId) => {
          if (emoji === "picker") {
            this.pickerFor = this.pickerFor === message.id ? null : message.id;
            this.emojiQuery = "";
            if (this.pickerFor) void this.ensureEmojis();
            this.msgSig = "";
            this.paintMessages();
            return;
          }
          this.toggleReaction(message, emoji, emojiId);
        },
        onImage: (url) => {
          this.lightbox = url;
          this.paintLightbox();
        },
        ...this.messageChrome(message, view),
      });
      if (this.pickerFor === message.id) node.append(this.emojiPicker((emoji, emojiId) => this.toggleReaction(message, emoji, emojiId)));
      node.dataset.mid = message.id;
      parent.append(node);
      lastDay = day;
      previous = { authorId: message.authorId, timestamp: message.timestamp, kind: message.kind };
    }
  }

  private paintTyping() {
    const id = this.channelId;
    const now = Date.now();
    const names = id === CRIT && this.demo
      ? ["Jonah Adler"]
      : this.typingNames.filter((item) => item.channelId === id && item.until > now).map((item) => item.name);
    const text = typingLine(names);
    if (this.typingEl.textContent !== text) this.typingEl.textContent = text;
    const nextClass = names.length ? "typing dots" : "typing";
    if (this.typingEl.className !== nextClass) this.typingEl.className = nextClass;
  }

  private paintMessages() {
    if (this.holdShell) return;
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
    const threadSig = id ? this.threadsFor(id).map((thread) => thread.id).join(",") : "";
    const structural = `${id}|${this.loading}|${shownError}|${this.pickerFor}|${this.jumpId}|${threadSig}|${this.config.appearance.density}|${pluginStamp}`;
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
    const host = column?.querySelector(":scope > .virtual-host");
    if (plan === "append" && column instanceof HTMLElement && host instanceof HTMLElement && id && list.length) {
      this.noteMessagePaint("append");
      this.lockScroll(() => {
        const span = this.messageSpan(list, metrics.top, intent === "bottom" || metrics.near);
        if (span.start !== this.msgStart || span.end !== this.msgEnd) {
          clear(host);
          this.appendMessages(host, list, span.start, id, span.end);
          this.msgStart = span.start;
          this.msgEnd = span.end;
          this.measureHost(host);
        }
        this.applySpacers(column, this.spacerBox(list, this.msgStart, this.msgEnd));
        this.placeScroll(metrics, intent);
      });
      this.watchMessageLayout();
      this.msgSig = sig;
      return;
    }
    if (plan === "append" && column instanceof HTMLElement && id && list.length && list.length <= VIRTUAL_MIN) {
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
        const board = id ? this.forumBoard(id) : null;
        if (board) this.messagesEl.append(board);
        const name = this.currentChannel()?.name ?? "this channel";
        this.messagesEl.append(el("div", "empty", board ? "Open a post, or start one from Discord." : `#${name} is quiet. The composer is below when you have something to say.`));
      } else if (id) {
        const board = this.forumBoard(id);
        if (board) this.messagesEl.append(board);
        const pinned = intent === "bottom" || (intent !== "preserve" && metrics.near);
        const rough = this.messageSpan(list, 0, false);
        const added = intent === "preserve" ? Math.max(0, rough.total - metrics.height) : 0;
        const span = this.messageSpan(list, metrics.top + added, pinned);
        const virtual = list.length > VIRTUAL_MIN;
        const next = el("div", virtual ? "message-column is-virtual" : "message-column");
        if (!virtual) {
          this.appendMessages(next, list, 0, id);
          this.msgStart = 0;
          this.msgEnd = list.length;
          this.messagesEl.append(next);
        } else {
          const top = el("div", "virtual-spacer");
          const body = el("div", "virtual-host");
          const bottom = el("div", "virtual-spacer");
          top.style.height = `${span.top}px`;
          bottom.style.height = `${span.bottom}px`;
          this.appendMessages(body, list, span.start, id, span.end);
          next.append(top, body, bottom);
          this.messagesEl.append(next);
          this.msgStart = span.start;
          this.msgEnd = span.end;
          this.measureHost(body);
          const box = this.spacerBox(list, span.start, span.end);
          top.style.height = `${box.top}px`;
          bottom.style.height = `${box.bottom}px`;
        }
      }
      this.placeScroll(metrics, intent);
      if (intent === "bottom" || (intent !== "preserve" && metrics.near)) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    });
    this.watchMessageLayout();
    this.msgSig = sig;
  }

  private renderContext() {
    const users: Record<string, string> = { ...this.userNames };
    const roster = this.demo ? people : [this.me, ...this.liveMembers];
    for (const person of roster) users[person.id] = person.name;
    for (const message of this.pages[this.channelId ?? ""] ?? []) {
      if (message.authorId && message.authorName && !users[message.authorId]) users[message.authorId] = message.authorName;
      for (const mention of message.mentionUsers ?? []) {
        if (mention.id && mention.name && !users[mention.id]) users[mention.id] = mention.name;
      }
    }
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

  private dmMemberShape(): string {
    const channel = this.currentChannel();
    const ids = channel?.recipients?.map((item) => item.id) ?? channel?.recipientIds ?? [];
    return `dm:${this.channelId}:${channel?.name ?? ""}:${ids.join(",")}`;
  }

  private guildMemberBoard(): { rows: PaintedRow[]; online: number; total: number; note: string; more: boolean } {
    const guildId = this.guildId ?? "";
    const roles = this.rolesByGuild[guildId] ?? [];
    const list = this.demo ? null : this.currentMemberList();
    const wire = list && list.rows.size ? visibleRows(list, roles) : null;
    const roster = this.demo ? people : this.liveMembers;
    const sections = wire ? null : groupMembers(roster, roles);
    const rows: PaintedRow[] = [];
    if (wire) rows.push(...wire);
    else if (sections) {
      for (const section of sections) {
        rows.push({ type: "group", id: section.id, label: section.label, count: section.count, color: section.color });
        for (const person of section.people) {
          rows.push({ type: "member", person, color: roleColor(person.roleIds, roles) || person.color || null });
        }
      }
    }
    const count = rows.filter((row) => row.type === "member").length;
    const online = list?.onlineCount || roster.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
    const total = list?.memberCount || roster.length;
    const base = memberNote(true, count, this.memberPhase[guildId]);
    const note = list && list.memberCount > 0 && rows.length === 0 ? "Loading members…" : (base ?? "");
    const highest = highestIndex(list);
    const more = Boolean(list && list.memberCount > count && highest >= 0 && highest + 1 < list.memberCount);
    return { rows, online, total, note, more };
  }

  private memberShapeOf(rows: PaintedRow[], note: string, more: boolean): string {
    const body = rows.map((row) => row.type === "group" ? `g:${row.id}:${row.count}:${row.color ?? ""}:${row.label}` : `m:${row.person.id}:${row.color ?? ""}:${row.person.name}`).join("|");
    return `${this.guildId}|${note}|${more ? 1 : 0}|${body}`;
  }

  private patchMemberPresence() {
    const board = this.guildId ? this.guildMemberBoard() : null;
    const countEl = this.membersEl.querySelector(".member-count");
    if (countEl && board?.total) countEl.textContent = `${board.online.toLocaleString()} online · ${board.total.toLocaleString()} members`;
    for (const row of this.membersEl.querySelectorAll<HTMLElement>(".member-row")) {
      const person = this.directory[row.dataset.user ?? ""];
      if (!person) continue;
      const dot = row.querySelector("i.status");
      if (dot) dot.className = `status ${person.status ?? "offline"}`;
      const copy = row.querySelector(".member-copy");
      if (!copy) continue;
      const line = memberSubtitle(person);
      const sub = copy.querySelector(":scope > span");
      if (!line) {
        sub?.remove();
        continue;
      }
      if (!sub) copy.append(el("span", "", line));
      else if (sub.textContent !== line) sub.textContent = line;
    }
  }

  private appendPaintedRow(parent: HTMLElement, row: PaintedRow) {
    if (row.type === "group") {
      const label = el("div", "member-group", `${row.label} — ${row.count}`);
      if (row.color) label.style.color = row.color;
      parent.append(label);
      return;
    }
    parent.append(this.memberButton(row.person, row.color));
  }

  private syncMemberWindow(scroll: HTMLElement) {
    const rows = this.memberPaint;
    if (!rows || rows.length <= VIRTUAL_MIN) return;
    const host = scroll.querySelector(":scope > .virtual-host");
    if (!(host instanceof HTMLElement)) return;
    const slice = sliceWindow(rows.length, scroll.scrollTop, scroll.clientHeight || 640, MEMBER_ROW, 8);
    if (Number(host.dataset.start) === slice.start && Number(host.dataset.end) === slice.end) return;
    const spacers = scroll.querySelectorAll(":scope > .virtual-spacer");
    if (spacers[0] instanceof HTMLElement) spacers[0].style.height = `${slice.start * MEMBER_ROW}px`;
    if (spacers[1] instanceof HTMLElement) spacers[1].style.height = `${(rows.length - slice.end) * MEMBER_ROW}px`;
    clear(host);
    for (let index = slice.start; index < slice.end; index += 1) this.appendPaintedRow(host, rows[index]);
    host.dataset.start = String(slice.start);
    host.dataset.end = String(slice.end);
  }

  private bindMemberScroll(scroll: HTMLElement) {
    scroll.addEventListener("scroll", () => {
      if (!this.memberFrame) {
        this.memberFrame = requestAnimationFrame(() => {
          this.memberFrame = 0;
          const current = this.membersEl.querySelector(".member-scroll");
          if (current instanceof HTMLElement) this.syncMemberWindow(current);
        });
      }
      window.clearTimeout(this.memberScrollTimer);
      this.memberScrollTimer = window.setTimeout(() => this.onMemberScroll(scroll), 120);
    }, { passive: true });
  }

  private paintMemberRows(scroll: HTMLElement, rows: PaintedRow[], kept: number) {
    const virtual = rows.length > VIRTUAL_MIN;
    if (virtual) scroll.classList.add("is-virtual");
    if (!virtual) {
      for (const row of rows) this.appendPaintedRow(scroll, row);
      this.memberPaint = null;
      return;
    }
    const slice = sliceWindow(rows.length, kept, 640, MEMBER_ROW, 8);
    const top = el("div", "virtual-spacer");
    const host = el("div", "virtual-host");
    const bottom = el("div", "virtual-spacer");
    top.style.height = `${slice.start * MEMBER_ROW}px`;
    bottom.style.height = `${(rows.length - slice.end) * MEMBER_ROW}px`;
    host.dataset.start = String(slice.start);
    host.dataset.end = String(slice.end);
    for (let index = slice.start; index < slice.end; index += 1) this.appendPaintedRow(host, rows[index]);
    scroll.append(top, host, bottom);
    this.memberPaint = rows;
  }

  private paintMembers() {
    if (this.holdShell) return;
    if (this.membersEl.hidden) {
      if (this.memberShape) {
        clear(this.membersEl);
        this.memberShape = "";
        this.memberPaint = null;
      }
      return;
    }
    const kept = this.membersEl.querySelector(".member-scroll")?.scrollTop ?? 0;
    if (!this.guildId) {
      const shape = this.dmMemberShape();
      if (shape === this.memberShape && this.membersEl.querySelector(".member-scroll")) {
        this.patchMemberPresence();
        return;
      }
      this.memberShape = shape;
      this.memberPaint = null;
      clear(this.membersEl);
      const head = el("div", "member-head");
      const scroll = el("div", "member-scroll");
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
    const board = this.guildMemberBoard();
    const shape = this.memberShapeOf(board.rows, board.note, board.more);
    if (shape === this.memberShape && this.membersEl.querySelector(".member-scroll")) {
      this.patchMemberPresence();
      return;
    }
    this.memberShape = shape;
    clear(this.membersEl);
    const head = el("div", "member-head");
    const scroll = el("div", "member-scroll");
    head.append(el("h2", "", "Members"));
    if (board.total) head.append(el("p", "member-count", `${board.online.toLocaleString()} online · ${board.total.toLocaleString()} members`));
    if (board.note && !board.rows.length) scroll.append(el("p", "empty", board.note));
    this.paintMemberRows(scroll, board.rows, kept);
    if (board.more) scroll.append(el("p", "empty", "Scroll for more."));
    this.bindMemberScroll(scroll);
    this.membersEl.append(head, scroll);
    scroll.scrollTop = kept;
    this.syncMemberWindow(scroll);
  }

  private memberButton(person: Person, color?: string | null): HTMLButtonElement {
    const row = el("button", "member-row");
    row.type = "button";
    row.dataset.user = person.id;
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
    if (this.holdShell) return;
    const wrap = this.composer.closest(".composer-wrap");
    if (wrap instanceof HTMLElement) wrap.hidden = this.friendsOpen && !this.guildId;
    const channel = this.currentChannel();
    this.composer.placeholder = channel ? `Message ${channel.kind === "text" ? "#" : ""}${channel.name}` : "Message";
    this.paintClipBanner();
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
      const preview = plainPreview(this.reply.content, this.renderContext(), 80);
      this.composerBanner.append(el("span", "", preview ? `Replying to ${this.reply.authorName}: ${preview}` : `Replying to ${this.reply.authorName}`));
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
    const emoji = el("button", "icon-button", "☺");
    emoji.type = "button";
    emoji.setAttribute("aria-label", "Emoji");
    emoji.addEventListener("click", () => {
      this.pickerFor = this.pickerFor === "composer" ? null : "composer";
      this.emojiQuery = "";
      if (this.pickerFor) void this.ensureEmojis();
      this.paintComposer();
    });
    tools.append(attach, file, emoji);
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
    if (this.pickerFor === "composer") {
      this.composerMeta.append(this.emojiPicker((glyph, emojiId, animated, name) => this.insertEmoji(glyph, emojiId, animated, name)));
    }
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
      const editing = this.editing;
      const previous = editing.content;
      editing.content = content;
      editing.edited = true;
      const stored = (history[id] ?? []).find((message) => message.id === editing.id);
      if (stored) {
        stored.content = content;
        stored.edited = true;
      }
      this.editing = null;
      if (!this.demo) {
        try {
          const saved = normalizeMessage(await invoke<RawMessage>("edit_message", { channelId: id, messageId: editing.id, content }));
          editing.content = saved.content;
          editing.edited = true;
          if (stored) stored.content = saved.content;
          this.absorbMessage(saved);
        } catch (err) {
          editing.content = previous;
          editing.edited = false;
          if (stored) {
            stored.content = previous;
            stored.edited = false;
          }
          this.toast("Couldn't edit", err instanceof Error ? err.message : "Discord refused the edit.");
        }
      }
      this.msgSig = "";
    } else {
      const message: RawMessage = {
        id: `local-${Date.now()}`,
        channelId: id,
        authorId: this.meId(),
        authorName: this.demo ? "Ethan Park" : this.me.name,
        content,
        timestamp: new Date().toISOString(),
        reply: this.reply
          ? { id: this.reply.id, authorName: this.reply.authorName, preview: plainPreview(this.reply.content, this.renderContext(), 80) || "Click to see message" }
          : null,
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
        try {
          const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
            channelId: id,
            content,
            replyTo: this.reply?.id ?? null,
            files: this.files.map((file) => ({ name: file.name, mime: file.mime, bytes: Array.from(file.bytes) })),
          }));
          message.id = sent.id;
          message.attachments = sent.attachments?.length ? sent.attachments : message.attachments;
          message.embeds = sent.embeds;
          message.authorAvatar = sent.authorAvatar;
          this.absorbMessage(sent);
          this.ackChannel(id, sent.id);
          this.msgSig = "";
        } catch (err) {
          history[id] = (history[id] ?? []).filter((item) => item.id !== message.id);
          this.pages[id] = (this.pages[id] ?? []).filter((item) => item.id !== message.id);
          this.msgSig = "";
          this.paint();
          this.toast("Couldn't send", err instanceof Error ? err.message : "Discord refused the message.");
          return;
        }
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

  private toggleReaction(message: RawMessage, emoji: string, emojiId?: string | null) {
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => sameReaction(reaction, emoji, emojiId));
    let add = true;
    this.emojiUses = rememberEmoji(this.emojiUses, emojiId ? `${emoji}:${emojiId}` : emoji, Date.now());
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
      reactions.push({ emoji, emojiId: emojiId ?? null, count: 1, me: true });
      message.reactions = reactions;
    }
    if (!this.demo && message.channelId) {
      void invoke("toggle_reaction", { channelId: message.channelId, messageId: message.id, emoji, emojiId: emojiId ?? null, add }).catch((err) => {
        this.toast("Couldn't react", err instanceof Error ? err.message : "Discord refused the reaction.");
      });
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
    let frame = 0;
    input.addEventListener("input", () => {
      this.switcherIndex = 0;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
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
    if (this.section === "voice") void this.pullClipStatus().then(() => {
      if (this.settings && this.section === "voice") this.renderSettings();
    });
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
        if (id === "voice") void this.pullClipStatus().then(() => {
          if (this.settings && this.section === "voice") this.renderSettings();
        });
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
      void this.loadAudioDevices();
      wrap.append(this.choice(["vad", "ptt"], this.voiceMode(), (value) => {
        this.setVoiceMode(value === "ptt" ? "ptt" : "vad");
        if (this.settings) this.renderSettings();
      }));
      if (this.detectedGame) {
        wrap.append(el("p", "hint", this.resolvedGame().profile
          ? `Push to talk for ${this.detectedGame} is saved on that game. It steps back when the game closes.`
          : `${this.detectedGame} is using your usual voice setting. A change here is remembered for this game.`));
      }
      const sense = el("input");
      sense.type = "range";
      sense.min = "0";
      sense.max = "100";
      sense.value = String(this.config.voice.sensitivity);
      sense.addEventListener("input", () => {
        this.config.voice.sensitivity = Number(sense.value);
        this.persist();
        this.pushVoiceAudio();
      });
      wrap.append(el("div", "hint", "Voice activity sensitivity"), sense);
      wrap.append(this.toggle("Noise suppression", this.config.voice.noise_suppression, (value) => {
        this.config.voice.noise_suppression = value;
        this.persist();
        this.pushVoiceAudio();
      }));
      wrap.append(el("h3", "", "In-game voice HUD"));
      const hudKey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
      wrap.append(el("p", "lede", "A small always-on-top window on macOS and Windows. It uses the same voice roster as the channel list. It stays off until you turn it on."));
      wrap.append(this.toggle("Show voice HUD", this.overlayOn(), (value) => {
        this.setVoiceOverlay(value, false);
      }));
      const opacity = el("input");
      opacity.type = "range";
      opacity.min = "35";
      opacity.max = "100";
      opacity.value = String(this.config.voice.overlay_opacity);
      opacity.setAttribute("aria-label", "Voice HUD opacity");
      opacity.addEventListener("input", () => {
        this.config.voice.overlay_opacity = Number(opacity.value);
        this.persist();
        this.publishVoiceHud();
      });
      wrap.append(el("div", "hint", "Opacity"), opacity);
      wrap.append(this.toggle("Click through", this.config.voice.overlay_click_through, (value) => {
        this.config.voice.overlay_click_through = value;
        this.persist();
        this.publishVoiceHud();
      }));
      wrap.append(el("p", "hint", `${hudKey} shows and hides the HUD, including while a game is focused. Click-through lets the game take the mouse. Turn it off to drag the HUD.`));
      const perfKey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
      wrap.append(this.toggle("Show performance", this.perfOn(), (value) => {
        this.setPerfOverlay(value, false);
      }));
      wrap.append(el("p", "hint", `${perfKey} adds RAM, CPU, and FPS to the same window. Opacity and click-through above apply to both.`));
      this.appendGameProfiles(wrap);
      wrap.append(el("h3", "", "Devices"));
      wrap.append(el("p", "lede", "Lark stores the device you pick. Voice uses these ids when it opens the microphone."));
      wrap.append(this.devicePicker("Input", this.config.voice.input_device, this.captureDevices(), (value) => {
        this.config.voice.input_device = value;
        this.persist();
        this.pushVoiceAudio();
      }));
      wrap.append(this.devicePicker("Output", this.config.voice.output_device, this.playbackDevices(), (value) => {
        this.config.voice.output_device = value;
        this.persist();
        this.pushVoiceAudio();
      }));
      wrap.append(this.devicePicker("Camera", this.config.voice.video_device, this.videoInputs, (value) => {
        this.config.voice.video_device = value;
        this.persist();
      }));
      const listDevices = el("button", "text-button", "List microphones and cameras");
      listDevices.type = "button";
      listDevices.addEventListener("click", () => void this.listDevices());
      wrap.append(listDevices);
      wrap.append(el("h3", "", "Clips"), el("p", "lede", clipBehaviorNote(this.platform.os)));
      wrap.append(el("p", "hint", this.clipStatusLine()));
      wrap.append(el("p", "hint", `Clips folder: ${this.clipStatus?.dir || this.platform.clipsDir}`));
      if (this.clipStatus?.hotkeyError) wrap.append(el("p", "warning", this.clipStatus.hotkeyError));
      wrap.append(this.toggle("Game Mode capture", this.config.clips.game_capture, (value) => {
        this.config.clips.game_capture = value;
        return this.persist().then(() => this.pullClipStatus());
      }));
      wrap.append(el("p", "hint", `Hotkey: ${formatShortcut(this.config.shortcuts.save_clip, this.platform.os)}. Change it under Keybinds. It is global on macOS and Windows, works while another app is in front, and needs a modifier or a function key.`));
      if (isTauri()) {
        const openClips = el("button", "text-button", "Open clips folder");
        openClips.type = "button";
        openClips.addEventListener("click", () => void this.openClipsFolder());
        wrap.append(openClips);
      }
    } else if (this.section === "shortcuts") {
      wrap.append(el("h2", "", "Keybinds"), el("p", "lede", "mod is ⌘ on macOS and Ctrl on Windows. Click a shortcut, then press the new keys. Save clip is global on macOS and Windows, so it still works while a game is in front."));
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
      wrap.append(el("h3", "", "Game Mode"));
      const gameKey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
      wrap.append(this.toggle("Game Mode", this.gameMode, (value) => {
        this.setGameMode(value, false);
      }));
      wrap.append(this.toggle("Detect games", this.config.desktop.detect_games, (value) => {
        this.config.desktop.detect_games = value;
        this.persist();
        if (!value) this.noteGame(null);
        void this.detectLoad();
      }));
      wrap.append(el("p", "hint", `${gameKey} toggles it, including while a game is focused. Animations pause, channels you have not opened are not prefetched, and the existing polls slow down. A detected game turns it on unless that game's profile says otherwise.`));
      wrap.append(el("p", "hint", this.detectedGame
        ? `Detected: ${this.detectedGame}.`
        : "No game detected. The check looks at the front app a few times a minute and does not read GPU sensors."));
      wrap.append(el("h3", "", "Status"));
      wrap.append(this.toggle("Hardware in status", this.config.desktop.hardware_status, (value) => {
        this.config.desktop.hardware_status = value;
        this.hardware = setHardwareEnabled(this.hardware, value, this.me.custom ?? "");
        this.hardwarePushFailed = false;
        this.persist();
        this.rememberHardware();
        if (!value) {
          this.hardwareSampleAt = 0;
          this.hardwareChecking = false;
          this.hardwareLine = null;
          this.applyHardware(null);
          return;
        }
        if (!isTauri() || this.demo) return;
        void this.sampleHardware(true);
      }));
      wrap.append(el("p", "hint", "Off until you turn this on. Lark then reads this computer's GPU name, CPU temperature when a sensor answers, and the current game. That line becomes your Discord custom status, kept to 128 characters, and it refreshes about once a minute. macOS and Windows only. A missing reading is left out. Turning this off stops the reads."));
      if (this.hardware.paused) {
        wrap.append(el("p", "hint", "Your custom status is left as you set it. Clear it to show hardware again."));
      } else if (this.hardwareChecking) {
        wrap.append(el("p", "hint", "Reading this computer…"));
      } else if (this.hardwareLine) {
        wrap.append(el("p", "hint", `Status line: ${this.hardwareLine}`));
      } else if (this.config.desktop.hardware_status && this.hardwareSampleAt > 0) {
        wrap.append(el("p", "hint", "Nothing to show from this computer right now."));
      } else if (!isTauri()) {
        wrap.append(el("p", "hint", "The desktop app reads the machine. This preview does not."));
      }
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
    if (this.rebinding || this.rebindingGame) {
      event.preventDefault();
      const shortcut = shortcutFromEvent(event, this.platform.os);
      if (!shortcut) return;
      if (this.rebindingGame) {
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
    } else if (matchShortcut(event, shortcuts.toggle_voice_overlay, os)) {
      event.preventDefault();
      this.toggleVoiceOverlay();
    } else if (matchShortcut(event, shortcuts.toggle_perf_overlay, os)) {
      event.preventDefault();
      this.togglePerfOverlay();
    } else if (matchShortcut(event, shortcuts.toggle_game_mode, os)) {
      event.preventDefault();
      this.toggleGameMode();
    } else if (matchShortcut(event, shortcuts.save_clip, os)) {
      event.preventDefault();
      void this.saveClip();
    } else if (this.voice && this.voiceMode() === "ptt" && matchShortcut(event, this.pttShortcut(), os)) {
      event.preventDefault();
      this.pttHeld = true;
      this.refreshSpeaking();
      this.pushTransmit();
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

  private persist(): Promise<void> {
    localStorage.setItem("lark.config.v1", JSON.stringify(this.config));
    if (!isTauri()) return Promise.resolve();
    return invoke("save_config", { config: this.config }).then(() => undefined);
  }

  private clipStatusLine(): string {
    if (!isTauri()) return "The desktop app keeps the buffer. This preview does not record the screen.";
    const status = this.clipStatus;
    if (!status) return "Checking the clip buffer…";
    if (status.recording) {
      const seconds = Math.max(0, Math.round(status.spanMs / 1000));
      return `Recording the main display · ${seconds}s in the buffer · ${status.backend}`;
    }
    return status.error
      ? `Buffer off. ${status.error}`
      : "Buffer off. Turn on Game Mode capture or share your screen. The hotkey does nothing until one of those is on.";
  }

  private async pullClipStatus() {
    if (!isTauri()) return;
    try {
      const status = await invoke<{ recording: boolean; spanMs: number; dir: string; backend: string; error: string; hotkeyError: string }>("clip_status");
      this.clipStatus = status;
    } catch {
      this.clipStatus = null;
    }
  }

  private onClipReady(payload: { ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }) {
    if (!payload?.ok || !payload.name) {
      const error = payload?.error || "Couldn't save a clip.";
      if (this.clipNotice === error) return;
      this.clipNotice = error;
      window.setTimeout(() => {
        if (this.clipNotice === error) this.clipNotice = "";
      }, 1500);
      void this.notify("Clip", error);
      return;
    }
    if (this.clipNotice === payload.name) return;
    this.clipNotice = payload.name;
    window.setTimeout(() => {
      if (this.clipNotice === payload.name) this.clipNotice = "";
    }, 1500);
    this.pendingClip = {
      name: payload.name,
      path: payload.path || "",
      bytes: payload.bytes || 0,
      spanMs: payload.spanMs || 0,
    };
    void this.notify("Clip saved", `${payload.name} is on this computer. Attach it to share it. Nothing was uploaded.`);
    if (this.view === "app") this.paintComposer();
  }

  private async saveClip() {
    if (!isTauri()) {
      this.toast("Clips", "The clip hotkey saves a file in the macOS and Windows app while screen share or Game Mode capture is on.");
      return;
    }
    try {
      const saved = await invoke<{ ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }>("save_clip");
      this.onClipReady(saved);
    } catch (err) {
      this.onClipReady({ ok: false, error: commandError(err, "Couldn't save a clip.") });
    }
  }

  private paintClipBanner() {
    clear(this.clipBanner);
    const clip = this.pendingClip;
    this.clipBanner.hidden = !clip;
    if (!clip) return;
    const seconds = Math.max(1, Math.round(clip.spanMs / 1000));
    this.clipBanner.append(el("span", "", `Clip saved · about ${seconds}s · not uploaded`));
    const attach = el("button", "primary", "Attach");
    attach.type = "button";
    attach.addEventListener("click", () => void this.attachPendingClip());
    const folder = el("button", "text-button", "Show in folder");
    folder.type = "button";
    folder.addEventListener("click", () => void this.showPendingClip());
    const dismiss = el("button", "ghost", "Dismiss");
    dismiss.type = "button";
    dismiss.addEventListener("click", () => {
      this.pendingClip = null;
      this.paintClipBanner();
    });
    this.clipBanner.append(attach, folder, dismiss);
  }

  private async attachPendingClip() {
    const clip = this.pendingClip;
    if (!clip) return;
    if (!this.channelId) {
      this.toast("Clip", "Open a channel, then attach the clip.");
      return;
    }
    try {
      const encoded = await invoke<string>("read_clip", { name: clip.name });
      const bytes = bytesFromBase64(encoded);
      const blob = new Blob([bytes], { type: "video/x-msvideo" });
      this.files.push({ name: clip.name, mime: "video/x-msvideo", bytes, url: URL.createObjectURL(blob) });
      this.pendingClip = null;
      this.paintComposer();
      this.toast("Clip attached", "Press Enter to send it. Lark has not uploaded the file.");
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't read the clip."));
    }
  }

  private async showPendingClip() {
    const clip = this.pendingClip;
    if (!clip || !isTauri()) return;
    try {
      await invoke("show_clip", { name: clip.name });
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't show the clip."));
    }
  }

  private async openClipsFolder() {
    if (!isTauri()) return;
    try {
      await invoke("open_clips_dir");
    } catch (err) {
      this.toast("Clips", commandError(err, "Couldn't open the clips folder."));
    }
  }

  private async ensureGuild(guildId: string) {
    await this.ensureChannels(guildId);
    await this.ensureMembers(guildId);
  }

  private async ensureChannels(guildId: string) {
    if (this.liveChannels[guildId]) return;
    const pending = this.channelLoads.get(guildId);
    if (pending) return pending;
    const task = this.loadGuildChannels(guildId);
    this.channelLoads.set(guildId, task);
    try {
      await task;
    } finally {
      if (this.channelLoads.get(guildId) === task) this.channelLoads.delete(guildId);
    }
  }

  /**
   * Channel lists come from READY and GUILD_CREATE. REST is a single fallback
   * for the guild on screen, after those events have had time to arrive.
   */
  private async loadGuildChannels(guildId: string) {
    if (this.liveChannels[guildId]) return;
    const delay = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
    if (delay > 0) {
      await this.waitForChannels(guildId, delay);
      if (this.liveChannels[guildId]) return;
    }
    if (this.guildId !== guildId || this.liveChannels[guildId]) return;
    try {
      const channels = await invoke<Channel[]>("fetch_guild_channels", { guildId });
      if (this.liveChannels[guildId]) return;
      this.liveChannels[guildId] = channels.map(normalizeChannel);
      for (const channel of this.liveChannels[guildId]) this.noteChannel(channel);
      if (this.holdShell) {
        this.queueChannelCheck();
        return;
      }
      if (this.guildId === guildId) this.paint();
    } catch {
      /* GUILD_CREATE may still fill the list. */
    }
  }

  private waitForChannels(guildId: string, ms: number): Promise<boolean> {
    if (this.liveChannels[guildId]) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      let wake: () => void = () => undefined;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const list = this.channelWaiters.get(guildId);
        if (list) {
          const next = list.filter((item) => item !== wake);
          if (next.length) this.channelWaiters.set(guildId, next);
          else this.channelWaiters.delete(guildId);
        }
        resolve(ok);
      };
      wake = () => finish(true);
      timer = window.setTimeout(() => finish(Boolean(this.liveChannels[guildId])), ms);
      const list = this.channelWaiters.get(guildId) ?? [];
      list.push(wake);
      this.channelWaiters.set(guildId, list);
    });
  }

  private wakeChannelWaiters(guildId: string) {
    const waiters = this.channelWaiters.get(guildId);
    if (!waiters) return;
    this.channelWaiters.delete(guildId);
    for (const wake of waiters) wake();
  }

  private async ensureMembers(guildId: string) {
    if (this.memberPhase[guildId] !== "done") this.memberPhase[guildId] = "loading";
    const channelId = this.guildId === guildId ? this.channelId : "";
    if (channelId) this.queueMemberSubscribe(guildId, channelId, [[0, 99]]);
    if (!(this.rolesByGuild[guildId]?.length)) {
      const wait = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
      if (wait > 0) await delay(wait);
      if (!this.rolesByGuild[guildId]?.length && this.guildId === guildId) {
        try {
          const roles = await invoke<RoleInfo[]>("fetch_roles", { guildId });
          this.rememberRoles(guildId, roles);
          if (this.guildId === guildId) this.paintMembers();
        } catch {
          /* GUILD_CREATE still delivers role colors. */
        }
      }
    }
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
    if (this.liveDms.length && this.friends.length) return;
    const wait = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
    if (wait > 0) await delay(wait);
    if (!this.liveDms.length) {
      try {
        const channels = await invoke<Channel[]>("fetch_dms");
        this.mergeDms(channels.map(normalizeChannel));
      } catch {
        /* READY private channels still fill the list. */
      }
    }
    if (!this.friends.length) {
      try {
        const friends = await invoke<RawMember[]>("fetch_friends");
        this.storeFriends(friends.map(personFromMember).filter((person): person is Person => Boolean(person)));
      } catch {
        /* Relationships on READY still fill the friends list. */
      }
    }
    if (!this.guildId) this.paint();
  }

  private mergeDms(incoming: Channel[]) {
    const byId = new Map(this.liveDms.map((channel) => [channel.id, channel]));
    for (const channel of incoming) {
      if (channel.kind !== "dm" && channel.kind !== "group") continue;
      const prev = byId.get(channel.id);
      const next = prev ? {
        ...prev,
        ...channel,
        recipients: channel.recipients?.length ? channel.recipients : prev.recipients,
        recipientIds: channel.recipientIds?.length ? channel.recipientIds : prev.recipientIds,
        lastMessageId: channel.lastMessageId || prev.lastMessageId,
      } : channel;
      byId.set(channel.id, next);
      this.noteChannel(next);
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
    this.msgSig = "";
    if (this.view === "app" && this.channelId) this.paintMessages();
  }

  private rememberGuild(guild: Guild) {
    this.liveGuilds = mergeGuilds([guild], this.liveGuilds);
    this.paintRail();
    if (guild.id === this.guildId) this.paintChannels();
  }

  private paintConnection() {
    if (this.holdShell) return;
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
      this.noteGatewayLiveness(event.state);
      if (event.state === "failed") {
        this.abortStartup();
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
      this.voiceRoster = {};
      this.voice = null;
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
      this.gatewayReadyAt = Date.now();
      const bundled = (event as { guildChannels?: { guildId?: string; channels?: Channel[] }[] }).guildChannels ?? [];
      for (const group of bundled) {
        if (!group.guildId || !group.channels?.length) continue;
        this.liveChannels[group.guildId] = group.channels.map(normalizeChannel);
        for (const channel of this.liveChannels[group.guildId]) this.noteChannel(channel);
        this.wakeChannelWaiters(group.guildId);
      }
      this.connection = "Connected";
      if (this.holdShell) {
        this.resumeOverlay = false;
        this.onStartupReady();
        return;
      }
      void this.ensureHome();
      if (!this.guildId || !this.liveGuilds.some((guild) => guild.id === this.guildId)) {
        this.guildId = this.liveGuilds[0]?.id ?? null;
      }
      if (this.guildId) this.liveMembers = this.membersByGuild[this.guildId] ?? [];
      const keepChannel = Boolean(this.channelId && (this.pages[this.channelId]?.length ?? 0) > 0);
      this.paint();
      if (this.guildId && !this.liveChannels[this.guildId]) void this.ensureChannels(this.guildId);
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
      this.msgSig = "";
      if (this.guildId === event.guildId) {
        this.paintMembers();
        this.paintMessages();
      }
    } else if (event.kind === "role" && event.guildId) {
      const payload = event as { role?: RoleInfo; removed?: boolean };
      if (payload.removed && payload.role?.id) {
        this.rolesByGuild[event.guildId] = (this.rolesByGuild[event.guildId] ?? []).filter((role) => role.id !== payload.role?.id);
        delete this.liveRoles[payload.role.id];
      } else if (payload.role) this.rememberRoles(event.guildId, [payload.role]);
      this.msgSig = "";
      if (this.guildId === event.guildId) {
        this.paintMembers();
        this.paintMessages();
      }
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
      this.wakeChannelWaiters(event.guildId);
      for (const channel of this.liveChannels[event.guildId] ?? []) {
        this.noteChannel(channel);
        this.refreshChannelBadge(channel.id);
      }
      if (this.holdShell) {
        this.queueChannelCheck();
        return;
      }
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
        if (this.holdShell) this.queueChannelCheck();
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
    } else if (event.kind === "threads") {
      const threads = ((event as { threads?: Channel[] }).threads ?? []).map(normalizeChannel);
      this.mergeThreads(String((event as { guildId?: string }).guildId ?? ""), String(event.channelId ?? ""), threads);
    } else if (event.kind === "messageCreate" && event.message) {
      const message = normalizeMessage(event.message);
      this.absorbMessage(message);
      const bucket = this.pages[message.channelId] ?? [];
      const known = bucket.some((item) => item.id === message.id);
      if (!known) this.pages[message.channelId] = [...bucket, message];
      const guildId = message.guildId || this.guildForChannel(message.channelId);
      const kind = this.channelById(message.channelId)?.kind;
      const direct = kind === "dm" || kind === "group" || !guildId;
      const pref = guildId ? this.discordNotify.guilds[guildId] : undefined;
      const mentionsMe = mentionsUser({
        mentionIds: message.mentionIds ?? [],
        mentionRoles: message.mentionRoles ?? message.mentionRoleIds ?? [],
        mentionEveryone: Boolean(message.mentionEveryone),
        meId: this.meId(),
        myRoles: guildId ? this.access[guildId]?.myRoles ?? [] : [],
        suppressEveryone: pref?.suppressEveryone ?? false,
        suppressRoles: pref?.suppressRoles ?? false,
        direct,
      });
      const level = this.levelFor(guildId, message.channelId);
      const viewing = message.channelId === this.channelId;
      const follow = viewing && (this.pinnedToBottom || message.authorId === this.meId());
      if (viewing && follow) {
        this.localUnread[message.channelId] = 0;
        this.localMentions[message.channelId] = 0;
        this.markers[message.channelId] = { lastMessageId: message.id, mentionCount: 0 };
        this.refreshChannelBadge(message.channelId);
      } else if (!viewing && message.authorId !== this.meId() && bumpsUnread(level, mentionsMe, direct)) {
        this.localUnread[message.channelId] = (this.localUnread[message.channelId] ?? 0) + 1;
        if (mentionsMe) this.localMentions[message.channelId] = (this.localMentions[message.channelId] ?? 0) + 1;
        if (message.id) this.channelLast[message.channelId] = message.id;
        this.behind[message.channelId] = true;
        this.refreshChannelBadge(message.channelId);
      }
      if (viewing && !follow && !known) {
        this.freshCount += 1;
        if (!this.divider[message.channelId]) this.divider[message.channelId] = message.id;
        this.paintNewBar();
      }
      if (viewing && follow) this.ackChannel(message.channelId, message.id);
      const alreadyNotified = shouldDesktopNotify({
        level,
        mentionsMe,
        fromMe: message.authorId === this.meId(),
        windowFocused: this.focused,
        channelId: message.channelId,
        activeChannelId: this.channelId,
        direct,
      });
      const body = plainPreview(message.content, this.renderContext()) || (message.attachments?.length ? "Sent an attachment" : message.stickers?.length ? "Sent a sticker" : "New message");
      if (alreadyNotified) void this.notify(message.authorName, body);
      this.considerKeyword(message, level, mentionsMe, alreadyNotified);
      if (viewing) {
        if (follow) this.pinnedToBottom = true;
        this.nearBottom = this.pinnedToBottom;
        this.scroll = follow ? "bottom" : "none";
        this.paintMessages();
      } else if ((this.unread[message.channelId] ?? 0) > 0 || (this.mentions[message.channelId] ?? 0) > 0 || this.behind[message.channelId]) {
        this.paintRail();
        this.paintChannels();
      }
    } else if (event.kind === "messageUpdate" && event.channelId && event.messageId) {
      const list = this.pages[event.channelId];
      const message = list?.find((item) => item.id === event.messageId);
      if (message) {
        const patch = event as {
          content?: string;
          embeds?: RawMessage["embeds"];
          attachments?: RawMessage["attachments"];
          stickers?: RawMessage["stickers"];
          reactions?: RawMessage["reactions"];
          mentionIds?: string[];
          mentionUsers?: RawMessage["mentionUsers"];
        };
        if (typeof patch.content === "string") {
          message.content = patch.content;
          message.edited = true;
        }
        if (patch.embeds) message.embeds = patch.embeds;
        if (patch.attachments) message.attachments = patch.attachments;
        if (patch.stickers) message.stickers = patch.stickers;
        if (patch.reactions) message.reactions = patch.reactions;
        if (patch.mentionIds) message.mentionIds = patch.mentionIds;
        if (patch.mentionUsers) message.mentionUsers = patch.mentionUsers;
        this.absorbMessage(message);
        if (event.channelId === this.channelId) {
          this.msgSig = "";
          this.paintMessages();
        }
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
        const emojiId = (event as { emojiId?: string | null }).emojiId ?? null;
        const existing = reactions.find((item) => sameReaction(item, event.emoji ?? "", emojiId));
        const mine = event.userId === this.meId();
        if (event.added) {
          if (existing) {
            if (mine && existing.me) return;
            existing.count += 1;
            if (mine) existing.me = true;
          } else reactions.push({ emoji: event.emoji, emojiId, count: 1, me: mine });
        } else if (existing) {
          if (mine && !existing.me) return;
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
      if (last) this.lastRead[event.channelId] = last;
      if (event.channelId === this.channelId) {
        this.localUnread[event.channelId] = 0;
        this.localMentions[event.channelId] = 0;
      }
      this.refreshBehind(event.channelId);
      this.refreshChannelBadge(event.channelId);
      this.syncBadge();
      this.paintChannels();
      this.paintRail();
    } else if (event.kind === "voiceStates" && event.guildId) {
      const states = ((event as { states?: VoiceStateInput[] }).states ?? []).map((state) => this.hydrateVoice(state, event.guildId ?? ""));
      replaceGuildVoice(this.voiceRoster, event.guildId, states);
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    } else if (event.kind === "voiceState" && event.userId) {
      const raw = event as VoiceStateInput;
      const state = this.hydrateVoice({ ...raw, guildId: String(raw.guildId ?? event.guildId ?? ""), userId: event.userId }, String(raw.guildId ?? ""));
      applyVoiceState(this.voiceRoster, state);
      if (state.name && state.name !== "Someone") this.userNames[state.userId] = state.name;
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    } else if (event.kind === "voiceSpeaking" && event.userId) {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      this.markSpeaking(event.userId, Boolean((event as { speaking?: boolean }).speaking));
    } else if (event.kind === "voiceLink") {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      const state = String((event as { state?: string }).state ?? "");
      const detail = String((event as { detail?: string }).detail ?? "");
      if (this.voice && (state === "connected" || state === "connecting" || state === "reconnecting")) {
        this.voice.status = state as VoiceSession["status"];
        this.voice.detail = friendlyVoiceDetail(detail);
        this.paintVoice();
        this.paintChannels();
      }
      if (state === "left" && epoch === this.voiceEpoch) {
        this.voice = null;
        this.paintVoice();
        this.paintChannels();
      }
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
    if (!this.voice || this.voiceMode() !== "ptt") return;
    if (matchShortcut(event, this.pttShortcut(), this.platform.os)) {
      this.pttHeld = false;
      this.refreshSpeaking();
      this.pushTransmit();
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
    if (!shouldPreload(this.gameMode)) return;
    const order = this.visibleChannels()
      .filter((channel) => channel.kind === "text" || channel.kind === "announcement" || channel.kind === "forum" || channel.kind === "thread" || channel.kind === "dm" || channel.kind === "group")
      .map((channel) => channel.id);
    const loaded = new Set(Object.keys(this.pages));
    const targets = prefetchChannelIds(id, order, this.recent, loaded, 3).filter((channelId) => channelId !== ARCHIVE);
    const token = ++this.prefetchToken;
    const load = async () => {
      for (const channelId of targets) {
        if (!shouldPreload(this.gameMode) || token !== this.prefetchToken || this.pages[channelId]) continue;
        if (this.demo) {
          const page = pageMessages(history[channelId] ?? [], undefined, 20);
          if (token !== this.prefetchToken || this.pages[channelId]) continue;
          this.pages[channelId] = page.messages;
          this.more[channelId] = page.hasMore;
          this.warm.add(channelId);
          continue;
        }
        try {
          const page = await this.livePage(channelId);
          if (!this.pages[channelId]) {
            this.pages[channelId] = page.messages;
            this.more[channelId] = page.hasMore;
            this.warm.add(channelId);
          }
          if (token !== this.prefetchToken) return;
        } catch {
          return;
        }
      }
      this.trimPages();
      this.rememberCache();
    };
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 80));
    idle(() => void load());
  }

  private trimPages() {
    const keep = new Set<string>([this.channelId ?? "", this.splitId ?? "", ...this.recent, ...this.warm]);
    const keys = Object.keys(this.pages);
    if (keys.length <= 12) return;
    for (const key of keys) {
      if (!keep.has(key)) delete this.pages[key];
    }
    if (this.warm.size > 4) {
      const extra = [...this.warm].filter((key) => key !== this.channelId && key !== this.splitId && !this.recent.includes(key));
      for (const key of extra.slice(0, this.warm.size - 4)) this.warm.delete(key);
    }
  }

  private joinVoice(channel: Channel) {
    this.voiceEpoch += 1;
    const epoch = this.voiceEpoch;
    applyVoiceState(this.voiceRoster, {
      guildId: this.guildId ?? "",
      channelId: channel.id,
      userId: this.meId(),
      name: this.demo ? "Ethan Park" : this.me.name,
      avatarUrl: this.me.avatarUrl ?? null,
    });
    this.voice = {
      channelId: channel.id,
      guildId: this.guildId,
      name: channel.name,
      status: "connecting",
      muted: false,
      deafened: false,
      members: [],
    };
    this.syncCallMembers();
    this.paintChannels();
    this.paintVoice();
    if (this.demo) {
      window.setTimeout(() => {
        if (!this.voice || this.voice.channelId !== channel.id) return;
        this.voice.status = "connected";
        this.refreshSpeaking();
        this.paintChannels();
        this.paintVoice();
      }, 180);
      return;
    }
    void invoke("join_voice", {
      guildId: this.guildId,
      channelId: channel.id,
      mute: false,
      deaf: false,
      epoch,
      vad: this.voiceMode() === "vad",
      sensitivity: this.config.voice.sensitivity,
      noiseSuppression: this.config.voice.noise_suppression,
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
    }).catch((err) => {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't join.");
      this.leaveVoice();
    });
    void this.loadAudioDevices();
  }

  private leaveVoice() {
    const guildId = this.voice?.guildId ?? "";
    if (this.voice) applyVoiceState(this.voiceRoster, { guildId, channelId: "", userId: this.meId() });
    this.voice = null;
    this.shareOn = false;
    this.pttHeld = false;
    if (!this.demo) void invoke("leave_voice").catch(() => undefined);
    this.paintVoice();
    this.paintChannels();
  }

  private toggleMute() {
    if (!this.voice) return;
    this.voice.muted = !this.voice.muted;
    if (!this.voice.muted) this.voice.deafened = false;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  }

  private toggleDeafen() {
    if (!this.voice) return;
    this.voice.deafened = !this.voice.deafened;
    this.voice.muted = this.voice.deafened;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  }

  private pushVoiceState() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_self", { mute: this.voice.muted, deaf: this.voice.deafened }).catch(() => undefined);
    this.pushVoiceAudio();
  }

  private pushTransmit() {
    if (!this.voice || this.demo) return;
    const transmit = !this.voice.muted && (this.voiceMode() === "ptt" ? this.pttHeld : true);
    void invoke("set_voice_transmit", { transmit }).catch(() => undefined);
  }

  private pushVoiceAudio() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_audio", {
      deafened: this.voice.deafened,
      vad: this.voiceMode() === "vad",
      sensitivity: this.config.voice.sensitivity,
      noiseSuppression: this.config.voice.noise_suppression,
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
    }).catch(() => undefined);
  }

  private refreshSpeaking() {
    if (!this.voice) return;
    const self = this.voice.members.find((member) => member.id === this.meId());
    if (!self) return;
    if (this.demo) {
      const vad = this.voiceMode() === "vad" && this.config.voice.sensitivity > 5;
      const speaking = !this.voice.muted && (this.voiceMode() === "ptt" ? this.pttHeld : vad);
      self.speaking = speaking;
      setSpeaking(this.voiceRoster, self.id, speaking);
      return;
    }
    if (this.voice.muted || (this.voiceMode() === "ptt" && !this.pttHeld)) {
      self.speaking = false;
      setSpeaking(this.voiceRoster, self.id, false);
    }
  }

  private mirrorSelfFlags() {
    if (!this.voice) return;
    applyVoiceState(this.voiceRoster, {
      guildId: this.voice.guildId ?? "",
      channelId: this.voice.channelId,
      userId: this.meId(),
      name: this.me.name,
      avatarUrl: this.me.avatarUrl ?? null,
      selfMute: this.voice.muted,
      selfDeaf: this.voice.deafened,
    });
  }

  private syncCallMembers() {
    if (!this.voice) return;
    const people = participantsIn(this.voiceRoster, this.voice.guildId ?? "", this.voice.channelId);
    const volumes = new Map(this.voice.members.map((member) => [member.id, member.volume]));
    this.voice.members = people.map((person) => ({
      id: person.userId,
      name: person.name,
      speaking: person.speaking,
      volume: volumes.get(person.userId) ?? person.volume,
      avatarUrl: person.avatarUrl,
      selfMute: person.selfMute,
      selfDeaf: person.selfDeaf,
      serverMute: person.serverMute,
      serverDeaf: person.serverDeaf,
    }));
  }

  private markSpeaking(userId: string, speaking: boolean) {
    const known = Object.values(this.voiceRoster).some((person) => person.userId === userId);
    if (!known && this.voice) {
      const person = this.knownPerson(userId);
      applyVoiceState(this.voiceRoster, {
        guildId: this.voice.guildId ?? "",
        channelId: this.voice.channelId,
        userId,
        name: person?.name ?? "Someone",
        avatarUrl: person?.avatarUrl ?? null,
      });
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    }
    setSpeaking(this.voiceRoster, userId, speaking);
    const member = this.voice?.members.find((item) => item.id === userId);
    if (member) member.speaking = speaking;
    const selector = `[data-voice-user="${CSS.escape(userId)}"]`;
    for (const node of this.root.querySelectorAll(selector)) node.classList.toggle("is-speaking", speaking);
    this.publishVoiceHud();
  }

  private hydrateVoice(state: VoiceStateInput, fallbackGuild: string): VoiceStateInput {
    const known = state.userId ? this.knownPerson(state.userId) : null;
    return {
      guildId: state.guildId || fallbackGuild,
      channelId: state.channelId ?? "",
      userId: state.userId,
      name: state.name || known?.name || "",
      avatarUrl: state.avatarUrl ?? known?.avatarUrl ?? null,
      selfMute: Boolean(state.selfMute),
      selfDeaf: Boolean(state.selfDeaf),
      serverMute: Boolean(state.serverMute),
      serverDeaf: Boolean(state.serverDeaf),
    };
  }

  private knownPerson(id: string): { name: string; avatarUrl: string | null } | null {
    if (id === this.me.id || (this.demo && id === this.meId())) {
      const person = this.demo ? people.find((item) => item.id === id) : this.me;
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    if (this.demo) {
      const person = people.find((item) => item.id === id);
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    for (const bucket of Object.values(this.membersByGuild)) {
      const person = bucket.find((item) => item.id === id);
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    const name = this.userNames[id];
    return name ? { name, avatarUrl: null } : null;
  }

  private async loadAudioDevices() {
    if (this.demo || !isTauri()) return;
    try {
      const listed = await invoke<{ inputs: string[]; outputs: string[] }>("list_audio_devices");
      this.cpalInputs = listed.inputs ?? [];
      this.cpalOutputs = listed.outputs ?? [];
      if (this.voice) this.paintVoice();
      if (this.settings && this.section === "voice") this.renderSettings();
    } catch {
      this.cpalInputs = [];
      this.cpalOutputs = [];
    }
  }

  private toggleSplit() {
    if (this.splitId) {
      this.splitId = null;
    } else {
      const next = this.visibleChannels().find((channel) => channel.kind !== "voice" && channel.kind !== "category" && channel.id !== this.channelId);
      this.splitId = next?.id ?? null;
      if (this.splitId && !this.pages[this.splitId] && shouldPreload(this.gameMode)) void this.preload(this.splitId);
    }
    this.paint();
  }

  private async preload(id: string) {
    if (!shouldPreload(this.gameMode) || this.pages[id] || id === ARCHIVE) return;
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
    else if (id === "voice-hud") this.toggleVoiceOverlay();
    else if (id === "perf-overlay") this.togglePerfOverlay();
    else if (id === "game-mode") this.toggleGameMode();
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

  private gameBase(): GameBase {
    return {
      voiceMode: this.config.voice.mode,
      pttKey: this.config.shortcuts.push_to_talk,
      voiceOverlay: this.config.voice.overlay,
      perfOverlay: this.config.desktop.perf_overlay,
      gameMode: this.config.desktop.game_mode,
    };
  }

  private resolvedGame() {
    return resolveGame(this.detectedGame, this.config.games, this.gameBase());
  }

  private voiceMode(): "vad" | "ptt" {
    return this.resolvedGame().voiceMode;
  }

  private pttShortcut(): string {
    return this.resolvedGame().pttKey;
  }

  private overlayOn(): boolean {
    return this.resolvedGame().voiceOverlay;
  }

  private perfOn(): boolean {
    return this.resolvedGame().perfOverlay;
  }

  private setVoiceMode(mode: "vad" | "ptt") {
    if (this.detectedGame) {
      this.patchProfile(this.detectedGame, { ptt: mode === "ptt" });
      return;
    }
    this.config.voice.mode = mode;
    this.persist();
    this.syncGameEffects();
  }

  private patchProfile(name: string, patch: Partial<GameProfile>) {
    const clean = cleanGameName(name);
    if (!clean) return;
    const current = this.config.games[clean] ?? profileFromBase(this.gameBase());
    this.config.games = { ...this.config.games, [clean]: { ...current, ...patch } };
    this.persist();
    this.syncGameEffects();
  }

  private noteGame(name: string | null) {
    const clean = name ? cleanGameName(name) : null;
    if (clean === this.detectedGame) return;
    this.detectedGame = clean;
    this.syncGameEffects();
    if (this.settings && (this.section === "voice" || this.section === "lark")) this.renderSettings();
  }

  private syncGameEffects() {
    const next = this.resolvedGame();
    const modeChanged = next.gameMode !== this.gameMode;
    this.gameMode = next.gameMode;
    document.documentElement.classList.toggle("is-game-mode", next.gameMode);
    if (modeChanged) this.bindPolls();
    const voiceKey = `${next.voiceMode}|${next.pttKey}`;
    if (voiceKey !== this.appliedVoiceKey) {
      this.appliedVoiceKey = voiceKey;
      this.pttHeld = false;
      if (this.voice) {
        this.refreshSpeaking();
        this.pushTransmit();
        this.pushVoiceAudio();
      }
    }
    if (!next.perfOverlay) this.fpsLoop = false;
    this.armFps();
    this.publishVoiceHud();
    if (modeChanged && this.view === "app") {
      this.msgSig = "";
      this.paintMessages();
    }
  }

  private bindPolls() {
    for (const id of this.pollTimers) window.clearInterval(id);
    const mode = this.gameMode;
    this.pollTimers = [
      window.setInterval(() => {
        if (this.themeOpen || (this.settings && this.section === "appearance")) void this.applyTheme();
      }, pollInterval("theme", mode)),
      window.setInterval(() => this.tickPlugins(), pollInterval("plugins", mode)),
      window.setInterval(() => this.tickClock(), pollInterval("clock", mode)),
      window.setInterval(() => void this.detectLoad(), pollInterval("detect", mode)),
    ];
  }

  private async detectLoad() {
    if (this.demo) {
      if (this.perfOn()) this.armFps();
      return;
    }
    const detect = this.config.desktop.detect_games;
    if (!detect && this.detectedGame) this.noteGame(null);
    const watch = detect || this.perfOn() || this.config.desktop.hardware_status;
    if (!watch) return;
    if (this.perfOn()) this.armFps();
    if (!isTauri() || this.detectBusy) return;
    this.detectBusy = true;
    try {
      const snap = await invoke<{
        game?: string | null;
        cpuPercent?: number | null;
        ramUsedMb?: number | null;
        ramTotalMb?: number | null;
      }>("hardware_snapshot", { full: false });
      if (detect) this.noteGame(typeof snap.game === "string" ? snap.game : null);
      if (this.perfOn()) {
        this.perfSample = {
          ...this.perfSample,
          cpu: typeof snap.cpuPercent === "number" ? snap.cpuPercent : null,
          ramUsedMb: typeof snap.ramUsedMb === "number" ? snap.ramUsedMb : null,
          ramTotalMb: typeof snap.ramTotalMb === "number" ? snap.ramTotalMb : null,
        };
        this.publishVoiceHud();
        this.armFps();
      }
    } catch {
      // The shell refuses the read when detection, the overlay, and hardware status are all off.
    } finally {
      this.detectBusy = false;
    }
  }

  private shownPerf(): PerfSample {
    if (!this.demo) return this.perfSample;
    return {
      cpu: this.perfSample.cpu ?? 18,
      ramUsedMb: this.perfSample.ramUsedMb ?? 6_400,
      ramTotalMb: this.perfSample.ramTotalMb ?? 16_384,
      fps: this.perfSample.fps,
    };
  }

  private armFps() {
    const mode = fpsWatch(this.perfOn(), this.gameMode);
    if (mode === "off") {
      this.fpsLoop = false;
      return;
    }
    if (this.fpsLoop) return;
    this.fpsLoop = true;
    const started = performance.now();
    const step = (now: number) => {
      const next = fpsWatch(this.perfOn(), this.gameMode);
      if (next === "off") {
        this.fpsLoop = false;
        return;
      }
      this.fpsMarks = noteFpsMark(this.fpsMarks, now);
      const fps = fpsFromMarks(this.fpsMarks, now);
      if (fps !== this.perfSample.fps) {
        this.perfSample = { ...this.perfSample, fps };
        this.publishVoiceHud();
      }
      // Game Mode keeps the number, then drops the frame loop until the next poll.
      if (next === "burst" && now - started >= 1000) {
        this.fpsLoop = false;
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private togglePerfOverlay() {
    const now = Date.now();
    if (now - this.perfToggleAt < 300) return;
    this.perfToggleAt = now;
    this.setPerfOverlay(!this.perfOn(), true);
  }

  private setPerfOverlay(enabled: boolean, announce: boolean) {
    if (this.perfOn() === enabled) {
      this.publishVoiceHud();
      return;
    }
    if (this.detectedGame) this.patchProfile(this.detectedGame, { perf_overlay: enabled });
    else {
      this.config.desktop.perf_overlay = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.settings && (this.section === "voice" || this.section === "lark")) this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
    this.toast("Performance", enabled ? `On. ${hotkey} hides it.` : "Hidden.");
  }

  private toggleGameMode() {
    const now = Date.now();
    if (now - this.gameToggleAt < 300) return;
    this.gameToggleAt = now;
    this.setGameMode(!this.gameMode, true);
  }

  private setGameMode(enabled: boolean, announce: boolean) {
    if (this.detectedGame) this.patchProfile(this.detectedGame, { game_mode: enabled });
    else {
      this.config.desktop.game_mode = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.settings && (this.section === "lark" || this.section === "voice")) this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    this.toast("Game Mode", enabled ? `On. ${hotkey} turns it off.` : "Off.");
  }

  private appendGameProfiles(wrap: HTMLElement) {
    wrap.append(el("h3", "", "Game profiles"));
    wrap.append(el("p", "lede", "Each game keeps its own push-to-talk key and the defaults for Game Mode, the voice HUD, and the performance strip. They apply while that game is detected."));
    const names = Object.keys(this.config.games).sort((a, b) => a.localeCompare(b));
    if (this.detectedGame && !names.includes(this.detectedGame)) {
      wrap.append(el("p", "hint", `${this.detectedGame} is in front. Change a switch below, or here, and Lark remembers it.`));
      wrap.append(this.profileCard(this.detectedGame, profileFromBase(this.gameBase())));
    }
    if (!names.length && !this.detectedGame) {
      wrap.append(el("p", "hint", "No saved games yet. Start one, or turn on Detect games under Lark."));
    }
    for (const name of names) {
      const profile = this.config.games[name];
      if (profile) wrap.append(this.profileCard(name, profile));
    }
  }

  private profileCard(name: string, profile: GameProfile): HTMLElement {
    const card = el("div", "plugin-card");
    card.append(el("strong", "", name));
    card.append(this.toggle("Push to talk", profile.ptt, (value) => this.patchProfile(name, { ptt: value })));
    const row = el("div", "shortcut-row");
    row.append(el("span", "", "Push to talk key"));
    const button = el("button", "kbd", this.rebindingGame === name ? "Press keys" : formatShortcut(profile.ptt_key, this.platform.os));
    button.type = "button";
    button.addEventListener("click", () => {
      this.rebinding = null;
      this.rebindingGame = name;
      this.renderSettings();
    });
    row.append(button);
    card.append(row);
    card.append(this.toggle("Game Mode", profile.game_mode, (value) => this.patchProfile(name, { game_mode: value })));
    card.append(this.toggle("Voice HUD", profile.voice_overlay, (value) => this.patchProfile(name, { voice_overlay: value })));
    card.append(this.toggle("Performance overlay", profile.perf_overlay, (value) => this.patchProfile(name, { perf_overlay: value })));
    const remove = el("button", "text-button", "Forget this game");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const games = { ...this.config.games };
      delete games[name];
      this.config.games = games;
      this.persist();
      this.syncGameEffects();
      this.renderSettings();
    });
    card.append(remove);
    return card;
  }

  private voiceHudView(): VoiceHudView {
    const frame = voiceHudFrame(
      this.voiceRoster,
      this.voice
        ? {
            guildId: this.voice.guildId ?? "",
            channelId: this.voice.channelId,
            name: this.voice.name,
            status: this.voice.status,
            muted: this.voice.muted,
            deafened: this.voice.deafened,
            selfId: this.meId(),
          }
        : null,
    );
    const resolved = this.resolvedGame();
    return {
      ...frame,
      enabled: resolved.voiceOverlay && this.view === "app",
      perf: resolved.perfOverlay && this.view === "app",
      stats: this.shownPerf(),
      opacity: this.config.voice.overlay_opacity,
      clickThrough: this.config.voice.overlay_click_through,
    };
  }

  private toggleVoiceOverlay() {
    const now = Date.now();
    if (now - this.hudToggleAt < 300) return;
    this.hudToggleAt = now;
    this.setVoiceOverlay(!this.overlayOn(), true);
  }

  private setVoiceOverlay(enabled: boolean, announce: boolean) {
    if (this.overlayOn() === enabled) {
      this.publishVoiceHud();
      return;
    }
    if (this.detectedGame) this.patchProfile(this.detectedGame, { voice_overlay: enabled });
    else {
      this.config.voice.overlay = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.voice) this.paintVoice();
    if (this.settings && this.section === "voice") this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
    this.toast("Voice HUD", enabled ? `On. ${hotkey} hides it.` : "Hidden.");
  }

  private publishVoiceHud() {
    if (!this.hudEl) return;
    if (this.hudQueued) return;
    this.hudQueued = true;
    requestAnimationFrame(() => {
      this.hudQueued = false;
      this.flushVoiceHud();
    });
  }

  private flushVoiceHud() {
    if (!this.hudEl) return;
    const view = this.voiceHudView();
    const sig = JSON.stringify(view);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    if (!isTauri()) {
      this.paintHudHost(view, false);
      return;
    }
    const ticket = ++this.hudTicket;
    void invoke<boolean>("sync_voice_overlay", {
      visible: view.enabled || view.perf,
      clickThrough: view.clickThrough,
      frame: view,
    }).then((native) => {
      if (ticket !== this.hudTicket) return;
      this.paintHudHost(view, native);
    }).catch(() => {
      if (ticket !== this.hudTicket) return;
      this.paintHudHost(view, false);
    });
  }

  private paintHudHost(view: VoiceHudView, native: boolean) {
    const show = (view.enabled || view.perf) && !native;
    this.hudEl.hidden = !show;
    if (show) renderVoiceHud(this.hudEl, view);
  }

  private paintVoice() {
    if (this.holdShell) return;
    const dock = this.voiceDock;
    if (!dock) return;
    dock.hidden = !this.voice;
    clear(dock);
    if (!this.voice) {
      this.publishVoiceHud();
      return;
    }
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
    controls.append(this.voiceButton(this.overlayOn() ? "Hide HUD" : "Voice HUD", () => this.toggleVoiceOverlay()));
    controls.append(this.voiceButton(this.perfOn() ? "Hide performance" : "Performance", () => this.togglePerfOverlay()));
    controls.append(this.voiceButton(this.voiceMode() === "ptt" ? "Push to talk" : "Voice activity", () => {
      this.setVoiceMode(this.voiceMode() === "ptt" ? "vad" : "ptt");
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
    devices.append(this.deviceSelect("Microphone", this.deviceChoices(this.cpalInputs, this.config.voice.input_device), this.deviceValue(this.config.voice.input_device), (value) => {
      this.config.voice.input_device = value === "Default" ? "" : value;
      this.persist();
      this.pushVoiceAudio();
    }));
    devices.append(this.deviceSelect("Speakers", this.deviceChoices(this.cpalOutputs, this.config.voice.output_device), this.deviceValue(this.config.voice.output_device), (value) => {
      this.config.voice.output_device = value === "Default" ? "" : value;
      this.persist();
      this.pushVoiceAudio();
    }));
    dock.append(devices);
    const peopleEl = el("div", "voice-people");
    for (const member of this.voice.members) {
      const row = el("div", `voice-person${member.speaking ? " is-speaking" : ""}`);
      row.dataset.voiceUser = member.id;
      row.append(portrait(member.name, member.id, member.avatarUrl, true), el("strong", "", member.name));
      const flags = el("span", "voice-flags");
      if (member.selfDeaf || member.serverDeaf) flags.append(icon(paths.headphonesOff));
      if (member.selfMute || member.serverMute || member.selfDeaf || member.serverDeaf) flags.append(icon(paths.micOff));
      if (flags.childElementCount) row.append(flags);
      if (member.id !== this.meId()) {
        const vol = el("input");
        vol.type = "range";
        vol.min = "0";
        vol.max = "200";
        vol.value = String(member.volume);
        vol.setAttribute("aria-label", `Volume for ${member.name}`);
        vol.addEventListener("input", () => {
          member.volume = Number(vol.value);
          setVolume(this.voiceRoster, member.id, member.volume);
          if (!this.demo) void invoke("set_voice_volume", { userId: member.id, volume: member.volume }).catch(() => undefined);
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
    const game = el("button", this.config.clips.game_capture ? "text-button is-on" : "text-button", this.config.clips.game_capture ? "Game capture on" : "Game capture");
    game.type = "button";
    game.title = "Record the main display for the clip hotkey without sharing";
    game.addEventListener("click", () => {
      this.config.clips.game_capture = !this.config.clips.game_capture;
      void this.persist();
      this.paintVoice();
    });
    share.append(toggle, game);
    share.append(el("p", "hint", `Clip hotkey ${formatShortcut(this.config.shortcuts.save_clip, this.platform.os)} saves the last 30 seconds while sharing or game capture is on. The file stays on this computer.`));
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
    this.publishVoiceHud();
  }

  private voiceButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "text-button", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  private iconButton(label: string, path: string, onClick: () => void, hot: boolean): HTMLButtonElement {
    const button = el("button", hot ? "icon-button is-hot" : "icon-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  }

  private captureDevices(): { id: string; label: string }[] {
    if (this.cpalInputs.length) return this.cpalInputs.map((name) => ({ id: name, label: name }));
    return this.audioInputs;
  }

  private playbackDevices(): { id: string; label: string }[] {
    if (this.cpalOutputs.length) return this.cpalOutputs.map((name) => ({ id: name, label: name }));
    return this.audioOutputs;
  }

  private deviceChoices(listed: string[], current: string): string[] {
    const names = ["Default", ...listed.filter((name) => name && name !== "Default")];
    const chosen = current.trim();
    if (chosen && chosen !== "Default" && !names.includes(chosen)) names.push(chosen);
    return names;
  }

  private deviceValue(current: string): string {
    return current.trim() ? current : "Default";
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
    input.placeholder = this.guildId && !this.demo ? "Search this server" : "Search loaded messages";
    input.setAttribute("aria-label", "Search messages");
    const results = el("div", "switcher-results");
    let timer = 0;
    const show = (hits: RawMessage[], note: string) => {
      clear(results);
      if (!input.value.trim()) results.append(el("div", "empty", note));
      else if (!hits.length) results.append(el("div", "empty", "No matches."));
      for (const hit of hits) {
        const button = el("button", "switcher-hit");
        button.type = "button";
        button.append(el("strong", "", hit.authorName), el("span", "faint", plainPreview(hit.content, this.renderContext(), 120) || "Attachment"));
        button.addEventListener("click", () => {
          this.searchOpen = false;
          this.paintSearch();
          void this.jumpToMessage(hit.channelId, hit.id);
        });
        results.append(button);
      }
    };
    const render = () => {
      const query = input.value.trim();
      const local = this.localSearch(query);
      show(local, this.guildId && !this.demo ? "Searching Discord…" : "Type to search messages that are already loaded.");
      if (!query || this.demo || !this.guildId) return;
      window.clearTimeout(timer);
      const token = ++this.searchToken;
      timer = window.setTimeout(() => {
        void invoke<RawMessage[]>("search_messages", { guildId: this.guildId, query }).then((messages) => {
          if (token !== this.searchToken || !this.searchOpen) return;
          const hits = messages.map(normalizeMessage);
          for (const message of hits) this.absorbMessage(message);
          show(hits, "");
        }).catch(() => {
          if (token === this.searchToken) show(local, "Discord search missed. Showing loaded messages.");
        });
      }, 280);
    };
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 48);
    });
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

  private localSearch(query: string): RawMessage[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const pools = this.demo ? Object.values(history).flat() : Object.values(this.pages).flat();
    return pools.filter((message) => message.content.toLowerCase().includes(needle)).slice(0, 20);
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
    const channelId = this.channelId;
    const ids = this.demo ? demoPins[channelId] ?? [] : [];
    const cached = this.demo
      ? (this.pages[channelId] ?? history[channelId] ?? []).filter((message) => ids.includes(message.id))
      : this.pinCache[channelId] ?? [];
    const loaded = this.demo || channelId in this.pinCache;
    if (!cached.length) panel.append(el("p", "empty", loaded ? "Nothing pinned in this channel." : "Loading pins…"));
    for (const message of cached) panel.append(this.pinRow(message));
    if (!this.demo && !loaded) {
      void invoke<RawMessage[]>("fetch_pins", { channelId }).then((messages) => {
        if (this.channelId !== channelId || !this.pinsOpen) return;
        this.pinCache[channelId] = messages.map(normalizeMessage);
        for (const message of this.pinCache[channelId]) this.absorbMessage(message);
        this.paintPins();
      }).catch(() => {
        if (!panel || this.channelId !== channelId) return;
        const empty = panel.querySelector(".empty");
        if (empty) empty.textContent = "Couldn't load pins.";
      });
    }
  }

  private pinRow(message: RawMessage): HTMLButtonElement {
    const button = el("button", "bookmark-row");
    button.type = "button";
    const preview = plainPreview(message.content, this.renderContext(), 140) || "Attachment";
    button.append(el("strong", "", message.authorName), el("span", "", preview));
    button.addEventListener("click", () => {
      this.pinsOpen = false;
      this.paintPins();
      void this.jumpToMessage(message.channelId || this.channelId || "", message.id);
    });
    return button;
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
      quiet: this.gameMode,
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

  private absorbMessage(message: RawMessage) {
    if (message.authorId && message.authorName && message.authorName !== "Unknown" && !this.userNames[message.authorId]) {
      this.userNames[message.authorId] = message.authorName;
    }
    for (const mention of message.mentionUsers ?? []) {
      if (mention.id && mention.name && mention.name !== "someone" && !this.userNames[mention.id]) this.userNames[mention.id] = mention.name;
    }
  }

  private noteChannel(channel: Channel) {
    if (channel.lastMessageId) this.channelLast[channel.id] = channel.lastMessageId;
    this.refreshBehind(channel.id);
  }

  private refreshBehind(id: string) {
    this.behind[id] = id === this.channelId ? false : channelIsBehind(this.channelLast[id], this.lastRead[id]);
  }

  private ackChannel(channelId: string, messageId: string) {
    if (!channelId || !messageId) return;
    this.lastRead[channelId] = messageId;
    this.behind[channelId] = false;
    this.localUnread[channelId] = 0;
    this.localMentions[channelId] = 0;
    this.markers[channelId] = { lastMessageId: messageId, mentionCount: 0 };
    this.refreshChannelBadge(channelId);
    if (this.demo || messageId.startsWith("local-")) return;
    void invoke("ack_message", { channelId, messageId }).catch(() => undefined);
  }

  private paintNewBar() {
    if (!this.newBar) return;
    this.newBar.hidden = this.freshCount <= 0;
    this.newBar.textContent = this.freshCount > 1 ? `${this.freshCount} new messages` : "New messages";
  }

  private jumpToBottom() {
    this.freshCount = 0;
    this.nearBottom = true;
    this.pinnedToBottom = true;
    this.scroll = "bottom";
    this.msgSig = "";
    const last = this.pages[this.channelId ?? ""]?.at(-1);
    if (this.channelId && last) this.ackChannel(this.channelId, last.id);
    this.paintNewBar();
    this.paintMessages();
  }

  private async jumpToMessage(channelId: string, messageId: string) {
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
  }

  private threadsFor(parentId: string): Channel[] {
    if (!this.guildId) return [];
    return this.channelsOf(this.guildId).filter((channel) => channel.kind === "thread" && channel.parentId === parentId);
  }

  private mergeThreads(guildId: string, parentId: string, threads: Channel[]) {
    const guild = guildId || this.guildForChannel(parentId) || this.guildId;
    if (!guild || !threads.length) return;
    const existing = this.liveChannels[guild] ?? [];
    const incoming = threads.map((thread) => ({ ...thread, kind: "thread" as const, parentId: thread.parentId || parentId || null }));
    const ids = new Set(incoming.map((thread) => thread.id));
    this.liveChannels[guild] = [...existing.filter((channel) => !ids.has(channel.id)), ...incoming];
    this.msgSig = "";
    if (this.guildId === guild) this.paint();
  }

  private async loadThreads(channelId: string) {
    if (this.demo || !this.guildId) return;
    try {
      const threads = await invoke<Channel[]>("fetch_threads", { channelId });
      this.mergeThreads(this.guildId, channelId, threads.map(normalizeChannel));
    } catch {
      /* Active threads are optional. */
    }
  }

  private ensureThreadChannel(thread: { id: string; name: string }) {
    if (!this.guildId) return;
    const list = this.liveChannels[this.guildId] ?? [];
    if (list.some((channel) => channel.id === thread.id)) return;
    this.liveChannels[this.guildId] = [
      ...list,
      { id: thread.id, name: thread.name, kind: "thread", parentId: this.channelId, position: 0 },
    ];
  }

  private forumBoard(channelId: string): HTMLElement | null {
    const channel = this.currentChannel();
    if (!channel || channel.kind !== "forum" || channel.id !== channelId) return null;
    const board = el("div", "forum-board");
    board.append(el("h3", "", "Posts"));
    const threads = this.threadsFor(channelId);
    if (!threads.length) board.append(el("p", "empty", "No active posts in this forum."));
    for (const thread of threads) {
      const button = el("button", "forum-post", thread.name);
      button.type = "button";
      button.addEventListener("click", () => void this.openChannel(thread.id));
      board.append(button);
    }
    return board;
  }

  private async ensureEmojis() {
    const guildId = this.guildId;
    if (!guildId || this.demo || this.guildEmojis[guildId]) return;
    this.guildEmojis[guildId] = [];
    try {
      const list = await invoke<{ id: string; name: string; animated: boolean }[]>("fetch_emojis", { guildId });
      this.guildEmojis[guildId] = list;
      this.msgSig = "";
      if (this.pickerFor === "composer") this.paintComposer();
      else if (this.pickerFor) this.paintMessages();
    } catch {
      /* Unicode reactions still work when the emoji list is refused. */
    }
  }

  private emojiPicker(onPick: (emoji: string, emojiId?: string | null, animated?: boolean, name?: string) => void): HTMLElement {
    const picker = el("div", "picker");
    const input = el("input");
    input.placeholder = "Find emoji";
    input.setAttribute("aria-label", "Find emoji");
    input.value = this.emojiQuery;
    const unicode = el("div", "picker-row");
    const custom = el("div", "picker-row");
    const fill = (query: string) => {
      clear(unicode);
      clear(custom);
      const needle = query.trim().toLowerCase();
      const ranked = frecency(this.emojiUses, Date.now()).map((item) => item.emoji).filter((emoji) => !emoji.includes(":"));
      const glyphs = [...ranked, ...EMOJI.filter((emoji) => !ranked.includes(emoji))];
      for (const emoji of glyphs) {
        const button = el("button", "icon-button", emoji);
        button.type = "button";
        button.addEventListener("click", () => onPick(emoji));
        unicode.append(button);
        if (unicode.childElementCount >= 16) break;
      }
      const server = (this.guildId ? this.guildEmojis[this.guildId] : []) ?? [];
      for (const emoji of server) {
        if (needle && !emoji.name.toLowerCase().includes(needle)) continue;
        const button = el("button", "icon-button");
        button.type = "button";
        button.title = `:${emoji.name}:`;
        const url = emojiCdnUrl(emoji.id, emoji.animated);
        if (url) {
          const img = el("img", "emoji");
          img.alt = emoji.name;
          img.src = url;
          button.append(img);
        } else button.textContent = emoji.name;
        button.addEventListener("click", () => onPick(emoji.name, emoji.id, emoji.animated, emoji.name));
        custom.append(button);
        if (custom.childElementCount >= 48) break;
      }
    };
    input.addEventListener("input", () => {
      this.emojiQuery = input.value;
      fill(input.value);
    });
    fill(this.emojiQuery);
    picker.append(input, unicode, custom);
    return picker;
  }

  private insertEmoji(emoji: string, emojiId?: string | null, animated?: boolean, name?: string) {
    const token = emojiId ? `<${animated ? "a" : ""}:${name ?? emoji}:${emojiId}>` : emoji;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, caret, caret, token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.pickerFor = null;
    this.composer.focus();
    this.paintComposer();
  }

  private refreshSuggest() {
    if (!this.suggestEl || !this.composer) return;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const query = mentionQuery(this.composer.value, caret);
    if (!query) {
      this.closeSuggest();
      return;
    }
    const key = `${query.kind}:${query.query}:${query.start}`;
    if (key !== this.suggestKey) {
      this.suggestKey = key;
      this.suggestIndex = 0;
    }
    this.suggestStart = query.start;
    this.suggest = mentionHits(query, this.renderContext());
    this.suggestEl.hidden = this.suggest.length === 0;
    clear(this.suggestEl);
    this.suggest.forEach((hit, index) => {
      const button = el("button", index === this.suggestIndex ? "is-active" : "");
      button.type = "button";
      button.append(el("span", "", hit.label), el("span", "faint", hit.hint));
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.suggestIndex = index;
        this.commitSuggest();
      });
      this.suggestEl.append(button);
    });
  }

  private commitSuggest() {
    const hit = this.suggest[this.suggestIndex];
    if (!hit) return;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, this.suggestStart, caret, hit.token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.closeSuggest();
    this.composer.focus();
  }

  private closeSuggest() {
    this.suggest = [];
    this.suggestKey = "";
    if (!this.suggestEl) return;
    this.suggestEl.hidden = true;
    clear(this.suggestEl);
  }

  private async pinMessage(message: RawMessage) {
    if (this.demo) {
      this.toast("Pinned", "Demo pins stay in the sample data.");
      return;
    }
    try {
      await invoke("pin_message", { channelId: message.channelId, messageId: message.id });
      delete this.pinCache[message.channelId];
      this.toast("Pinned", "Message pinned.");
    } catch (err) {
      this.toast("Couldn't pin", err instanceof Error ? err.message : "Discord refused the pin.");
    }
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
    void this.notify(message.authorName, plainPreview(message.content, this.renderContext()) || hit);
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
    this.tickHardware();
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

  private tickHardware() {
    if (!this.config.desktop.hardware_status) {
      if (this.hardware.enabled || this.hardware.owned) this.applyHardware(null);
      return;
    }
    this.retryHardwarePush();
    if (!isTauri() || this.demo || this.hardwareBusy || this.hardware.paused) return;
    if (!hardwareSampleDue(this.hardwareSampleAt, Date.now(), pollInterval("hardware", this.gameMode))) return;
    void this.sampleHardware(false);
  }

  private retryHardwarePush() {
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
    void invoke("set_presence", { status, custom }).then(() => {
      this.hardwarePushFailed = false;
    }, () => {
      this.hardwarePushFailed = true;
    });
  }

  private async sampleHardware(force: boolean) {
    if (!this.config.desktop.hardware_status || !isTauri() || this.demo) return;
    if (this.hardwareBusy) return;
    if (!force && !hardwareSampleDue(this.hardwareSampleAt, Date.now(), pollInterval("hardware", this.gameMode))) return;
    this.hardwareSampleAt = Date.now();
    this.hardwareBusy = true;
    this.hardwareChecking = true;
    if (this.settings && this.section === "lark") this.renderSettings();
    try {
      if (force) await invoke("save_config", { config: this.config });
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
      if (this.settings && this.section === "lark") this.renderSettings();
    }
  }

  private applyHardware(sample: { ok: boolean; line: string | null } | null) {
    const step = stepHardware({ ...this.hardware, enabled: this.config.desktop.hardware_status }, this.me.custom ?? "", sample);
    this.hardware = step.state;
    this.rememberHardware();
    if (step.custom === undefined) return;
    const status = this.presenceStatus();
    if ((this.me.custom ?? "") !== step.custom || this.me.status !== status) {
      this.setStatus(status, step.custom, "plugin");
    }
  }

  private presenceStatus(): "online" | "idle" | "dnd" | "invisible" {
    const status = this.me.status;
    if (status === "idle" || status === "dnd" || status === "invisible" || status === "online") return status;
    return "online";
  }

  private rememberHardware() {
    const saved = serializeHardwareState(this.hardware);
    if (saved) localStorage.setItem(HARDWARE_STORAGE_KEY, saved);
    else localStorage.removeItem(HARDWARE_STORAGE_KEY);
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
    if (source === "user") {
      this.hardware = noteHardwareEdit(this.hardware, custom);
      if (!custom.trim() && this.config.desktop.hardware_status) this.hardwareSampleAt = 0;
      this.rememberHardware();
    }
    const changed = this.me.status !== status || (this.me.custom ?? "") !== custom;
    this.me = { ...this.me, status, custom };
    if (source === "user" && (status === "online" || status === "idle" || status === "dnd" || status === "invisible")) {
      this.away = { ...this.away, savedStatus: status, away: status === "idle" };
    }
    if (this.demo) {
      people[0].status = status;
      people[0].custom = custom;
    } else if (changed) {
      const pending = invoke("set_presence", { status: status === "invisible" ? "invisible" : status, custom });
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

function voiceStatusLabel(status: VoiceSession["status"]): string {
  if (status === "connected") return "Voice Connected";
  if (status === "reconnecting") return "Reconnecting…";
  return "Connecting…";
}

function friendlyVoiceDetail(detail: string): string {
  const text = detail.trim();
  if (!text || text.startsWith("aead_") || text.startsWith("xsalsa20")) return "";
  return text;
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
    mentionUsers: message.mentionUsers ?? [],
    mentionRoleIds: message.mentionRoleIds ?? message.mentionRoles ?? [],
    mentionRoles: message.mentionRoles ?? message.mentionRoleIds ?? [],
    stickers: message.stickers ?? [],
    authorAvatar: message.authorAvatar ?? null,
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
