import { channelIsBehind, firstUnreadId, mergeIncoming, outgoingNonce, sameOutgoing, sameReaction, shouldGroup, typingLine } from "../chat";
import { outgoingError } from "../compose";
import { defaultConfig, sanitizeConfig } from "../config";
import { ARCHIVE, CRIT, booth, history, ME, NORTHWIND, channels as demoChannels, dms as demoDms, guilds as demoGuilds, pageMessages, people, pins as demoPins } from "../demo/data";
import { rememberEmoji, frecency, EMOJI, type EmojiUse } from "../emoji";
import { applyMention, mentionHits, mentionQuery, plainPreview, type MentionHit } from "../mentions";
import { bumpsUnread, effectiveLevel, shouldDesktopNotify } from "../notify";
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
import { isBookmarked, toggleBookmark, type Bookmark } from "../pack/bookmarks";
import { hiddenIds, toggleHidden } from "../pack/hidden";
import { allowKeywordNotify, cleanWords, firstHit, shouldKeywordNotify, wordsFor } from "../pack/keywords";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "../pack/playing";
import { formatRelative } from "../pack/relative";
import { backoff, cancelSend, queueSend, takeDue, type ScheduledSend } from "../pack/schedule";
import { defaultPack, PACK_IDS, sanitizePack, settingsFor, type PackState } from "../pack/state";
import { commandCatalog, matchCommands } from "../palette";
import { DRAFTS_PLAIN_KEY, DRAFTS_SEALED_KEY, parseDraftMap, planDraftLoad, type DraftMap } from "../drafts";
import { dmPreview, personalLine, redactBlocks, redactSensitive, streamerActive } from "../privacy";
import { addReminder, cancelReminder, reminderFor, reminderPresets, sanitizeReminders, takeDueReminders, type Reminder } from "../reminders";
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
import { bytesFromBase64, clipBehaviorNote, CLIP_FPS_OPTIONS, CLIP_RESOLUTION_OPTIONS, sanitizeClipFps, sanitizeClipResolution } from "../clip";
import {
  CLIP_DRAG,
  clipMime,
  clipAttachAction,
  compressCopy,
  demoClips,
  fitAction,
  formatClipBytes,
  formatClipDate,
  formatClipDuration,
  isClipFileName,
  limitSentence,
  parseCompressMode,
  posterFor,
  renamedClipName,
  trimRange,
  uploadLimitBytes,
  type ClipCard,
} from "../clips";
import {
  CALL_PIP_KEY,
  CALL_SPLIT_KEY,
  CALL_STRIP_KEY,
  PIP_HEIGHT,
  PIP_WIDTH,
  callChrome,
  clampPip,
  clampSplitRatio,
  dismissCallSurface,
  leadMedia,
  nearestPipCorner,
  pipAnchors,
  pipPoint,
  readPipCorner,
  readSplitRatio,
  readStripOpen,
  stripPeople,
  stripWindow,
  toggleCallHotkey,
  voiceChannelAction,
  type CallSurface,
  type PipCorner,
} from "../call-layout";
import { callBus, openCallPopout, type CallCommand, type CallFrame } from "../call-window";
import { speakColor, speakingMotion, stageTiles, voiceBadges, type RingMotion, type StageMember, type StageTile } from "../voice-stage";
import { fuzzyScore } from "../search";
import { formatShortcut, matchShortcut, shortcutConflicts, shortcutFromEvent } from "../shortcuts";
import type { AppConfig, Channel, GameProfile, Guild, NotifyLevel, Person, RawMessage, Shortcuts, SoundClip } from "../types";
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
import { activeFriends, clampNote, friendGlance } from "../social";
import { clipForHotkey, soundHotkeyIsGlobal } from "../soundboard";
import { applyUserMix, applyVoiceState, hydrateMix, participantsIn, playbackVolume, replaceGuildVoice, setSpeaking, type VoiceParticipant, type VoiceRoster, type VoiceStateInput } from "../voice";
import { voiceHudFrame, type VoiceHudView } from "../voice-hud";
import { rowEstimate, sliceWindow, spanWindow, VIRTUAL_MIN, type SpanWindow } from "../virtual";
import { clear, colorFor, el, icon, portrait, paths } from "./dom";
import {
  colorControl,
  groupedSections,
  normalizeHex,
  searchSettings,
  sectionsForQuery,
  segmentControl,
  selectControl,
  settingCard,
  settingEntries,
  settingHead,
  settingRow,
  settingsCloseButton,
  settingsPane,
  settingsSections,
  SHORTCUT_COPY,
  sliderControl,
  switchControl,
  type SettingEntry,
} from "./settings";
import { installShareSettings } from "../share-settings";
import { demoShareSources, qualityLabel, snapShareFps, snapShareHeight, streamKeyFor, type ShareSource } from "../share";
import { renderVoiceHud } from "./hud";
import { clearStreamFrames, liveBadge, mountStreamTiles, pushStreamFrame, shareDialog } from "./share-view";
import { renderCallStage, renderCallStrip, renderPipTile, signalMeter, speakWrap } from "./voice-view";
import { renderMessage } from "./messages";
import { renderProfileCard, type ProfileRole, type WireProfile } from "./profile";
import { patchSignIn, renderSignIn } from "./signin";

interface VoiceMember {
  id: string;
  name: string;
  speaking: boolean;
  volume: number;
  localMuted?: boolean;
  avatarUrl?: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
  serverMute?: boolean;
  serverDeaf?: boolean;
  video?: boolean;
  sharing?: boolean;
  streamLabel?: string;
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

interface LocalFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  url: string;
  clipName?: string;
  declaredBytes?: number;
}

interface ClipAsk {
  name: string;
  channelId: string;
  mode: "send" | "attach";
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
  private section = "appearance";
  private settingsQuery = "";
  private settingsAnchor = "";
  private settingsEntered = "";
  private rebinding: keyof Shortcuts | null = null;
  private soundBind: string | null = null;
  private notes: Record<string, string> = {};
  private clipBlobs = new Map<string, string>();
  private sentMix = new Map<string, number>();
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
  private reminders: Reminder[] = [];
  private reminding: RawMessage | null = null;
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
  private callStrip!: HTMLElement;
  private callSplit!: HTMLElement;
  private callSplitBar!: HTMLElement;
  private callHandle!: HTMLElement;
  private callPip!: HTMLElement;
  private voiceMenuEl!: HTMLElement;
  private voiceGearEl!: HTMLElement;
  private hudEl!: HTMLElement;
  private hudSig = "";
  private hudTicket = 0;
  private hudToggleAt = 0;
  private countEl: HTMLElement | null = null;
  private splitId: string | null = null;
  private voice: VoiceSession | null = null;
  private voiceRoster: VoiceRoster = {};
  private voiceEpoch = 0;
  private callSurface: CallSurface = "chat";
  private stripOpen = false;
  private pipCorner: PipCorner = "bottom-right";
  private splitRatio = 0.42;
  private pipDrag = false;
  private callPopout: Window | null = null;
  private callBus: BroadcastChannel | null = null;
  private cameraOn = false;
  private gearOpen = false;
  private activitiesOpen = false;
  private voiceMenu: { userId: string; x: number; y: number } | null = null;
  private cpalInputs: string[] = [];
  private cpalOutputs: string[] = [];
  private shareOn = false;
  private sharePaused = false;
  private shareUserPaused = false;
  private shareHeld = false;
  private shareNote = "";
  private shareDialogOpen = false;
  private shareQualityOpen = false;
  private shareSources: ShareSource[] = [];
  private sharePick = "screen:0";
  private shareWatching = "";
  private pipUser = "";
  private shareLiveHeight = 1080;
  private shareLiveFps = 30;
  private shareLayer!: HTMLElement;
  private pendingClip: { name: string; path: string; bytes: number; spanMs: number } | null = null;
  private clipNotice = "";
  private clipsOpen = false;
  private clipItems: ClipCard[] = [];
  private clipStamp = "";
  private clipAsk: ClipAsk | null = null;
  private clipPlayer: string | null = null;
  private clipTrim: string | null = null;
  private clipSendFor: string | null = null;
  private clipRename: string | null = null;
  private clipProgress: { name: string; percent: number } | null = null;
  private premiumType = 0;
  private clipDialog!: HTMLElement;
  private clipStatus: {
    recording: boolean;
    spanMs: number;
    dir: string;
    backend: string;
    error: string;
    hotkeyError: string;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    capNote?: string;
  } | null = null;
  private pttHeld = false;
  private recent: string[] = [];
  private drafts: DraftMap = {};
  private draftTicket = 0;
  private draftsReady = false;
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
  private folderSync: FolderSync | null = null;
  private folderMenuEl: HTMLElement | null = null;
  private suppressRailClick = false;
  private railIntent: DropIntent | null = null;
  private railDrag: { pointerId: number; kind: "guild" | "folder"; id: string; x: number; y: number; moved: boolean } | null = null;
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
    installShareSettings();
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
    const params = new URLSearchParams(location.search);
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
        if (Array.isArray(messages)) this.pages[id] = messages.slice(-80);
      }
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
    await this.loadPlugins();
    await this.applyTheme();
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
    chat.append(this.chatHead, this.callStrip, this.callSplit, this.callHandle, this.messagesEl, this.typingEl, composerWrap, this.newBar);
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
    this.hudEl = el("div", "voice-hud-host");
    this.hudEl.hidden = true;
    this.voiceMenuEl = el("div", "voice-menu");
    this.voiceMenuEl.hidden = true;
    this.voiceGearEl = el("div", "voice-gear");
    this.voiceGearEl.hidden = true;
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
    this.root.append(this.gate, this.shell, this.switcherEl, this.settingsEl, this.clipDialog, this.lightboxEl, this.inviteEl, this.hudEl, this.callPip, this.shareLayer, this.voiceMenuEl, this.voiceGearEl, this.toastWrap, this.splashEl);
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
      const dragged = event.dataTransfer?.getData(CLIP_DRAG) || "";
      const plain = event.dataTransfer?.getData("text/plain") || "";
      const name = dragged || (isClipFileName(plain) ? plain : "");
      if (name) {
        void this.attachClipByName(name);
        return;
      }
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
    this.notes["100000000000000002"] = "Prefers the booth quiet.";
    for (const person of people) {
      this.directory[person.id] = person;
      this.userNames[person.id] = person.name;
    }
    const shareMode = new URLSearchParams(location.search).get("share");
    this.seedDemoVoice(shareMode === "live");
    const named = cleanGameName(new URLSearchParams(location.search).get("game") ?? "");
    if (named && this.config.desktop.detect_games) this.noteGame(named);
    this.paint();
    const openClips = new URLSearchParams(location.search).has("clips");
    void this.openChannel(CRIT).then(() => {
      if (openClips) this.openClips();
      if (shareMode === "dialog" || shareMode === "live") this.openDemoShare(shareMode);
    });
  }

  private seedDemoVoice(sharing = false) {
    const channelId = demoChannels[NORTHWIND].find((channel) => channel.kind === "voice")?.id;
    if (!channelId) return;
    replaceGuildVoice(this.voiceRoster, NORTHWIND, [
      { guildId: NORTHWIND, channelId, userId: booth[0].id, name: booth[0].name },
      { guildId: NORTHWIND, channelId, userId: booth[1].id, name: booth[1].name, selfMute: true, ...(sharing ? { selfStream: true } : {}) },
    ]);
    setSpeaking(this.voiceRoster, booth[0].id, true);
    hydrateMix(this.voiceRoster, this.config.voice.levels);
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
    this.paintClipDialog();
    this.paintLightbox();
    this.paintBookmarks();
    this.paintInvite();
    this.publishVoiceHud();
    if (!this.splashLeaving) this.splashEl.hidden = true;
  }

  private applyAppearance() {
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
    const rail = appearance.show_server_rail ? "72px" : "0px";
    const channelW = appearance.channel_list === "hidden" ? "0px" : "240px";
    const dmSidebar = !this.guildId && !this.friendsOpen && this.currentChannelIsDm();
    const members = appearance.show_member_list && !this.narrow && (this.guildId || dmSidebar) ? "240px" : "0px";
    this.rail.hidden = !appearance.show_server_rail;
    this.channelPane.hidden = appearance.channel_list === "hidden" && !this.drawer;
    this.membersEl.hidden = members === "0px";
    const callSplit = this.callSurface === "split";
    if (this.stage) {
      this.stage.classList.toggle("is-split", Boolean(this.splitId) && !this.narrow && !callSplit);
      this.splitPane.hidden = !this.splitId || this.narrow || callSplit;
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
    const folders = this.folders.map((folder) => `${folder.id ?? ""}:${folder.name ?? ""}:${folder.color ?? ""}:${folder.id ? this.folderOpen[folder.id] !== false : true}:${folder.guildIds.join(".")}`).join(";");
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
    button.addEventListener("click", (event) => {
      if (this.consumeRailClick(event)) return;
      this.folderOpen[entry.id] = !open;
      localStorage.setItem("lark.folders.v1", JSON.stringify(this.folderOpen));
      this.paintRail();
    });
    wrap.append(button);
    if (open) {
      for (const guildId of entry.guildIds) this.appendServerButton(wrap, guildId, entry.id);
    }
    parent.append(wrap);
  }

  private appendServerButton(parent: HTMLElement, guildId: string, folderId: string | null) {
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
  }

  private ensureFolderSync(): FolderSync {
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
  }

  private consumeRailClick(event: Event): boolean {
    if (!this.suppressRailClick) return false;
    this.suppressRailClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private commitFolders(next: GuildFolder[]) {
    if (foldersKey(next) === foldersKey(this.folders)) return;
    const structural = folderStructureKey(next) !== folderStructureKey(this.folders);
    this.folders = next;
    if (!structural && this.rail.querySelector("[data-guild]")) {
      this.railShape = this.railShapeSig();
      this.patchFolderLabels();
    } else this.paintRail();
    if (this.demo) return;
    this.ensureFolderSync().edit(next);
  }

  private patchFolderLabels() {
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
  }

  private onRailPointerDown(event: PointerEvent) {
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
  }

  private onRailPointerMove(event: PointerEvent) {
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
  }

  private onRailPointerUp(event: PointerEvent) {
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
  }

  private railHits(): RailHit[] {
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
  }

  private cueRail(clientY: number) {
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
  }

  private dropEdge(intent: DropIntent, hits: RailHit[], scroll: HTMLElement): number | null {
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
  }

  private ensureDropLine(scroll: HTMLElement): HTMLElement {
    let line = scroll.querySelector<HTMLElement>(".rail-drop-line");
    if (!line) {
      line = el("div", "rail-drop-line");
      line.setAttribute("aria-hidden", "true");
      scroll.append(line);
    }
    return line;
  }

  private clearRailCue() {
    this.rail.classList.remove("is-reordering");
    this.rail.querySelectorAll(".is-drop-target, .is-dragging").forEach((node) => node.classList.remove("is-drop-target", "is-dragging"));
    this.rail.querySelector(".rail-drop-line")?.remove();
  }

  private onRailContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-folder]");
    const folderId = button?.dataset.folder;
    if (!folderId) return;
    event.preventDefault();
    this.openFolderMenu(folderId, event.clientX, event.clientY);
  }

  private openFolderMenu(folderId: string, x: number, y: number) {
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
    menu.append(el("p", "folder-menu-label", "Folder"), input, colors);
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 232))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 140))}px`;
    document.body.append(menu);
    this.folderMenuEl = menu;
    input.focus();
    input.select();
  }

  private closeFolderMenu() {
    this.folderMenuEl?.remove();
    this.folderMenuEl = null;
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
        ? participantsIn(this.voiceRoster, this.guildId, channel.id).map((person) => {
            const flags = voiceBadges(person);
            return `${person.userId}${flags.muted ? "m" : ""}${flags.deafened ? "d" : ""}`;
          }).join(".")
        : "";
      const muted = this.levelFor(this.guildId && channel.kind !== "dm" && channel.kind !== "group" ? this.guildId : null, channel.id) === "mute" ? "m" : "";
      const collapsed = this.collapsedCats.has(channel.id) ? "c" : "";
      const direct = !this.guildId && (channel.kind === "dm" || channel.kind === "group");
      const preview = direct ? this.dmPreviewLabel(channel.id) : "";
      const activity = direct ? this.dmActivityLabel(channel) : "";
      return `${channel.id}:${channel.name}:${channel.kind}:${channel.parentId ?? ""}:${channel.position}:${muted}:${collapsed}:${voice}:${preview}:${activity}`;
    });
    const me = this.demo ? people[0] : this.me;
    return `${this.guildId ?? ""}|${this.friendsOpen ? 1 : 0}|${this.clipsOpen ? 1 : 0}|${this.streamerOn() ? 1 : 0}|${me.id}|${me.name}|${this.voice?.channelId ?? ""}|${this.voice?.status ?? ""}|${this.voice?.muted ? 1 : 0}|${this.voice?.deafened ? 1 : 0}|${this.shareOn ? 1 : 0}|${this.stripOpen ? 1 : 0}|${bits.join(",")}`;
  }

  private patchChannelRows() {
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
      friends.classList.toggle("is-selected", this.friendsOpen && !this.channelId && !this.clipsOpen);
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      this.setBadge(friends, online);
    }
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
  }

  private clipsNavButton(): HTMLButtonElement {
    const clips = el("button", `channel-row${this.clipsOpen ? " is-selected" : ""}`);
    clips.type = "button";
    clips.dataset.clips = "1";
    clips.append(icon(paths.film), el("span", "row-label", "Clips"));
    clips.addEventListener("click", () => this.openClips());
    return clips;
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
        this.returnToChat();
        this.channelId = "";
        this.drawer = false;
        this.msgSig = "";
        this.paint();
      });
      scroll.append(friends, this.clipsNavButton(), el("div", "category", "Direct messages"));
      const dms = [...this.dms()].sort((a, b) => a.position - b.position);
      if (!dms.length) scroll.append(el("p", "empty", "No direct messages yet."));
      for (const dm of dms) scroll.append(this.channelButton(dm, true));
    } else {
      scroll.append(this.clipsNavButton());
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

  private channelSelected(id: string): boolean {
    if (this.friendsOpen || this.clipsOpen) return false;
    return id === this.channelId;
  }

  private voiceUserRow(person: VoiceParticipant): HTMLElement {
    const badges = voiceBadges(person);
    const row = el("div", `voice-user${badges.speaking ? " is-speaking" : ""}`);
    row.dataset.voiceUser = person.userId;
    row.append(speakWrap(portrait(person.name, person.userId, person.avatarUrl, true), this.ringMotion()));
    row.append(el("span", "voice-user-name", person.name));
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
  }

  private voicePanel(): HTMLElement {
    const session = this.voice;
    const status = session?.status ?? "connecting";
    const panel = el("section", "voice-panel");
    const audible = status === "connected" ? "Voice connected" : status === "reconnecting" ? "Reconnecting" : "Connecting";
    panel.setAttribute("aria-label", `${audible}, ${session?.name ?? "Voice"}`);
    const line = el("div", "voice-panel-line");
    line.append(signalMeter(status), el("strong", "voice-panel-name", session?.name ?? "Voice"));
    if (this.shareOn) line.append(liveBadge(this.sharePaused));
    const actions = el("div", "voice-panel-actions");
    const share = this.iconButton(this.shareOn ? "Stop sharing" : "Share your screen", paths.monitor, () => this.toggleShare(), false);
    if (this.shareOn) share.classList.add("is-live");
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
      this.iconButton(session?.muted ? "Unmute" : "Mute", session?.muted ? paths.micOff : paths.mic, () => this.toggleMute(), Boolean(session?.muted)),
      this.iconButton(session?.deafened ? "Undeafen" : "Deafen", session?.deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), Boolean(session?.deafened)),
      hangup,
      el("span", "spacer"),
      strip,
    );
    panel.append(line, actions);
    return panel;
  }

  private channelButton(channel: Channel, dm: boolean): HTMLButtonElement {
    const muted = this.levelFor(dm ? null : this.guildId, channel.id) === "mute";
    const unreadCount = this.unread[channel.id] ?? 0;
    const mentions = this.mentions[channel.id] ?? 0;
    const unread = unreadCount > 0 || mentions > 0;
    const quiet = !unread && Boolean(this.behind[channel.id]);
    const joined = channel.kind === "voice" && this.voice?.channelId === channel.id;
    const button = el("button", `${dm ? "dm-row" : "channel-row"}${channel.kind === "thread" ? " is-thread" : ""}${this.channelSelected(channel.id) ? " is-selected" : ""}${unread || quiet ? " is-unread" : ""}${muted ? " is-muted" : ""}${channel.kind === "voice" ? " is-voice" : ""}${joined ? " is-joined" : ""}`);
    button.type = "button";
    button.dataset.channel = channel.id;
    let known: Person | undefined;
    if (!dm) button.append(icon(channel.kind === "voice" ? paths.volume : channel.kind === "announcement" ? paths.bell : paths.hash));
    else {
      const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
      if (recipient) button.dataset.user = recipient.id;
      known = recipient ? this.directory[recipient.id] : undefined;
      const wrap = el("div", "avatar-wrap");
      wrap.append(
        portrait(known?.name || recipient?.name || channel.name, recipient?.id || channel.id, known?.avatarUrl || recipient?.avatarUrl, true),
        channel.kind === "dm" ? el("i", `status ${known?.status ?? "offline"}`) : el("i"),
      );
      button.append(wrap);
    }
    const label = el("span", "row-copy");
    label.append(el("span", "row-label", dm ? this.maskText(channel.name) : channel.name));
    if (dm && known) {
      const activity = friendGlance(known).activity;
      if (activity) label.append(el("span", "dm-activity", this.maskText(activity)));
    }
    if (dm) {
      const preview = this.dmPreviewLabel(channel.id);
      if (preview) label.append(el("span", "dm-preview", preview));
    }
    button.append(label);
    if (muted) button.append(el("span", "faint", "muted"));
    else if (mentions > 0) button.append(el("span", "badge", String(mentions)));
    button.addEventListener("click", () => {
      this.drawer = false;
      if (channel.kind === "voice") {
        this.onVoiceChannel(channel);
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
    this.clipsOpen = false;
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
    const heading = this.clipsOpen
      ? "Clips"
      : this.friendsOpen && !this.guildId ? "Friends" : channel ? (channel.kind === "dm" || channel.kind === "group" ? this.maskText(channel.name) : `# ${channel.name}`) : "Lark";
    row.append(el("h2", "", heading));
    if (this.demo) row.append(el("span", "demo-pill", "Demo"));
    if (this.streamerOn()) row.append(el("span", "demo-pill", "Streamer"));
    title.append(row);
    if (channel?.topic) title.append(el("div", "topic", this.maskText(channel.topic)));
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
    const saved = el("button", "text-button");
    saved.type = "button";
    saved.textContent = "Saved";
    saved.setAttribute("aria-label", "Saved messages");
    saved.addEventListener("click", () => {
      this.bookmarksOpen = !this.bookmarksOpen;
      this.paintBookmarks();
    });
    const headerButtons = [search, find, pin, saved, split, theme, members, bell];
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
      const shown = this.presentView(view);
      const day = new Date(message.timestamp).toDateString();
      const grouped = shouldGroup(previous, message, day === lastDay);
      const node = renderMessage(shown, {
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
        ...this.messageChrome(message, shown),
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
    if (this.clipsOpen) {
      this.paintClipLibrary();
      return;
    }
    if (this.friendsOpen && !this.guildId) {
      this.paintFriends();
      return;
    }
    this.paintTyping();
    const id = this.channelId;
    let list = id ? this.pages[id] ?? [] : [];
    if (id && list.length) list = this.windowMessages(id, list);
    const pluginStamp = `${this.pack.bookmarks.length}:${this.reminders.length}:${this.streamerOn() ? 1 : 0}:${this.pack.hiddenAuthors.length}:${Object.keys(this.translated).length}:${this.hookOn("relativeTime") ? Math.floor(this.clock / 30_000) : 0}:${this.pack.mediaCompact}:${this.pack.mediaPreviews}:${this.config.plugins.enabled.join(",")}`;
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
    const noteSig = Object.entries(this.notes).map(([id, note]) => `${id}:${note}`).join(",");
    const sig = `friends|${this.streamerOn() ? 1 : 0}|${this.friends.map((person) => `${person.id}:${person.status}:${person.custom}:${person.activity}`).join(",")}|${noteSig}`;
    if (sig === this.msgSig) return;
    this.msgSig = sig;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    const board = el("div", "friends-board");
    const roster = sortPeople(this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends);
    if (!roster.length) {
      board.append(el("p", "empty", "Friends show up here once Discord sends them. Direct messages stay in the list on the left."));
    }
    const active = activeFriends(roster);
    if (active.length) {
      const strip = el("section", "friend-glance");
      strip.append(el("h3", "member-group", "Active now"));
      const row = el("div", "friend-glance-row");
      for (const person of active) {
        const chip = el("button", "friend-chip");
        chip.type = "button";
        chip.append(el("strong", "", this.maskText(person.name)), el("span", "", this.maskText(friendGlance(person).activity)));
        chip.addEventListener("click", () => this.openProfile(person));
        row.append(chip);
      }
      strip.append(row);
      board.append(strip);
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
        const line = this.maskText(friendGlance(person).line || memberSubtitle(person) || statusLabel(person.status));
        copy.append(el("strong", "", this.maskText(person.name)), el("span", "", line));
        const note = this.notes[person.id];
        if (note) copy.append(el("span", "friend-note", this.maskText(note)));
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
      const line = this.maskText(memberSubtitle(person));
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
    const line = this.maskText(memberSubtitle(person));
    copy.append(title);
    if (line) copy.append(el("span", "", line));
    row.append(wrap, copy);
    row.addEventListener("click", () => this.openProfile(person));
    return row;
  }

  private paintComposer() {
    if (this.holdShell) return;
    const wrap = this.composer.closest(".composer-wrap");
    if (wrap instanceof HTMLElement) wrap.hidden = this.friendsOpen && !this.guildId && !this.clipsOpen;
    const channel = this.currentChannel();
    this.composer.placeholder = this.clipsOpen
      ? "Drop a clip here, or write a message"
      : channel
        ? `Message ${channel.kind === "text" ? "#" : ""}${channel.name}`
        : "Message";
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
    } else if (this.reminding) {
      this.paintReminderBanner();
    } else if (this.reply) {
      this.composerBanner.hidden = false;
      const preview = this.maskText(plainPreview(this.reply.content, this.renderContext(), 80));
      const author = this.maskText(this.reply.authorName);
      this.composerBanner.append(el("span", "", preview ? `Replying to ${author}: ${preview}` : `Replying to ${author}`));
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.reply = null;
        this.paintComposer();
      });
      this.composerBanner.append(cancel);
    }
    if (!this.pendingDelete && !this.editing && !this.reminding) {
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
    const later = el("button", "text-button", "Later");
    later.type = "button";
    later.setAttribute("aria-label", "Send later");
    later.addEventListener("click", () => {
      this.scheduling = !this.scheduling;
      this.reminding = null;
      this.paintComposer();
    });
    tools.append(later);
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

  private fileBytes(file: LocalFile): number {
    return file.declaredBytes ?? file.bytes.byteLength;
  }

  private async send() {
    const id = this.channelId;
    if (!id) return;
    const ready = await this.prepareOutgoingFiles();
    if (!ready) return;
    const content = this.composer.value;
    const error = outgoingError(content, this.files.length, this.files.reduce((sum, file) => sum + this.fileBytes(file), 0), uploadLimitBytes(this.premiumType));
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
      const localId = outgoingNonce();
      const message: RawMessage = {
        id: localId,
        nonce: localId,
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
          size: this.fileBytes(file),
        })),
      };
      this.storeEcho(id, message);
      this.scroll = "bottom";
      this.pinnedToBottom = true;
      this.paintMessages();
      if (!this.demo) {
        try {
          const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
            channelId: id,
            content,
            replyTo: this.reply?.id ?? null,
            nonce: localId,
            files: this.files.map((file) => ({ name: file.name, mime: file.mime, bytes: Array.from(file.bytes) })),
          }));
          this.storeEcho(id, { ...sent, nonce: sent.nonce || localId });
          this.absorbMessage(sent);
          this.ackChannel(id, sent.id);
          this.msgSig = "";
        } catch (err) {
          if ((this.pages[id] ?? []).some((item) => item.id === localId)) {
            this.dropEcho(id, localId);
            this.msgSig = "";
            this.paint();
            this.toast("Couldn't send", err instanceof Error ? err.message : "Discord refused the message.");
            return;
          }
          this.msgSig = "";
        }
      }
      this.reply = null;
    }
    this.composer.value = "";
    if (id) delete this.drafts[id];
    void this.writeDrafts();
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
    const opening = !this.settings;
    this.settings = true;
    this.settingsEl.hidden = false;
    if (opening) this.settingsEl.classList.remove("is-in");
    this.renderSettings();
    if (opening) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.settings) this.settingsEl.classList.add("is-in");
        });
      });
      this.settingsEl.querySelector<HTMLInputElement>("[data-settings-search]")?.focus();
    }
    this.afterSettingsSection();
  }

  private closeSettings() {
    if (!this.settings) return;
    this.settings = false;
    this.rebinding = null;
    this.settingsQuery = "";
    this.settingsAnchor = "";
    this.settingsEntered = "";
    this.settingsEl.classList.remove("is-in");
    window.setTimeout(() => {
      if (!this.settings) this.settingsEl.hidden = true;
    }, 160);
    this.paint();
  }

  private settingsIndex(): SettingEntry[] {
    return settingEntries(this.catalog.map((plugin) => ({
      id: `plugin.${plugin.id}`,
      section: "plugins",
      label: plugin.name,
      description: plugin.description,
    })));
  }

  private afterSettingsSection() {
    if (!this.settings) return;
    if (this.section === "appearance") void this.refreshThemeIndex();
    if (this.section === "clips") {
      void this.pullClipStatus().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
      void this.loadClips().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
    }
  }

  private renderSettings() {
    const query = this.settingsQuery;
    const index = this.settingsIndex();
    const visible = sectionsForQuery(query, settingsSections(), index);
    if (query.trim() && visible.length && !visible.some((item) => item.id === this.section)) {
      this.section = visible[0].id;
    }
    const previousTop = this.settingsEl.querySelector(".settings-body")?.scrollTop ?? 0;
    const sameSection = this.settingsEntered === this.section;
    const anchor = this.settingsAnchor;
    clear(this.settingsEl);

    const sidebar = el("aside", "settings-sidebar");
    const searchLabel = el("label", "settings-search");
    const search = el("input");
    search.type = "search";
    search.placeholder = "Search";
    search.value = query;
    search.spellcheck = false;
    search.setAttribute("aria-label", "Search settings");
    search.dataset.settingsSearch = "1";
    search.addEventListener("input", () => {
      const before = this.section;
      this.settingsQuery = search.value;
      const caret = search.selectionStart ?? search.value.length;
      this.renderSettings();
      if (this.section !== before) this.afterSettingsSection();
      const next = this.settingsEl.querySelector<HTMLInputElement>("[data-settings-search]");
      if (!next) return;
      next.focus();
      next.setSelectionRange(caret, caret);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const hit = searchSettings(this.settingsQuery, settingsSections(), this.settingsIndex())[0];
      if (!hit) return;
      event.preventDefault();
      const before = this.section;
      this.section = hit.section;
      this.settingsAnchor = hit.kind === "setting" ? hit.id : "";
      this.renderSettings();
      if (this.section !== before) this.afterSettingsSection();
    });
    searchLabel.append(search);
    sidebar.append(searchLabel);

    const navScroll = el("div", "settings-nav-scroll");
    const nav = el("nav", "settings-nav");
    nav.setAttribute("aria-label", "Settings categories");
    if (query.trim()) {
      const hits = searchSettings(query, settingsSections(), index);
      if (!hits.length) nav.append(el("p", "settings-empty", "No settings match that."));
      for (const hit of hits) {
        const button = el("button", "settings-hit");
        button.type = "button";
        const section = settingsSections().find((item) => item.id === hit.section);
        button.append(el("strong", "", hit.label));
        button.append(el("span", "", hit.kind === "section" ? "Category" : (section?.label ?? "")));
        button.addEventListener("click", () => {
          const before = this.section;
          this.section = hit.section;
          this.settingsAnchor = hit.kind === "setting" ? hit.id : "";
          this.renderSettings();
          if (this.section !== before) this.afterSettingsSection();
        });
        nav.append(button);
      }
    } else {
      for (const group of groupedSections(visible)) {
        const block = el("div", "settings-group");
        block.append(el("h2", "settings-group-label", group.label));
        for (const item of group.sections) {
          const button = el("button", this.section === item.id ? "settings-link is-on" : "settings-link", item.label);
          button.type = "button";
          button.setAttribute("aria-current", this.section === item.id ? "true" : "false");
          button.addEventListener("click", () => {
            if (this.section === item.id) return;
            this.section = item.id;
            this.settingsAnchor = "";
            this.renderSettings();
            this.afterSettingsSection();
          });
          block.append(button);
        }
        nav.append(block);
      }
    }
    navScroll.append(nav);
    sidebar.append(navScroll);

    const stage = el("div", "settings-stage");
    const body = el("div", "settings-body");
    const content = el("div", sameSection ? "settings-content" : "settings-content is-entering");
    this.settingsEntered = this.section;
    content.append(this.settingsPane());
    this.markSettingHits(content);
    body.append(content);
    const closeWrap = el("div", "settings-close-wrap");
    closeWrap.append(settingsCloseButton(() => this.closeSettings()));
    stage.append(body, closeWrap);
    this.settingsEl.append(sidebar, stage);
    if (anchor) {
      const target = content.querySelector<HTMLElement>(`[data-setting="${CSS.escape(anchor)}"]`);
      if (target) {
        target.classList.add("is-anchor");
        target.scrollIntoView({ block: "center" });
      }
      this.settingsAnchor = "";
    } else if (sameSection) {
      body.scrollTop = previousTop;
    }
  }

  private markSettingHits(root: HTMLElement) {
    const query = this.settingsQuery.trim();
    if (!query) return;
    const ids = new Set(
      searchSettings(query, settingsSections(), this.settingsIndex())
        .filter((hit) => hit.kind === "setting")
        .map((hit) => hit.id),
    );
    for (const node of root.querySelectorAll<HTMLElement>("[data-setting]")) {
      if (ids.has(node.dataset.setting ?? "")) node.classList.add("is-hit");
    }
  }

  private settingsPane(): HTMLElement {
    switch (this.section) {
      case "account": return this.paneAccount();
      case "appearance": return this.paneAppearance();
      case "notifications": return this.paneNotifications();
      case "shortcuts": return this.paneShortcuts();
      case "window": return this.paneWindow();
      case "voice": return this.paneVoice();
      case "messages": return this.paneMessages();
      case "privacy": return this.panePrivacy();
      case "clips": return this.paneClips();
      case "gaming": return this.paneGaming();
      case "plugins":
      case "lark":
        return this.panePlugins();
      default: {
        const extra = settingsPane(this.section);
        if (extra) return extra();
        const known = settingsSections().find((item) => item.id === this.section);
        const wrap = el("div", "settings-stack");
        wrap.append(settingHead(known?.label ?? "Settings", known?.description ?? "This page has no controls yet."));
        return wrap;
      }
    }
  }

  private paneAccount(): HTMLElement {
    const me = this.demo ? people[0] : this.me;
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("My Account", "Name, avatar, and id come from Discord. Lark does not edit them. The token never goes in the config file, logs, or a plugin."));
    const who = settingCard();
    who.append(el("div", "account-banner"));
    const body = el("div", "account-body");
    body.append(portrait(me.name, me.id, me.avatarUrl));
    const copy = el("div");
    copy.append(el("strong", "", this.maskText(me.name)));
    copy.append(el("div", "hint", this.maskText(me.custom || statusLabel(me.status))));
    copy.append(el("div", "hint", personalLine(me.id, this.streamerOn())));
    body.append(copy);
    who.append(body);
    const session = settingCard("Session");
    session.dataset.setting = "account.session";
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "macOS Keychain", "~/Library/Application Support/dev.lark.desktop"));
    grid.append(this.platformCard("Windows", "Windows Credential Manager", "%APPDATA%\\dev.lark.desktop"));
    session.append(grid);
    session.append(el("p", "setting-help", `This session: ${this.platform.credentialStore}. Config folder: ${this.platform.configDir}`));
    if (isTauri()) {
      const forget = el("button", "ghost", "Forget token");
      forget.type = "button";
      forget.addEventListener("click", () => void this.forgetToken());
      const actions = el("div", "settings-actions");
      actions.append(forget);
      session.append(actions);
    }
    wrap.append(who, session);
    return wrap;
  }

  private paneAppearance(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Appearance", "Each card is that theme's own colours. One click applies it."));
    const themes = settingCard("Themes");
    themes.dataset.setting = "appearance.theme";
    const filter = el("input", "theme-filter");
    filter.type = "search";
    filter.placeholder = "Filter themes";
    filter.value = this.themeFilter;
    filter.setAttribute("aria-label", "Filter themes");
    filter.addEventListener("input", () => {
      this.themeFilter = filter.value;
      this.paintThemeGallery();
    });
    const grid = el("div", "theme-gallery");
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
    themes.append(filter, grid, actions);
    themes.append(el("p", "setting-help", "CSS and JSON carry the same colours. Frosted uses the system material on macOS and Windows, and stays opaque elsewhere. Themes do not blur or animate the message list."));
    const text = settingCard("Text");
    text.append(this.segmentRow(
      "appearance.font",
      "Font",
      "The face used for messages and the chrome.",
      ["inter", "system", "serif", "mono"],
      { inter: "Inter", system: "System", serif: "Serif", mono: "Mono" },
      this.config.appearance.font_family,
      (value) => {
        this.config.appearance.font_family = value as AppConfig["appearance"]["font_family"];
        this.persist();
        this.paint();
      },
    ));
    text.append(this.sliderRow("appearance.size", "Font size", "Interface size, from 12 to 20.", this.config.appearance.font_size, 12, 20, (value) => {
      this.config.appearance.font_size = value;
      this.persist();
      this.applyAppearance();
    }));
    const display = settingCard("Display");
    display.append(this.segmentRow(
      "appearance.density",
      "Density",
      "How tightly messages sit.",
      ["cozy", "compact", "irc"],
      { cozy: "Cozy", compact: "Compact", irc: "IRC" },
      this.config.appearance.density,
      (value) => {
        this.config.appearance.density = value as AppConfig["appearance"]["density"];
        this.persist();
        this.msgSig = "";
        this.paint();
      },
    ));
    display.append(this.segmentRow(
      "appearance.channels",
      "Channel list",
      "Which side the channel list uses, or hide it.",
      ["left", "right", "hidden"],
      { left: "Left", right: "Right", hidden: "Hidden" },
      this.config.appearance.channel_list,
      (value) => {
        this.config.appearance.channel_list = value as AppConfig["appearance"]["channel_list"];
        this.persist();
        this.paint();
      },
    ));
    display.append(this.switchRow("appearance.members", "Member list", "Show the member list beside the chat.", this.config.appearance.show_member_list, (value) => {
      this.config.appearance.show_member_list = value;
      this.persist();
      this.paint();
    }));
    display.append(this.switchRow("appearance.rail", "Server rail", "Show the server icons along the left edge.", this.config.appearance.show_server_rail, (value) => {
      this.config.appearance.show_server_rail = value;
      this.persist();
      this.paint();
    }));
    display.append(this.accentRow());
    wrap.append(themes, text, display);
    this.paintThemeGallery(wrap);
    return wrap;
  }

  private accentRow(): HTMLElement {
    const guild = this.guilds().find((item) => item.id === this.guildId);
    const stored = guild ? (this.config.accents[guild.id] ?? "") : "";
    const shown = normalizeHex(stored) || rgbToHex(getComputedStyle(this.root).getPropertyValue("--accent")) || "#5865f2";
    const control = colorControl(shown, "Server accent", (hex) => {
      if (!this.guildId) return;
      this.config.accents[this.guildId] = hex;
      this.persist();
      this.applyAppearance();
    }, guild && stored ? () => {
      if (!this.guildId) return;
      delete this.config.accents[this.guildId];
      this.persist();
      this.applyAppearance();
      if (this.settings) this.renderSettings();
    } : undefined);
    if (!guild) {
      for (const node of control.querySelectorAll("input, button")) {
        if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement) node.disabled = true;
      }
    }
    const description = guild
      ? `Colour for ${guild.name}. Reset follows the theme.`
      : "Open a server to set its accent. Direct messages use the theme colour.";
    return settingRow("appearance.accent", "Server accent", description, control, true);
  }

  private paneNotifications(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Notifications", this.platform.notificationNote));
    const card = settingCard("Alerts");
    card.append(this.segmentRow(
      "notifications.level",
      "Default",
      "What a new channel does until you set it.",
      ["all", "mentions", "mute"],
      { all: "All", mentions: "Mentions", mute: "Mute" },
      this.config.notifications.default,
      (value) => {
        this.config.notifications.default = value as NotifyLevel;
        this.persist();
      },
    ));
    const test = el("button", "primary", "Send a test notification");
    test.type = "button";
    test.addEventListener("click", () => void this.notify("Lark", "Notifications are on. Mute still wins."));
    card.append(settingRow("notifications.test", "Test notification", "Send a sample so you can see where it lands.", test));
    const words = el("input");
    words.value = this.config.notifications.keywords.join(", ");
    words.setAttribute("aria-label", "Highlight keywords");
    words.addEventListener("change", () => {
      this.config.notifications.keywords = words.value.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 20);
      this.persist();
      this.msgSig = "";
    });
    card.append(settingRow("notifications.keywords", "Highlight keywords", "Messages that contain these words get a highlight. Separate words with commas.", words, true));
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "Banners and Notification Center", "⌘"));
    grid.append(this.platformCard("Windows", "Toasts in Action Center", "Ctrl"));
    card.append(grid);
    wrap.append(card);
    return wrap;
  }

  private paneShortcuts(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Keybinds", "mod is ⌘ on macOS and Ctrl on Windows. Click a shortcut, then press the new keys. Save clip is global on macOS and Windows, so it still works while a game is in front."));
    const card = settingCard("Shortcuts");
    card.append(settingRow("shortcut.mark_read", "Mark read", "Esc closes whatever is open first. With nothing open, it marks the channel read.", el("span", "kbd", "Esc")));
    const conflicts = shortcutConflicts(this.config.shortcuts);
    if (conflicts.length) card.append(el("div", "warning", conflicts.join(" ")));
    for (const [action, shortcut] of Object.entries(this.config.shortcuts) as [keyof Shortcuts, string][]) {
      const copy = SHORTCUT_COPY[action] ?? { label: action.replaceAll("_", " "), description: "" };
      const button = el("button", "kbd", this.rebinding === action ? "Press keys" : formatShortcut(shortcut, this.platform.os));
      button.type = "button";
      button.addEventListener("click", () => {
        this.rebinding = action;
        this.renderSettings();
      });
      card.append(settingRow(`shortcut.${action}`, copy.label, copy.description, button));
    }
    wrap.append(card);
    return wrap;
  }

  private paneWindow(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Window", "Tray, login, and how fast the window paints."));
    const card = settingCard("Desktop");
    card.append(this.switchRow("window.tray", "Minimise to tray", "Closing the window leaves Lark in the menu bar or system tray.", this.config.desktop.minimize_to_tray, (value) => {
      this.config.desktop.minimize_to_tray = value;
      this.persist();
      if (isTauri()) void invoke("set_minimize_to_tray", { enabled: value });
    }));
    card.append(this.switchRow("window.login", "Open at login", "Start Lark when you sign in to this computer.", this.config.desktop.autostart, (value) => {
      this.config.desktop.autostart = value;
      this.persist();
      if (isTauri()) void invoke("set_autostart", { enabled: value });
    }));
    card.append(this.segmentRow(
      "window.frame",
      "Frame rate",
      "Scrolling and transitions follow the monitor, up to this cap. Lark paints only when something on screen changes.",
      ["0", "240", "165", "144", "120", "60"],
      { "0": "Match", "240": "240", "165": "165", "144": "144", "120": "120", "60": "60" },
      String(this.config.desktop.frame_cap),
      (value) => {
        this.config.desktop.frame_cap = Number(value);
        this.frames.setCap(Number(value));
        this.persist();
      },
    ));
    const hz = this.frames.displayHz;
    card.append(el("p", "setting-help", hz
      ? `This display is about ${hz} Hz. The hard cap is 240.`
      : "Measuring the display. The hard cap is 240."));
    wrap.append(card);
    return wrap;
  }

  private paneVoice(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Voice & Video", "Push to talk, voice activity, and RNNoise on the microphone. Echo cancellation stays off."));
    void this.loadAudioDevices();
    const input = settingCard("Input");
    input.append(this.segmentRow(
      "voice.mode",
      "Input mode",
      "Voice activity opens the mic when you speak. Push to talk waits for the key.",
      ["vad", "ptt"],
      { vad: "Voice activity", ptt: "Push to talk" },
      this.voiceMode(),
      (value) => this.setVoiceMode(value === "ptt" ? "ptt" : "vad"),
    ));
    if (this.detectedGame) {
      input.append(el("p", "setting-help", this.resolvedGame().profile
        ? `Push to talk for ${this.detectedGame} is saved on that game. It steps back when the game closes.`
        : `${this.detectedGame} is using your usual voice setting. A change here is remembered for this game.`));
    }
    input.append(this.sliderRow("voice.sensitivity", "Voice activity sensitivity", "How loud you need to be before voice activity opens the mic.", this.config.voice.sensitivity, 0, 100, (value) => {
      this.config.voice.sensitivity = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    input.append(this.switchRow("voice.noise", "Noise suppression", "RNNoise runs on the microphone when this is on. It does not cancel echo.", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
      this.paintVoice();
    }));
    const hudKey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
    const perfKey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
    const hud = settingCard("In-game voice HUD");
    hud.append(el("p", "setting-help", "A small always-on-top window on macOS and Windows. It uses the same voice roster as the channel list. It stays off until you turn it on."));
    hud.append(this.switchRow("voice.hud", "Show voice HUD", `${hudKey} shows and hides it, including while a game is focused.`, this.overlayOn(), (value) => {
      this.setVoiceOverlay(value, false);
    }));
    hud.append(this.sliderRow("voice.opacity", "Opacity", "How solid the voice HUD is. The same value covers the performance strip.", this.config.voice.overlay_opacity, 35, 100, (value) => {
      this.config.voice.overlay_opacity = value;
      this.persist();
      this.publishVoiceHud();
    }));
    hud.append(this.switchRow("voice.click", "Click through", "Lets the game take the mouse. Turn it off to drag the HUD.", this.config.voice.overlay_click_through, (value) => {
      this.config.voice.overlay_click_through = value;
      this.persist();
      this.publishVoiceHud();
    }));
    hud.append(this.switchRow("voice.perf", "Show performance", `${perfKey} adds RAM, CPU, and FPS to the same window.`, this.perfOn(), (value) => {
      this.setPerfOverlay(value, false);
    }));
    const devices = settingCard("Devices");
    devices.append(el("p", "setting-help", "Lark stores the device you pick. Voice uses these ids when it opens the microphone."));
    devices.append(this.deviceRow("voice.input", "Input", "Microphone Lark stores for the call.", this.config.voice.input_device, this.captureDevices(), (value) => {
      this.config.voice.input_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    devices.append(this.deviceRow("voice.output", "Output", "Speakers or headphones for the call.", this.config.voice.output_device, this.playbackDevices(), (value) => {
      this.config.voice.output_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    devices.append(this.deviceRow("voice.camera", "Camera", "Camera id stored for later. Video calls are not sent yet.", this.config.voice.video_device, this.videoInputs, (value) => {
      this.config.voice.video_device = value;
      this.persist();
    }));
    const listDevices = el("button", "text-button", "List microphones and cameras");
    listDevices.type = "button";
    listDevices.addEventListener("click", () => void this.listDevices());
    const deviceActions = el("div", "settings-actions");
    deviceActions.append(listDevices);
    devices.append(deviceActions);
    const ring = settingCard("Speaking ring");
    ring.append(this.speakRingRow());
    const share = settingCard("Screen share");
    share.append(el("p", "setting-help", "Go Live uses these defaults. The picker in a call can still change them, and every resolution is available."));
    share.append(this.segmentRow(
      "voice.share.quality",
      "Default quality",
      "Resolution for a new stream. Source keeps the window's own size.",
      ["720", "1080", "1440", "2160", "source"],
      { "720": "720p", "1080": "1080p", "1440": "1440p", "2160": "4K", source: "Source" },
      this.config.voice.share_resolution,
      (value) => {
        this.config.voice.share_resolution = value;
        this.persist();
      },
    ));
    share.append(this.segmentRow(
      "voice.share.quality",
      "Default frame rate",
      "15, 30, or 60. The stream drops a step if the encoder or the uplink cannot hold it.",
      ["15", "30", "60"],
      { "15": "15", "30": "30", "60": "60" },
      String(this.config.voice.share_fps),
      (value) => {
        this.config.voice.share_fps = snapShareFps(Number(value));
        this.persist();
      },
    ));
    share.append(this.switchRow("voice.share.audio", "Share application audio", "Send the shared app's audio when this computer can capture it.", this.config.voice.share_app_audio, (value) => {
      this.config.voice.share_app_audio = value;
      this.persist();
    }));
    share.append(this.segmentRow(
      "voice.share.encoder",
      "Hardware encoder",
      "Auto uses NVENC, AMF, Quick Sync, VideoToolbox, or Media Foundation when that one matches this computer.",
      ["auto", "nvenc", "amf", "qsv", "videotoolbox", "media-foundation"],
      { auto: "Auto", nvenc: "NVENC", amf: "AMF", qsv: "QSV", videotoolbox: "VideoToolbox", "media-foundation": "MF" },
      this.config.voice.share_encoder,
      (value) => {
        this.config.voice.share_encoder = value;
        this.persist();
      },
    ));
    wrap.append(input, hud, devices, ring, share);
    this.appendSoundboard(wrap);
    return wrap;
  }

  private speakRingRow(): HTMLElement {
    const current = speakColor(this.config.voice.speak_color);
    const control = colorControl(current, "Speaking ring color", (hex) => {
      this.config.voice.speak_color = speakColor(hex);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
    }, () => {
      this.config.voice.speak_color = speakColor(undefined);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return settingRow(
      "voice.speak",
      "Speaking ring",
      "The ring sweeps around an avatar while someone is speaking. It stays a solid ring when reduced motion is on, and while Game Mode is on. Discord green is the default.",
      control,
      true,
    );
  }

  private paneMessages(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Messages", "Saved messages, reminders, and scheduled sends stay on this device. Discord pins are unchanged."));
    const saved = settingCard("Saved");
    saved.dataset.setting = "messages.saved";
    if (!this.pack.bookmarks.length) saved.append(el("p", "setting-help", "Save on a message keeps it here. Saved in the header opens the same list."));
    for (const bookmark of this.pack.bookmarks) saved.append(this.savedRow(bookmark));
    const reminders = settingCard("Reminders");
    reminders.dataset.setting = "messages.reminders";
    if (!this.reminders.length) reminders.append(el("p", "setting-help", "Remind on a message. Lark notifies you once, at the time you picked."));
    for (const reminder of this.reminders) reminders.append(this.reminderRow(reminder));
    const scheduled = settingCard("Scheduled");
    scheduled.dataset.setting = "messages.scheduled";
    if (!this.pack.schedule.length) scheduled.append(el("p", "setting-help", "Later in the composer queues a send. The soonest time is 15 seconds from now, and one message goes out at a time."));
    for (const item of this.pack.schedule) scheduled.append(this.scheduledRow(item));
    wrap.append(saved, reminders, scheduled);
    return wrap;
  }

  private panePrivacy(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Privacy", "Streamer mode hides emails, tokens, DM previews, and personal info on this screen. Discord still has the real messages."));
    const card = settingCard("Streamer mode");
    card.append(this.switchRow("privacy.streamer", "Streamer mode", "Hide emails, tokens, DM previews, and your account id on this screen.", this.config.privacy.streamer, (value) => {
      this.config.privacy.streamer = value;
      this.persist();
      this.noteCapture();
    }));
    card.append(this.switchRow("privacy.auto", "Turn on while sharing or recording", "Follows screen share and the clip buffer. It does not look for other apps.", this.config.privacy.streamer_auto, (value) => {
      this.config.privacy.streamer_auto = value;
      this.persist();
      this.noteCapture();
    }));
    const active = this.streamerOn();
    const hotkey = formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os);
    card.append(el("p", "setting-help", active
      ? "Streamer mode is on. Emails and tokens in messages read as hidden, DM previews are dropped, and your account id is hidden."
      : `Off. ${hotkey} can toggle it from the command palette.`));
    wrap.append(card);
    return wrap;
  }

  private paneClips(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Clips", clipBehaviorNote(this.platform.os)));
    const card = settingCard("Buffer");
    card.dataset.setting = "clips.folder";
    card.append(el("p", "setting-help", this.clipStatusLine()));
    card.append(this.segmentRow(
      "clips.resolution",
      "Resolution",
      "720p, 1080p, 1440p, or 2160p. The default is 1440p.",
      CLIP_RESOLUTION_OPTIONS.map((value) => `${value}p`),
      {},
      `${sanitizeClipResolution(this.config.clips.resolution)}p`,
      (value) => {
        this.config.clips.resolution = sanitizeClipResolution(Number.parseInt(value, 10));
        return this.persist().then(() => this.pullClipStatus());
      },
    ));
    card.append(this.segmentRow(
      "clips.fps",
      "Frame rate",
      "60, 120, or 240 fps. Lark caps the combination when the display or encoder cannot hold it.",
      CLIP_FPS_OPTIONS.map((value) => `${value} fps`),
      {},
      `${sanitizeClipFps(this.config.clips.fps)} fps`,
      (value) => {
        this.config.clips.fps = sanitizeClipFps(Number.parseInt(value, 10));
        return this.persist().then(() => this.pullClipStatus());
      },
    ));
    if (this.clipStatus?.capNote) card.append(el("p", "warning", this.clipStatus.capNote));
    card.append(el("p", "setting-help", `Clips folder: ${this.clipStatus?.dir || this.platform.clipsDir}`));
    if (this.clipStatus?.hotkeyError) card.append(el("p", "warning", this.clipStatus.hotkeyError));
    card.append(this.switchRow("clips.capture", "Game Mode capture", "Keep a buffer of the main display without sharing your screen.", this.config.clips.game_capture, (value) => {
      this.config.clips.game_capture = value;
      return this.persist().then(() => this.pullClipStatus());
    }));
    card.append(el("p", "setting-help", `Hotkey: ${formatShortcut(this.config.shortcuts.save_clip, this.platform.os)}. Change it under Keybinds. It is global on macOS and Windows, works while another app is in front, and needs a modifier or a function key.`));
    if (isTauri()) {
      const openClips = el("button", "text-button", "Open clips folder");
      openClips.type = "button";
      openClips.addEventListener("click", () => void this.openClipsFolder());
      const actions = el("div", "settings-actions");
      actions.append(openClips);
      card.append(actions);
    }
    const upload = settingCard("Upload");
    upload.append(el("p", "setting-help", limitSentence(this.platform.os, this.premiumType)));
    upload.append(this.segmentRow(
      "clips.compress",
      "When a clip is over the upload limit",
      "Always compress, ask first, or keep the original. A compressed copy is H.264/AAC MP4. The original stays in the clips folder.",
      ["always", "ask", "never"],
      { always: "Always", ask: "Ask", never: "Never" },
      this.config.clips.compress,
      (value) => {
        this.config.clips.compress = parseCompressMode(value);
        this.persist();
      },
    ));
    const browse = el("button", "text-button", "Open the Clips view");
    browse.type = "button";
    browse.addEventListener("click", () => this.openClips());
    const uploadActions = el("div", "settings-actions");
    uploadActions.append(browse);
    upload.append(settingRow("clips.library", "Clip library", "Play, trim, rename, and send clips saved on this computer.", uploadActions));
    const library = settingCard("Saved on this computer");
    this.appendClipLibrary(library);
    wrap.append(card, upload, library);
    return wrap;
  }

  private paneGaming(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Gaming", "Game Mode eases resource use while a game is in front. Each game can keep its own voice and overlay defaults."));
    const mode = settingCard("Game Mode");
    const gameKey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    mode.append(this.switchRow("gaming.mode", "Game Mode", `${gameKey} toggles it, including while a game is focused. Animations pause, channels you have not opened are not prefetched, and the existing polls slow down.`, this.gameMode, (value) => {
      this.setGameMode(value, false);
    }));
    mode.append(this.switchRow("gaming.detect", "Detect games", "The check looks at the front app a few times a minute and does not read GPU sensors. Turning it off stops that check.", this.config.desktop.detect_games, (value) => {
      this.config.desktop.detect_games = value;
      this.persist();
      if (!value) this.noteGame(null);
      void this.detectLoad();
    }));
    mode.append(el("p", "setting-help", this.detectedGame
      ? `Detected: ${this.detectedGame}. A detected game turns Game Mode on unless that game's profile says otherwise.`
      : "No game detected."));
    const status = settingCard("Status");
    status.append(this.switchRow("gaming.hardware", "Hardware in status", "Off until you turn this on. Lark then reads this computer's GPU name, CPU temperature when a sensor answers, and the current game. That line becomes your Discord custom status, kept to 128 characters, and it refreshes about once a minute. macOS and Windows only.", this.config.desktop.hardware_status, (value) => {
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
    if (this.hardware.paused) {
      status.append(el("p", "setting-help", "Your custom status is left as you set it. Clear it to show hardware again."));
    } else if (this.hardwareChecking) {
      status.append(el("p", "setting-help", "Reading this computer…"));
    } else if (this.hardwareLine) {
      status.append(el("p", "setting-help", `Status line: ${this.hardwareLine}`));
    } else if (this.config.desktop.hardware_status && this.hardwareSampleAt > 0) {
      status.append(el("p", "setting-help", "Nothing to show from this computer right now."));
    } else if (!isTauri()) {
      status.append(el("p", "setting-help", "The desktop app reads the machine. This preview does not."));
    }
    const profiles = settingCard("Game profiles");
    profiles.dataset.setting = "gaming.profiles";
    this.appendGameProfiles(profiles);
    wrap.append(mode, status, profiles);
    return wrap;
  }

  private panePlugins(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Plugins", "Plugins stay off until you turn them on. They never receive the token."));
    const card = settingCard("Installed");
    card.dataset.setting = "plugins.list";
    card.append(el("p", "setting-help", "Reading tools stay on this device. Send later and the status plugins use the same single Discord requests as the composer and the profile chip, paced so they cannot burst."));
    const pack = new Set<string>(PACK_IDS);
    let headed = false;
    for (const plugin of this.catalog) {
      if (!headed && pack.has(plugin.id)) {
        headed = true;
        card.append(el("h3", "", "Pack"));
      }
      const enabled = this.config.plugins.enabled.includes(plugin.id);
      card.append(this.switchRow(`plugin.${plugin.id}`, plugin.name, plugin.description, enabled, (value) => this.setPluginEnabled(plugin.id, value)));
      if (enabled) this.appendPluginPanel(card, plugin.id);
    }
    if (!this.catalog.length) card.append(el("p", "setting-help", "No plugins found."));
    wrap.append(card);
    return wrap;
  }

  private segmentRow(id: string, label: string, description: string, values: string[], labels: Record<string, string>, current: string, onPick: (value: string) => void): HTMLElement {
    const control = segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
    return settingRow(id, label, description, control, true);
  }

  private sliderRow(id: string, label: string, description: string, value: number, min: number, max: number, onInput: (value: number) => void): HTMLElement {
    return settingRow(id, label, description, sliderControl(value, min, max, label, onInput), true);
  }

  private switchRow(id: string, label: string, description: string, on: boolean, change: (value: boolean) => void | Promise<void>): HTMLElement {
    const button = switchControl(on, label);
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
    return settingRow(id, label, description, button);
  }

  private deviceRow(id: string, label: string, description: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    return settingRow(id, label, description, selectControl(label, current, options, onChange), true);
  }

  private devicePicker(label: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrap = el("label", "device", label);
    wrap.append(selectControl(label, current, options, onChange));
    return wrap;
  }

  private platformCard(title: string, body: string, extra: string): HTMLElement {
    const current = (title === "macOS" && this.platform.os === "macos") || (title === "Windows" && this.platform.os === "windows");
    const card = el("article", `platform-card${current ? " is-current" : ""}`);
    card.append(el("strong", "", title), el("div", "", body), el("div", "hint", extra));
    return card;
  }

  private choice(values: string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
    return segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
  }

  private toggle(label: string, on: boolean, change: (value: boolean) => void | Promise<void>, description = ""): HTMLElement {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
    return this.switchRow(id || "setting", label, description, on, change);
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
      if (this.shareDialogOpen || this.shareQualityOpen) {
        this.shareDialogOpen = false;
        this.shareQualityOpen = false;
        this.paintShareDialog();
        this.paintVoice();
        return;
      }
      if (this.voiceMenu || this.gearOpen || this.activitiesOpen) {
        this.voiceMenu = null;
        this.gearOpen = false;
        this.activitiesOpen = false;
        this.paintVoiceFloats();
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
    } else if (matchShortcut(event, shortcuts.toggle_call, os)) {
      event.preventDefault();
      this.toggleCallView();
    } else if (matchShortcut(event, shortcuts.save_clip, os)) {
      event.preventDefault();
      void this.saveClip();
    } else if (this.voice && this.voiceMode() === "ptt" && matchShortcut(event, this.pttShortcut(), os)) {
      event.preventDefault();
      this.pttHeld = true;
      this.refreshSpeaking();
      this.pushTransmit();
    } else if (this.matchSound(event, typing)) {
      event.preventDefault();
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
      const size = status.width && status.height ? `${status.width}×${status.height}` : "the main display";
      const rate = status.fps ? ` at ${status.fps} fps` : "";
      const codec = status.codec ? ` ${status.codec}` : "";
      return `Recording ${size}${rate}${codec} · ${seconds}s in the buffer · ${status.backend}`;
    }
    return status.error
      ? `Buffer off. ${status.error}`
      : "Buffer off. Turn on Game Mode capture or share your screen. The hotkey does nothing until one of those is on.";
  }

  private async pullClipStatus() {
    if (!isTauri()) return;
    try {
      const status = await invoke<{
        recording: boolean;
        spanMs: number;
        dir: string;
        backend: string;
        error: string;
        hotkeyError: string;
        width?: number;
        height?: number;
        fps?: number;
        codec?: string;
        capNote?: string;
      }>("clip_status");
      const was = Boolean(this.clipStatus?.recording);
      this.clipStatus = status;
      if (was !== status.recording && this.config.privacy.streamer_auto) this.noteCapture();
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
    if (!this.clipItems.some((item) => item.name === clip.name)) {
      this.clipItems = [{
        name: clip.name,
        bytes: clip.bytes,
        modifiedMs: Date.now(),
        durationMs: clip.spanMs,
        width: 0,
        height: 0,
        poster: "",
      }, ...this.clipItems];
    }
    this.pendingClip = null;
    this.paintClipBanner();
    await this.attachClipByName(clip.name);
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

  private openClips() {
    this.clipsOpen = true;
    this.returnToChat();
    this.friendsOpen = false;
    this.settings = false;
    this.settingsEl.hidden = true;
    this.switcher = false;
    this.switcherEl.hidden = true;
    this.msgSig = "";
    void this.loadClips().then(() => {
      if (this.clipsOpen) {
        this.msgSig = "";
        this.paint();
      }
    });
    this.paint();
  }

  private async loadClips() {
    let next: ClipCard[] = [];
    if (this.demo || !isTauri()) next = demoClips();
    else {
      try {
        const listed = await invoke<ClipCard[]>("list_clips");
        next = listed.map((clip) => ({
          ...clip,
          poster: clip.poster ? `data:image/jpeg;base64,${clip.poster}` : posterFor(clip.name, clip.name),
        }));
      } catch (err) {
        this.toast("Clips", commandError(err, "Couldn't list clips."));
      }
    }
    const stamp = next.map((clip) => `${clip.name}:${clip.bytes}:${clip.modifiedMs}`).join("|");
    if (stamp === this.clipStamp) return;
    this.clipStamp = stamp;
    this.clipItems = next;
  }

  private paintClipLibrary() {
    const stamp = `${this.clipStamp}|${this.clipSendFor ?? ""}|${this.clipRename ?? ""}|${this.clipProgress?.name ?? ""}:${this.clipProgress?.percent ?? ""}|${this.premiumType}|${this.config.clips.compress}`;
    if (stamp === this.msgSig && this.messagesEl.querySelector(".clip-library")) return;
    this.msgSig = stamp;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    this.appendClipLibrary(this.messagesEl);
  }

  private appendClipLibrary(parent: HTMLElement) {
    const board = el("div", "clip-library");
    const limit = uploadLimitBytes(this.premiumType);
    board.append(el("p", "lede", limitSentence(this.platform.os, this.premiumType)));
    if (this.clipProgress) {
      const progress = el("div", "clip-progress");
      progress.append(el("span", "", `Compressing ${this.clipProgress.name} · ${this.clipProgress.percent}%`));
      const bar = el("div", "clip-progress-bar");
      const fill = el("span");
      fill.style.width = `${this.clipProgress.percent}%`;
      bar.append(fill);
      progress.append(bar);
      board.append(progress);
    }
    if (!this.clipItems.length) {
      board.append(el("p", "empty", "No clips yet. The hotkey saves one while screen share or Game Mode capture is on."));
      parent.append(board);
      return;
    }
    const grid = el("div", "clip-grid");
    for (const clip of this.clipItems) grid.append(this.clipCard(clip, limit));
    board.append(grid);
    parent.append(board);
  }

  private clipCard(clip: ClipCard, limit: number): HTMLElement {
    const card = el("article", "clip-card");
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(CLIP_DRAG, clip.name);
      event.dataTransfer?.setData("text/plain", clip.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });
    const thumb = el("div", "clip-thumb");
    const image = document.createElement("img");
    image.alt = "";
    image.src = clip.poster || posterFor(clip.name, clip.name);
    thumb.append(image, el("span", "clip-duration", formatClipDuration(clip.durationMs)));
    const meta = el("div", "clip-meta");
    const title = this.clipRename === clip.name ? el("input") : el("strong", "", clip.name.replace(/^lark-clip-/, ""));
    if (title instanceof HTMLInputElement) {
      title.value = clip.name.replace(/^lark-clip-/, "").replace(/\.(mp4|avi)$/, "");
      title.setAttribute("aria-label", "Clip name");
      queueMicrotask(() => title.focus());
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.renameClip(clip.name, title.value);
        }
        if (event.key === "Escape") {
          this.clipRename = null;
          this.msgSig = "";
          this.paint();
        }
      });
      title.addEventListener("blur", () => {
        if (this.clipRename === clip.name) void this.renameClip(clip.name, title.value);
      });
    }
    meta.append(title);
    const facts = el("span", "clip-facts", `${formatClipDuration(clip.durationMs)} · ${formatClipBytes(clip.bytes)} · ${formatClipDate(clip.modifiedMs)}`);
    meta.append(facts);
    if (clip.bytes > limit) meta.append(el("span", "clip-over", `Over the ${formatClipBytes(limit)} upload limit`));
    const actions = el("div", "clip-actions");
    actions.append(this.clipAction("Play", () => void this.playClip(clip.name)));
    actions.append(this.clipAction("Rename", () => {
      this.clipRename = clip.name;
      this.msgSig = "";
      this.paint();
    }));
    actions.append(this.clipAction("Delete", () => void this.deleteClip(clip.name)));
    actions.append(this.clipAction("Reveal", () => void this.revealClip(clip.name)));
    actions.append(this.clipAction("Trim", () => {
      this.clipTrim = clip.name;
      this.paintClipDialog();
    }));
    actions.append(this.clipAction("Send", () => {
      this.clipSendFor = this.clipSendFor === clip.name ? null : clip.name;
      this.msgSig = "";
      this.paint();
    }));
    meta.append(actions);
    if (this.clipSendFor === clip.name) meta.append(this.clipSendMenu(clip.name));
    card.append(thumb, meta);
    return card;
  }

  private clipAction(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "text-button", label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private clipSendMenu(name: string): HTMLElement {
    const menu = el("div", "clip-send");
    const current = this.currentChannel();
    const sendable = current && current.kind !== "voice" && current.kind !== "category" ? current : undefined;
    if (sendable) {
      const label = sendable.kind === "dm" || sendable.kind === "group" ? sendable.name : `#${sendable.name}`;
      menu.append(this.clipAction(`Send to ${label}`, () => void this.deliverClip(name, sendable.id)));
    }
    for (const dm of this.dms().slice(0, 6)) {
      if (dm.id === sendable?.id) continue;
      menu.append(this.clipAction(`DM ${dm.name}`, () => void this.deliverClip(name, dm.id)));
    }
    if (!menu.childElementCount) menu.append(el("span", "hint", "Open a channel or a DM first."));
    return menu;
  }

  private async deliverClip(name: string, channelId: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    if (!clip) return;
    const limit = uploadLimitBytes(this.premiumType);
    const action = fitAction(clip.bytes, limit, this.config.clips.compress);
    this.clipSendFor = null;
    if (action === "block") {
      this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
      return;
    }
    if (action === "ask") {
      this.clipAsk = { name, channelId, mode: "send" };
      this.paintClipDialog();
      return;
    }
    const sending = action === "compress" ? await this.compressClip(name, limit) : name;
    if (!sending) return;
    await this.sendClipFile(sending, channelId);
  }

  private async prepareOutgoingFiles(): Promise<boolean> {
    const limit = uploadLimitBytes(this.premiumType);
    for (const file of [...this.files]) {
      if (!file.clipName) continue;
      const action = fitAction(this.fileBytes(file), limit, this.config.clips.compress);
      if (action === "send") {
        await this.materializeClip(file);
        continue;
      }
      if (action === "block") {
        this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
        return false;
      }
      if (action === "ask") {
        this.clipAsk = { name: file.clipName, channelId: this.channelId || "", mode: "attach" };
        this.paintClipDialog();
        return false;
      }
      const fitted = await this.compressClip(file.clipName, limit);
      if (!fitted) return false;
      await this.replaceClipFile(file, fitted);
    }
    return true;
  }

  private async confirmClipCompress() {
    const ask = this.clipAsk;
    if (!ask) return;
    this.clipAsk = null;
    this.paintClipDialog();
    const limit = uploadLimitBytes(this.premiumType);
    const fitted = await this.compressClip(ask.name, limit);
    if (!fitted) return;
    if (ask.mode === "send") {
      await this.sendClipFile(fitted, ask.channelId);
      return;
    }
    const file = this.files.find((item) => item.clipName === ask.name);
    if (file) await this.replaceClipFile(file, fitted);
    this.paintComposer();
    void this.send();
  }

  private async compressClip(name: string, limit: number): Promise<string | null> {
    const clip = this.clipItems.find((item) => item.name === name);
    if (this.demo || !isTauri()) {
      if (!clip) return null;
      for (const percent of [20, 55, 100]) {
        this.clipProgress = { name, percent };
        this.msgSig = "";
        this.paint();
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      const fitted = compressCopy(clip, limit);
      if (!this.clipItems.some((item) => item.name === fitted.name)) this.clipItems = [fitted, ...this.clipItems];
      this.clipStamp = "";
      this.clipProgress = null;
      this.msgSig = "";
      this.paint();
      this.toast("Clip compressed", "The original is still in the clips folder.");
      return fitted.name;
    }
    try {
      const saved = await invoke<{ name?: string; bytes?: number }>("compress_clip", { name, limitBytes: limit });
      this.clipProgress = null;
      this.clipStamp = "";
      await this.loadClips();
      this.toast("Clip compressed", "The original is still in the clips folder.");
      return saved.name || null;
    } catch (err) {
      this.clipProgress = null;
      this.toast("Clip", commandError(err, "Couldn't compress the clip."));
      return null;
    }
  }

  private async sendClipFile(name: string, channelId: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    const localId = outgoingNonce();
    if (this.demo || !isTauri()) {
      const message: RawMessage = {
        id: localId,
        nonce: localId,
        channelId,
        authorId: this.meId(),
        authorName: "Ethan Park",
        content: "",
        timestamp: new Date().toISOString(),
        kind: "default",
        attachments: [{
          id: "clip",
          name,
          url: clip?.poster || "",
          contentType: clipMime(name),
          size: clip?.bytes ?? 0,
        }],
      };
      this.storeEcho(channelId, message);
      this.toast("Clip sent", `${name} was sent from this computer.`);
      this.clipsOpen = false;
      this.msgSig = "";
      void this.openChannel(channelId);
      return;
    }
    try {
      const encoded = await invoke<string>("read_clip", { name });
      const bytes = bytesFromBase64(encoded);
      const sent = await invoke<RawMessage>("send_message", {
        channelId,
        content: "",
        replyTo: null,
        nonce: localId,
        files: [{ name, mime: clipMime(name), bytes: Array.from(bytes) }],
      });
      this.toast("Clip sent", "Discord has the file. The original is still in the clips folder.");
      this.absorbMessage(normalizeMessage(sent));
      this.clipsOpen = false;
      this.msgSig = "";
      void this.openChannel(channelId);
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't send the clip."));
    }
  }

  private async attachClipByName(name: string) {
    const clip = this.clipItems.find((item) => item.name === name) ?? {
      name,
      bytes: 0,
      modifiedMs: 0,
      durationMs: 0,
      width: 0,
      height: 0,
      poster: "",
    };
    if (!this.channelId && !this.clipsOpen) {
      this.toast("Clip", "Open a channel, then drop the clip on the composer.");
      return;
    }
    const action = clipAttachAction(clip.bytes, this.premiumType, this.config.clips.compress);
    const limit = uploadLimitBytes(this.premiumType);
    if (action === "block") {
      this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
      return;
    }
    if (this.demo || !isTauri() || action !== "send") {
      this.files.push({
        name: clip.name,
        mime: clipMime(clip.name),
        bytes: new Uint8Array(),
        url: clip.poster,
        clipName: clip.name,
        declaredBytes: clip.bytes,
      });
      this.clipsOpen = false;
      this.paint();
      if (action === "compress") this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Lark will compress a copy when you send.`);
      else if (action === "ask") this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Lark will ask before compressing it.`);
      return;
    }
    try {
      const encoded = await invoke<string>("read_clip", { name: clip.name });
      const bytes = bytesFromBase64(encoded);
      const blob = new Blob([bytes], { type: clipMime(clip.name) });
      this.files.push({
        name: clip.name,
        mime: clipMime(clip.name),
        bytes,
        url: URL.createObjectURL(blob),
        clipName: clip.name,
      });
      this.clipsOpen = false;
      this.paintComposer();
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't read the clip."));
    }
  }

  private async materializeClip(file: LocalFile) {
    if (file.bytes.byteLength > 0 || !file.clipName || this.demo || !isTauri()) return;
    const encoded = await invoke<string>("read_clip", { name: file.clipName });
    const bytes = bytesFromBase64(encoded);
    file.bytes = bytes;
    file.declaredBytes = bytes.byteLength;
    file.mime = clipMime(file.clipName);
    file.url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  }

  private async replaceClipFile(file: LocalFile, name: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    file.name = name;
    file.clipName = name;
    file.mime = clipMime(name);
    file.declaredBytes = clip?.bytes;
    file.bytes = new Uint8Array();
    file.url = clip?.poster || file.url;
    if (!this.demo && isTauri()) await this.materializeClip(file);
  }

  private async playClip(name: string) {
    this.clipPlayer = name;
    const clip = this.clipItems.find((item) => item.name === name);
    if (!this.demo && isTauri() && clip && !clip.poster.startsWith("blob:")) {
      try {
        const encoded = await invoke<string>("read_clip", { name });
        const bytes = bytesFromBase64(encoded);
        clip.poster = URL.createObjectURL(new Blob([bytes], { type: clipMime(name) }));
      } catch (err) {
        this.toast("Clip", commandError(err, "Couldn't play the clip."));
      }
    }
    this.paintClipDialog();
  }

  private async revealClip(name: string) {
    if (this.demo || !isTauri()) {
      this.toast("Clips", `This preview keeps ${name} in the sample library.`);
      return;
    }
    try {
      await invoke("show_clip", { name });
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't show the clip."));
    }
  }

  private async renameClip(name: string, label: string) {
    const next = renamedClipName(name, label);
    this.clipRename = null;
    if (!next || next === name) {
      this.msgSig = "";
      this.paint();
      return;
    }
    if (this.demo || !isTauri()) {
      this.clipItems = this.clipItems.map((clip) => clip.name === name ? { ...clip, name: next, poster: posterFor(next, label) } : clip);
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      return;
    }
    try {
      await invoke("rename_clip", { name, label });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't rename the clip."));
    }
  }

  private async deleteClip(name: string) {
    if (this.demo || !isTauri()) {
      this.clipItems = this.clipItems.filter((clip) => clip.name !== name);
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      return;
    }
    try {
      await invoke("delete_clip", { name });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't delete the clip."));
    }
  }

  private async applyTrim(name: string, startSec: number, endSec: number) {
    const clip = this.clipItems.find((item) => item.name === name);
    const range = trimRange(clip?.durationMs ?? 0, startSec, endSec);
    if (typeof range === "string") {
      this.toast("Trim", range);
      return;
    }
    this.clipTrim = null;
    this.paintClipDialog();
    if (this.demo || !isTauri()) {
      if (!clip) return;
      const copy: ClipCard = {
        ...clip,
        name: clip.name.replace(/\.(mp4|avi)$/, "-trim.$1"),
        durationMs: range.endMs - range.startMs,
        bytes: Math.max(1, Math.round(clip.bytes * ((range.endMs - range.startMs) / Math.max(1, clip.durationMs)))),
      };
      copy.poster = posterFor(copy.name, "trim");
      this.clipItems = [copy, ...this.clipItems];
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      this.toast("Clip trimmed", "The original is still in the clips folder.");
      return;
    }
    try {
      await invoke("trim_clip", { name, startMs: range.startMs, endMs: range.endMs });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
      this.toast("Clip trimmed", "The original is still in the clips folder.");
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't trim the clip."));
    }
  }

  private paintClipDialog() {
    clear(this.clipDialog);
    const ask = this.clipAsk;
    const playing = this.clipPlayer ? this.clipItems.find((clip) => clip.name === this.clipPlayer) : undefined;
    const trimming = this.clipTrim ? this.clipItems.find((clip) => clip.name === this.clipTrim) : undefined;
    if (!ask && !playing && !trimming) {
      this.clipDialog.hidden = true;
      return;
    }
    this.clipDialog.hidden = false;
    const card = el("div", "clip-dialog");
    if (ask) {
      const clip = this.clipItems.find((item) => item.name === ask.name);
      const limit = uploadLimitBytes(this.premiumType);
      card.append(el("h2", "", "Compress this clip?"));
      card.append(el("p", "", `${ask.name} is ${formatClipBytes(clip?.bytes ?? 0)}. The upload limit is ${formatClipBytes(limit)}. Lark can re-encode a copy to H.264/AAC MP4 and leave the original in the clips folder.`));
      const actions = el("div", "clip-actions");
      actions.append(this.clipAction("Compress and send", () => void this.confirmClipCompress()));
      actions.append(this.clipAction("Cancel", () => {
        this.clipAsk = null;
        this.paintClipDialog();
      }));
      card.append(actions);
    } else if (playing) {
      card.append(el("h2", "", playing.name));
      if (playing.poster.startsWith("blob:") && playing.name.endsWith(".mp4")) {
        const video = el("video", "clip-video");
        video.controls = true;
        video.src = playing.poster;
        card.append(video);
      } else {
        const image = document.createElement("img");
        image.className = "clip-video";
        image.alt = "";
        image.src = playing.poster || posterFor(playing.name, playing.name);
        card.append(image, el("p", "hint", `${formatClipDuration(playing.durationMs)} · ${formatClipBytes(playing.bytes)}`));
      }
      card.append(this.clipAction("Close", () => {
        this.clipPlayer = null;
        this.paintClipDialog();
      }));
    } else if (trimming) {
      card.append(el("h2", "", "Trim clip"), el("p", "hint", "This writes a new file. The original stays."));
      const start = el("input");
      start.type = "number";
      start.min = "0";
      start.step = "0.1";
      start.value = "0";
      start.setAttribute("aria-label", "Trim start seconds");
      const end = el("input");
      end.type = "number";
      end.min = "0";
      end.step = "0.1";
      end.value = String(Math.max(0.1, trimming.durationMs / 1000));
      end.setAttribute("aria-label", "Trim end seconds");
      const row = el("div", "clip-actions");
      row.append(start, end);
      card.append(row);
      const actions = el("div", "clip-actions");
      actions.append(this.clipAction("Save trim", () => void this.applyTrim(trimming.name, Number(start.value), Number(end.value))));
      actions.append(this.clipAction("Cancel", () => {
        this.clipTrim = null;
        this.paintClipDialog();
      }));
      card.append(actions);
    }
    this.clipDialog.append(card);
    this.clipDialog.onclick = (event) => {
      if (event.target !== this.clipDialog) return;
      this.clipAsk = null;
      this.clipPlayer = null;
      this.clipTrim = null;
      this.paintClipDialog();
    };
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
    if (person.id !== this.meId()) {
      void invoke<string>("fetch_user_note", { userId }).then((note) => {
        if (this.popout?.id !== userId) return;
        const clean = clampNote(note);
        if (clean) this.notes[userId] = clean;
        else delete this.notes[userId];
        this.paintPopout();
      }).catch(() => undefined);
    }
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
      note?: string;
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
      const premium = (event.user as { premiumType?: number }).premiumType;
      if (typeof premium === "number" && Number.isFinite(premium)) this.premiumType = premium;
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
      if (this.demo || this.railDrag) return;
      const folders = ((event as { folders?: { id?: string | number | null; name?: string | null; color?: string | null; guildIds?: string[] }[] }).folders ?? [])
        .map((folder) => normalizeFolder(folder))
        .filter((folder): folder is GuildFolder => Boolean(folder));
      if (!folders.length) return;
      if (!this.ensureFolderSync().acceptRemote(folders)) return;
      this.folders = folders;
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
      const known = bucket.some((item) => sameOutgoing(item, message));
      this.pages[message.channelId] = mergeIncoming(bucket, message);
      const prior = history[message.channelId];
      if (prior?.some((item) => sameOutgoing(item, message))) history[message.channelId] = mergeIncoming(prior, message);
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
      const body = this.notifyBody(message, direct);
      if (alreadyNotified) void this.notify(this.streamerOn() && direct ? "Direct message" : this.maskText(message.authorName), body);
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
    } else if (event.kind === "userNote" && event.userId) {
      const note = clampNote(String(event.note ?? ""));
      if (note) this.notes[event.userId] = note;
      else delete this.notes[event.userId];
      if (this.popout?.id === event.userId) this.paintPopout();
      if (this.friendsOpen) {
        this.msgSig = "";
        this.paintMessages();
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
    } else if (event.kind === "screenShare") {
      this.onScreenShare(event as { state?: string; note?: string; detail?: string; fps?: number; height?: number });
    } else if (event.kind === "streamFrame") {
      this.onStreamFrame(event as { annexB?: string; streamKey?: string; preview?: boolean });
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
      if (!this.composer.value) delete this.drafts[id];
      else this.drafts[id] = this.composer.value.slice(0, 2000);
      if (this.draftsReady) void this.writeDrafts();
    }, 120);
  }

  private streamerOn(): boolean {
    return streamerActive(
      this.config.privacy.streamer,
      this.config.privacy.streamer_auto,
      this.shareOn || Boolean(this.clipStatus?.recording),
    );
  }

  private maskText(value: string): string {
    return this.streamerOn() ? redactSensitive(value) : value;
  }

  private noteCapture() {
    this.msgSig = "";
    this.channelShape = "";
    this.memberShape = "";
    if (this.view === "app") this.paint();
    else if (this.settings && (this.section === "privacy" || this.section === "messages")) this.renderSettings();
  }

  private toggleStreamer() {
    this.config.privacy.streamer = !this.config.privacy.streamer;
    this.persist();
    this.noteCapture();
    this.toast("Streamer mode", this.streamerOn() ? "On. Emails, tokens, DM previews, and personal info are hidden." : "Off.");
  }

  private dmActivityLabel(channel: Channel): string {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const known = recipient ? this.directory[recipient.id] : undefined;
    if (!known) return "";
    return this.maskText(friendGlance(known).activity);
  }

  private dmPreviewLabel(channelId: string): string {
    const loaded = this.pages[channelId];
    const source = loaded?.length ? loaded : this.demo ? history[channelId] : undefined;
    const last = [...(source ?? [])].reverse().find((message) => message.content.trim());
    if (!last) return "";
    return dmPreview(plainPreview(last.content, this.renderContext(), 80), this.streamerOn(), 80);
  }

  private previewLine(message: RawMessage, limit: number): string {
    const channel = this.channelById(message.channelId);
    const direct = channel?.kind === "dm" || channel?.kind === "group";
    if (this.streamerOn() && direct) return "Message hidden";
    const text = plainPreview(message.content, this.renderContext(), limit) || (message.attachments?.length ? "Attachment" : "Empty message");
    return this.maskText(text);
  }

  private notifyBody(message: RawMessage, direct: boolean): string {
    if (this.streamerOn() && direct) return "New direct message";
    const body = plainPreview(message.content, this.renderContext()) || (message.attachments?.length ? "Sent an attachment" : message.stickers?.length ? "Sent a sticker" : "New message");
    return this.maskText(body);
  }

  private bookmarkExcerpt(bookmark: { channelId: string; excerpt: string }): string {
    const channel = this.channelById(bookmark.channelId);
    if (this.streamerOn() && (channel?.kind === "dm" || channel?.kind === "group")) return "Direct message";
    return this.maskText(bookmark.excerpt || "Empty message");
  }

  private presentView(view: ViewMessage): ViewMessage {
    if (!this.streamerOn()) return view;
    return {
      ...view,
      authorName: redactSensitive(view.authorName),
      blocks: redactBlocks(view.blocks),
      raw: redactSensitive(view.raw),
      reply: view.reply
        ? { ...view.reply, authorName: redactSensitive(view.reply.authorName), preview: redactSensitive(view.reply.preview) }
        : null,
      embeds: view.embeds.map((embed) => ({
        ...embed,
        author: embed.author ? redactSensitive(embed.author) : null,
        title: embed.title ? redactSensitive(embed.title) : null,
        footer: embed.footer ? redactSensitive(embed.footer) : null,
        description: redactBlocks(embed.description),
        fields: embed.fields.map((field) => ({
          ...field,
          name: redactSensitive(field.name),
          value: redactBlocks(field.value),
        })),
      })),
    };
  }

  private async hydrateDrafts() {
    const plan = planDraftLoad(localStorage.getItem(DRAFTS_SEALED_KEY), localStorage.getItem(DRAFTS_PLAIN_KEY));
    let shouldSeal = false;
    if (plan.kind === "migrate") {
      localStorage.removeItem(DRAFTS_PLAIN_KEY);
      this.drafts = { ...plan.plain, ...this.drafts };
      shouldSeal = true;
    } else if (plan.kind === "sealed" && isTauri()) {
      try {
        const plain = await invoke<string>("open_drafts", { sealed: plan.sealed });
        const loaded = parseDraftMap(JSON.parse(plain));
        localStorage.removeItem(DRAFTS_PLAIN_KEY);
        this.drafts = { ...loaded, ...this.drafts };
        shouldSeal = true;
      } catch {
        this.toast("Drafts", "Drafts stay in memory for this session. The credential store could not unlock them.");
      }
    }
    this.draftsReady = true;
    this.applyOpenDraft();
    if (isTauri() && shouldSeal) await this.writeDrafts();
  }

  private applyOpenDraft() {
    const id = this.channelId;
    if (!id || this.editing || !this.composer) return;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.composer.value) {
      this.composer.value = draft;
      this.paintComposer();
    }
  }

  private async writeDrafts() {
    if (!isTauri()) return;
    const ticket = ++this.draftTicket;
    const plain = JSON.stringify(parseDraftMap(this.drafts));
    try {
      const sealed = await invoke<string>("seal_drafts", { plain });
      if (ticket !== this.draftTicket) return;
      localStorage.setItem(DRAFTS_SEALED_KEY, sealed);
      localStorage.removeItem(DRAFTS_PLAIN_KEY);
    } catch {
      // Leave the previous seal. Do not write the plaintext back.
    }
  }

  private saveReminders() {
    localStorage.setItem("lark.reminders.v1", JSON.stringify(this.reminders));
  }

  private beginReminder(message: RawMessage) {
    const existing = reminderFor(this.reminders, message.channelId, message.id);
    if (existing) {
      this.reminders = cancelReminder(this.reminders, existing.id);
      this.saveReminders();
      this.toast("Reminder", "Removed.");
      this.msgSig = "";
      this.paintMessages();
      if (this.settings && this.section === "messages") this.renderSettings();
      return;
    }
    this.reminding = message;
    this.scheduling = false;
    this.paintComposer();
  }

  private queueReminder(at: number) {
    const message = this.reminding;
    if (!message) return;
    const result = addReminder(this.reminders, {
      messageId: message.id,
      channelId: message.channelId,
      authorName: message.authorName,
      excerpt: message.content,
      remindAt: at,
    }, Date.now());
    if (!result.ok) {
      this.toast("Reminder", result.error);
      return;
    }
    this.reminders = result.list;
    this.reminding = null;
    this.saveReminders();
    this.msgSig = "";
    this.paintMessages();
    this.paintComposer();
    this.toast("Reminder", "Lark will notify you once.");
  }

  private paintReminderBanner() {
    const message = this.reminding;
    if (!message) return;
    clear(this.composerBanner);
    this.composerBanner.hidden = false;
    this.composerBanner.append(el("span", "", `Remind about ${this.maskText(message.authorName)}`));
    for (const preset of reminderPresets(Date.now())) {
      const button = el("button", "text-button", preset.label);
      button.type = "button";
      button.addEventListener("click", () => this.queueReminder(preset.at));
      this.composerBanner.append(button);
    }
    const when = el("input");
    when.type = "datetime-local";
    when.setAttribute("aria-label", "Remind at");
    when.value = localInputValue(Date.now() + 60 * 60_000);
    const custom = el("button", "primary", "Set");
    custom.type = "button";
    custom.addEventListener("click", () => this.queueReminder(Date.parse(when.value)));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.reminding = null;
      this.paintComposer();
    });
    this.composerBanner.append(when, custom, cancel);
  }

  private tickReminders() {
    const picked = takeDueReminders(this.reminders, Date.now());
    if (!picked.due.length) return;
    this.reminders = picked.pending;
    this.saveReminders();
    for (const item of picked.due) {
      const channel = this.channelById(item.channelId);
      const direct = channel?.kind === "dm" || channel?.kind === "group";
      const body = this.streamerOn() && direct
        ? "A direct message you asked to be reminded about."
        : this.streamerOn()
          ? "A message you asked to be reminded about."
          : (item.excerpt || "Saved reminder");
      void this.notify("Reminder", body);
    }
    this.msgSig = "";
    if (this.view === "app") this.paintMessages();
    if (this.settings && this.section === "messages") this.renderSettings();
  }

  private savedRow(bookmark: Bookmark): HTMLElement {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", `${this.maskText(bookmark.authorName)} — ${this.bookmarkExcerpt(bookmark)}`));
    const open = el("button", "text-button", "Open");
    open.type = "button";
    open.addEventListener("click", () => {
      this.closeSettings();
      void this.openChannel(bookmark.channelId);
    });
    const remove = el("button", "ghost", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      this.pack.bookmarks = this.pack.bookmarks.filter((item) => item.messageId !== bookmark.messageId || item.channelId !== bookmark.channelId);
      this.savePack();
      this.msgSig = "";
      this.renderSettings();
    });
    row.append(open, remove);
    return row;
  }

  private reminderRow(reminder: Reminder): HTMLElement {
    const row = el("div", "shortcut-row");
    const when = formatRelative(new Date(reminder.remindAt).toISOString(), Date.now());
    const channel = this.channelById(reminder.channelId);
    const direct = this.streamerOn() && (channel?.kind === "dm" || channel?.kind === "group");
    const excerpt = direct ? "Direct message" : this.maskText(reminder.excerpt || "Empty message");
    row.append(el("span", "", `${this.maskText(reminder.authorName)} · ${when} · ${excerpt}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.reminders = cancelReminder(this.reminders, reminder.id);
      this.saveReminders();
      this.msgSig = "";
      this.renderSettings();
    });
    row.append(cancel);
    return row;
  }

  private scheduledRow(item: ScheduledSend): HTMLElement {
    const row = el("div", "shortcut-row");
    const when = formatRelative(new Date(item.sendAt).toISOString(), Date.now());
    row.append(el("span", "", `${when} · ${this.maskText(item.content.slice(0, 80))}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.pack.schedule = cancelSend(this.pack.schedule, item.id);
      this.savePack();
      this.renderSettings();
      this.paintComposer();
    });
    row.append(cancel);
    return row;
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

  private onVoiceChannel(channel: Channel) {
    const action = voiceChannelAction({
      joinedThisChannel: this.voice?.channelId === channel.id,
      surface: this.callSurface,
    });
    if (this.callSurface === "popout" && action.surface !== "popout") this.closeCallPopout();
    this.callSurface = action.surface;
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.voiceMenu = null;
    if (action.join) {
      this.friendsOpen = false;
      this.clipsOpen = false;
      this.joinVoice(channel);
      return;
    }
    this.paint();
  }

  private ringMotion(): RingMotion {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return speakingMotion(this.gameMode, reduced);
  }

  private stageMembers(): StageMember[] {
    if (!this.voice) return [];
    const selfId = this.meId();
    return this.voice.members.map((member) => ({
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl ?? null,
      speaking: member.speaking,
      selfMute: Boolean(member.selfMute) || (member.id === selfId && this.voice!.muted),
      selfDeaf: Boolean(member.selfDeaf) || (member.id === selfId && this.voice!.deafened),
      serverMute: Boolean(member.serverMute),
      serverDeaf: Boolean(member.serverDeaf),
      localMuted: Boolean(member.localMuted),
      volume: member.volume,
      self: member.id === selfId,
      video: Boolean(member.video) || (member.id === selfId && this.cameraOn),
      sharing: Boolean(member.sharing) || (member.id === selfId && this.shareOn),
      streamLabel: member.streamLabel,
    }));
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
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareDialogOpen = false;
    this.shareQualityOpen = false;
    this.shareWatching = "";
    this.pipUser = "";
    this.shareNote = "";
    clearStreamFrames();
    this.cameraOn = false;
    this.callSurface = dismissCallSurface();
    this.closeCallPopout();
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.voiceMenu = null;
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
    } else if (this.voice.muted || (this.voiceMode() === "ptt" && !this.pttHeld)) {
      self.speaking = false;
      setSpeaking(this.voiceRoster, self.id, false);
    }
    this.syncSpeakingClass(self.id);
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
    hydrateMix(this.voiceRoster, this.config.voice.levels);
    const people = participantsIn(this.voiceRoster, this.voice.guildId ?? "", this.voice.channelId);
    this.voice.members = people.map((person) => ({
      id: person.userId,
      name: person.name,
      speaking: person.speaking,
      volume: person.volume,
      localMuted: person.localMuted,
      avatarUrl: person.avatarUrl,
      selfMute: person.selfMute,
      selfDeaf: person.selfDeaf,
      serverMute: person.serverMute,
      serverDeaf: person.serverDeaf,
      video: person.video,
      sharing: person.sharing,
      streamLabel: person.streamLabel,
    }));
    if (this.demo) return;
    for (const member of this.voice.members) {
      if (member.id === this.meId()) continue;
      const gain = playbackVolume(member.volume, Boolean(member.localMuted));
      if (this.sentMix.get(member.id) === gain) continue;
      this.sentMix.set(member.id, gain);
      void invoke("set_voice_volume", { userId: member.id, volume: gain }).catch(() => undefined);
    }
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
    this.syncSpeakingClass(userId);
    this.publishVoiceHud();
  }

  private syncSpeakingClass(userId: string) {
    const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
    let on = person ? voiceBadges(person).speaking : false;
    if (userId === this.meId() && this.voice && (this.voice.muted || this.voice.deafened)) on = false;
    const selector = `[data-voice-user="${CSS.escape(userId)}"]`;
    for (const node of this.root.querySelectorAll(selector)) node.classList.toggle("is-speaking", on);
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
      ...(state.selfStream === undefined ? {} : { selfStream: Boolean(state.selfStream) }),
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
      const inputs = listed.inputs ?? [];
      const outputs = listed.outputs ?? [];
      const same = inputs.join("\0") === this.cpalInputs.join("\0") && outputs.join("\0") === this.cpalOutputs.join("\0");
      this.cpalInputs = inputs;
      this.cpalOutputs = outputs;
      if (same) return;
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
    else if (id === "call") this.toggleCallView();
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
    }     else if (id === "pins") {
      this.pinsOpen = true;
      this.paintPins();
    } else if (id === "clips") this.openClips();
    else if (id === "saved") {
      this.bookmarksOpen = true;
      this.paintBookmarks();
    } else if (id === "reminders" || id === "scheduled") {
      this.section = "messages";
      this.openSettings();
    } else if (id === "streamer") this.toggleStreamer();
    else if (id === "status") {
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
    if (this.settings && (this.section === "voice" || this.section === "gaming")) this.renderSettings();
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
    if (isTauri()) void invoke("set_clip_pace", { gameMode: next.gameMode }).catch(() => undefined);
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
    if (this.settings && (this.section === "voice" || this.section === "gaming")) this.renderSettings();
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
    if (this.settings && (this.section === "gaming" || this.section === "voice")) this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    this.toast("Game Mode", enabled ? `On. ${hotkey} turns it off.` : "Off.");
  }

  private appendGameProfiles(wrap: HTMLElement) {
    wrap.append(el("p", "setting-help", "Each game keeps its own push-to-talk key and the defaults for Game Mode, the voice HUD, and the performance strip. They apply while that game is detected."));
    const names = Object.keys(this.config.games).sort((a, b) => a.localeCompare(b));
    if (this.detectedGame && !names.includes(this.detectedGame)) {
      wrap.append(el("p", "hint", `${this.detectedGame} is in front. Change a switch below, or here, and Lark remembers it.`));
      wrap.append(this.profileCard(this.detectedGame, profileFromBase(this.gameBase())));
    }
    if (!names.length && !this.detectedGame) {
      wrap.append(el("p", "setting-help", "No saved games yet. Start one, or turn on Detect games above."));
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
    if (!dock || !this.callStrip || !this.callSplit) return;
    const textChat = Boolean(this.voice) && !this.clipsOpen && !(this.friendsOpen && !this.guildId);
    const tiles = textChat ? stageTiles(this.stageMembers()) : [];
    const media = leadMedia(tiles);
    const chrome = callChrome({
      inCall: textChat,
      surface: textChat ? this.callSurface : "chat",
      stripOpen: this.stripOpen,
      hasMedia: Boolean(media),
    });
    const chat = this.messagesEl.parentElement;
    if (chat) {
      chat.dataset.call = this.voice ? this.callSurface : "off";
      chat.dataset.strip = chrome.stripPx > 0 ? "open" : "closed";
    }
    this.messagesEl.hidden = false;
    this.callStrip.hidden = chrome.stripPx === 0;
    clear(this.callStrip);
    if (chrome.stripPx > 0) {
      const people = stripPeople(this.stageMembers().map((member) => ({
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        speaking: voiceBadges(member).speaking,
        self: member.self,
      })));
      renderCallStrip(this.callStrip, stripWindow(people), this.ringMotion(), {
        onOpen: () => this.openCallSplit(),
        onHide: () => this.setStripOpen(false),
      });
    }
    const showGrid = chrome.grid === "split";
    this.callSplit.hidden = !showGrid;
    this.callHandle.hidden = !showGrid;
    clear(this.callSplitBar);
    clear(dock);
    if (showGrid && this.voice) {
      this.callSplitBar.append(el("strong", "call-split-name", this.voice.name));
      const pop = el("button", "text-button", "Pop out");
      pop.type = "button";
      pop.addEventListener("click", () => this.popCallOut());
      const close = el("button", "icon-button");
      close.type = "button";
      close.setAttribute("aria-label", "Close call view");
      close.title = "Close call view (Esc)";
      close.append(icon(paths.close));
      close.addEventListener("click", () => this.dismissCallView());
      const actions = el("div", "call-split-actions");
      actions.append(pop, close);
      this.callSplitBar.append(actions);
      renderCallStage(dock, tiles, this.ringMotion(), this.callStageHandlers());
    }
    this.paintPip(chrome.pip ? media : null);
    this.mountShareSurfaces();
    this.paintShareDialog();
    this.paintVoiceFloats();
    this.publishVoiceHud();
    this.publishCallFrame();
    requestAnimationFrame(() => {
      this.placeCallSplit();
      this.placePip();
    });
  }

  private callStageHandlers() {
    return {
      cameraOn: this.cameraOn,
      shareOn: this.shareOn,
      muted: Boolean(this.voice?.muted),
      deafened: Boolean(this.voice?.deafened),
      activitiesOpen: this.activitiesOpen,
      clips: this.config.soundboard.clips.map((clip) => ({ id: clip.id, name: clip.name })),
      onCamera: () => this.toggleCamera(),
      onShare: () => this.toggleShare(),
      onActivities: () => {
        this.activitiesOpen = !this.activitiesOpen;
        this.gearOpen = false;
        this.voiceMenu = null;
        this.paintVoice();
      },
      onMute: () => this.toggleMute(),
      onDeafen: () => this.toggleDeafen(),
      onLeave: () => this.leaveVoice(),
      onPlay: (id: string) => this.playSound(id),
      onMenu: (userId: string, x: number, y: number) => this.openVoiceMenu(userId, x, y),
    };
  }

  private returnToChat() {
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = dismissCallSurface();
  }

  private dismissCallView() {
    this.returnToChat();
    this.paint();
  }

  private setStripOpen(open: boolean) {
    this.stripOpen = open;
    try {
      localStorage.setItem(CALL_STRIP_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
    this.channelShape = "";
    this.paint();
  }

  private openCallSplit() {
    if (!this.voice) return;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "split";
    this.paint();
  }

  private toggleCallView() {
    if (!this.voice) return;
    const next = toggleCallHotkey(true, this.callSurface);
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = next;
    this.paint();
  }

  private popCallOut() {
    if (!this.voice) return;
    if (this.callPopout && !this.callPopout.closed) {
      this.callPopout.focus();
      this.callSurface = "popout";
      this.ensureCallBus();
      this.paint();
      return;
    }
    const child = openCallPopout();
    if (!child) {
      this.toast("Call", "Couldn't open a call window. The call stays above the text channel.");
      this.callSurface = "split";
      this.paint();
      return;
    }
    this.callPopout = child;
    this.callSurface = "popout";
    this.ensureCallBus();
    this.paint();
  }

  private closeCallPopout() {
    const child = this.callPopout;
    this.callPopout = null;
    try {
      this.callBus?.postMessage({ type: "bye" });
    } catch {
      /* already closed */
    }
    if (child && !child.closed) child.close();
  }

  private ensureCallBus() {
    if (this.callBus) return;
    this.callBus = callBus();
    if (!this.callBus) return;
    this.callBus.onmessage = (event) => {
      const data = event.data as { type?: string; command?: CallCommand; frame?: CallFrame } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "hello") this.publishCallFrame();
      else if (data.type === "command" && data.command) this.onCallCommand(data.command);
    };
  }

  private publishCallFrame() {
    if (!this.callBus || this.callSurface !== "popout" || !this.voice) return;
    const frame: CallFrame = {
      channel: this.voice.name,
      tiles: stageTiles(this.stageMembers()),
      motion: this.ringMotion(),
      speakColor: speakColor(this.config.voice.speak_color),
      cameraOn: this.cameraOn,
      shareOn: this.shareOn,
      muted: this.voice.muted,
      deafened: this.voice.deafened,
      activitiesOpen: this.activitiesOpen,
      clips: this.config.soundboard.clips.map((clip) => ({ id: clip.id, name: clip.name })),
    };
    this.callBus.postMessage({ type: "frame", frame });
  }

  private onCallCommand(command: CallCommand) {
    if (command.type === "close") {
      if (this.callSurface !== "popout") return;
      this.callSurface = "chat";
      this.closeCallPopout();
      this.paint();
      return;
    }
    if (command.type === "dock") {
      this.closeCallPopout();
      this.callSurface = "split";
      this.paint();
      return;
    }
    if (!this.voice) return;
    if (command.type === "mute") this.toggleMute();
    else if (command.type === "deafen") this.toggleDeafen();
    else if (command.type === "leave") this.leaveVoice();
    else if (command.type === "camera") this.toggleCamera();
    else if (command.type === "share") this.toggleShare();
    else if (command.type === "activities") {
      this.activitiesOpen = !this.activitiesOpen;
      this.paintVoice();
    } else if (command.type === "play") this.playSound(command.id);
  }

  private paintPip(tile: StageTile | null) {
    if (!this.callPip) return;
    if (!tile) {
      this.callPip.hidden = true;
      clear(this.callPip);
      return;
    }
    this.callPip.hidden = false;
    renderPipTile(this.callPip, tile, this.ringMotion());
  }

  private callAvailable(): number {
    const chat = this.callSplit.parentElement;
    if (!chat) return 0;
    const composer = this.composer.closest(".composer-wrap");
    const composerH = composer instanceof HTMLElement && !composer.hidden ? composer.offsetHeight : 0;
    const used = this.chatHead.offsetHeight + (this.callStrip.hidden ? 0 : this.callStrip.offsetHeight) + composerH + this.typingEl.offsetHeight + this.callHandle.offsetHeight;
    return Math.max(0, chat.clientHeight - used);
  }

  private placeCallSplit() {
    if (!this.callSplit || this.callSplit.hidden) return;
    const available = this.callAvailable();
    if (available <= 0) return;
    this.callSplit.style.height = `${Math.round(available * this.splitRatio)}px`;
    this.callHandle.setAttribute("aria-valuemin", "28");
    this.callHandle.setAttribute("aria-valuemax", "62");
    this.callHandle.setAttribute("aria-valuenow", String(Math.round(this.splitRatio * 100)));
  }

  private placePip() {
    if (!this.callPip || this.callPip.hidden || this.pipDrag) return;
    const frame = this.messagesEl.getBoundingClientRect();
    if (frame.width < 80 || frame.height < 80) return;
    const composer = this.composer.closest(".composer-wrap");
    const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
    const size = { width: PIP_WIDTH, height: PIP_HEIGHT };
    const point = pipPoint(this.pipCorner, rectBox(frame), blocker ? rectBox(blocker) : null, size);
    this.callPip.style.width = `${size.width}px`;
    this.callPip.style.height = `${size.height}px`;
    this.callPip.style.left = `${point.x}px`;
    this.callPip.style.top = `${point.y}px`;
  }

  private bindCallChrome() {
    this.callHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.callSurface !== "split") return;
      event.preventDefault();
      const startY = event.clientY;
      const start = this.splitRatio;
      const available = this.callAvailable();
      const move = (ev: PointerEvent) => {
        if (available <= 0) return;
        this.splitRatio = clampSplitRatio(start + (ev.clientY - startY) / available);
        this.placeCallSplit();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        try {
          localStorage.setItem(CALL_SPLIT_KEY, String(this.splitRatio));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    this.callPip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.callPip.hidden) return;
      event.preventDefault();
      const rect = this.callPip.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = rect.left;
      const originY = rect.top;
      let moved = false;
      this.pipDrag = true;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > 4) moved = true;
        const frame = this.messagesEl.getBoundingClientRect();
        const composer = this.composer.closest(".composer-wrap");
        const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
        const next = clampPip(
          { x: originX + dx, y: originY + dy },
          { width: PIP_WIDTH, height: PIP_HEIGHT },
          rectBox(frame),
          blocker ? rectBox(blocker) : null,
        );
        this.callPip.style.left = `${next.x}px`;
        this.callPip.style.top = `${next.y}px`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        this.pipDrag = false;
        if (!moved) {
          this.openCallSplit();
          return;
        }
        const pip = this.callPip.getBoundingClientRect();
        const frame = this.messagesEl.getBoundingClientRect();
        const composer = this.composer.closest(".composer-wrap");
        const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
        const size = { width: PIP_WIDTH, height: PIP_HEIGHT };
        this.pipCorner = nearestPipCorner(
          { x: pip.left, y: pip.top },
          pipAnchors(rectBox(frame), blocker ? rectBox(blocker) : null, size),
        );
        try {
          localStorage.setItem(CALL_PIP_KEY, this.pipCorner);
        } catch {
          /* ignore */
        }
        this.placePip();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    window.addEventListener("resize", () => {
      this.placeCallSplit();
      this.placePip();
    });
  }

  private toggleCamera() {
    this.cameraOn = !this.cameraOn;
    this.paintVoice();
  }

  private toggleShare() {
    if (this.shareOn) {
      this.stopShare();
      return;
    }
    this.shareDialogOpen = true;
    this.shareQualityOpen = false;
    void this.loadShareSources();
    this.paint();
  }

  private openDemoShare(mode: "dialog" | "live") {
    const channel = demoChannels[NORTHWIND].find((item) => item.kind === "voice");
    if (!channel) return;
    if (mode === "live") {
      this.shareOn = true;
      this.shareLiveHeight = snapShareHeight(this.config.voice.share_resolution);
      this.shareLiveFps = snapShareFps(this.config.voice.share_fps);
      this.shareSources = demoShareSources();
    } else {
      this.shareDialogOpen = true;
      this.shareSources = demoShareSources();
      this.sharePick = this.shareSources[0]?.id ?? "screen:0";
    }
    if (mode === "live") this.callSurface = "split";
    this.joinVoice(channel);
    this.paintShareDialog();
  }

  private async loadShareSources() {
    if (this.demo) {
      this.shareSources = demoShareSources();
    } else {
      try {
        const listed = await invoke<ShareSource[]>("list_share_sources");
        this.shareSources = listed.length ? listed : [{ id: "screen:0", kind: "screen", name: "Entire screen", width: 0, height: 0, thumbnail: "" }];
      } catch {
        this.shareSources = [{ id: "screen:0", kind: "screen", name: "Entire screen", width: 0, height: 0, thumbnail: "" }];
      }
    }
    if (!this.shareSources.some((source) => source.id === this.sharePick)) this.sharePick = this.shareSources[0]?.id ?? "";
    this.paintShareDialog();
  }

  private goLive() {
    const source = this.shareSources.find((item) => item.id === this.sharePick) ?? this.shareSources[0];
    if (!source || !this.voice) return;
    this.shareDialogOpen = false;
    this.shareOn = true;
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareNote = "";
    this.shareLiveHeight = snapShareHeight(this.config.voice.share_resolution);
    this.shareLiveFps = snapShareFps(this.config.voice.share_fps);
    this.persist();
    if (!this.demo) {
      void invoke("start_screen_share", {
        sourceId: source.id,
        resolution: this.config.voice.share_resolution,
        fps: this.shareLiveFps,
        appAudio: this.config.voice.share_app_audio,
        encoder: this.config.voice.share_encoder,
        sourceWidth: source.width,
        sourceHeight: source.height,
      }).catch((err) => {
        this.shareOn = false;
        this.toast("Screen share", err instanceof Error ? err.message : "Couldn't start the stream.");
        this.paintVoice();
        this.paintChannels();
      });
    }
    this.noteCapture();
  }

  private stopShare() {
    this.shareOn = false;
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareQualityOpen = false;
    this.shareDialogOpen = false;
    this.shareNote = "";
    if (this.pipUser === this.meId()) this.pipUser = "";
    if (!this.demo) void invoke("stop_screen_share").catch(() => undefined);
    this.noteCapture();
  }

  private setShareQuality(resolution: string, fps: number) {
    const height = resolution === "0" || resolution === "source" ? "source" : resolution;
    this.config.voice.share_resolution = height;
    this.config.voice.share_fps = snapShareFps(fps);
    this.shareLiveHeight = snapShareHeight(height);
    this.shareLiveFps = this.config.voice.share_fps;
    this.persist();
    const source = this.shareSources.find((item) => item.id === this.sharePick);
    if (this.shareOn && !this.demo) {
      void invoke("set_share_quality", {
        resolution: height,
        fps: this.shareLiveFps,
        sourceWidth: source?.width ?? 0,
        sourceHeight: source?.height ?? 0,
      }).catch(() => undefined);
    }
    this.paintVoice();
    this.paintShareDialog();
  }

  private toggleSharePause() {
    this.shareUserPaused = !this.shareUserPaused;
    this.sharePaused = this.shareUserPaused;
    this.shareHeld = false;
    if (!this.demo) void invoke("set_share_paused", { paused: this.sharePaused }).catch(() => undefined);
    this.paintVoice();
    this.paintChannels();
  }

  private noteShareVisibility(hidden: boolean) {
    if (!this.shareOn || this.demo || this.shareUserPaused) return;
    if (hidden && !this.sharePaused) {
      this.shareHeld = true;
      this.sharePaused = true;
      void invoke("set_share_paused", { paused: true }).catch(() => undefined);
      this.paintVoice();
      this.paintChannels();
    } else if (!hidden && this.shareHeld) {
      this.shareHeld = false;
      this.sharePaused = false;
      void invoke("set_share_paused", { paused: false }).catch(() => undefined);
      this.paintVoice();
      this.paintChannels();
    }
  }

  private watchMember(userId: string) {
    if (!this.voice) return;
    this.shareWatching = userId;
    if (!this.demo) {
      const key = streamKeyFor(this.voice.guildId ?? "", this.voice.channelId, userId);
      void invoke("watch_stream", { streamKey: key }).catch((err) => {
        this.shareWatching = "";
        this.toast("Screen share", err instanceof Error ? err.message : "Couldn't watch that stream.");
        this.paintVoice();
      });
    }
    this.paintVoice();
  }

  private stopWatching() {
    this.shareWatching = "";
    if (!this.demo) void invoke("stop_watch_stream").catch(() => undefined);
    this.paintVoice();
  }

  private streamHandlers() {
    return {
      onWatch: (userId: string) => this.watchMember(userId),
      onStopWatch: () => this.stopWatching(),
      onStop: () => this.stopShare(),
      onPause: () => this.toggleSharePause(),
      onQuality: () => {
        this.shareQualityOpen = !this.shareQualityOpen;
        this.paintVoice();
      },
      onResolution: (value: string) => this.setShareQuality(value, this.config.voice.share_fps),
      onFps: (fps: number) => this.setShareQuality(this.config.voice.share_resolution, fps),
      onPip: (userId: string) => {
        this.pipUser = this.pipUser === userId ? "" : userId;
        this.paintVoice();
      },
      resolution: this.config.voice.share_resolution,
      fps: this.config.voice.share_fps,
    };
  }

  private mountShareSurfaces() {
    if (!this.callPip) return;
    mountStreamTiles(this.root, this.streamModels(), this.streamHandlers(), this.pipUser);
  }

  private streamModels() {
    if (!this.voice) return [];
    const selfId = this.meId();
    return this.voice.members.flatMap((member) => {
      const self = member.id === selfId;
      const sharing = (self && this.shareOn) || Boolean(member.sharing);
      if (!sharing) return [];
      return [{
        userId: member.id,
        name: member.name,
        self,
        paused: self && this.sharePaused,
        watching: !self && this.shareWatching === member.id,
        label: self ? qualityLabel(this.shareLiveHeight, this.shareLiveFps) : member.sharing ? "Go Live" : "",
        note: self ? this.shareNote : "",
        qualityOpen: self && this.shareQualityOpen,
      }];
    });
  }

  private paintShareDialog() {
    if (!this.shareLayer) return;
    this.shareLayer.replaceChildren();
    if (!this.shareDialogOpen) {
      this.shareLayer.hidden = true;
      return;
    }
    this.shareLayer.hidden = false;
    this.shareLayer.append(shareDialog({
      sources: this.shareSources.length ? this.shareSources : demoShareSources(),
      selectedId: this.sharePick,
      resolution: this.config.voice.share_resolution,
      fps: this.config.voice.share_fps,
      appAudio: this.config.voice.share_app_audio,
      onSelect: (id) => {
        this.sharePick = id;
        this.paintShareDialog();
      },
      onResolution: (value) => this.setShareQuality(value, this.config.voice.share_fps),
      onFps: (fps) => this.setShareQuality(this.config.voice.share_resolution, fps),
      onAppAudio: (on) => {
        this.config.voice.share_app_audio = on;
        this.persist();
        this.paintShareDialog();
      },
      onGo: () => this.goLive(),
      onClose: () => {
        this.shareDialogOpen = false;
        this.paintShareDialog();
      },
    }));
  }

  private onScreenShare(event: { state?: string; note?: string; detail?: string; fps?: number; height?: number }) {
    const state = event.state ?? "";
    const note = event.note || event.detail || "";
    if (state === "live") this.shareOn = true;
    if (state === "stopped") this.shareOn = false;
    if (state === "failed") {
      this.shareNote = note || "The stream stopped.";
      this.toast("Screen share", this.shareNote);
    }
    if (state === "adapted") {
      this.shareNote = note;
      if (typeof event.fps === "number") this.shareLiveFps = snapShareFps(event.fps);
      if (typeof event.height === "number" && [720, 1080, 1440, 2160].includes(event.height)) this.shareLiveHeight = event.height;
    }
    this.paintVoice();
    this.paintChannels();
  }

  private onStreamFrame(event: { annexB?: string; streamKey?: string; preview?: boolean }) {
    if (!event.annexB) return;
    const raw = atob(event.annexB);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    const userId = event.preview || !event.streamKey ? this.meId() : event.streamKey.split(":").at(-1) || "";
    if (userId) pushStreamFrame(userId, bytes);
  }

  private openVoiceMenu(userId: string, x: number, y: number) {
    if (userId === this.meId()) return;
    this.voiceMenu = { userId, x, y };
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.paintVoice();
  }

  private dismissVoiceFloats(event: PointerEvent) {
    if (event.button !== 0) return;
    if (!this.voiceMenu && !this.gearOpen && !this.activitiesOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".voice-menu, .voice-gear, .voice-pop, .voice-bar, .share-dialog, .share-popover, .share-layer, [data-voice-gear]")) return;
    this.voiceMenu = null;
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.paintVoiceFloats();
    if (this.callSurface === "split") this.paintVoice();
  }

  private paintVoiceFloats() {
    this.paintVoiceMenu();
    this.paintGear();
  }

  private paintVoiceMenu() {
    const host = this.voiceMenuEl;
    if (!host) return;
    const menu = this.voiceMenu;
    const person = menu ? Object.values(this.voiceRoster).find((item) => item.userId === menu.userId) : undefined;
    if (!menu || !person || person.userId === this.meId()) {
      host.hidden = true;
      clear(host);
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-label", `Volume for ${person.name}`);
    host.style.left = `${menu.x}px`;
    host.style.top = `${menu.y}px`;
    host.append(el("strong", "", person.name));
    const readout = el("span", "hint", `User volume ${person.volume}%`);
    const vol = el("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "200";
    vol.value = String(person.volume);
    vol.setAttribute("aria-label", `Volume for ${person.name}`);
    const muted = person.localMuted;
    vol.addEventListener("input", () => {
      const next = Number(vol.value);
      readout.textContent = `User volume ${next}%`;
      this.previewMix(person.userId, next, muted);
    });
    vol.addEventListener("change", () => void this.persist());
    const mute = el("button", muted ? "text-button is-on" : "text-button", muted ? "Muted for you" : "Mute for you");
    mute.type = "button";
    mute.addEventListener("click", () => this.setUserMix(person.userId, Number(vol.value), !muted));
    host.append(readout, vol, mute);
    this.clampFloat(host, menu.x, menu.y);
  }

  private paintGear() {
    const host = this.voiceGearEl;
    if (!host) return;
    if (!this.gearOpen || !this.voice) {
      host.hidden = true;
      clear(host);
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("aria-label", "Voice settings");
    host.append(el("strong", "", "Voice settings"));
    host.append(this.devicePicker("Microphone", this.config.voice.input_device, this.captureDevices(), (value) => {
      this.config.voice.input_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.devicePicker("Speakers", this.config.voice.output_device, this.playbackDevices(), (value) => {
      this.config.voice.output_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.devicePicker("Camera", this.config.voice.video_device, this.videoInputs, (value) => {
      this.config.voice.video_device = value;
      this.persist();
    }));
    const sense = el("input");
    sense.type = "range";
    sense.min = "0";
    sense.max = "100";
    sense.value = String(this.config.voice.sensitivity);
    sense.setAttribute("aria-label", "Voice activity sensitivity");
    sense.addEventListener("input", () => {
      this.config.voice.sensitivity = Number(sense.value);
      this.persist();
      this.pushVoiceAudio();
      this.refreshSpeaking();
    });
    host.append(el("span", "hint", "Voice activity sensitivity"), sense);
    host.append(this.gearToggle("Noise suppression", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.gearToggle("Voice HUD", this.overlayOn(), (value) => this.setVoiceOverlay(value, false)));
    host.append(this.gearToggle("Performance", this.perfOn(), (value) => this.setPerfOverlay(value, false)));
    host.append(this.gearToggle("Game capture", this.config.clips.game_capture, (value) => {
      this.config.clips.game_capture = value;
      void this.persist().then(() => this.pullClipStatus());
    }));
    host.append(this.choice(["vad", "ptt"], this.voiceMode(), (value) => {
      this.setVoiceMode(value === "ptt" ? "ptt" : "vad");
      this.paintGear();
    }));
    host.append(el("strong", "", "Soundboard"));
    if (!this.config.soundboard.clips.length) host.append(el("p", "hint", "Add clips in Voice & Video."));
    for (const clip of this.config.soundboard.clips) {
      const play = el("button", "text-button", clip.name);
      play.type = "button";
      play.addEventListener("click", () => this.playSound(clip.id));
      host.append(play);
    }
    const more = el("button", "text-button", "Voice & Video settings");
    more.type = "button";
    more.addEventListener("click", () => {
      this.gearOpen = false;
      this.section = "voice";
      this.paintVoiceFloats();
      this.openSettings();
    });
    host.append(more);
    const anchor = this.channelPane.querySelector("[data-voice-gear]");
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
    const x = rect ? rect.left : 16;
    const y = rect ? rect.top - 8 : 80;
    host.style.left = `${x}px`;
    host.style.top = `${Math.max(8, y)}px`;
    this.clampFloat(host, x, y, true);
  }

  private gearToggle(label: string, on: boolean, change: (value: boolean) => void): HTMLElement {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", label));
    const button = el("button", on ? "text-button is-on" : "text-button", on ? "On" : "Off");
    button.type = "button";
    button.addEventListener("click", () => {
      change(!on);
      this.paintGear();
      if (this.settings && this.section === "voice") this.renderSettings();
    });
    row.append(button);
    return row;
  }

  private clampFloat(host: HTMLElement, x: number, y: number, above = false) {
    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - rect.width - 8));
      let top = above ? y - rect.height : y;
      top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - rect.height - 8));
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    });
  }

  private setUserMix(userId: string, volume: number, muted: boolean) {
    const mix = { volume: playbackVolume(volume, false), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    void this.persist();
    this.syncCallMembers();
    this.paintVoice();
    this.paintChannels();
  }

  private previewMix(userId: string, volume: number, muted: boolean) {
    const mix = { volume: playbackVolume(volume, false), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    const member = this.voice?.members.find((item) => item.id === userId);
    if (member) {
      member.volume = mix.volume;
      member.localMuted = muted;
    }
    if (this.demo || !this.voice) return;
    const gain = playbackVolume(mix.volume, muted);
    if (this.sentMix.get(userId) === gain) return;
    this.sentMix.set(userId, gain);
    void invoke("set_voice_volume", { userId, volume: gain }).catch(() => undefined);
  }

  private matchSound(event: KeyboardEvent, typing: boolean): boolean {
    const clip = clipForHotkey(this.config.soundboard.clips, event, this.platform.os);
    if (!clip) return false;
    if (typing && !soundHotkeyIsGlobal(clip.hotkey)) return false;
    this.playSound(clip.id);
    return true;
  }

  private playSound(id: string) {
    const clip = this.config.soundboard.clips.find((item) => item.id === id);
    if (!clip) return;
    if (!this.voice) {
      this.toast("Soundboard", "Join a voice channel to play a sound.");
      return;
    }
    if (!isTauri()) {
      const url = this.clipBlobs.get(id);
      if (!url) {
        this.toast("Soundboard", "Add the wav again in this preview. The desktop app plays it into the call.");
        return;
      }
      const audio = new Audio(url);
      audio.volume = Math.min(1, clip.volume / 100);
      void audio.play().catch(() => this.toast("Soundboard", "Couldn't play that clip."));
      return;
    }
    void invoke("play_soundboard", { id }).catch((err) => {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't play that clip.");
    });
  }

  private saveNote(userId: string, note: string) {
    const clean = clampNote(note);
    if (clean) this.notes[userId] = clean;
    else delete this.notes[userId];
    if (this.friendsOpen) {
      this.msgSig = "";
      this.paintMessages();
    }
    if (this.demo) return;
    void invoke("save_user_note", { userId, note: clean }).catch((err) => {
      this.toast("Note", err instanceof Error ? err.message : "Couldn't save that note.");
    });
  }

  private appendSoundboard(wrap: HTMLElement) {
    const card = settingCard("Soundboard");
    card.dataset.setting = "voice.soundboard";
    card.append(el("p", "setting-help", "WAV clips mixed into the call. A hotkey with a modifier also works while another app is in front."));
    const file = el("input");
    file.type = "file";
    file.accept = ".wav,audio/wav,audio/x-wav";
    file.hidden = true;
    file.addEventListener("change", () => {
      const picked = file.files?.[0];
      file.value = "";
      if (picked) void this.addSoundFile(picked);
    });
    const add = el("button", "text-button", "Add wav");
    add.type = "button";
    add.addEventListener("click", () => file.click());
    const actions = el("div", "settings-actions");
    actions.append(add, file);
    card.append(actions);
    if (!this.config.soundboard.clips.length) {
      card.append(el("p", "setting-help", "No clips yet. 16-bit WAV, up to 15 seconds."));
      wrap.append(card);
      return;
    }
    for (const clip of this.config.soundboard.clips) {
      const row = el("div", "shortcut-row");
      row.append(el("span", "", clip.name));
      const hotkey = el("button", "kbd", this.soundBind === clip.id ? "Press keys" : clip.hotkey ? formatShortcut(clip.hotkey, this.platform.os) : "Hotkey");
      hotkey.type = "button";
      hotkey.addEventListener("click", () => {
        this.soundBind = clip.id;
        this.renderSettings();
      });
      const volume = el("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "200";
      volume.value = String(clip.volume);
      volume.title = "Clip volume";
      volume.setAttribute("aria-label", `${clip.name} volume`);
      volume.addEventListener("input", () => {
        clip.volume = Math.min(200, Math.max(0, Math.round(Number(volume.value))));
      });
      volume.addEventListener("change", () => {
        void this.persist();
      });
      const play = el("button", "text-button", "Play");
      play.type = "button";
      play.addEventListener("click", () => this.playSound(clip.id));
      const remove = el("button", "ghost", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => void this.removeSound(clip));
      row.append(hotkey, volume, play, remove);
      card.append(row);
    }
    wrap.append(card);
  }

  private async addSoundFile(file: File) {
    if (this.config.soundboard.clips.length >= 24) {
      this.toast("Soundboard", "The board already has 24 clips.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".wav")) {
      this.toast("Soundboard", "Use a WAV file.");
      return;
    }
    if (!isTauri()) {
      const id = `preview${Date.now().toString(16)}`;
      this.clipBlobs.set(id, URL.createObjectURL(file));
      const name = file.name.replace(/\.wav$/i, "").slice(0, 40) || "Sound";
      this.config.soundboard.clips.push({ id, name, path: file.name, hotkey: "", volume: 100 });
      await this.persist();
      this.renderSettings();
      this.paintVoice();
      return;
    }
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const clip = await invoke<SoundClip>("import_sound_clip", { name: file.name, bytes });
      this.config.soundboard.clips.push(clip);
      await this.persist();
      this.renderSettings();
      this.paintVoice();
    } catch (err) {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't add that clip.");
    }
  }

  private async removeSound(clip: SoundClip) {
    const url = this.clipBlobs.get(clip.id);
    if (url) URL.revokeObjectURL(url);
    this.clipBlobs.delete(clip.id);
    if (isTauri()) await invoke("delete_sound_clip", { path: clip.path }).catch(() => undefined);
    this.config.soundboard.clips = this.config.soundboard.clips.filter((item) => item.id !== clip.id);
    await this.persist();
    this.renderSettings();
    this.paintVoice();
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
        const shown = this.presentView(view);
        body.append(renderMessage(shown, {
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
          ...this.messageChrome(message, shown),
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
        button.append(el("strong", "", this.maskText(hit.authorName)), el("span", "faint", this.previewLine(hit, 120)));
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
    button.append(el("strong", "", this.maskText(message.authorName)), el("span", "", this.previewLine(message, 140)));
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
    const personView = this.streamerOn()
      ? { ...person, name: this.maskText(person.name), custom: this.maskText(person.custom ?? ""), activity: person.activity ? this.maskText(person.activity) : person.activity }
      : person;
    renderProfileCard(pop, {
      person: personView,
      self: person.id === this.meId(),
      statusPicker: this.statusOpen && person.id === this.meId(),
      roles: this.profileRoles(person),
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
      note: this.streamerOn() ? "" : (this.notes[person.id] ?? ""),
      onNote: this.streamerOn() || person.id === this.meId() ? undefined : (note) => this.saveNote(person.id, note),
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
      reminded: Boolean(reminderFor(this.reminders, message.channelId, message.id)),
      translated: Boolean(this.translated[message.id]),
      onBookmark: () => this.onBookmark(message),
      onRemind: () => this.beginReminder(message),
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
  }

  private paintBookmarks() {
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
    if (!this.pack.bookmarks.length) list.append(el("p", "hint", "Save a message and it stays on this device."));
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
    void this.notify(this.maskText(message.authorName), this.maskText(plainPreview(message.content, this.renderContext()) || hit));
  }

  private tickClock() {
    if (!this.hookOn("relativeTime") || this.view !== "app") return;
    this.clock = Date.now();
    this.msgSig = "";
    this.paintMessages();
  }

  private tickPlugins() {
    this.tickReminders();
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
    if (this.settings && this.section === "gaming") this.renderSettings();
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
      if (this.settings && this.section === "gaming") this.renderSettings();
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
  }

  private storeEcho(channelId: string, message: RawMessage) {
    history[channelId] = mergeIncoming(history[channelId] ?? [], message);
    this.pages[channelId] = mergeIncoming(this.pages[channelId] ?? [], message);
  }

  private dropEcho(channelId: string, localId: string) {
    const keep = (item: RawMessage) => item.id !== localId && item.nonce !== localId;
    history[channelId] = (history[channelId] ?? []).filter(keep);
    this.pages[channelId] = (this.pages[channelId] ?? []).filter(keep);
  }

  private async postPlain(channelId: string, content: string): Promise<boolean> {
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

function rectBox(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
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
  const nonce = message.nonce == null ? "" : String(message.nonce).trim();
  return {
    ...message,
    nonce: nonce || undefined,
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
