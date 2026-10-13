import { reportCrash } from "../crash";
import { defaultConfig } from "../config";
import { ME, NORTHWIND } from "../demo/data";
import { type RestHit } from "../rest-cache";
import { type EmojiUse } from "../emoji";
import { type MentionHit } from "../mentions";
import { type MissedNote } from "../smart-notify";
import {
  FolderSync, type DropIntent
} from "../folders";
import {
  type DiscordNotify,
  type GuildAccess,
  type GuildFolder, type ReadMarker
} from "../shell";
import { ListSync } from "../user-lists";
import { type AwayClock } from "../pack/away";
import { type ConnectionLine } from "../pack/connections";
import { type ScheduledSend } from "../pack/schedule";
import { defaultPack, type PackState } from "../pack/state";
import "../media/call-volume";
import "../media/files-panel";
import "../media/watch-panel";
import "../media/activity-panel";
import { type DraftMap } from "../drafts";
import { type Reminder } from "../reminders";
import { browserPlatform, type PlatformInfo } from "../platform";
import { type PluginCatalogItem, type PluginSource } from "../plugins";
import {
  type InstalledRecord,
  type StoreIndex
} from "../store";
import { FrameClock } from "../frame";
import { emptyPerfSample, type PerfSample } from "../perf";
import {
  type SavedPlace,
  type StartupMilestone
} from "../startup";
import {
  type HardwareState
} from "../hardware";
import {
  type ClipCard
} from "../clips";
import {
  type CallSurface,
  type PipCorner
} from "../call-layout";
import {
  initialUpdateState, type UpdateState
} from "../updates";
import {
  initialInterfaceUi, type InterfaceUi
} from "../interface-update";
import type { Update } from "@tauri-apps/plugin-updater";
import type { LocalSearchClient } from "../local-search-client";
import type { AppConfig, Channel, Guild, Person, RawMessage, Shortcuts } from "../types";
import { type ThemePreviewSession } from "../theme-preview";
import {
  type MemberListSort, type PaintedRow,
  type MemberListState, type RoleInfo
} from "../members";
import { QR_CAPTION } from "../signin";
import {
  type FriendTab,
  type SocialRelationship
} from "../social";
import { type GuildSound } from "../soundboard";
import { defaultCallView, restingDesk, voiceLinkDetails, type CallViewPrefs, type DeskAudio, type InputProfile, type VoiceRoster } from "../voice";
import { el } from "./dom";
import type { BoardSession } from "./dashboard-view";
import type { StatNote } from "./stats-store";
import { type ShareSource } from "../share";
import {
  type RingState
} from "../call-ring";
import { type MutedTalkState } from "../muted-talk";
import { type MutedProbe } from "../muted-probe";
import type { WireProfile } from "./profile";
import type { ProfileTabId } from "./profile-tabs";
import {
  type AccountOverview
} from "../user-settings";

import type { VoiceSession, ScrollMode, LocalFile, ClipAsk } from "./app-shared";
import { voiceMethods } from "./app-voice";
import { installMethods } from "./app-shared";
import { bootMethods } from "./app-boot";
import { railMethods } from "./app-rail";
import { messageMethods } from "./app-messages";
import { dashboardMethods } from "./app-dashboard";
import { memberMethods } from "./app-members";
import { composerMethods } from "./app-composer";
import { settingsMethods } from "./app-settings";
import { storeMethods } from "./app-store";
import { updateMethods } from "./app-updates";
import { notifyMethods } from "./app-notify";
import { clipMethods } from "./app-clips";
import { gatewayMethods } from "./app-gateway";
import { searchMethods } from "./app-search";
import { messageToolMethods } from "./app-message-tools";
import { emojiMethods } from "./app-emoji";
import { presenceMethods } from "./app-presence";
import { menuMethods } from "./app-menus";
import { socialMethods } from "./app-social";
import { extraMethods } from "./app-extras";

export function mount(root: HTMLElement) {
  try {
    const app = new LarkApp(root);
    void app.start().catch((error) => reportCrash(error));
  } catch (error) {
    reportCrash(error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- methods split into app-*.ts are merged in below
export class LarkApp {
  config: AppConfig = defaultConfig();
  platform: PlatformInfo = browserPlatform();
  view: "gate" | "app" = "gate";
  demo = false;
  bench = false;
  guildId: string | null = NORTHWIND;
  channelId: string | null = null;
  pages: Record<string, RawMessage[]> = {};
  more: Record<string, boolean> = {};
  unread: Record<string, number> = {};
  mentions: Record<string, number> = {};
  divider: Record<string, string | null> = {};
  loading = false;
  error: string | null = null;
  reply: RawMessage | null = null;
  editing: RawMessage | null = null;
  pendingDelete: RawMessage | null = null;
  files: LocalFile[] = [];
  pickerFor: string | null = null;
  switcher = false;
  switcherIndex = 0;
  settings = false;
  settingsQueued = false;
  section = "appearance";
  settingsQuery = "";
  settingsAnchor = "";
  settingsEntered = "";
  rebinding: keyof Shortcuts | null = null;
  soundBind: string | null = null;
  notes: Record<string, string> = {};
  clipBlobs = new Map<string, string>();
  sentMix = new Map<string, number>();
  narrow = false;
  drawer = false;
  lightbox: string | null = null;
  lightboxZoom = 1;
  youtubeFloat: string | null = null;
  youtubeFloatStamp = "";
  catalog: PluginCatalogItem[] = [];
  storeIndex: StoreIndex | null = null;
  installed: InstalledRecord[] = [];
  preferBuiltin = false;
  themePreview: ThemePreviewSession | null = null;
  storeListening = false;
  storeRefreshing = false;
  storeIndexTried = false;
  storeInstalling = "";
  storeQuery = "";
  storeKind: "all" | "plugin" | "theme" = "all";
  storeCategory = "";
  loaded = new Map<string, PluginSource>();
  pack: PackState = defaultPack();
  translated: Record<string, string> = {};
  away: AwayClock = { lastActivity: Date.now(), away: false, lastWrite: 0, savedStatus: "online" };
  playingShown = "";
  playingWrite = 0;
  hardware: HardwareState = { enabled: false, takeover: false, paused: false, owned: "", savedCustom: "" };
  hardwareSampleAt = 0;
  hardwareBusy = false;
  hardwareChecking = false;
  hardwareLine: string | null = null;
  hardwarePushFailed = false;
  hardwarePushAt = 0;
  detectedGame: string | null = null;
  frontApp: string | null = null;
  blockedIds = new Set<string>();
  gameMode = false;
  perfSample: PerfSample = emptyPerfSample();
  fpsMarks: number[] = [];
  fpsLoop = false;
  pollTimers: number[] = [];
  detectBusy = false;
  appliedVoiceKey = "";
  perfToggleAt = 0;
  gameToggleAt = 0;
  rebindingGame: string | null = null;
  keywordLast: Record<string, number> = {};
  readAllQueue: { channelId: string; messageId: string }[] = [];
  readAllTimer = 0;
  whoisUser = "";
  whoisHide = 0;
  whoisCache = new Map<string, { joinedAt?: string; mutuals: string[]; at: number }>();
  liveQueue: ScheduledSend[] = [];
  sendingLive = false;
  liveScheduling = false;
  sendingScheduled = false;
  scheduling = false;
  bookmarksOpen = false;
  reminders: Reminder[] = [];
  reminding: RawMessage | null = null;
  clock = Date.now();
  scroll: ScrollMode = "none";
  scrollLock = 0;
  pinnedToBottom = true;
  messagePaints: number[] = [];
  statusFlaps: number[] = [];
  typingTimer = 0;
  appliedTheme = "";
  msgSig = "";
  messageHeights = new Map<string, number>();
  msgStart = 0;
  msgEnd = 0;
  messageFrame = 0;
  composerFrame = 0;
  channelShape = "";
  railShape = "";
  railBadges = "";
  memberShape = "";
  memberPaint: PaintedRow[] | null = null;
  memberFrame = 0;
  prefetchToken = 0;
  pageLoads = new Map<string, Promise<{ messages: RawMessage[]; hasMore: boolean }>>();
  restPages = new Map<string, RestHit<RawMessage[]>>();
  warm = new Set<string>();
  hudQueued = false;
  openedAt = 0;
  tokenNote = "";
  signInBusy = "";
  qrSvg = "";
  qrStatus = QR_CAPTION;
  qrWatching = false;
  connection = "Demo";
  focused = true;
  missed: MissedNote[] = [];
  missedSeen = 0;
  quietOn = false;
  typingSent = 0;
  me: Person = { id: ME, name: "You", status: "online" };
  liveGuilds: Guild[] = [];
  liveChannels: Record<string, Channel[]> = {};
  channelLoads = new Map<string, Promise<void>>();
  channelWaiters = new Map<string, Array<() => void>>();
  gatewayReadyAt = 0;
  savedPlace: SavedPlace = { guildId: null, channelId: null };
  splashEl!: HTMLElement;
  splashStatus!: HTMLElement;
  splashTrack!: HTMLElement;
  splashBar!: HTMLElement;
  holdShell = false;
  shellShown = false;
  splashLeaving = false;
  startupCold = true;
  resumeOverlay = false;
  startupMilestone: StartupMilestone = "connect";
  startupStepAt = 0;
  splashShownAt = 0;
  gatewayDownAt = 0;
  landingWarmStarted = false;
  channelCheckQueued = false;
  splashFrame = 0;
  slowSplashTimer = 0;
  channelGraceTimer = 0;
  splashFinishTimer = 0;
  splashHideTimer = 0;
  splashCapTimer = 0;
  liveDms: Channel[] = [];
  liveMembers: Person[] = [];
  membersByGuild: Record<string, Person[]> = {};
  memberLists: Record<string, MemberListState> = {};
  memberPhase: Record<string, "loading" | "done"> = {};
  memberRanges = "";
  memberScrollTimer = 0;
  peopleTimer = 0;
  rolesByGuild: Record<string, RoleInfo[]> = {};
  friends: Person[] = [];
  friendsOpen = false;
  friendTab: FriendTab = "online";
  relationships: SocialRelationship[] = [];
  relationshipsRetry = 0;
  dmPins = new Set<string>();
  dmPinsReady = false;
  closedDms = new Set<string>();
  profilePanelOpen = false;
  profileFull = false;
  profileTab: ProfileTabId = "about";
  serverEditor = false;
  socialMenusBound = false;
  friendTick = 0;
  dashboardOpen = false;
  dashboardTick = 0;
  dashboardSig = "";
  dashboardVis = false;
  dashboardLoading: Promise<typeof import("./dashboard")> | null = null;
  dashboardMod: typeof import("./dashboard") | null = null;
  late: typeof import("./late") | null = null;
  lateTask: Promise<typeof import("./late")> | null = null;
  threadCore: typeof import("../threads") | null = null;
  threadCoreTask: Promise<typeof import("../threads")> | null = null;
  modReady = false;
  boardOpen = false;
  boardSession: BoardSession | null = null;
  boardLoading: Promise<BoardSession> | null = null;
  boardHost!: HTMLElement;
  statOff = false;
  statSpeaking = false;
  statBoot = 0;
  statTimer = 0;
  statQueue: StatNote[] = [];
  statusEmoji = "";
  statusEmojiId: string | null = null;
  statusEmojiAnimated = false;
  statusClearAt: number | null = null;
  directory: Record<string, Person> = {};
  wireProfile: WireProfile | null = null;
  liveRoles: Record<string, string> = {};
  userNames: Record<string, string> = {};
  typingNames: { channelId: string; name: string; until: number }[] = [];
  lastRead: Record<string, string> = {};
  channelLast: Record<string, string> = {};
  behind: Record<string, boolean> = {};
  freshCount = 0;
  nearBottom = true;
  jumpId: string | null = null;
  suggest: MentionHit[] = [];
  suggestIndex = 0;
  suggestStart = 0;
  suggestKey = "";
  guildEmojis: Record<string, { id: string; name: string; animated: boolean }[]> = {};
  emojiQuery = "";
  pinCache: Record<string, RawMessage[]> = {};
  searchToken = 0;
  newBar!: HTMLButtonElement;
  suggestEl!: HTMLElement;
  shell!: HTMLElement;
  rail!: HTMLElement;
  channelPane!: HTMLElement;
  chatHead!: HTMLElement;
  messagesEl!: HTMLElement;
  typingEl!: HTMLElement;
  membersEl!: HTMLElement;
  composer!: HTMLTextAreaElement;
  composerBanner!: HTMLElement;
  clipBanner!: HTMLElement;
  composerMeta!: HTMLElement;
  gate!: HTMLElement;
  switcherEl!: HTMLElement;
  settingsEl!: HTMLElement;
  lightboxEl!: HTMLElement;
  youtubeFloatEl!: HTMLElement;
  toastWrap!: HTMLElement;
  updateBannerEl!: HTMLElement;
  interfaceToastEl!: HTMLElement;
  updates: UpdateState = initialUpdateState("3.0.6", true);
  interfaceUi: InterfaceUi = initialInterfaceUi();
  updateTimer = 0;
  interfaceTimer = 0;
  pendingUpdate: Update | null = null;
  updateBusy = false;
  installingUpdate = false;
  stage!: HTMLElement;
  splitPane!: HTMLElement;
  voiceDock!: HTMLElement;
  callStrip!: HTMLElement;
  callSplit!: HTMLElement;
  callSplitBar!: HTMLElement;
  callHandle!: HTMLElement;
  callPip!: HTMLElement;
  voiceMenuEl!: HTMLElement;
  voiceGearEl!: HTMLElement;
  hudEl!: HTMLElement;
  hudSig = "";
  hudTicket = 0;
  hudToggleAt = 0;
  countEl: HTMLElement | null = null;
  splitId: string | null = null;
  voice: VoiceSession | null = null;
  voiceRoster: VoiceRoster = {};
  voiceAvatarFetches = new Set<string>();
  voiceEpoch = 0;
  voiceJoinedAt = 0;
  voiceConnectedAt = 0;
  callTimerTick = 0;
  sessionTick = 0;
  sessionShown = "";
  sessionWrite = 0;
  callSurface: CallSurface = "chat";
  stripOpen = false;
  pipCorner: PipCorner = "bottom-right";
  splitRatio = 0.42;
  pipDrag = false;
  callPopout: Window | null = null;
  callBus: BroadcastChannel | null = null;
  cameraOn = false;
  gearOpen = false;
  activitiesOpen = false;
  soundboardOpen = false;
  heardSounds = new Map<string, number>();
  micMenuOpen = false;
  moreOpen = false;
  voiceMenu: { userId: string; x: number; y: number } | null = null;
  channelMenu: { channelId: string; x: number; y: number } | null = null;
  desk: DeskAudio = restingDesk();
  callView: CallViewPrefs = defaultCallView();
  voiceDetails = voiceLinkDetails({});
  incoming: RingState | null = null;
  ringHandle: { start(): void; stop(): void } | null = null;
  ringNotified = "";
  callActionsBound = false;
  mutedTalk: MutedTalkState = { show: false, heldMs: 0 };
  mutedProbe: MutedProbe | null = null;
  muteHotkeyAt = 0;
  deafenHotkeyAt = 0;
  netPanel: { close: () => void } | null = null;
  netVoiceTimer = 0;
  netTicket = 0;
  netOpening = false;
  inputProfiles: InputProfile[] = [];
  inputProfileId = "";
  inputVolume = 100;
  outputVolume = 100;
  echoCancellation = true;
  agc = true;
  noiseQuality: "standard" | "high" = "standard";
  soundToggles: Record<string, boolean> = {};
  guildSounds: GuildSound[] = [];
  voiceChatLines: { id: string; author: string; text: string }[] = [];
  voiceChatEl: HTMLElement | null = null;
  watchUrl = "";
  watchVideo = "";
  stageTopic = "";
  stageRaised = false;
  stageSpeaker = false;
  voiceChannelMenuBound = false;
  deviceMenu: "input" | "output" | null = null;
  inputLevel = 0;
  micTestOn = false;
  micMeterTimer = 0;
  micPreview: MediaStream | null = null;
  cameraStream: MediaStream | null = null;
  cameraTimer = 0;
  cameraStop: (() => void) | null = null;
  cameraGen = 0;
  cpalInputs: string[] = [];
  cpalOutputs: string[] = [];
  shareOn = false;
  sharePaused = false;
  shareUserPaused = false;
  shareHeld = false;
  shareNote = "";
  shareDialogOpen = false;
  shareQualityOpen = false;
  shareSources: ShareSource[] = [];
  sharePick = "screen:0";
  shareWatching = "";
  pipUser = "";
  shareLiveHeight = 1080;
  shareLiveFps = 30;
  shareLayer!: HTMLElement;
  pendingClip: { name: string; path: string; bytes: number; spanMs: number } | null = null;
  clipNotice = "";
  clipsOpen = false;
  clipItems: ClipCard[] = [];
  clipStamp = "";
  clipAsk: ClipAsk | null = null;
  clipPlayer: string | null = null;
  clipPlayNote = "";
  clipTrim: string | null = null;
  clipSendFor: string | null = null;
  clipRename: string | null = null;
  clipProgress: { name: string; percent: number } | null = null;
  premiumType = 0;
  clipDialog!: HTMLElement;
  clipStatus: {
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
  pttHeld = false;
  pushMuted = false;
  mutedByPush = false;
  discordRebind: string | null = null;
  hotkeysOff = false;
  accountOverview: AccountOverview | null = null;
  accountNote = "";
  gateAccountSig = "";
  recent: string[] = [];
  drafts: DraftMap = {};
  draftTicket = 0;
  draftsReady = false;
  emojiUses: EmojiUse[] = [];
  searchOpen = false;
  localSearchOpen = false;
  localSearchSeq = 0;
  localSearchPanel: { destroy(): void } | null = null;
  localPending = new Map<string, RawMessage[]>();
  localTombstones = new Set<string>();
  localFlushQueued = false;
  localOps: Promise<unknown> = Promise.resolve();
  localClientPromise: Promise<LocalSearchClient> | null = null;
  pinsOpen = false;
  digestOpen = false;
  receiptNote = false;
  nickTarget: { id: string; name: string } | null = null;
  connectionCache = new Map<string, { lines: ConnectionLine[]; at: number }>();
  awayReplyBusy = false;
  themeOpen = false;
  themeFilter = "";
  extraThemeIds: string[] = [];
  themeCache = new Map<string, string>();
  imported = new Map<string, string>();
  materialWanted: string | null = null;
  popout: Person | null = null;
  statusOpen = false;
  folders: GuildFolder[] = [];
  folderOpen: Record<string, boolean> = {};
  folderSync: FolderSync | null = null;
  folderMenuEl: HTMLElement | null = null;
  suppressRailClick = false;
  railIntent: DropIntent | null = null;
  railDrag: { pointerId: number; kind: "guild" | "folder"; id: string; x: number; y: number; moved: boolean } | null = null;
  collapsedCats = new Set<string>();
  catSeeded = false;
  markers: Record<string, ReadMarker> = {};
  localUnread: Record<string, number> = {};
  localMentions: Record<string, number> = {};
  access: Record<string, GuildAccess> = {};
  discordNotify: DiscordNotify = { guilds: {}, dms: {} };
  invite: { code: string; name: string; detail: string; icon: string } | null = null;
  inviteEl!: HTMLElement;
  contextMenuEl: HTMLElement | null = null;
  favorites: Record<string, string[]> = {};
  favoriteIds: string[] = [];
  favoritesMuted = false;
  favoriteExtras: string[] = [];
  favoritesMigrated = false;
  pinsMigrated = false;
  listSync: ListSync | null = null;
  savedHeld = new Set<string>();
  pinnedChannels: Record<string, string[]> = {};
  hideMuted = false;
  viewAsRoleId: string | null = null;
  viewAsPermissions = "";
  guildSettingsEl: HTMLElement | null = null;
  guildSettingsTicket = 0;
  memberListSort: MemberListSort = "status";
  audioInputs: { id: string; label: string }[] = [];
  audioOutputs: { id: string; label: string }[] = [];
  videoInputs: { id: string; label: string }[] = [];
  badgeSent = -1;
  upload = 0;
  draftTimer = 0;
  frames = new FrameClock();

  constructor(readonly root: HTMLElement) {}

  layoutObserver: ResizeObserver | null = null;
  layoutColumn: HTMLElement | null = null;

  switcherHitsCache: { id: string; guildId: string | null; label: string; hint: string; command?: string }[] = [];

  voicePrefsLoaded = false;

  pinRow(message: RawMessage): HTMLElement {
    const row = el("div", "pin-row");
    const button = el("button", "bookmark-row");
    button.type = "button";
    button.append(el("strong", "", this.maskText(message.authorName)), el("span", "", this.previewLine(message, 140)));
    button.addEventListener("click", () => {
      this.pinsOpen = false;
      this.paintPins();
      void this.jumpToMessage(message.channelId || this.channelId || "", message.id);
    });
    const unpin = el("button", "text-button", "Unpin");
    unpin.type = "button";
    unpin.setAttribute("aria-label", "Unpin message");
    unpin.addEventListener("click", (event) => {
      event.stopPropagation();
      message.pinned = true;
      void this.pinMessage(message);
    });
    row.append(button, unpin);
    return row;
  }

}

type VoiceMethods = typeof voiceMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends VoiceMethods {}
installMethods(LarkApp, voiceMethods);

type BootMethods = typeof bootMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends BootMethods {}
installMethods(LarkApp, bootMethods);

type RailMethods = typeof railMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends RailMethods {}
installMethods(LarkApp, railMethods);

type MessageMethods = typeof messageMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends MessageMethods {}
installMethods(LarkApp, messageMethods);

type DashboardMethods = typeof dashboardMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends DashboardMethods {}
installMethods(LarkApp, dashboardMethods);

type MemberMethods = typeof memberMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends MemberMethods {}
installMethods(LarkApp, memberMethods);

type ComposerMethods = typeof composerMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends ComposerMethods {}
installMethods(LarkApp, composerMethods);

type SettingsMethods = typeof settingsMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends SettingsMethods {}
installMethods(LarkApp, settingsMethods);

type StoreMethods = typeof storeMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends StoreMethods {}
installMethods(LarkApp, storeMethods);

type UpdateMethods = typeof updateMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends UpdateMethods {}
installMethods(LarkApp, updateMethods);

type NotifyMethods = typeof notifyMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends NotifyMethods {}
installMethods(LarkApp, notifyMethods);

type ClipMethods = typeof clipMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends ClipMethods {}
installMethods(LarkApp, clipMethods);

type GatewayMethods = typeof gatewayMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends GatewayMethods {}
installMethods(LarkApp, gatewayMethods);

type SearchMethods = typeof searchMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends SearchMethods {}
installMethods(LarkApp, searchMethods);

type MessageToolMethods = typeof messageToolMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends MessageToolMethods {}
installMethods(LarkApp, messageToolMethods);

type EmojiMethods = typeof emojiMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends EmojiMethods {}
installMethods(LarkApp, emojiMethods);

type PresenceMethods = typeof presenceMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends PresenceMethods {}
installMethods(LarkApp, presenceMethods);

type MenuMethods = typeof menuMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends MenuMethods {}
installMethods(LarkApp, menuMethods);

type SocialMethods = typeof socialMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends SocialMethods {}
installMethods(LarkApp, socialMethods);

type ExtraMethods = typeof extraMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LarkApp extends ExtraMethods {}
installMethods(LarkApp, extraMethods);
