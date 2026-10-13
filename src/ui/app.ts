import { reportCrash } from "../crash";
import { defaultConfig } from "../config";
import { ME, NORTHWIND, channels as demoChannels, people } from "../demo/data";
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
import { ListSync, applyRemoteLists, flattenFavoriteIds, mapToPins, readIdList, refileFavorites, toggleListed, uniqueSnowflakes, type ListPayload, type RemoteLists } from "../user-lists";
import { type AwayClock } from "../pack/away";
import { mergeSaved, rowsFromPayload } from "../saved-sync";
import { queueAcks, readAllIds, READ_ALL_GAP_MS, takeAck, type ReadTarget } from "../pack/read-all";
import { cloneTargets, discordMedia, emojiCloneBody, stickerCloneRequest } from "../pack/emote-clone";
import { dropDue, presetLead, queueDraft } from "../pack/live-schedule";
import { enabledEngines, engineLabel, searchHref, httpsImage, type ImageEngine } from "../pack/image-search";
import { isJumbo } from "../pack/jumbo";
import { type ConnectionLine } from "../pack/connections";
import { mutualNames, whoisLines } from "../pack/whois";
import { backoff, takeDue, type ScheduledSend } from "../pack/schedule";
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
import type { AppConfig, Channel, Guild, NotifyLevel, Person, RawMessage, Shortcuts } from "../types";
import { type ThemePreviewSession } from "../theme-preview";
import {
  type MemberListSort, type PaintedRow,
  type MemberListState, type RoleInfo
} from "../members";
import { QR_CAPTION } from "../signin";
import {
  blockedIds,
  clampNickname, developerModeOn,
  dmContextMenu, friendUsernameOk, memberContextMenu, readPinList,
  requestAddFavorite,
  requestModView,
  requestRoleToggle, setRelationshipIndex,
  togglePin,
  voiceSpotFor, type FriendTab,
  type SocialRelationship
} from "../social";
import { type GuildSound } from "../soundboard";
import { defaultCallView, restingDesk, voiceLinkDetails, type CallViewPrefs, type DeskAudio, type InputProfile, type VoiceRoster } from "../voice";
import { clear, el, icon, paths } from "./dom";
import type { BoardSession } from "./dashboard-view";
import type { StatNote } from "./stats-store";
import {
  toggleId
} from "../server-model";
import { renderWhois } from "./whois-card";
import { type ShareSource } from "../share";
import {
  applyCall,
  callerName,
  createRingtone,
  incomingNotice,
  pulseRingtone,
  ringAudible,
  ringInBackground,
  ringTargets,
  stopRingtoneContext,
  type RingState,
} from "../call-ring";
import { renderCallRing } from "./call-ring-view";
import { type MutedTalkState } from "../muted-talk";
import { type MutedProbe } from "../muted-probe";
import type { ProfileActionSlot, WireProfile } from "./profile";
import type { ProfileTabId } from "./profile-tabs";
import {
  type AccountOverview
} from "../user-settings";

import type { VoiceSession, ScrollMode, LocalFile, ClipAsk } from "./app-shared";
import { isTauri, invoke, localInputValue, normalizeChannel } from "./app-shared";
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
  updates: UpdateState = initialUpdateState("3.0.4", true);
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

  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", text);
    } catch {
      this.toast("Copy", "The clipboard is not available.");
    }
  }

  guildForChannel(channelId: string): string | null {
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      if (list.some((channel) => channel.id === channelId)) return guildId;
    }
    return null;
  }

  ensureDmPins() {
    if (this.dmPinsReady) return;
    this.dmPinsReady = true;
    this.dmPins = new Set(readPinList(localStorage.getItem("lark.dm.pins.v1")));
  }

  saveDmPins() {
    localStorage.setItem("lark.dm.pins.v1", JSON.stringify([...this.dmPins]));
  }

  loadRelationships() {
    if (this.demo || Date.now() < this.relationshipsRetry) return;
    this.relationshipsRetry = Date.now() + 20_000;
    void invoke<SocialRelationship[]>("fetch_relationships").then((rows) => {
      this.mergeRelationships(rows, true, false);
      this.relationshipsRetry = Number.POSITIVE_INFINITY;
      void import("./inbox").then((mod) => mod.noteRelationshipIndex());
      this.msgSig = "";
      if (this.friendsOpen) this.paintFriends();
      if (!this.guildId) this.paintChannels();
    }).catch(() => undefined);
  }

  mergeRelationships(rows: SocialRelationship[], replace: boolean, removed: boolean) {
    if (removed) {
      const ids = new Set(rows.map((row) => row.id));
      this.relationships = this.relationships.filter((row) => !ids.has(row.id));
    } else if (replace) {
      this.relationships = rows.filter((row) => row.id && row.kind);
    } else {
      const byId = new Map(this.relationships.map((row) => [row.id, row]));
      for (const row of rows) {
        if (!row.id || !row.kind) continue;
        byId.set(row.id, row);
      }
      this.relationships = [...byId.values()];
    }
    setRelationshipIndex(this.relationships);
    const blocked = blockedIds();
    for (const row of this.relationships) {
      if (row.kind !== "friend") continue;
      const existing = this.friends.find((person) => person.id === row.id);
      if (existing) {
        existing.friendNick = row.nickname || existing.friendNick;
        if (row.serverTag?.tag) existing.serverTag = row.serverTag;
        if (row.avatarUrl) existing.avatarUrl = row.avatarUrl;
      } else {
        this.friends.push({
          id: row.id,
          name: row.nickname || row.name || "Friend",
          status: "offline",
          friendNick: row.nickname || null,
          serverTag: row.serverTag,
          avatarUrl: row.avatarUrl,
          bot: row.bot,
        });
      }
    }
    this.friends = this.friends.filter((person) => !blocked.has(person.id));
    for (const person of this.friends) {
      this.directory[person.id] = { ...this.directory[person.id], ...person };
      this.userNames[person.id] = person.friendNick || person.name;
    }
  }

  relationshipFor(userId: string): SocialRelationship | undefined {
    return this.relationships.find((row) => row.id === userId);
  }

  personFromRelationship(userId: string): Person | null {
    const row = this.relationshipFor(userId);
    if (!row) return this.directory[userId] ?? null;
    return this.directory[userId] ?? { id: row.id, name: row.nickname || row.name, avatarUrl: row.avatarUrl, status: "offline", friendNick: row.nickname, serverTag: row.serverTag };
  }

  async changeRelationship(userId: string, action: "friend" | "remove" | "block" | "ignore") {
    if (this.demo) {
      this.toast("Friends", "Demo relationships stay on this device.");
      return;
    }
    try {
      if (action === "friend") {
        const row = await invoke<SocialRelationship>("add_relationship", { userId });
        this.mergeRelationships([row], false, false);
      } else if (action === "block") {
        const row = await invoke<SocialRelationship>("block_user", { userId });
        this.friends = this.friends.filter((person) => person.id !== userId);
        this.mergeRelationships([row], false, false);
      } else if (action === "ignore") {
        await invoke("ignore_user", { userId });
        this.mergeRelationships([{ id: userId, kind: "incoming", name: "", username: "", nickname: "" }], false, true);
      } else {
        await invoke("remove_relationship", { userId });
        this.friends = this.friends.filter((person) => person.id !== userId);
        this.mergeRelationships([{ id: userId, kind: "friend", name: "", username: "", nickname: "" }], false, true);
      }
      this.msgSig = "";
      const note = action === "friend" ? "Friend request sent." : action === "block" ? "Blocked." : action === "ignore" ? "Ignored." : "Removed.";
      this.toast("Friends", note);
      if (this.friendsOpen) this.paintFriends();
      this.paintChannels();
    } catch (err) {
      this.toast("Friends", err instanceof Error ? err.message : "Discord refused that.");
    }
  }

  async addFriendUsername(username: string) {
    const name = username.trim().toLowerCase();
    if (!friendUsernameOk(name)) {
      this.toast("Add Friend", "Enter a Discord username.");
      return;
    }
    if (this.demo) {
      this.toast("Add Friend", "Demo requests stay on this device.");
      return;
    }
    try {
      const row = await invoke<SocialRelationship>("add_friend_username", { username: name });
      this.mergeRelationships([row.kind ? row : { ...row, kind: "outgoing" }], false, false);
      this.friendTab = "pending";
      this.msgSig = "";
      this.paintFriends();
      this.toast("Add Friend", "Friend request sent.");
    } catch (err) {
      this.toast("Add Friend", err instanceof Error ? err.message : "Discord refused that username.");
    }
  }

  scheduleSocialChrome() {
    queueMicrotask(() => this.paintSocialChrome());
  }

  paintSocialChrome() {
    this.chatHead.querySelectorAll("[data-social-chrome]").forEach((node) => node.remove());
    const channel = this.currentChannel();
    const dm = Boolean(channel && (channel.kind === "dm" || channel.kind === "group") && !this.friendsOpen);
    if (!dm || !channel) {
      if (this.profilePanelOpen) {
        this.profilePanelOpen = false;
        this.paintProfilePanel();
      }
      return;
    }
    const actions = this.chatHead.querySelector(".head-actions");
    if (actions) {
      const call = this.socialHeaderButton("Start voice call", paths.mic, () => this.startDmCall(channel, false));
      const video = this.socialHeaderButton("Start video call", paths.camera, () => this.startDmCall(channel, true));
      const add = this.socialHeaderButton("Add to DM", paths.plus, () => this.openAddRecipient(channel));
      const profile = this.socialHeaderButton(this.profilePanelOpen ? "Hide profile" : "Show profile", paths.users, () => {
        this.profilePanelOpen = !this.profilePanelOpen;
        this.paintProfilePanel();
      });
      for (const button of [profile, add, video, call]) {
        button.dataset.socialChrome = "1";
        actions.prepend(button);
      }
    }
    this.paintProfilePanel();
  }

  socialHeaderButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "icon-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  }

  startDmCall(channel: Channel, video: boolean) {
    if (channel.kind !== "dm" && channel.kind !== "group") return;
    this.friendsOpen = false;
    this.clipsOpen = false;
    if (this.guildId) this.guildId = null;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "chat";
    if (this.channelId !== channel.id) void this.openChannel(channel.id);
    this.joinVoice(channel);
    if (this.voice?.channelId !== channel.id) {
      this.toast("Voice", "Couldn't start that call.");
      return;
    }
    if (video !== this.cameraOn) this.toggleCamera();
    this.ringOthers(channel);
  }

  ringOthers(channel: Channel) {
    if (this.demo || this.voice?.channelId !== channel.id) return;
    const ids = ringTargets(this.meId(), [
      ...(channel.recipientIds ?? []),
      ...(channel.recipients ?? []).map((person) => person.id),
    ]);
    if (!ids.length) return;
    void invoke("ring_call", { channelId: channel.id, recipients: ids }).catch(() => undefined);
  }

  applyIncomingCall(call: { channelId?: string; ringing?: unknown; ended?: boolean; video?: boolean }) {
    const channelId = String(call.channelId ?? "");
    const ringing = Array.isArray(call.ringing) ? call.ringing.filter((id): id is string => typeof id === "string") : [];
    const known = this.dmChannels().find((item) => item.id === channelId);
    const people = (known?.recipients ?? []).map((person) => ({ id: person.id, name: person.name }));
    if (!people.length && known?.name) people.push({ id: "", name: known.name });
    const next = applyCall(
      this.incoming,
      { channelId, ringing, ended: Boolean(call.ended), video: Boolean(call.video) },
      this.meId(),
      callerName(this.meId(), people),
      this.voice?.channelId === channelId && !this.voice.guildId,
    );
    this.syncIncoming(next);
  }

  syncIncoming(next: RingState | null) {
    this.incoming = next;
    renderCallRing(next, {
      onAnswer: () => this.answerIncoming(),
      onDecline: () => this.declineIncoming(),
    });
    if (!this.ringHandle) {
      this.ringHandle = createRingtone(() => {
        if (!ringAudible(this.config.preferences.call_sound, Boolean(this.incoming))) {
          this.ringHandle?.stop();
          stopRingtoneContext();
          return;
        }
        pulseRingtone();
      }, 2000, window);
    }
    if (ringAudible(this.config.preferences.call_sound, Boolean(next))) this.ringHandle.start();
    else {
      this.ringHandle.stop();
      stopRingtoneContext();
    }
    if (!next) {
      this.ringNotified = "";
      return;
    }
    if (next.channelId !== this.ringNotified && ringInBackground(document.hidden, document.hasFocus())) {
      this.ringNotified = next.channelId;
      void this.notifyIncoming(next);
    }
  }

  answerIncoming() {
    const ring = this.incoming;
    if (!ring) return;
    const known = this.dmChannels().find((item) => item.id === ring.channelId);
    const channel: Channel = known ?? { id: ring.channelId, name: ring.callerName, kind: "dm", position: 0 };
    this.syncIncoming(null);
    this.friendsOpen = false;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "chat";
    if (this.channelId !== channel.id) void this.openChannel(channel.id);
    this.joinVoice(channel);
    if (ring.video && this.voice?.channelId === channel.id && !this.cameraOn) this.toggleCamera();
    if (!isTauri()) return;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();
    }).catch(() => undefined);
  }

  declineIncoming() {
    const ring = this.incoming;
    if (!ring) return;
    this.syncIncoming(null);
    if (this.demo) return;
    void invoke("stop_ringing", { channelId: ring.channelId }).catch(() => undefined);
  }

  async notifyIncoming(ring: RingState) {
    const notice = incomingNotice(ring.callerName, ring.video);
    this.toast(notice.title, notice.body);
    if (!isTauri()) return;
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (!granted) return;
    if (!this.callActionsBound) {
      this.callActionsBound = true;
      void mod.onAction((notification) => {
        const action = (notification as { actionId?: string }).actionId;
        if (action === "answer") this.answerIncoming();
        else if (action === "decline") this.declineIncoming();
      });
    }
    await mod.registerActionTypes([{
      id: "lark-call",
      actions: [
        { id: "answer", title: "Answer", foreground: true },
        { id: "decline", title: "Decline", foreground: true },
      ],
    }]).catch(() => undefined);
    mod.sendNotification({
      title: notice.title,
      body: notice.body,
      actionTypeId: "lark-call",
      autoCancel: true,
    });
  }

  joinFriendVoice(userId: string) {
    const spot = voiceSpotFor(Object.values(this.voiceRoster), userId);
    if (!spot) {
      this.toast("Voice", "They are not in a voice channel.");
      return;
    }
    if (spot.guildId) this.guildId = spot.guildId;
    const known = this.channelsOf(spot.guildId).find((channel) => channel.id === spot.channelId);
    const channel: Channel = known ?? { id: spot.channelId, name: spot.channelName, kind: "voice", position: 0 };
    this.friendsOpen = false;
    this.popout = null;
    this.paintPopout();
    this.joinVoice(channel);
  }

  watchFriend(userId: string) {
    const spot = voiceSpotFor(Object.values(this.voiceRoster), userId);
    if (!spot) {
      this.toast("Stream", "They are not in a voice channel.");
      return;
    }
    if (this.voice?.channelId !== spot.channelId) this.joinFriendVoice(userId);
    this.watchMember(userId);
  }

  bindSocialMenus() {
    if (this.socialMenusBound) return;
    this.socialMenusBound = true;
    this.membersEl.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest(".member-row");
      if (!(row instanceof HTMLElement)) return;
      const id = row.dataset.user;
      if (!id) return;
      event.preventDefault();
      const person = this.directory[id] ?? { id, name: row.querySelector("strong")?.textContent || "Member" };
      this.openMemberMenu(person, event.clientX, event.clientY);
    });
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".social-menu")) return;
      this.closeSocialMenu();
    });
  }

  closeSocialMenu() {
    document.getElementById("lark-social-menu")?.remove();
  }

  showSocialMenu(x: number, y: number, items: { id: string; label: string; danger?: boolean }[], onPick: (id: string) => void) {
    if (!this.late) {
      void this.ensureLate().then(() => this.showSocialMenu(x, y, items, onPick));
      return;
    }
    this.closeSocialMenu();
    const menu = this.late!.renderContextMenu(x, y, items, (id) => {
      this.closeSocialMenu();
      onPick(id);
    });
    menu.id = "lark-social-menu";
    this.root.append(menu);
  }

  openDmMenu(channel: Channel, x: number, y: number) {
    const userId = this.dmUserId(channel);
    const friend = this.friends.some((person) => person.id === userId) || this.relationshipFor(userId)?.kind === "friend";
    this.showSocialMenu(x, y, dmContextMenu({
      developerMode: developerModeOn(this.config),
      pinned: this.dmPins.has(channel.id),
      favorite: this.favoriteIds.includes(channel.id),
      muted: this.levelFor(null, channel.id) === "mute",
      friend,
      group: channel.kind === "group",
    }), (id) => this.runDmMenu(channel, userId, id));
  }

  runDmMenu(channel: Channel, userId: string, id: string) {
    if (id === "read") this.markDmRead(channel);
    else if (id === "pin") this.toggleDmPin(channel.id);
    else if (id === "favorite") {
      const had = this.favoriteIds.includes(channel.id);
      const saved = requestAddFavorite(channel.id) === "called";
      this.toast("Favorites", saved ? (had ? "Removed from Favorites." : "Added to Favorites.") : "Favorites are not available yet.");
    } else if (id === "profile") {
      const person = userId ? this.personFromRelationship(userId) : null;
      if (person) this.openProfile(person);
    } else if (id === "call") this.startDmCall(channel, false);
    else if (id === "note") {
      this.openPrompt("Note", this.notes[userId] ?? "", false, (text) => {
        if (userId) this.saveNote(userId, text);
      });
    } else if (id === "nick") {
      const current = this.relationshipFor(userId)?.nickname || "";
      this.openPrompt("Friend Nickname", current, false, (text) => void this.saveFriendNick(userId, text));
    } else if (id === "close") void this.closeDmChannel(channel);
    else if (id === "apps") window.open("https://discord.com/app-directory", "_blank", "noopener");
    else if (id === "invite") void this.invitePerson(channel);
    else if (id === "rename") {
      this.openPrompt("Rename Group", channel.name, false, (text) => void this.renameGroup(channel.id, text));
    } else if (id === "unfriend") void this.changeRelationship(userId, "remove");
    else if (id === "ignore") void this.changeRelationship(userId, "ignore");
    else if (id === "block") void this.changeRelationship(userId, "block");
    else if (id === "mute") void this.muteDm(channel.id, this.levelFor(null, channel.id) !== "mute");
    else if (id === "copy-user" && userId) void this.copySocialId(userId, "User ID");
    else if (id === "copy-channel") void this.copySocialId(channel.id, "Channel ID");
  }

  openMemberMenu(person: Person, x: number, y: number) {
    const self = person.id === this.meId();
    this.showSocialMenu(x, y, memberContextMenu({ developerMode: developerModeOn(this.config), self }), (id) => {
      if (id === "profile") this.openProfile(person);
      else if (id === "mention") this.mentionPerson(person);
      else if (id === "server-profile") this.openProfile(self ? person : person, false, self);
      else if (id === "apps") window.open("https://discord.com/app-directory", "_blank", "noopener");
      else if (id === "roles") this.openRoleMenu(person);
      else if (id === "mod") {
        const guildId = this.guildId;
        void this.ensureLate().then(() => {
          if (requestModView(person.id, guildId) !== "called") this.toast("Mod View", "Mod View is not available yet.");
        });
      } else if (id === "copy-id") void this.copySocialId(person.id, "User ID");
    });
  }

  openRoleMenu(person: Person) {
    const roles = this.profileRoles(person);
    if (!roles.length) {
      this.toast("Roles", "No roles on this member yet.");
      return;
    }
    this.openChoice("Roles", roles.map((role) => ({ id: role.id, label: role.name })), (roleId) => {
      this.toast("Roles", requestRoleToggle(person.id, roleId, this.guildId) === "called" ? "Role updated." : "Role changes open from server settings.");
    });
  }

  mentionPerson(person: Person) {
    const token = `<@${person.id}>`;
    const current = this.composer.value;
    this.composer.value = current && !/\s$/.test(current) ? `${current} ${token} ` : `${current}${token} `;
    this.composer.focus();
  }

  dmUserId(channel: Channel): string {
    return channel.recipients?.find((item) => item.id !== this.meId())?.id
      ?? channel.recipientIds?.find((id) => id !== this.meId())
      ?? "";
  }

  markDmRead(channel: Channel) {
    const last = channel.lastMessageId || this.pages[channel.id]?.at(-1)?.id || "";
    this.localUnread[channel.id] = 0;
    this.localMentions[channel.id] = 0;
    this.behind[channel.id] = false;
    if (last) {
      this.markers[channel.id] = { lastMessageId: last, mentionCount: 0 };
      this.lastRead[channel.id] = last;
      if (!this.demo) void invoke("ack_message", { channelId: channel.id, messageId: last }).catch(() => undefined);
    }
    this.refreshChannelBadge(channel.id);
    this.paintChannels();
    this.syncBadge();
  }

  async muteDm(channelId: string, muted: boolean) {
    const level: NotifyLevel = muted ? "mute" : "all";
    this.config.notifications.channels[channelId] = muted ? { muted: true } : { level: "all", muted: false };
    this.stageNotify(null, channelId, level);
    void this.persist();
    this.paint();
    await this.writeNotify(null, channelId, level);
  }

  async closeDmChannel(channel: Channel) {
    if (!this.demo) {
      try {
        await invoke("close_dm", { channelId: channel.id });
      } catch (err) {
        this.toast("Direct message", err instanceof Error ? err.message : "Couldn't close that conversation.");
        return;
      }
      this.liveDms = this.liveDms.filter((item) => item.id !== channel.id);
    }
    this.closedDms.add(channel.id);
    if (this.channelId === channel.id) {
      this.channelId = "";
      this.friendsOpen = true;
    }
    this.paint();
  }

  async saveFriendNick(userId: string, nickname: string) {
    const clean = clampNickname(nickname);
    const row = this.relationshipFor(userId);
    if (row) row.nickname = clean;
    const friend = this.friends.find((person) => person.id === userId);
    if (friend) friend.friendNick = clean;
    this.msgSig = "";
    if (this.friendsOpen) this.paintFriends();
    if (this.demo) return;
    try {
      await invoke("set_friend_nickname", { userId, nickname: clean });
    } catch (err) {
      this.toast("Nickname", err instanceof Error ? err.message : "Couldn't save that nickname.");
    }
  }

  async renameGroup(channelId: string, name: string) {
    if (this.demo) {
      this.toast("Group", "Demo groups stay on this device.");
      return;
    }
    try {
      const channel = normalizeChannel(await invoke<Channel>("rename_group_dm", { channelId, name }));
      this.mergeDms([channel]);
      this.paint();
    } catch (err) {
      this.toast("Group", err instanceof Error ? err.message : "Couldn't rename that group.");
    }
  }

  openGroupCreator() {
    const roster = this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends;
    this.openPicker("New Group DM", roster.map((person) => ({ id: person.id, label: person.name })), 2, (ids) => void this.createGroup(ids));
  }

  openAddRecipient(channel: Channel) {
    const present = new Set([...(channel.recipientIds ?? []), ...(channel.recipients ?? []).map((item) => item.id)]);
    const roster = (this.demo ? people : this.friends).filter((person) => person.id !== this.meId() && !present.has(person.id));
    this.openPicker("Add to DM", roster.map((person) => ({ id: person.id, label: person.name })), 1, (ids) => void this.addRecipient(channel, ids[0]));
  }

  async createGroup(ids: string[]) {
    if (this.demo) {
      this.toast("Group", "Demo groups stay on this device.");
      return;
    }
    try {
      const channel = normalizeChannel(await invoke<Channel>("create_group_dm", { recipientIds: ids }));
      this.mergeDms([channel]);
      this.friendsOpen = false;
      void this.openChannel(channel.id);
    } catch (err) {
      this.toast("Group", err instanceof Error ? err.message : "Couldn't create that group.");
    }
  }

  async addRecipient(channel: Channel, userId: string | undefined) {
    if (!userId) return;
    if (this.demo) {
      this.toast("Direct message", "Demo groups stay on this device.");
      return;
    }
    try {
      await invoke("add_dm_recipient", { channelId: channel.id, userId });
      const channels = await invoke<Channel[]>("fetch_dms");
      this.mergeDms(channels.map(normalizeChannel));
      this.paint();
      this.toast("Direct message", "Added to the conversation.");
    } catch (err) {
      this.toast("Direct message", err instanceof Error ? err.message : "Couldn't add that person.");
    }
  }

  async invitePerson(channel: Channel) {
    const guilds = this.guilds();
    if (!guilds.length) {
      this.toast("Invite", "Join a server before inviting someone.");
      return;
    }
    this.openChoice("Invite to Server", guilds.map((guild) => ({ id: guild.id, label: guild.name })), (guildId) => {
      const text = this.channelsOf(guildId).find((item) => item.kind === "text" || item.kind === "announcement");
      if (!text) {
        this.toast("Invite", "Open that server once so Lark can see a text channel.");
        return;
      }
      if (this.demo) {
        this.toast("Invite", "Demo invites stay on this device.");
        return;
      }
      void invoke<string>("create_channel_invite", { channelId: text.id }).then(async (code) => {
        const sent = await this.postPlain(channel.id, `https://discord.gg/${code}`);
        this.toast("Invite", sent ? "Invite sent." : "Couldn't send that invite.");
      }).catch((err) => {
        this.toast("Invite", err instanceof Error ? err.message : "Couldn't create an invite.");
      });
    });
  }

  async saveServerProfile(nick: string, bio: string, avatar: string | null) {
    if (!this.guildId) {
      this.toast("Profile", "Open a server to edit the per-server profile.");
      return;
    }
    if (this.demo) {
      this.toast("Profile", "Demo server profiles stay on this device.");
      return;
    }
    try {
      await invoke("set_server_profile", { guildId: this.guildId, nick: clampNickname(nick), bio, avatar });
      this.toast("Profile", "Server profile saved.");
    } catch (err) {
      this.toast("Profile", err instanceof Error ? err.message : "Couldn't save that profile.");
    }
  }

  profileSlots(person: Person): ProfileActionSlot[] {
    const host = globalThis as { larkProfileSlots?: (person: { id: string; guildId: string | null }) => ProfileActionSlot[] };
    if (typeof host.larkProfileSlots !== "function") return [];
    try {
      return host.larkProfileSlots({ id: person.id, guildId: this.guildId }) ?? [];
    } catch {
      return [];
    }
  }

  paintProfilePanel() {
    let panel = document.getElementById("lark-profile-panel");
    const channel = this.currentChannel();
    const open = Boolean(channel && (channel.kind === "dm" || channel.kind === "group") && this.profilePanelOpen && !this.friendsOpen);
    if (!open || !channel) {
      panel?.remove();
      this.stage.classList.remove("is-profile");
      return;
    }
    if (!panel) {
      panel = el("aside", "profile-panel");
      panel.id = "lark-profile-panel";
      this.stage.append(panel);
    }
    this.stage.classList.add("is-profile");
    const person = this.dmCounterparty(channel);
    if (!person) {
      clear(panel);
      panel.append(el("p", "empty", "No profile for this conversation."));
      return;
    }
    if (!this.late) {
      void this.ensureLate().then(() => this.paintProfilePanel());
      return;
    }
    if (panel.dataset.user !== person.id) {
      panel.dataset.user = person.id;
      if (!this.demo) {
        void invoke<WireProfile>("fetch_profile", { userId: person.id, guildId: this.guildId }).then((profile) => {
          if (!this.profilePanelOpen) return;
          this.wireProfile = profile;
          this.paintProfilePanel();
        }).catch(() => undefined);
      }
    }
    const details = this.wireProfile?.id === person.id ? this.wireProfile : null;
    const sample = this.demo && !details ? this.late!.sampleProfile(person) : null;
    const roles = this.profileRoles(person);
    this.late!.renderProfileCard(panel, {
      person,
      self: false,
      statusPicker: false,
      roles: roles.length ? roles : (sample ? this.late!.sampleRoles() : []),
      placement: "panel",
      details: details ? {
        id: details.id,
        name: this.maskText(details.name),
        username: this.maskText(details.username),
        avatarUrl: details.avatarUrl,
        bannerUrl: details.bannerUrl,
        accent: details.accent,
        bio: this.maskText(details.bio ?? ""),
        pronouns: this.maskText(details.pronouns ?? ""),
        nick: details.nick ? this.maskText(details.nick) : details.nick,
        mutualNames: [],
        mutualGuilds: details.mutualGuilds?.length ?? 0,
        mutualFriends: details.mutualFriends ?? 0,
        mutualFriendsList: (details.mutualFriendsList ?? []).map((friend) => ({ id: friend.id, name: this.maskText(friend.name) })),
        joinedAt: details.joinedAt,
        badges: details.badges ?? [],
        widgets: details.widgets ?? [],
        serverTag: details.serverTag ?? person.serverTag ?? null,
      } : sample,
    }, {
      onClose: () => {
        this.profilePanelOpen = false;
        this.paintProfilePanel();
      },
      onMessage: () => void this.openDm(person.id),
      onAddFriend: this.friends.some((item) => item.id === person.id) ? undefined : () => void this.changeRelationship(person.id, "friend"),
      onJoinVoice: voiceSpotFor(Object.values(this.voiceRoster), person.id) ? () => this.joinFriendVoice(person.id) : undefined,
      note: this.notes[person.id] ?? "",
      onNote: (note) => this.saveNote(person.id, note),
      slots: this.profileSlots(person),
    });
  }

  dmCounterparty(channel: Channel): Person | null {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const id = recipient?.id ?? channel.recipientIds?.find((item) => item !== this.meId());
    if (!id) return null;
    return this.directory[id] ?? { id, name: recipient?.name || channel.name, avatarUrl: recipient?.avatarUrl, status: "offline" };
  }

  async copySocialId(id: string, label: string) {
    try {
      await navigator.clipboard.writeText(id);
      this.toast(label, "Copied.");
    } catch {
      this.toast(label, id);
    }
  }

  openPrompt(title: string, value: string, multiline: boolean, onSave: (text: string) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("form", "social-prompt");
    card.append(el("h2", "", title));
    const field = multiline ? el("textarea") : el("input");
    field.value = value;
    field.maxLength = multiline ? 256 : 100;
    const save = el("button", "primary", "Save");
    save.type = "submit";
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(field, save, cancel);
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      overlay.remove();
      onSave(field.value);
    });
    overlay.append(card);
    this.root.append(overlay);
    field.focus();
  }

  openChoice(title: string, options: { id: string; label: string }[], onPick: (id: string) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("div", "social-prompt");
    card.append(el("h2", "", title));
    for (const option of options.slice(0, 40)) {
      const button = el("button", "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        overlay.remove();
        onPick(option.id);
      });
      card.append(button);
    }
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(cancel);
    overlay.append(card);
    this.root.append(overlay);
  }

  openPicker(title: string, options: { id: string; label: string }[], minimum: number, onPick: (ids: string[]) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const selected = new Set<string>();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("div", "social-prompt");
    card.append(el("h2", "", title));
    if (!options.length) card.append(el("p", "empty", "No one to add."));
    for (const option of options.slice(0, 40)) {
      const button = el("button", "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        if (selected.has(option.id)) selected.delete(option.id);
        else selected.add(option.id);
        button.classList.toggle("is-on", selected.has(option.id));
      });
      card.append(button);
    }
    const save = el("button", "primary", "Add");
    save.type = "button";
    save.addEventListener("click", () => {
      if (selected.size < minimum) {
        this.toast(title, minimum > 1 ? "Pick at least two people." : "Pick someone.");
        return;
      }
      overlay.remove();
      onPick([...selected]);
    });
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(save, cancel);
    overlay.append(card);
    this.root.append(overlay);
  }

  readAllButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Read all");
    button.type = "button";
    button.setAttribute("aria-label", "Mark every server read");
    button.addEventListener("click", () => this.readEverything());
    return button;
  }

  readEverything() {
    if (!this.hookOn("readAll")) return;
    const targets: ReadTarget[] = [];
    const push = (channel: Channel, guildId: string | null, direct: boolean) => {
      const pending = (this.unread[channel.id] ?? 0) + (this.mentions[channel.id] ?? 0) + (this.behind[channel.id] ? 1 : 0);
      targets.push({
        id: channel.id,
        kind: channel.kind,
        direct,
        muted: this.levelFor(guildId, channel.id) === "mute",
        pending,
      });
    };
    for (const guild of this.guilds()) {
      for (const channel of this.channelsOf(guild.id)) push(channel, guild.id, false);
    }
    for (const dm of this.dms()) push(dm, null, true);
    const ids = readAllIds(targets, { includeMuted: this.pack.readAllMuted, includeDms: this.pack.readAllDms });
    if (!ids.length) {
      this.toast("Read all", "Nothing unread.");
      return;
    }
    const acks: { channelId: string; messageId: string }[] = [];
    for (const id of ids) {
      this.localUnread[id] = 0;
      this.localMentions[id] = 0;
      const last = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
      this.markers[id] = { lastMessageId: last, mentionCount: 0 };
      this.behind[id] = false;
      this.refreshChannelBadge(id);
      if (last) acks.push({ channelId: id, messageId: last });
    }
    this.readAllQueue = queueAcks(this.readAllQueue, acks);
    this.badgeSent = -1;
    this.syncBadge();
    this.paint();
    this.toast("Read all", `${ids.length} channel${ids.length === 1 ? "" : "s"} marked read.`);
    this.pumpReadAll();
  }

  pumpReadAll() {
    if (this.readAllTimer || this.demo) return;
    const step = () => {
      const picked = takeAck(this.readAllQueue);
      this.readAllQueue = picked.rest;
      if (!picked.next) {
        this.readAllTimer = 0;
        return;
      }
      void invoke("ack_message", { channelId: picked.next.channelId, messageId: picked.next.messageId }).catch(() => undefined);
      this.readAllTimer = window.setTimeout(step, READ_ALL_GAP_MS);
    };
    step();
  }

  watchMessageWhois(node: HTMLElement, message: RawMessage) {
    const person: Person = {
      id: message.authorId,
      name: message.authorName,
      avatarUrl: message.authorAvatar,
      bot: message.authorBot,
    };
    for (const target of node.querySelectorAll(".author, .avatar")) {
      target.addEventListener("mouseenter", (event) => {
        const mouse = event as MouseEvent;
        this.showWhois(person, mouse.clientX, mouse.clientY);
      });
      target.addEventListener("mouseleave", () => this.hideWhoisSoon());
    }
  }

  showWhois(person: Person, x: number, y: number) {
    if (!this.hookOn("userWhois") || this.streamerOn() || !person.id) return;
    window.clearTimeout(this.whoisHide);
    this.whoisUser = person.id;
    const cached = this.whoisCache.get(person.id);
    this.paintWhois(this.maskText(person.name), this.whoisText(person.id, cached?.joinedAt, cached?.mutuals ?? this.mutualsFor(person.id)), x, y);
    if (!cached || Date.now() - cached.at > 5 * 60_000) void this.loadWhois(person.id, x, y);
  }

  hideWhoisSoon() {
    window.clearTimeout(this.whoisHide);
    this.whoisHide = window.setTimeout(() => this.clearWhois(), 180);
  }

  whoisText(userId: string, joinedAt?: string, mutuals: string[] = []): string[] {
    return whoisLines({
      userId,
      now: Date.now(),
      joinedAt,
      mutuals,
      showAge: this.pack.whoisAge,
      showMutuals: this.pack.whoisMutuals,
      showJoin: this.pack.whoisJoin,
    });
  }

  mutualsFor(userId: string, profileNames: string[] = []): string[] {
    return mutualNames(userId, this.guilds().map((guild) => ({
      name: guild.name,
      memberIds: (this.membersByGuild[guild.id] ?? []).map((member) => member.id),
    })), profileNames);
  }

  async loadWhois(userId: string, x: number, y: number) {
    if (this.demo || !isTauri()) return;
    try {
      const profile = await invoke<WireProfile>("fetch_profile", { userId, guildId: this.guildId ?? "" });
      if (!profile || profile.id !== userId) return;
      const names = (profile.mutualGuilds ?? [])
        .map((guild) => this.guilds().find((item) => item.id === guild.id)?.name)
        .filter((name): name is string => Boolean(name));
      const mutuals = this.mutualsFor(userId, names);
      this.whoisCache.set(userId, { joinedAt: profile.joinedAt, mutuals, at: Date.now() });
      if (this.whoisUser === userId) this.paintWhois(this.maskText(profile.name || "User"), this.whoisText(userId, profile.joinedAt, mutuals), x, y);
    } catch {
      /* The card still shows the account age from the id. */
    }
  }

  paintWhois(title: string, lines: string[], x: number, y: number) {
    let card = document.getElementById("lark-whois");
    if (!card) {
      card = el("div", "whois-card");
      card.id = "lark-whois";
      this.root.append(card);
    }
    renderWhois(card, title, lines, x, y);
  }

  clearWhois() {
    this.whoisUser = "";
    document.getElementById("lark-whois")?.remove();
  }

  markJumbo(node: HTMLElement, content: string) {
    if (!this.hookOn("jumboEmoji") || !isJumbo(content)) return;
    const article = node.querySelector("article.message");
    if (!(article instanceof HTMLElement)) return;
    article.classList.add("is-jumbo");
    article.style.setProperty("--lark-jumbo", `${this.pack.jumboSize}px`);
  }

  watchImageSearch(node: HTMLElement) {
    node.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.classList.contains("image-preview") && !target.classList.contains("embed-image")) return;
      const url = httpsImage(target.currentSrc || target.src);
      if (!url) return;
      const engines = enabledEngines({ lens: this.pack.imageLens, tineye: this.pack.imageTineye, yandex: this.pack.imageYandex });
      if (!engines.length) {
        event.preventDefault();
        this.toast("Reverse image search", "Turn on Google Lens, TinEye, or Yandex in the plugin settings.");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showSocialMenu(event.clientX, event.clientY, engines.map((engine) => ({ id: engine, label: engineLabel(engine) })), (id) => {
        const href = searchHref(id as ImageEngine, url);
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      });
    }, true);
  }

  watchEmoteClone(node: HTMLElement) {
    node.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      const sticker = Boolean(target.closest(".sticker"));
      const emoji = target.classList.contains("emoji");
      if (!emoji && !sticker) return;
      if (sticker && !this.pack.emoteStickers) return;
      const media = discordMedia(target.currentSrc || target.src);
      if (!media) return;
      if (sticker && media.kind !== "sticker") return;
      if (!sticker && media.kind !== "emoji") return;
      event.preventDefault();
      const name = (target.alt || target.closest(".sticker")?.querySelector("span")?.textContent || "emoji").replace(/^:|:$/g, "");
      const targets = cloneTargets(this.guilds(), this.access);
      if (!targets.length) {
        this.toast("Emote cloner", "You need Manage Expressions on a server.");
        return;
      }
      this.showMenu(event.clientX, event.clientY, targets.map((guild) => ({ id: guild.id, label: `Add to ${guild.name}` })), (guildId) => {
        void this.cloneEmote(target.currentSrc || target.src, name, guildId, media.kind, media.animated);
      });
    });
  }

  async cloneEmote(url: string, name: string, guildId: string, kind: "emoji" | "sticker", animated: boolean) {
    if (!discordMedia(url)) return;
    if (this.demo || !isTauri()) {
      this.toast("Emote cloner", "Cloning runs in the desktop app, on a server you manage.");
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Couldn't download that image.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (kind === "emoji") {
        const body = emojiCloneBody(name, bytes, animated);
        if ("error" in body) {
          this.toast("Emote cloner", body.error);
          return;
        }
        await invoke("guild_admin", { request: { op: "create_emoji", guildId, body } });
      } else {
        const built = stickerCloneRequest(guildId, name, bytes, animated);
        if ("error" in built) {
          this.toast("Emote cloner", built.error);
          return;
        }
        await invoke("guild_admin", { request: built.request });
      }
      this.toast("Emote cloner", `Added ${name} to the server.`);
    } catch (err) {
      this.toast("Emote cloner", err instanceof Error ? err.message : "Discord refused that emoji.");
    }
  }

  paintLiveScheduleBanner() {
    const channelId = this.channelId;
    if (!channelId || !this.hookOn("liveSchedule")) return;
    if (this.liveScheduling) {
      clear(this.composerBanner);
      this.composerBanner.hidden = false;
      const when = el("input");
      when.type = "datetime-local";
      when.setAttribute("aria-label", "Send at");
      when.value = localInputValue(Date.now() + presetLead(this.pack.schedulePreset));
      const confirm = el("button", "primary", "Queue");
      confirm.type = "button";
      confirm.addEventListener("click", () => {
        const sendAt = Date.parse(when.value);
        const result = queueDraft(this.liveQueue, { channelId, content: this.composer.value, sendAt }, Date.now());
        if (!result.ok) {
          this.toast("Scheduler", result.error);
          return;
        }
        this.liveQueue = result.list;
        this.composer.value = "";
        if (this.channelId) delete this.drafts[this.channelId];
        void this.writeDrafts();
        this.liveScheduling = false;
        this.paintComposer();
        this.toast("Scheduler", "Queued. It sends while Lark stays open.");
      });
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.liveScheduling = false;
        this.paintComposer();
      });
      this.composerBanner.append(el("span", "", "Send at"), when, confirm, cancel);
      return;
    }
    const waiting = this.liveQueue.filter((item) => item.channelId === channelId);
    const next = waiting[0];
    if (!next) return;
    clear(this.composerBanner);
    this.composerBanner.hidden = false;
    const when = new Date(next.sendAt).toLocaleString();
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.liveQueue = this.liveQueue.filter((item) => item.id !== next.id);
      this.paintComposer();
    });
    this.composerBanner.append(el("span", "", `Scheduled ${when}`), cancel);
  }

  async tickLiveSchedule() {
    if (this.sendingLive) return;
    if (!this.hookOn("liveSchedule")) {
      this.liveQueue = dropDue(this.liveQueue, Date.now());
      return;
    }
    const picked = takeDue(this.liveQueue, Date.now());
    if (!picked.due) return;
    this.sendingLive = true;
    this.liveQueue = picked.rest;
    try {
      const sent = await this.postPlain(picked.due.channelId, picked.due.content);
      if (!sent) {
        const retry = backoff(picked.due, Date.now());
        if (retry && this.hookOn("liveSchedule")) this.liveQueue = [...this.liveQueue, retry].sort((a, b) => a.sendAt - b.sendAt);
        else this.toast("Scheduler", "That message was not sent.");
      }
    } finally {
      this.sendingLive = false;
      this.paintComposer();
    }
  }

  parkCallChrome() {
    const chat = this.messagesEl?.parentElement;
    if (chat) {
      chat.dataset.call = "off";
      chat.dataset.strip = "closed";
      chat.classList.remove("is-call-full");
    }
    if (this.messagesEl) this.messagesEl.hidden = false;
    if (this.callStrip) {
      if (this.callStrip.childElementCount) clear(this.callStrip);
      this.callStrip.hidden = true;
    }
    if (this.callSplit) this.callSplit.hidden = true;
    if (this.callHandle) this.callHandle.hidden = true;
    if (this.callSplitBar?.childElementCount) clear(this.callSplitBar);
    if (this.voiceDock?.childElementCount) clear(this.voiceDock);
    if (this.callPip && !this.callPip.hidden) {
      if (this.callPip.childElementCount) clear(this.callPip);
      this.callPip.hidden = true;
    }
  }

  /** Settings, profile, call tiles, inbox, and mod view. Kept off the first message paint. */
  ensureLate(): Promise<typeof import("./late")> {
    if (this.late) return Promise.resolve(this.late);
    if (!this.lateTask) {
      this.lateTask = Promise.all([
        import("./late"),
        import("../share-settings").then((mod) => mod.installShareSettings()),
      ]).then(([mod]) => {
        this.late = mod;
        this.bootModView();
        return mod;
      });
    }
    return this.lateTask;
  }

  scheduleLate() {
    const run = () => { void this.ensureLate(); };
    if (this.bench) window.setTimeout(run, 8000);
    else {
      const idle = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 0 }), 400));
      idle(() => run());
    }
  }

  bootModView() {
    if (!this.late || this.modReady) return;
    this.modReady = true;
    this.late.installModView({
      isDemo: () => this.demo || !isTauri(),
      name: (userId) => this.directory[userId]?.name || this.userNames[userId] || "Member",
      roles: (guildId) => (this.rolesByGuild[guildId] ?? [])
        .filter((role) => role.id !== guildId)
        .map((role) => ({ id: role.id, name: role.name, position: role.position })),
      memberRoleIds: (userId) => this.wireProfile?.id === userId && this.wireProfile.roleIds
        ? this.wireProfile.roleIds
        : this.directory[userId]?.roleIds ?? [],
      localMessages: (userId) => {
        const hits: { id: string; channelId: string; content: string }[] = [];
        for (const [channelId, page] of Object.entries(this.pages)) {
          for (const message of page) {
            if (message.authorId === userId) hits.push({ id: message.id, channelId, content: message.content || "Empty message" });
          }
        }
        return hits.slice(-8).reverse();
      },
      voice: (guildId, userId) => {
        const person = Object.values(this.voiceRoster).find((item) => item.userId === userId && item.guildId === guildId && item.channelId);
        return { inVoice: Boolean(person?.channelId), mute: Boolean(person?.serverMute), deaf: Boolean(person?.serverDeaf) };
      },
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      jump: (channelId, messageId) => { void this.jumpToMessage(channelId, messageId); },
      rememberRole: (userId, roleId, on) => {
        const apply = (person: { roleIds?: string[] } | undefined) => {
          if (!person) return;
          const ids = new Set(person.roleIds ?? []);
          if (on) ids.add(roleId);
          else ids.delete(roleId);
          person.roleIds = [...ids];
        };
        apply(this.directory[userId]);
        if (this.wireProfile?.id === userId) this.wireProfile.roleIds = this.directory[userId]?.roleIds ?? this.wireProfile.roleIds;
        const guildId = this.guildId;
        if (!guildId) return;
        apply((this.membersByGuild[guildId] ?? []).find((person) => person.id === userId));
      },
      noteVoice: (userId, kind, on) => {
        const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
        if (!person) return;
        if (kind === "mute") person.serverMute = on;
        if (kind === "deaf") {
          person.serverDeaf = on;
          if (on) person.serverMute = true;
        }
        this.paintVoice();
      },
    });
  }

  bootLists() {
    this.ensureDmPins();
    const stored = readIdList(localStorage.getItem("lark.favorite-ids.v1"));
    this.favoriteIds = stored.length ? stored : flattenFavoriteIds(this.favorites);
    (globalThis as { larkFavorites?: { addFavoriteChannel: (id: string) => void } }).larkFavorites = {
      addFavoriteChannel: (id) => this.toggleFavorite(id),
    };
  }

  ensureListSync(): ListSync {
    if (this.listSync) return this.listSync;
    this.listSync = new ListSync({
      send: async (payload) => {
        if (this.demo || !isTauri()) throw new Error("offline");
        await invoke("set_user_lists", {
          favorites: payload.favorites,
          favoritesMuted: payload.favoritesMuted,
          favoriteExtras: payload.favoriteExtras,
          pinnedDms: payload.pinnedDms,
          channelPins: payload.channelPins,
        });
      },
      schedule: (ms, fn) => window.setTimeout(fn, ms),
      cancel: (id) => window.clearTimeout(id),
      onError: () => this.toast("Lists", "Discord didn't save pins and favorites. Lark kept them on this device."),
    });
    return this.listSync;
  }

  listPayload(): ListPayload {
    return {
      favorites: uniqueSnowflakes(this.favoriteIds, 200),
      favoritesMuted: this.favoritesMuted,
      favoriteExtras: this.favoriteExtras.slice(0, 50),
      pinnedDms: uniqueSnowflakes([...this.dmPins], 40),
      channelPins: mapToPins(this.pinnedChannels),
    };
  }

  refileLists() {
    const known = this.demo ? demoChannels : this.liveChannels;
    if (!Object.keys(known).length) return;
    this.favorites = refileFavorites(this.favoriteIds, known);
  }

  persistLists() {
    localStorage.setItem("lark.favorite-ids.v1", JSON.stringify(this.favoriteIds));
    localStorage.setItem("lark.favorites.v1", JSON.stringify(this.favorites));
    localStorage.setItem("lark.channel-pins.v1", JSON.stringify(this.pinnedChannels));
    this.saveDmPins();
  }

  toggleFavorite(channelId: string) {
    this.favoriteIds = toggleListed(this.favoriteIds, channelId);
    this.refileLists();
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
  }

  toggleChannelPin(guildId: string, channelId: string) {
    this.pinnedChannels[guildId] = toggleId(this.pinnedChannels[guildId], channelId);
    if (!this.pinnedChannels[guildId]?.length) delete this.pinnedChannels[guildId];
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
  }

  toggleDmPin(channelId: string, repaintSettings = false) {
    this.ensureDmPins();
    this.dmPins = togglePin(this.dmPins, channelId);
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
    if (repaintSettings && this.settings) this.renderSettings();
  }

  applyUserLists(event: RemoteLists) {
    if (this.demo) return;
    const sync = this.ensureListSync();
    const applied = applyRemoteLists({
      favorites: this.favoriteIds,
      favoritesMuted: this.favoritesMuted,
      favoriteExtras: this.favoriteExtras,
      pinnedDms: [...this.dmPins],
      channelPins: this.pinnedChannels,
      favoritesMigrated: this.favoritesMigrated,
      pinsMigrated: this.pinsMigrated,
    }, event, !sync.acceptRemote());
    this.favoriteIds = applied.next.favorites;
    this.favoritesMuted = applied.next.favoritesMuted;
    this.favoriteExtras = applied.next.favoriteExtras;
    this.dmPins = new Set(applied.next.pinnedDms);
    this.dmPinsReady = true;
    this.pinnedChannels = applied.next.channelPins;
    this.favoritesMigrated = applied.next.favoritesMigrated;
    this.pinsMigrated = applied.next.pinsMigrated;
    this.refileLists();
    this.persistLists();
    this.paintChannels();
    if (applied.push) sync.edit(this.listPayload());
  }

  async pullSaved() {
    if (this.demo || !isTauri()) return;
    try {
      const payload = await invoke<unknown>("list_saved_messages");
      const remote = rowsFromPayload(payload);
      const first = localStorage.getItem("lark.saved.migrated") !== "1";
      const keep = new Set(this.savedHeld);
      if (first) {
        for (const item of this.pack.bookmarks) keep.add(`${item.channelId}:${item.messageId}`);
        for (const item of this.reminders) keep.add(`${item.channelId}:${item.messageId}`);
      }
      const merged = mergeSaved(this.pack.bookmarks, this.reminders, remote, keep);
      this.pack.bookmarks = merged.bookmarks;
      this.reminders = merged.reminders;
      this.savePack();
      this.saveReminders();
      if (first) localStorage.setItem("lark.saved.migrated", "1");
      for (const row of merged.upload) {
        const id = `${row.channelId}:${row.messageId}`;
        try {
          await invoke("put_saved_message", { channelId: row.channelId, messageId: row.messageId, dueAt: row.dueAt });
          this.savedHeld.delete(id);
        } catch {
          this.savedHeld.add(id);
        }
      }
    } catch {
      // Discord's saved-message list is unavailable. The local lists stay.
    }
  }

  async pushSaved(channelId: string, messageId: string, keep: boolean, dueAt: string | null) {
    if (this.demo || !isTauri()) return;
    if (!/^\d{5,22}$/.test(channelId) || !/^\d{5,22}$/.test(messageId)) return;
    const id = `${channelId}:${messageId}`;
    try {
      if (keep) await invoke("put_saved_message", { channelId, messageId, dueAt });
      else await invoke("delete_saved_message", { channelId, messageId });
      this.savedHeld.delete(id);
    } catch {
      this.savedHeld.add(id);
      this.toast("Saved", "Discord didn't store that. Lark kept it on this device.");
    }
  }

  applySavedEvent(event: { channelId?: string; messageId?: string; removed?: boolean; dueAt?: string | null; authorName?: string; excerpt?: string; savedAt?: string }) {
    const channelId = event.channelId ?? "";
    const messageId = event.messageId ?? "";
    if (!/^\d{5,22}$/.test(channelId) || !/^\d{5,22}$/.test(messageId)) return;
    const id = `${channelId}:${messageId}`;
    if (this.savedHeld.has(id)) return;
    if (event.removed) {
      this.pack.bookmarks = this.pack.bookmarks.filter((item) => item.channelId !== channelId || item.messageId !== messageId);
      this.reminders = this.reminders.filter((item) => item.channelId !== channelId || item.messageId !== messageId);
    } else {
      const prev = this.pack.bookmarks.find((item) => item.channelId === channelId && item.messageId === messageId);
      const next = {
        messageId,
        channelId,
        authorName: event.authorName || prev?.authorName || "Someone",
        excerpt: event.excerpt || prev?.excerpt || "",
        savedAt: Date.parse(event.savedAt ?? "") || prev?.savedAt || Date.now(),
      };
      this.pack.bookmarks = [next, ...this.pack.bookmarks.filter((item) => item.channelId !== channelId || item.messageId !== messageId)].slice(0, 200);
      const due = event.dueAt ? Date.parse(event.dueAt) : NaN;
      this.reminders = this.reminders.filter((item) => item.channelId !== channelId || item.messageId !== messageId);
      if (Number.isFinite(due)) {
        this.reminders = [...this.reminders, {
          id: `remind-${messageId}`,
          messageId,
          channelId,
          authorName: next.authorName,
          excerpt: next.excerpt,
          remindAt: due,
        }].sort((a, b) => a.remindAt - b.remindAt).slice(0, 50);
      }
    }
    this.savePack();
    this.saveReminders();
    if (this.bookmarksOpen) this.paintBookmarks();
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
