import { channelIsBehind, mergeIncoming, outgoingNonce, sameOutgoing, sameReaction } from "../chat";
import { composedError, spoilerUploadName } from "../compose";
import { reportCrash } from "../crash";
import { snapCameraFps, snapCameraHeight } from "../camera-quality";
import { defaultConfig } from "../config";
import { ARCHIVE, history, ME, NORTHWIND, channels as demoChannels, pageMessages, people, pins as demoPins } from "../demo/data";
import { latestGateway, readyShape, rememberGateway } from "../gateway-cache";
import { type RestHit } from "../rest-cache";
import { bindEmojiLoader, expandShortcodes, rememberEmoji, frecency, EMOJI, setCustomEmojis, type EmojiUse } from "../emoji";
import { applyMention, mentionHits, mentionQuery, plainPreview, type MentionHit } from "../mentions";
import { bumpsUnread, shouldDesktopNotify } from "../notify";
import {
  MISSED_KEY,
  MISSED_SEEN_KEY,
  cleanAlertList,
  clockMinutes,
  digestLines,
  digestSummary, inQuietHours,
  matchAlert,
  planNotification,
  releaseHeld,
  rememberMissed,
  sanitizeMissed,
  type MissedNote
} from "../smart-notify";
import {
  FolderSync,
  applyFolderDrop, type DropIntent
} from "../folders";
import {
  channelFlags,
  cycleServer as stepServer,
  dockBadge, inviteCode, orderedGuildIds,
  mentionsUser,
  normalizeFolder, type DiscordNotify,
  type GuildAccess,
  type GuildFolder,
  type GuildPref,
  type ReadMarker
} from "../shell";
import { ListSync, applyRemoteLists, flattenFavoriteIds, mapToPins, readIdList, refileFavorites, toggleListed, uniqueSnowflakes, type ListPayload, type RemoteLists } from "../user-lists";
import { stepAway, type AwayClock } from "../pack/away";
import { isBookmarked, toggleBookmark, type Bookmark } from "../pack/bookmarks";
import { mergeSaved, rowsFromPayload } from "../saved-sync";
import { toggleHidden } from "../pack/hidden";
import { allowKeywordNotify, cleanWords, firstHit, shouldKeywordNotify, wordsFor } from "../pack/keywords";
import { orderDms } from "../pack/pin-dms";
import { cleanPatterns, patternHit, patternsFor, shouldPatternNotify } from "../pack/patterns";
import { queueAcks, readAllIds, READ_ALL_GAP_MS, takeAck, type ReadTarget } from "../pack/read-all";
import { cloneTargets, discordMedia, emojiCloneBody, stickerCloneRequest } from "../pack/emote-clone";
import { dropDue, presetLead, queueDraft } from "../pack/live-schedule";
import { enabledEngines, engineLabel, searchHref, httpsImage, type ImageEngine } from "../pack/image-search";
import { isJumbo } from "../pack/jumbo";
import { atOrBefore, noteSeen } from "../pack/receipts";
import { digestRows } from "../pack/digest";
import { composerCount } from "../pack/words";
import { replyChain } from "../pack/chain";
import { connectionLabel, connectionLines, type ConnectionLine } from "../pack/connections";
import { displayName, setLocalNick } from "../pack/nicks";
import { folderTitle } from "../pack/folder-extra";
import { awayReplyDecision, cleanAwayText } from "../pack/away-reply";
import type { GameCatalog } from "../pack/game-desk";
import { themeAttributeLines, themeAttributeText } from "../pack/theme-attrs";
import { mutualNames, whoisLines } from "../pack/whois";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "../pack/playing";
import { formatRelative } from "../pack/relative";
import { backoff, cancelSend, queueSend, takeDue, type ScheduledSend } from "../pack/schedule";
import { defaultPack, PACK_IDS, settingsFor, type PackState } from "../pack/state";
import { downloadName, originalImageUrl } from "../media/files";
import { newestClip, pipBox, youtubeId, youtubePlayerUrl } from "../media/watch";
import { renderMediaPanel } from "../media/registry";
import "../media/call-volume";
import "../media/files-panel";
import "../media/watch-panel";
import "../media/activity-panel";
import { gameActivityName, mediaStatusLine } from "../media/activity";
import { findLog, logView, recordDelete, recordEdit } from "../pack/logger";
import { holdRead as privacyHoldRead, obsDetected, panicPlan, publishActivity, redactStreamerText, streamerSafeActive, visibleStatus } from "../pack/privacy";
import { stripTrackingText, stripTrackingUrl } from "../pack/links";
import type { HourCycle, TimeMode } from "../pack/time";
import { messageMarkdown } from "../pack/markdown";
import { addTemplate, insertTemplate, removeTemplate } from "../pack/replies";
import { nextZoom } from "../pack/zoom";
import { commandCatalog, matchCommands } from "../palette";
import { DRAFTS_PLAIN_KEY, DRAFTS_SEALED_KEY, parseDraftMap, planDraftLoad, type DraftMap } from "../drafts";
import { dmPreview, personalLine, redactBlocks, redactSensitive, streamerActive } from "../privacy";
import { addReminder, cancelReminder, reminderFor, reminderPresets, takeDueReminders, type Reminder } from "../reminders";
import { browserPlatform, type PlatformInfo } from "../platform";
import { describePlugin, enabledSources, validPluginId, type PluginCatalogItem, type PluginHooks, type PluginSource } from "../plugins";
import {
  acceptBytes,
  APP_VERSION,
  browseStore,
  categoryLabel,
  entryUrl,
  findStoreItem,
  hashMatches,
  larkVersionOk,
  newerVersion,
  parseInstallUrl,
  parseStoreIndex,
  readLocalStore,
  sha256Hex,
  STORE_INDEX_URL,
  STORE_LOCAL_KEY,
  STORE_PAGE_URL,
  writeLocalStore,
  type InstalledRecord,
  type StoreIndex,
  type StoreItem,
} from "../store";
import { storeSwatches } from "./store-swatches";
import { renderEmojiPicker } from "./emoji-picker";
import { type ViewMessage } from "../render/message";
import { FrameClock } from "../frame";
import {
  pollInterval, shouldPreload
} from "../game";
import { emptyPerfSample, type PerfSample } from "../perf";
import { CHANNEL_GATEWAY_GRACE_MS, channelRestDelay } from "../guilds";
import { prefetchChannelIds } from "../cache";
import { HISTORY_PAGE, initialHistory } from "../history";
import {
  type SavedPlace,
  type StartupMilestone
} from "../startup";
import {
  HARDWARE_STORAGE_KEY,
  clampStatus,
  hardwareSampleDue, noteHardwareEdit,
  serializeHardwareState,
  setHardwareEnabled,
  stepHardware,
  type HardwareState
} from "../hardware";
import { bytesFromBase64, clipBehaviorNote, CLIP_BUFFER_OPTIONS, CLIP_FPS_OPTIONS, CLIP_RESOLUTION_OPTIONS, sanitizeClipBuffer, sanitizeClipFps, sanitizeClipResolution } from "../clip";
import {
  CLIP_DRAG,
  clipMime,
  clipPlaybackBlock,
  clampTrim,
  clipAttachAction,
  clipDisplayTitle,
  compressCopy,
  demoClips,
  fitAction,
  formatClipBytes,
  formatClipDate,
  formatClipDuration, limitSentence,
  parseCompressMode,
  posterFor,
  renamedClipName,
  trimPresets,
  trimRange,
  uploadLimitBytes,
  type ClipCard
} from "../clips";
import {
  type CallSurface,
  type PipCorner
} from "../call-layout";
import { speakColor } from "../voice-stage";
import { fuzzyScore } from "../search";
import {
  AUTO_INSTALL_KEY,
  UPDATE_CHECK_MS,
  beginCheck,
  checkFailed,
  checkFinished,
  dismissUpdate,
  downloadFinished,
  downloadProgress,
  initialUpdateState,
  readAutoInstall,
  requestRestart,
  setAutoInstall,
  setInCall,
  updateBanner,
  updateErrorMessage,
  updatesStatus,
  writeAutoInstall,
  type UpdateState,
  type UpdateStep,
} from "../updates";
import {
  INTERFACE_CHECK_MS,
  applyInterfaceError,
  applyInterfaceReport,
  applyInterfaceSnapshot,
  initialInterfaceUi,
  interfaceBuildLabel,
  interfaceToast,
  setInterfaceCall,
  type InterfaceChannel,
  type InterfaceReport,
  type InterfaceSnapshot,
  type InterfaceUi,
} from "../interface-update";
import type { Update } from "@tauri-apps/plugin-updater";
import { formatShortcut, matchShortcut, shortcutConflicts, shortcutFromEvent } from "../shortcuts";
import type { LocalSearchClient } from "../local-search-client";
import type { AppConfig, Channel, Guild, NotifyLevel, Person, RawMessage, Shortcuts } from "../types";
import {
  parseThemeCss, validateThemeCss
} from "../themes";
import { beginThemePreview, revertThemePreview, swapThemePreview, type ThemePreviewSession } from "../theme-preview";
import {
  applyMemberOps,
  emptyMemberList, type MemberListSort, rangesForScroll,
  roleColor, type PaintedRow,
  type MemberListState,
  type MemberListWire,
  type RoleInfo
} from "../members";
import { mergeGuilds, mergePeople, personFromMember, type RawMember } from "../roster";
import { commandError, gateQr, QR_CAPTION } from "../signin";
import {
  blockedIds,
  clampNickname,
  clampNote,
  clearAfterAt,
  developerModeOn,
  dmContextMenu, floatPinned, friendActivityText,
  friendUsernameOk, memberContextMenu, readPinList,
  requestAddFavorite,
  requestModView,
  requestRoleToggle, setRelationshipIndex,
  togglePin,
  voiceSpotFor,
  type ClearAfter,
  type FriendTab,
  type SocialRelationship
} from "../social";
import * as socialApi from "../social";
import type { ParityHost, ThreadIndexWire } from "../threads";
import { loadThreadsUi, threadsNow } from "./lazy-threads";
import { writeClipboard } from "../clipboard";
import { sanitizeSoundToggles, type GuildSound } from "../soundboard";
import { applyVoiceState, defaultCallView, noiseQualityName, readVoicePrefs, replaceGuildVoice, restingDesk, sanitizeInputProfiles, VOICE_PREFS_KEY, voiceLinkDetails, writeVoicePrefs, type CallViewPrefs, type DeskAudio, type InputProfile, type VoiceRoster, type VoiceStateInput } from "../voice";
import { rowEstimate } from "../virtual";
import { clear, el, icon, portrait, paths } from "./dom";
import type { BoardSession } from "./dashboard-view";
import type { StatNote } from "./stats-store";
import { mountPrivacyPanel } from "./privacy-panels";
import {
  DISCORD_LINKS,
  categoryChannelIds,
  categoryContextItems,
  channelContextItems, channelLink,
  channelNotifyBody,
  channelsNotifyBody,
  duplicateChannelBody,
  extraChannelItems,
  guildNotifyBody,
  headerMenuItems, openCreateEvent, serverContextItems,
  toggleId,
  type MenuEntry,
  withMoveTargets
} from "../server-model";
import { mountChatPluginPanel } from "./chat-plugin-panels";
import { renderWhois } from "./whois-card";
import { externalLink, mountAddServer, mountMenu } from "./guild-settings";
import { loadSettingsPages, peekSettingsPages, type SettingsPages } from "./lazy-chrome";
import { noteGateway, noteVoiceDiagnostics, setTrafficArmed, trafficArmed } from "../net/traffic";
import type { SettingEntry } from "./settings";
import { snapShareFps, type ShareSource } from "../share";
import {
  APP_DIRECTORY_URL,
  NITRO_URL,
  armForward,
  armStickers,
  bindGifLoader,
  bindSlashLoader,
  bindSlashRunner,
  clearForward,
  clearStickers,
  commandsFromPayload,
  composerPanel,
  ensureMessagingStyles,
  filterLoadedMessages,
  gifChoice,
  gifHitsNow,
  gifQueryText,
  gifsFromPayload,
  hasSearchCriteria,
  interactionBody,
  markUnreadPlan,
  messageLink,
  noteGifFocus,
  openDiscordPage,
  parseSearchQuery,
  peekForward,
  peekStickers,
  pickQuickReactions,
  readBlockedIds,
  readDeveloperMode,
  readRevealSpoilers,
  readShowEmbeds,
  renderComposerAccessories,
  renderForwardPicker,
  renderGifPicker,
  renderStickerPicker,
  requestCreatePoll,
  requestCreateThread,
  requestLaunchActivity,
  resolveSearch,
  scheduleGifLoad,
  setComposerPanel,
  setGifHits,
  setGifQuery,
  setSlashCommands,
  setStickerHits,
  stickerGuildNow,
  stickerHitsNow,
  takeGifFocus,
  toggleComposerPanel,
  type SlashCommand,
} from "./composer-tools";
import { remoteSearchCall, searchNote, searchPlace, searchPlaceholder, searchUsers } from "../home-search";
import { callKeyAction } from "../keybind-actions";
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
import type { ProfileActionSlot, ProfileRole, WireProfile } from "./profile";
import type { ProfileTabId } from "./profile-tabs";
import {
  applyUserChrome,
  dropSession,
  matchingKeybind,
  parseAccountOverview,
  playSoftTone,
  rememberSession,
  shortcutOk,
  type AccountOverview,
} from "../user-settings";

import type { VoiceSession, ScrollMode, LocalFile, ClipAsk } from "./app-shared";
import { downloadFile, isTauri, invoke, delay, friendlyVoiceDetail, statusLabel, localInputValue, rgbToHex, normalizeMessage, normalizeChannel, asStatus } from "./app-shared";
import { voiceMethods } from "./app-voice";
import { installMethods } from "./app-shared";
import { bootMethods } from "./app-boot";
import { railMethods } from "./app-rail";
import { messageMethods } from "./app-messages";
import { dashboardMethods } from "./app-dashboard";
import { memberMethods } from "./app-members";

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

  paintComposer() {
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
    } else if (this.nickTarget) {
      this.paintNickBanner();
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
      const liveHere = this.hookOn("liveSchedule") && (this.liveScheduling || (!this.scheduling && this.liveQueue.some((item) => item.channelId === this.channelId)));
      if (liveHere) this.paintLiveScheduleBanner();
      else this.paintScheduleBanner();
    }
    clear(this.composerMeta);
    ensureMessagingStyles();
    const emojiScope = `${this.guildId ?? ""}:${this.channelId ?? ""}`;
    if (this.guildId) setCustomEmojis(this.guildEmojis[this.guildId] ?? []);
    bindEmojiLoader(() => {
      const apply = () => {
        setCustomEmojis(this.guildId ? this.guildEmojis[this.guildId] ?? [] : []);
        this.refreshSuggest();
      };
      if (this.guildId && !this.demo && !this.guildEmojis[this.guildId]) void this.ensureEmojis().then(apply);
      else apply();
    }, emojiScope);
    bindSlashRunner((action) => {
      if (action.op === "gif") {
        setGifQuery(action.query);
        setComposerPanel("gif");
        scheduleGifLoad(action.query);
        this.paintComposer();
        return;
      }
      if (action.op === "send") {
        if (!action.text) return;
        this.composer.value = action.text;
        void this.send();
        return;
      }
      const channelId = this.channelId;
      if (!channelId || this.demo) {
        this.toast("Apps", this.demo ? "Demo mode doesn't run Discord apps." : "Open a channel first.");
        return;
      }
      const body = interactionBody({
        command: action.command,
        channelId,
        guildId: this.guildId,
        args: action.args,
        targetId: action.targetId,
      });
      if (!body) {
        this.composer.value = `/${action.command.name} `;
        this.composer.focus();
        return;
      }
      void invoke("invoke_command", { payload: body }).then(() => {
        this.toast("Apps", `/${action.command.name} sent.`);
      }).catch((err) => {
        this.toast("Apps", err instanceof Error ? err.message : "Discord refused the command.");
      });
    });
    bindSlashLoader((query) => {
      if (this.demo || !this.channelId) {
        setSlashCommands([]);
        return;
      }
      void invoke<unknown>("search_app_commands", {
        guildId: this.guildId,
        channelId: this.channelId,
        query,
        kind: 1,
      }).then((payload) => {
        setSlashCommands(commandsFromPayload(payload));
        this.refreshSuggest();
      }).catch(() => undefined);
    }, emojiScope);
    bindGifLoader((query) => {
      if (this.demo) {
        setGifHits([]);
        return;
      }
      void invoke<unknown>("search_gifs", { query }).then((payload) => {
        setGifHits(gifsFromPayload(payload));
        if (composerPanel() === "gif") this.paintComposer();
      }).catch(() => {
        setGifHits([]);
        if (composerPanel() === "gif") this.paintComposer();
      });
    });
    const tools = el("div", "composer-tools");
    const file = el("input");
    file.type = "file";
    file.multiple = true;
    file.hidden = true;
    file.addEventListener("change", () => {
      void this.takeFiles(file.files);
      file.value = "";
    });
    tools.append(renderComposerAccessories({
      fileInput: file,
      onUpload: () => file.click(),
      onThread: () => {
        if (!this.channelId || !requestCreateThread(this.channelId, null)) this.toast("Create Thread", "Threads aren't available yet.");
      },
      onPoll: () => {
        if (!this.channelId || !requestCreatePoll(this.channelId)) this.toast("Create Poll", "Polls aren't available yet.");
      },
      onAppsLink: () => {
        void openDiscordPage(APP_DIRECTORY_URL).then((ok) => {
          if (!ok) this.toast("Use Apps", "Couldn't open the app directory.");
        });
      },
      onGift: () => {
        void openDiscordPage(NITRO_URL).then((ok) => {
          if (!ok) this.toast("Gift", "Couldn't open Discord Nitro.");
        });
      },
      onGif: () => this.toggleGifPicker(),
      onStickers: () => this.toggleStickerPicker(),
      onEmoji: () => {
        this.pickerFor = this.pickerFor === "composer" ? null : "composer";
        this.emojiQuery = "";
        if (this.pickerFor) void this.ensureEmojis();
        this.paintComposer();
      },
      onActivity: () => {
        if (!requestLaunchActivity(this.channelId)) this.toast("Apps", "Activities open from a voice channel.");
      },
      onRepaint: () => this.paintComposer(),
    }));
    const later = el("button", "text-button", "Later");
    later.type = "button";
    later.setAttribute("aria-label", "Send later");
    later.addEventListener("click", () => {
      this.scheduling = !this.scheduling;
      this.liveScheduling = false;
      this.reminding = null;
      this.paintComposer();
    });
    tools.append(later);
    if (this.hookOn("quickReply")) tools.append(this.repliesButton());
    if (this.hookOn("gameDesk")) tools.append(this.deskButton());
    if (this.hookOn("liveSchedule")) {
      const schedule = el("button", "text-button", "Schedule");
      schedule.type = "button";
      schedule.setAttribute("aria-label", "Schedule message");
      schedule.addEventListener("click", () => {
        this.liveScheduling = !this.liveScheduling;
        this.scheduling = false;
        this.reminding = null;
        this.paintComposer();
      });
      tools.append(schedule);
    }
    for (const item of this.files) {
      const chip = el("span", "file-chip");
      const name = el("button", "text-button", item.name);
      name.type = "button";
      name.addEventListener("click", () => {
        this.files = this.files.filter((candidate) => candidate !== item);
        this.paintComposer();
      });
      const spoiler = el("button", item.spoiler ? "text-button file-spoiler is-on" : "text-button file-spoiler", "Spoiler");
      spoiler.type = "button";
      spoiler.setAttribute("aria-label", item.spoiler ? "Remove spoiler" : "Mark as spoiler");
      spoiler.addEventListener("click", () => {
        item.spoiler = !item.spoiler;
        this.paintComposer();
      });
      chip.append(name, spoiler);
      tools.append(chip);
    }
    this.countEl = el("span", "count", composerCount(this.composer.value, this.hookOn("wordCount")));
    const hint = el("span", "hint", "Enter to send");
    if (this.upload > 0 && this.upload < 100) {
      const bar = el("div", "upload");
      bar.style.width = `${this.upload}%`;
      this.composerMeta.append(bar);
    }
    this.composerMeta.append(tools, hint, this.countEl);
    if (composerPanel() === "gif") {
      this.composerMeta.append(renderGifPicker({
        query: gifQueryText(),
        hits: gifHitsNow(),
        onQuery: (query) => {
          setGifQuery(query);
          noteGifFocus();
          scheduleGifLoad(query);
        },
        onPick: (hit, shift) => {
          const choice = gifChoice(hit.url, shift);
          if (!choice) return;
          if (choice.mode === "insert") {
            const caret = this.composer.selectionStart ?? this.composer.value.length;
            this.composer.value = `${this.composer.value.slice(0, caret)}${choice.text}${this.composer.value.slice(caret)}`;
          } else {
            this.composer.value = choice.text;
          }
          setComposerPanel(null);
          if (choice.mode === "send") void this.send();
          else this.paintComposer();
        },
      }));
      if (takeGifFocus()) {
        const field = this.composerMeta.querySelector(".gif-picker input");
        if (field instanceof HTMLInputElement) field.focus();
      }
    }
    if (composerPanel() === "stickers") {
      this.composerMeta.append(renderStickerPicker({
        hits: stickerHitsNow(),
        onPick: (id) => {
          if (this.editing) {
            this.toast("Stickers", "Finish editing before sending a sticker.");
            return;
          }
          armStickers([id]);
          setComposerPanel(null);
          void this.send();
        },
      }));
    }
    const pendingForward = peekForward();
    if (pendingForward) {
      const channels = [...this.dms(), ...this.guilds().flatMap((guild) => this.channelsOf(guild.id))];
      const seen = new Set<string>();
      this.composerMeta.append(renderForwardPicker({
        preview: this.maskText(pendingForward.preview || pendingForward.authorName),
        channels: channels.filter((channel) => {
          if (seen.has(channel.id)) return false;
          seen.add(channel.id);
          return true;
        }).map((channel) => ({ id: channel.id, name: this.maskText(channel.name), kind: channel.kind })),
        onCancel: () => {
          clearForward();
          this.paintComposer();
        },
        onPick: (dest) => {
          const draft = peekForward();
          clearForward();
          this.paintComposer();
          if (!draft) return;
          if (this.demo) {
            this.toast("Forward", "Demo mode keeps the message here.");
            return;
          }
          void invoke("send_message", {
            channelId: dest,
            content: "",
            replyTo: null,
            nonce: null,
            files: [],
            stickerIds: [],
            forward: { messageId: draft.messageId, channelId: draft.channelId, guildId: draft.guildId },
          }).then(() => {
            this.toast("Forwarded", "Message forwarded.");
          }).catch((err) => {
            this.toast("Couldn't forward", err instanceof Error ? err.message : "Discord refused the forward.");
          });
        },
      }));
    }
    if (this.pickerFor === "composer") {
      this.composerMeta.append(this.emojiPicker((glyph, emojiId, animated, name) => this.insertEmoji(glyph, emojiId, animated, name)));
    }
  }

  async takeFiles(list: FileList | null) {
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

  fileBytes(file: LocalFile): number {
    return file.declaredBytes ?? file.bytes.byteLength;
  }

  async send() {
    const id = this.channelId;
    if (!id) return;
    const ready = await this.prepareOutgoingFiles();
    if (!ready) return;
    const stickers = this.editing ? [] : peekStickers();
    const content = this.cleanOutgoing(expandShortcodes(this.composer.value));
    const error = composedError(content, this.files.length, this.files.reduce((sum, file) => sum + this.fileBytes(file), 0), stickers.length, uploadLimitBytes(this.premiumType));
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
      let kept = true;
      if (!this.demo) {
        try {
          const saved = normalizeMessage(await invoke<RawMessage>("edit_message", { channelId: id, messageId: editing.id, content }));
          editing.content = saved.content;
          editing.edited = true;
          if (stored) stored.content = saved.content;
          this.absorbMessage(saved);
        } catch (err) {
          kept = false;
          editing.content = previous;
          editing.edited = false;
          if (stored) {
            stored.content = previous;
            stored.edited = false;
          }
          this.toast("Couldn't edit", err instanceof Error ? err.message : "Discord refused the edit.");
        }
      }
      if (kept) this.noteLoggedEdit(editing, previous, editing.content);
      this.queueLocalIndex(id);
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
          name: spoilerUploadName(file.name, Boolean(file.spoiler)),
          url: file.url,
          contentType: file.mime,
          size: this.fileBytes(file),
        })),
        stickers: stickers.map((stickerId) => {
          const hit = stickerHitsNow().find((item) => item.id === stickerId);
          return { id: stickerId, name: hit?.name ?? "Sticker", url: hit?.url ?? null };
        }),
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
            files: this.files.map((file) => ({ name: spoilerUploadName(file.name, Boolean(file.spoiler)), mime: file.mime, bytes: Array.from(file.bytes) })),
            stickerIds: stickers,
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
      this.notePlace("message", id);
      this.reply = null;
    }
    clearStickers();
    this.composer.value = "";
    if (id) delete this.drafts[id];
    void this.writeDrafts();
    this.files = [];
    this.pinnedToBottom = true;
    this.scroll = "bottom";
    this.paintComposer();
    if (!this.msgSig) this.paintMessages();
  }

  beginEdit(message: RawMessage) {
    this.editing = message;
    this.reply = null;
    this.composer.value = message.content;
    this.composer.focus();
    this.paintComposer();
  }

  editLast() {
    const list = this.pages[this.channelId ?? ""] ?? [];
    const mine = [...list].reverse().find((message) => message.authorId === this.meId());
    if (mine) this.beginEdit(mine);
  }

  removeMessage(message: RawMessage) {
    const id = message.channelId;
    this.noteLoggedDelete(message);
    history[id] = (history[id] ?? []).filter((item) => item.id !== message.id);
    this.pages[id] = (this.pages[id] ?? []).filter((item) => item.id !== message.id);
    this.forgetLocalMessage(id, message.id, message.nonce);
    this.pendingDelete = null;
    if (!this.demo) void invoke("delete_message", { channelId: id, messageId: message.id });
    this.msgSig = "";
    this.paintMessages();
    this.paintComposer();
  }

  toggleReaction(message: RawMessage, emoji: string, emojiId?: string | null) {
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

  openSwitcher() {
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

  switcherHitsCache: { id: string; guildId: string | null; label: string; hint: string; command?: string }[] = [];

  switcherHits(query: string) {
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
    const pasted = inviteCode(query);
    if (pasted) hits.push({ id: `invite:${pasted}`, guildId: null, label: `Join ${pasted}`, hint: "Invite", score: 200 });
    const seen = new Set<string>();
    for (const person of [...this.friends, ...Object.values(this.directory)]) {
      if (!person?.id || seen.has(person.id)) continue;
      seen.add(person.id);
      const score = fuzzyScore(query, person.name);
      if (score === null) continue;
      hits.push({ id: `user:${person.id}`, guildId: null, label: person.name, hint: "Person", score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 16);
  }

  moveSwitcher(delta: number) {
    const hits = this.switcherHitsCache;
    if (!hits.length) return;
    this.switcherIndex = (this.switcherIndex + delta + hits.length) % hits.length;
    this.switcherEl.querySelectorAll(".switcher-hit").forEach((node, index) => node.classList.toggle("is-active", index === this.switcherIndex));
  }

  commitSwitcher() {
    const hit = this.switcherHitsCache[this.switcherIndex];
    if (hit) this.commitHit(hit);
  }

  commitHit(hit: { id: string; guildId: string | null; command?: string }) {
    if (hit.command) {
      this.closeSwitcher();
      this.runCommand(hit.command);
      return;
    }
    if (hit.id.startsWith("invite:")) {
      this.closeSwitcher();
      this.openInvite(hit.id.slice("invite:".length));
      return;
    }
    if (hit.id.startsWith("user:")) {
      this.closeSwitcher();
      void this.openDm(hit.id.slice("user:".length));
      return;
    }
    this.closeSwitcher();
    this.guildId = hit.guildId;
    void this.openChannel(hit.id);
  }

  closeSwitcher() {
    this.switcher = false;
    this.switcherEl.hidden = true;
    clear(this.switcherEl);
  }

  openSettings() {
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

  closeSettings() {
    if (!this.settings) return;
    this.settings = false;
    this.rebinding = null;
    this.discordRebind = null;
    this.settingsQuery = "";
    this.settingsAnchor = "";
    this.settingsEntered = "";
    this.settingsEl.classList.remove("is-in");
    window.setTimeout(() => {
      if (!this.settings) this.settingsEl.hidden = true;
    }, 160);
    this.paint();
  }

  settingsIndex(): SettingEntry[] {
    return this.late!.settingEntries(this.catalog.map((plugin) => ({
      id: `plugin.${plugin.id}`,
      section: "plugins",
      label: plugin.name,
      description: plugin.description,
    })));
  }

  afterSettingsSection() {
    if (!this.settings) return;
    if (this.section === "appearance") void this.refreshThemeIndex();
    if (this.section === "plugins") void this.refreshPluginsPane();
    if (this.section === "account" || this.section === "connections") void this.loadAccountOverview();
    if (this.section === "clips") {
      void this.pullClipStatus().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
      void this.loadClips().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
    }
  }

  renderSettings() {
    if (!this.late) {
      void this.ensureLate().then(() => this.renderSettings());
      return;
    }
    const query = this.settingsQuery;
    const index = this.settingsIndex();
    const visible = this.late!.sectionsForQuery(query, this.late!.settingsSections(), index);
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
      const hit = this.late!.searchSettings(this.settingsQuery, this.late!.settingsSections(), this.settingsIndex())[0];
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
      const hits = this.late!.searchSettings(query, this.late!.settingsSections(), index);
      if (!hits.length) nav.append(el("p", "settings-empty", "No settings match that."));
      for (const hit of hits) {
        const button = el("button", "settings-hit");
        button.type = "button";
        const section = this.late!.settingsSections().find((item) => item.id === hit.section);
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
      for (const group of this.late!.groupedSections(visible)) {
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
    const logout = el("button", "settings-link", "Log Out");
    logout.type = "button";
    logout.addEventListener("click", () => void this.logoutAccount());
    sidebar.append(logout);

    const stage = el("div", "settings-stage");
    const body = el("div", "settings-body");
    const content = el("div", sameSection ? "settings-content" : "settings-content is-entering");
    this.settingsEntered = this.section;
    content.append(this.settingsPane());
    this.markSettingHits(content);
    body.append(content);
    const closeWrap = el("div", "settings-close-wrap");
    closeWrap.append(this.late!.settingsCloseButton(() => this.closeSettings()));
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

  markSettingHits(root: HTMLElement) {
    const query = this.settingsQuery.trim();
    if (!query) return;
    const ids = new Set(
      this.late!.searchSettings(query, this.late!.settingsSections(), this.settingsIndex())
        .filter((hit) => hit.kind === "setting")
        .map((hit) => hit.id),
    );
    for (const node of root.querySelectorAll<HTMLElement>("[data-setting]")) {
      if (ids.has(node.dataset.setting ?? "")) node.classList.add("is-hit");
    }
  }

  settingsNow(): SettingsPages | null {
    const pages = peekSettingsPages();
    if (pages) return pages;
    if (!this.settingsQueued) {
      this.settingsQueued = true;
      void loadSettingsPages().then(() => {
        this.settingsQueued = false;
        if (this.settings) this.renderSettings();
      });
    }
    return null;
  }

  paneFromSettings(render: (pages: SettingsPages) => HTMLElement): HTMLElement {
    const pages = this.settingsNow();
    if (pages) return render(pages);
    const wrap = el("div", "settings-stack");
    wrap.append(el("p", "setting-help", "Loading settings"));
    return wrap;
  }

  noteStat(note: StatNote) {
    if (this.bench || this.statOff) return;
    this.statQueue.push(note);
    if (this.statTimer) return;
    this.statTimer = window.setTimeout(() => {
      this.statTimer = 0;
      void this.flushStats();
    }, 1200);
  }

  flushStats(): Promise<void> {
    const batch = this.statQueue.splice(0);
    if (!batch.length || this.statOff || this.bench) return Promise.resolve();
    const boot = this.statBoot;
    this.statBoot = 0;
    return import("./stats-store").then((mod) => {
      mod.noteAll(batch, boot);
    }).catch(() => undefined);
  }

  notePlace(kind: "focus" | "message" | "voice", id: string, on?: 0 | 1) {
    if (this.bench || this.statOff) return;
    const place = this.placeFor(id);
    const channel = this.channelById(id);
    const scope = channel?.kind === "dm" || channel?.kind === "group"
      ? channel.kind
      : channel?.kind === "voice" || channel?.kind === "stage" ? "voice" : "text";
    this.noteStat({
      t: Date.now(),
      kind,
      id,
      name: place.channelName,
      place: place.guildName,
      scope: kind === "voice" ? "voice" : scope,
      on,
    });
  }

  paneStats(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(el("p", "setting-help", "Loading stats"));
    void this.flushStats().then(() => import("./stats-page")).then((mod) => {
      if (this.section !== "stats" || !wrap.isConnected) return;
      clear(wrap);
      mod.mountStatsPage(wrap, {
        onCollecting: (on) => {
          this.statOff = !on;
          if (!on) this.statQueue.length = 0;
        },
      });
    }).catch(() => undefined);
    return wrap;
  }

  settingsPane(): HTMLElement {
    switch (this.section) {
      case "account": return this.paneAccount();
      case "messaging": return this.paneFromSettings((pages) => pages.renderMessagingPane(this.settingsHost()));
      case "data": return this.paneFromSettings((pages) => pages.renderDataPane(this.settingsHost()));
      case "connections": return this.paneFromSettings((pages) => pages.renderConnectionsPane(this.settingsHost()));
      case "activity": return this.paneFromSettings((pages) => pages.renderActivityPane(this.settingsHost()));
      case "nitro": return this.paneFromSettings((pages) => pages.renderNitroPane(this.settingsHost()));
      case "appearance": return this.paneAppearance();
      case "accessibility": return this.paneFromSettings((pages) => pages.renderAccessibilityPane(this.settingsHost()));
      case "notifications": return this.paneNotifications();
      case "shortcuts": return this.paneShortcuts();
      case "language": return this.paneFromSettings((pages) => pages.renderLanguagePane(this.settingsHost()));
      case "window": return this.paneWindow();
      case "advanced": return this.paneFromSettings((pages) => pages.renderAdvancedPane(this.settingsHost()));
      case "updates": return this.paneUpdates();
      case "voice": return this.paneVoice();
      case "messages": return this.paneMessages();
      case "privacy": return this.panePrivacy();
      case "clips": return this.paneClips();
      case "gaming": return this.paneGaming();
      case "stats": return this.paneStats();
      case "plugins":
      case "lark":
        return this.panePlugins();
      default: {
        const extra = this.late!.settingsPane(this.section);
        if (extra) return extra();
        const known = this.late!.settingsSections().find((item) => item.id === this.section);
        const wrap = el("div", "settings-stack");
        wrap.append(this.late!.settingHead(known?.label ?? "Settings", known?.description ?? "This page has no controls yet."));
        return wrap;
      }
    }
  }

  paneUpdates(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Updates", "Lark checks for an app update and an interface bundle on startup and every 30 minutes. A voice call finishes before either one reloads."));
    const card = this.late!.settingCard("This computer");
    card.append(this.late!.settingRow("updates.version", "Current version", "The version of Lark running on this computer.", el("span", "hint", this.updates.currentVersion || "3.0.4")));
    card.append(this.switchRow("updates.auto", "Automatically install updates", "Download a new version in the background and install it when it is ready. A voice call finishes first.", this.updates.autoInstall, (value) => {
      const step = setAutoInstall(this.updates, value);
      this.updates = step.state;
      localStorage.setItem(AUTO_INSTALL_KEY, writeAutoInstall(value));
      this.paintUpdateBanner();
      this.followUpdate(step);
    }));
    const check = el("button", "text-button", this.updates.phase === "checking" ? "Checking…" : "Check for updates");
    check.type = "button";
    check.disabled = this.updates.phase === "checking" || this.updates.phase === "downloading" || this.updates.phase === "installing";
    check.addEventListener("click", () => void this.checkForUpdates(true));
    card.append(this.late!.settingRow("updates.check", "Check for updates", "Look for a Lark update now.", check));
    card.append(el("p", "setting-help", updatesStatus(this.updates)));
    if (!isTauri()) card.append(el("p", "setting-help", "Updates install from the macOS and Windows apps."));
    const notes = this.updates.offer?.notes.trim();
    if (notes && this.updates.skippedVersion !== this.updates.offer?.version) {
      card.append(el("p", "setting-help", notes.length > 1200 ? `${notes.slice(0, 1199).trimEnd()}…` : notes));
    }
    wrap.append(card);
    const uiCard = this.late!.settingCard("Interface");
    uiCard.append(this.late!.settingRow("updates.ui", "Interface build", "The interface loaded in this window. Built-in is the one packaged with the app.", el("span", "hint", interfaceBuildLabel(this.interfaceUi.snapshot))));
    uiCard.append(this.late!.settingRow(
      "updates.channel",
      "Interface channel",
      "Stable or Canary. Canary gets each interface build. Stable gets a promoted build.",
      this.late!.segmentControl(["stable", "canary"], this.interfaceUi.snapshot.channel, (value) => {
        void this.setInterfaceChannel(value === "canary" ? "canary" : "stable");
      }, { stable: "Stable", canary: "Canary" }),
      true,
    ));
    const checkUi = el("button", "text-button", this.interfaceUi.checking ? "Checking…" : "Check now");
    checkUi.type = "button";
    checkUi.disabled = this.interfaceUi.checking;
    checkUi.addEventListener("click", () => void this.checkInterface(true));
    uiCard.append(this.late!.settingRow("updates.interface", "Check now", "Look for an interface bundle now.", checkUi));
    const resetUi = el("button", "text-button", "Reset to built-in UI");
    resetUi.type = "button";
    resetUi.addEventListener("click", () => void this.resetInterface());
    uiCard.append(this.late!.settingRow("updates.reset", "Reset to built-in UI", "Drop the downloaded interface and load the one packaged with Lark.", resetUi));
    if (this.interfaceUi.error) uiCard.append(el("p", "setting-help", this.interfaceUi.error));
    else if (this.interfaceUi.note) uiCard.append(el("p", "setting-help", this.interfaceUi.note));
    if (!isTauri()) uiCard.append(el("p", "setting-help", "Interface updates install from the macOS and Windows apps."));
    wrap.append(uiCard);
    return wrap;
  }

  paneAccount(): HTMLElement {
    const me = this.demo ? people[0] : this.me;
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("My Account", "Name, avatar, and id come from Discord. Lark does not edit them. The token never goes in the config file, logs, or a plugin."));
    const who = this.late!.settingCard();
    who.append(el("div", "account-banner"));
    const body = el("div", "account-body");
    body.append(portrait(me.name, me.id, me.avatarUrl));
    const copy = el("div");
    copy.append(el("strong", "", this.maskText(me.name)));
    copy.append(el("div", "hint", this.maskText(me.custom || statusLabel(me.status))));
    copy.append(el("div", "hint", personalLine(me.id, this.streamerOn())));
    body.append(copy);
    who.append(body);
    const session = this.late!.settingCard("Session");
    session.dataset.setting = "account.session";
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "macOS Keychain", "~/Library/Application Support/dev.lark.desktop"));
    grid.append(this.platformCard("Windows", "Windows Credential Manager", "%APPDATA%\\dev.lark.desktop"));
    session.append(grid);
    session.append(el("p", "setting-help", `This session: ${this.platform.credentialStore}. Config folder: ${this.platform.configDir}`));
    const accountPages = this.settingsNow();
    wrap.append(who, session, ...(accountPages ? accountPages.renderAccountDetails(this.settingsHost()) : []));
    return wrap;
  }

  settingsHost() {
    return {
      config: this.config,
      streamer: this.streamerOn(),
      tauri: isTauri(),
      os: this.platform.os,
      meName: this.me.name,
      meId: this.me.id,
      meCustom: this.me.custom || "",
      credentialStore: this.platform.credentialStore,
      configDir: this.platform.configDir,
      account: this.accountOverview,
      accountNote: this.accountNote,
      discordRebind: this.discordRebind,
      mask: (value: string) => this.maskText(value),
      persist: () => { void this.persist(); },
      refresh: () => { if (this.settings) this.renderSettings(); },
      apply: () => this.applyAppearance(),
      repaint: () => this.paint(),
      logout: () => { void this.logoutAccount(); },
      switchAccount: (id: string) => { void this.switchTo(id); },
      removeAccount: (id: string) => { void this.removeAccount(id); },
      addAccount: () => { void this.addAccount(); },
      unlink: (type: string, id: string) => { void this.unlinkConnection(type, id); },
      rebindDiscord: (id: string) => {
        this.discordRebind = id;
        this.rebinding = null;
        if (this.settings) this.renderSettings();
      },
      formatShortcut: (shortcut: string) => formatShortcut(shortcut, this.platform.os),
      open: (url: string) => this.openDiscord(url),
      onDeveloper: (on: boolean) => { if (!on) this.closeNetworkPanel(); },
      openNetwork: () => this.openNetworkPanel(),
    };
  }

  openNetworkPanel() {
    if (this.netPanel || this.netOpening || !this.config.display.developer_mode) return;
    this.netOpening = true;
    const ticket = ++this.netTicket;
    setTrafficArmed(true);
    void import("./net-panel").then(({ mountNetPanel }) => {
      this.netOpening = false;
      if (ticket !== this.netTicket || !this.config.display.developer_mode) {
        if (ticket === this.netTicket) this.disarmNetwork();
        return;
      }
      this.netPanel = mountNetPanel(() => this.disarmNetwork(), (name, body) => downloadFile(name, body, "application/json"));
      this.netVoiceTimer = window.setInterval(() => this.pollVoiceTraffic(), 1000);
    }).catch(() => {
      this.netOpening = false;
      if (ticket === this.netTicket) this.disarmNetwork();
    });
  }

  pollVoiceTraffic() {
    if (!trafficArmed()) return;
    void invoke<string>("voice_diagnostics").then((text) => {
      if (trafficArmed()) noteVoiceDiagnostics(text);
    }).catch(() => undefined);
  }

  disarmNetwork() {
    setTrafficArmed(false);
    window.clearInterval(this.netVoiceTimer);
    this.netVoiceTimer = 0;
    this.netPanel = null;
  }

  closeNetworkPanel() {
    this.netTicket += 1;
    this.netOpening = false;
    const panel = this.netPanel;
    if (panel) panel.close();
    else this.disarmNetwork();
  }

  paneAppearance(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Appearance", "Each card is that theme's own colours. One click applies it."));
    const appearancePages = this.settingsNow();
    if (appearancePages) wrap.append(appearancePages.colorModeCard(this.settingsHost()));
    const themes = this.late!.settingCard("Themes");
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
    const text = this.late!.settingCard("Text");
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
    text.append(this.sliderRow("appearance.size", "Font size", "Interface size, from 12 to 24.", this.config.appearance.font_size, 12, 24, (value) => {
      this.config.appearance.font_size = value;
      this.persist();
      this.applyAppearance();
    }));
    const display = this.late!.settingCard("Display");
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
    if (appearancePages) wrap.append(appearancePages.appIconCard(this.settingsHost()), appearancePages.mediaCard(this.settingsHost()));
    this.paintThemeGallery(wrap);
    return wrap;
  }

  accentRow(): HTMLElement {
    const guild = this.guilds().find((item) => item.id === this.guildId);
    const stored = guild ? (this.config.accents[guild.id] ?? "") : "";
    const shown = this.late!.normalizeHex(stored) || rgbToHex(getComputedStyle(this.root).getPropertyValue("--accent")) || "#fafafa";
    const control = this.late!.colorControl(shown, "Server accent", (hex) => {
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
    return this.late!.settingRow("appearance.accent", "Server accent", description, control, true);
  }

  paneNotifications(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Notifications", this.platform.notificationNote));
    const card = this.late!.settingCard("Alerts");
    card.append(this.segmentRow(
      "notifications.level",
      "Notify me when",
      "All messages, only mentions, or nothing.",
      ["all", "mentions", "mute"],
      { all: "All messages", mentions: "Mentions", mute: "Nothing" },
      this.config.notifications.default,
      (value) => {
        this.config.notifications.default = value as NotifyLevel;
        this.persist();
      },
    ));
    const test = el("button", "primary", "Send a test notification");
    test.type = "button";
    test.addEventListener("click", () => void this.notify("Lark", "Notifications are on. Mute still wins."));
    card.append(this.late!.settingRow("notifications.test", "Test notification", "Send a sample so you can see where it lands.", test));
    const words = el("input");
    words.value = this.config.notifications.keywords.join(", ");
    words.setAttribute("aria-label", "Highlight keywords");
    words.addEventListener("change", () => {
      this.config.notifications.keywords = words.value.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 20);
      this.persist();
      this.msgSig = "";
    });
    card.append(this.late!.settingRow("notifications.keywords", "Highlight keywords", "Messages that contain these words get a highlight. Separate words with commas.", words, true));
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "Banners and Notification Center", "⌘"));
    grid.append(this.platformCard("Windows", "Toasts in Action Center", "Ctrl"));
    card.append(grid);
    const notificationPages = this.settingsNow();
    if (notificationPages) card.append(...notificationPages.notificationExtras(this.settingsHost()));
    wrap.append(card, this.quietCard(), this.alertCard(), this.missedCard());
    return wrap;
  }

  quietCard(): HTMLElement {
    const quiet = this.config.notifications.quiet;
    const card = this.late!.settingCard("Quiet hours");
    card.append(this.switchRow(
      "notifications.quiet",
      "Quiet hours",
      "Uses this computer's clock. Mentions, direct messages, and keyword or person alerts still come through. A mute still blocks ordinary messages.",
      quiet.enabled,
      (value) => {
        this.config.notifications.quiet.enabled = value;
        this.quietOn = inQuietHours(this.config.notifications.quiet, new Date());
        this.persist();
      },
    ));
    card.append(this.clockRow("notifications.quiet.start", "Start", "When the window begins.", quiet.start, (value) => {
      this.config.notifications.quiet.start = value;
      this.persist();
    }));
    card.append(this.clockRow("notifications.quiet.end", "End", "When the window ends. A later start runs through midnight.", quiet.end, (value) => {
      this.config.notifications.quiet.end = value;
      this.persist();
    }));
    card.append(this.segmentRow(
      "notifications.quiet.mode",
      "Non-critical alerts",
      "Suppress drops them. Batch saves them and sends one summary when the window ends or you come back.",
      ["suppress", "batch"],
      { suppress: "Suppress", batch: "Batch" },
      quiet.mode,
      (value) => {
        this.config.notifications.quiet.mode = value === "suppress" ? "suppress" : "batch";
        this.persist();
      },
    ));
    return card;
  }

  alertCard(): HTMLElement {
    const card = this.late!.settingCard("Alerts");
    card.append(el("p", "setting-help", "A match notifies you even when the channel is muted. Add the word, the person, or the channel id to Blocked to stop that."));
    card.append(this.commaRow(
      "notifications.alerts",
      "Alert keywords",
      "Words, separated by commas.",
      this.config.notifications.alert_keywords,
      (next) => {
        this.config.notifications.alert_keywords = next;
      },
    ));
    card.append(this.commaRow(
      "notifications.people",
      "People",
      "Exact display names or user ids.",
      this.config.notifications.people,
      (next) => {
        this.config.notifications.people = next;
      },
    ));
    card.append(this.commaRow(
      "notifications.blocked",
      "Blocked",
      "These never break a mute.",
      this.config.notifications.blocked,
      (next) => {
        this.config.notifications.blocked = next;
      },
    ));
    return card;
  }

  missedCard(): HTMLElement {
    const card = this.late!.settingCard("Missed");
    card.dataset.setting = "notifications.missed";
    const lines = digestLines(this.missed);
    if (!lines.length) {
      card.append(el("p", "setting-help", "Nothing missed. Lark keeps this list on this device while you are away or in quiet hours."));
      return card;
    }
    const summary = digestSummary(this.missed);
    card.append(el("p", "setting-help", `${summary.title}. Kept on this device. Opening a channel clears it.`));
    const list = el("div", "missed-list");
    for (const line of lines) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      button.append(el("strong", "", this.maskText(line.name)), el("span", "", `${line.count} message${line.count === 1 ? "" : "s"}`));
      button.addEventListener("click", () => this.openMissed(line.channelId));
      list.append(button);
    }
    card.append(list);
    const clear = el("button", "text-button", "Clear");
    clear.type = "button";
    clear.addEventListener("click", () => {
      this.missed = [];
      this.missedSeen = Date.now();
      this.saveMissed();
      if (this.settings) this.renderSettings();
    });
    card.append(clear);
    return card;
  }

  clockRow(id: string, label: string, description: string, value: string, onChange: (value: string) => void): HTMLElement {
    const input = el("input");
    input.type = "time";
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      if (clockMinutes(input.value) === null) {
        input.value = value;
        return;
      }
      onChange(input.value);
      this.quietOn = inQuietHours(this.config.notifications.quiet, new Date());
    });
    return this.late!.settingRow(id, label, description, input);
  }

  commaRow(id: string, label: string, description: string, current: readonly string[], apply: (next: string[]) => void): HTMLElement {
    const input = el("input");
    input.type = "text";
    input.value = current.join(", ");
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      apply(cleanAlertList(input.value));
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return this.late!.settingRow(id, label, description, input, true);
  }

  openMissed(channelId: string) {
    const guildId = this.guildForChannel(channelId);
    if (guildId) {
      this.guildId = guildId;
      this.friendsOpen = false;
    } else if (this.dms().some((channel) => channel.id === channelId)) {
      this.guildId = null;
      this.friendsOpen = false;
    }
    this.closeSettings();
    void this.openChannel(channelId);
  }

  paneShortcuts(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Keybinds", "mod is ⌘ on macOS and Ctrl on Windows. Click a shortcut, then press the new keys. Save clip is global on macOS and Windows, so it still works while a game is in front."));
    const card = this.late!.settingCard("Shortcuts");
    card.append(this.late!.settingRow("shortcut.mark_read", "Mark read", "Esc closes whatever is open first. With nothing open, it marks the channel read.", el("span", "kbd", "Esc")));
    const conflicts = shortcutConflicts(this.config.shortcuts);
    if (conflicts.length) card.append(el("div", "warning", conflicts.join(" ")));
    for (const [action, shortcut] of Object.entries(this.config.shortcuts) as [keyof Shortcuts, string][]) {
      const copy = this.late!.SHORTCUT_COPY[action] ?? { label: action.replaceAll("_", " "), description: "" };
      const button = el("button", "kbd", this.rebinding === action ? "Press keys" : formatShortcut(shortcut, this.platform.os));
      button.type = "button";
      button.addEventListener("click", () => {
        this.rebinding = action;
        this.renderSettings();
      });
      card.append(this.late!.settingRow(`shortcut.${action}`, copy.label, copy.description, button));
    }
    const shortcutPages = this.settingsNow();
    wrap.append(card);
    if (shortcutPages) wrap.append(shortcutPages.discordKeybindCard(this.settingsHost()));
    return wrap;
  }

  paneWindow(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Window", "Tray, login, and how fast the window paints."));
    const card = this.late!.settingCard("Desktop");
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

  paneVoice(): HTMLElement {
    this.ensureVoicePrefs();
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Voice & Video", "Push to talk, voice activity, and Lark noise suppression (RNNoise) on the microphone."));
    void this.loadAudioDevices();
    const input = this.late!.settingCard("Input");
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
    input.append(this.switchRow("voice.noise", "Lark noise suppression", "RNNoise runs on the microphone when this is on. Echo cancellation is separate. Higher quality uses a spectral suppressor. This is not Krisp.", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
      this.paintVoice();
    }));
    const hudKey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
    const perfKey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
    const hud = this.late!.settingCard("In-game voice HUD");
    hud.append(el("p", "setting-help", "A small always-on-top window on macOS and Windows. It uses the same voice roster as the channel list. It stays off until you turn it on. Click through starts on, so the window does not take the mouse from a game."));
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
    const devices = this.late!.settingCard("Devices");
    devices.append(el("p", "setting-help", "Lark stores the device you pick. Voice matches that name on the desktop device. An unknown id uses the communications device."));
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
    devices.append(this.deviceRow("voice.camera", "Camera", "Camera Lark opens for the preview and for video in a call.", this.config.voice.video_device, this.videoInputs, (value) => {
      this.config.voice.video_device = value;
      this.persist();
    }));
    const listDevices = el("button", "text-button", "List microphones and cameras");
    listDevices.type = "button";
    listDevices.addEventListener("click", () => void this.listDevices());
    const copyDiag = this.diagnosticsButton();
    const deviceActions = el("div", "settings-actions");
    deviceActions.append(listDevices, copyDiag);
    devices.append(deviceActions);
    const camera = this.late!.settingCard("Camera");
    camera.append(el("p", "setting-help", "720p at 30 fps is the default. The GPU encodes it when this computer has a hardware encoder, and a software encoder is the fallback. Lark steps the picture down when packets are being lost, then back up when the link clears."));
    camera.append(this.segmentRow(
      "voice.camera.quality",
      "Resolution",
      "360p, 480p, 720p, or 1080p.",
      ["360", "480", "720", "1080"],
      { "360": "360p", "480": "480p", "720": "720p", "1080": "1080p" },
      String(snapCameraHeight(this.config.voice.camera_height)),
      (value) => {
        this.config.voice.camera_height = snapCameraHeight(Number(value));
        this.persist();
        if (this.cameraOn) void this.startCameraSend();
      },
    ));
    camera.append(this.segmentRow(
      "voice.camera.fps",
      "Frame rate",
      "15 or 30. 30 matches a Discord camera.",
      ["15", "30"],
      { "15": "15", "30": "30" },
      String(snapCameraFps(this.config.voice.camera_fps)),
      (value) => {
        this.config.voice.camera_fps = snapCameraFps(Number(value));
        this.persist();
        if (this.cameraOn) void this.startCameraSend();
      },
    ));
    const ring = this.late!.settingCard("Speaking ring");
    ring.append(this.speakRingRow());
    const share = this.late!.settingCard("Screen share");
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
    wrap.append(input, hud, devices, camera, ring, share);
    this.appendVoiceLab(wrap);
    this.appendSoundboard(wrap);
    return wrap;
  }

  speakRingRow(): HTMLElement {
    const current = speakColor(this.config.voice.speak_color);
    const control = this.late!.colorControl(current, "Speaking ring color", (hex) => {
      this.config.voice.speak_color = speakColor(hex);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
    }, () => {
      this.config.voice.speak_color = speakColor(undefined);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return this.late!.settingRow(
      "voice.speak",
      "Speaking ring",
      "The ring sweeps around an avatar while someone is speaking. It stays a solid ring when reduced motion is on, and while Game Mode is on. Discord green is the default.",
      control,
      true,
    );
  }

  voicePrefsLoaded = false;

  ensureVoicePrefs() {
    if (this.voicePrefsLoaded) return;
    this.voicePrefsLoaded = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(VOICE_PREFS_KEY);
    } catch {
      raw = null;
    }
    const prefs = readVoicePrefs(raw);
    this.inputProfiles = prefs.profiles;
    this.inputProfileId = prefs.profileId;
    this.echoCancellation = prefs.echoCancellation;
    this.agc = prefs.agc;
    this.noiseQuality = prefs.noiseQuality;
    this.inputVolume = prefs.inputVolume;
    this.outputVolume = prefs.outputVolume;
    this.soundToggles = sanitizeSoundToggles(prefs.soundToggles);
  }

  storeVoicePrefs() {
    try {
      localStorage.setItem(VOICE_PREFS_KEY, writeVoicePrefs({
        profiles: this.inputProfiles,
        profileId: this.inputProfileId,
        echoCancellation: this.echoCancellation,
        agc: this.agc,
        noiseQuality: this.noiseQuality,
        inputVolume: this.inputVolume,
        outputVolume: this.outputVolume,
        soundToggles: this.soundToggles,
      }));
    } catch {
      /* private mode */
    }
  }

  appendVoiceLab(wrap: HTMLElement) {
    this.late!.registerSettingEntries([
      { id: "voice.mic-test", section: "voice", label: "Mic test", description: "Watch the microphone level.", keywords: "meter input" },
      { id: "voice.profiles", section: "voice", label: "Input profiles", description: "Saved microphone, input mode, and sensitivity.", keywords: "profile" },
      { id: "voice.echo", section: "voice", label: "Echo cancellation", description: "Cancel speaker echo with the playback mix.", keywords: "aec echo" },
      { id: "voice.quality", section: "voice", label: "Higher quality suppression", description: "Spectral noise suppression. Echo cancellation is separate.", keywords: "spectral rnnoise" },
      { id: "voice.agc", section: "voice", label: "Automatic gain control", description: "Keep the microphone at a steady level.", keywords: "agc volume" },
      { id: "voice.camera-test", section: "voice", label: "Camera test", description: "Preview the camera. In a call, the same picture is sent.", keywords: "video webcam" },
      { id: "voice.stream-preview", section: "voice", label: "Stream preview", description: "The current Go Live picture.", keywords: "share screen" },
      { id: "voice.sound-toggles", section: "voice", label: "Sound toggles", description: "Turn individual sounds on or off.", keywords: "soundboard" },
    ]);
    const test = this.late!.settingCard("Mic test");
    test.dataset.setting = "voice.mic-test";
    const meter = el("div", "mic-meter");
    meter.append(el("span", "mic-meter-fill"));
    const probe = el("button", this.micTestOn ? "text-button is-on" : "text-button", this.micTestOn ? "Stop mic test" : "Mic test");
    probe.type = "button";
    probe.addEventListener("click", () => {
      this.micTestOn = !this.micTestOn;
      if (this.micTestOn) this.watchMicLevel();
      else this.stopMicLevel();
      if (this.settings) this.renderSettings();
    });
    test.append(el("p", "setting-help", "The meter moves while the test or the microphone menu is open."), meter, probe);
    const profiles = this.late!.settingCard("Input profiles");
    profiles.dataset.setting = "voice.profiles";
    profiles.append(el("p", "setting-help", "A profile stores the microphone, voice activity or push to talk, and the sensitivity."));
    const name = el("input");
    name.type = "text";
    name.maxLength = 40;
    name.placeholder = "Profile name";
    name.setAttribute("aria-label", "Input profile name");
    const save = el("button", "text-button", "Save profile");
    save.type = "button";
    save.addEventListener("click", () => {
      const label = name.value.trim() || "Profile";
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      const id = /^[a-z0-9]/.test(slug) ? slug : `p${Date.now().toString(36)}`;
      this.inputProfiles = sanitizeInputProfiles([
        ...this.inputProfiles.filter((profile) => profile.id !== id),
        { id, name: label, deviceId: this.config.voice.input_device, mode: this.voiceMode() === "ptt" ? "ptt" : "vad", sensitivity: this.config.voice.sensitivity },
      ]);
      this.inputProfileId = id;
      this.storeVoicePrefs();
      if (this.settings) this.renderSettings();
    });
    const form = el("div", "settings-actions");
    form.append(name, save);
    profiles.append(form);
    if (!this.inputProfiles.length) profiles.append(el("p", "setting-help", "No profiles yet."));
    for (const profile of this.inputProfiles) {
      const row = el("div", "shortcut-row");
      const use = el("button", profile.id === this.inputProfileId ? "text-button is-on" : "text-button", profile.name);
      use.type = "button";
      use.addEventListener("click", () => {
        this.pickInputProfile(profile.id);
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      const drop = el("button", "text-button", "Remove");
      drop.type = "button";
      drop.addEventListener("click", () => {
        this.inputProfiles = this.inputProfiles.filter((item) => item.id !== profile.id);
        if (this.inputProfileId === profile.id) this.inputProfileId = "";
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      row.append(use, drop);
      profiles.append(row);
    }
    const process = this.late!.settingCard("Processing");
    process.append(this.switchRow("voice.echo", "Echo cancellation", "Cancels speaker echo with the playback mix, before noise suppression.", this.echoCancellation, (value) => {
      this.echoCancellation = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.quality", "Higher quality suppression", "Spectral noise suppression. Standard stays on RNNoise. Echo cancellation is separate. This is not Krisp.", this.noiseQuality === "high", (value) => {
      this.noiseQuality = noiseQualityName(value ? "high" : "standard");
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.agc", "Automatic gain control", "Keeps a quiet microphone at a steady level. Silence stays silence.", this.agc, (value) => {
      this.agc = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    const camera = this.late!.settingCard("Camera test");
    camera.dataset.setting = "voice.camera-test";
    const slot = el("div", "camera-preview-slot");
    slot.dataset.cameraTest = "";
    const open = el("button", this.cameraOn ? "text-button is-on" : "text-button", this.cameraOn ? "Stop camera" : "Test camera");
    open.type = "button";
    open.addEventListener("click", () => this.toggleCamera());
    camera.append(el("p", "setting-help", "The preview uses the camera above. In a voice channel the same frames are sent on the voice connection."), slot, open);
    const stream = this.late!.settingCard("Stream preview");
    stream.dataset.setting = "voice.stream-preview";
    const preview = el("div", "stream-preview");
    const live = document.querySelector("[data-stream-slot] video");
    if (live instanceof HTMLVideoElement && live.srcObject instanceof MediaStream) {
      const copy = document.createElement("video");
      copy.className = "stream-preview-video";
      copy.muted = true;
      copy.autoplay = true;
      copy.playsInline = true;
      copy.srcObject = live.srcObject;
      preview.append(copy);
    } else {
      preview.append(el("p", "hint", this.shareOn
        ? `Live at ${this.config.voice.share_resolution} · ${this.config.voice.share_fps} fps.`
        : "Start a stream to see it here."));
    }
    stream.append(preview);
    wrap.append(test, profiles, process, camera, stream);
  }

  paneMessages(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Messages", "Saved messages, reminders, and scheduled sends stay on this device. Discord pins are unchanged."));
    const saved = this.late!.settingCard("Saved");
    saved.dataset.setting = "messages.saved";
    if (!this.pack.bookmarks.length) saved.append(el("p", "setting-help", "Save on a message keeps it here. Saved in the header opens the same list."));
    for (const bookmark of this.pack.bookmarks) saved.append(this.savedRow(bookmark));
    const reminders = this.late!.settingCard("Reminders");
    reminders.dataset.setting = "messages.reminders";
    if (!this.reminders.length) reminders.append(el("p", "setting-help", "Remind on a message. Lark notifies you once, at the time you picked."));
    for (const reminder of this.reminders) reminders.append(this.reminderRow(reminder));
    const scheduled = this.late!.settingCard("Scheduled");
    scheduled.dataset.setting = "messages.scheduled";
    if (!this.pack.schedule.length) scheduled.append(el("p", "setting-help", "Later in the composer queues a send. The soonest time is 15 seconds from now, and one message goes out at a time."));
    for (const item of this.pack.schedule) scheduled.append(this.scheduledRow(item));
    wrap.append(saved, reminders, scheduled);
    return wrap;
  }

  panePrivacy(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Privacy", "Streamer mode hides emails, tokens, DM previews, and personal info on this screen. Discord still has the real messages."));
    const card = this.late!.settingCard("Streamer mode");
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

  paneClips(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Clips", clipBehaviorNote(this.platform.os)));
    const card = this.late!.settingCard("Buffer");
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
    const bufferLabels: Record<string, string> = { "15": "15s", "30": "30s", "60": "1m", "90": "90s", "120": "2m" };
    card.append(this.segmentRow(
      "clips.buffer",
      "Replay length",
      "How far back the hotkey saves. A longer buffer keeps the same memory budget by lowering the bitrate.",
      CLIP_BUFFER_OPTIONS.map((value) => String(value)),
      bufferLabels,
      String(sanitizeClipBuffer(this.config.clips.buffer_sec)),
      (value) => {
        this.config.clips.buffer_sec = sanitizeClipBuffer(Number.parseInt(value, 10));
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
    const upload = this.late!.settingCard("Upload");
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
    upload.append(this.late!.settingRow("clips.library", "Clip library", "Play, trim, and share clips saved on this computer.", uploadActions));
    const library = this.late!.settingCard("Saved on this computer");
    this.appendClipLibrary(library);
    wrap.append(card, upload, library);
    return wrap;
  }

  paneGaming(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Gaming", "Game Mode tucks the side columns during a call or while a game is in front, and eases resource use. Chat stays on screen. Each game can keep its own voice and overlay defaults."));
    const mode = this.late!.settingCard("Game Mode");
    const gameKey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    mode.append(this.switchRow("gaming.mode", "Game Mode", `${gameKey} toggles it, including while a game is focused. In a call, or while a game is in front, the member list hides and the rail and channel list shrink. Chat, the composer, and mute stay reachable. Animations pause, unopened channels are not prefetched, and the existing polls slow down. Speaking stays a static mark.`, this.gameMode, (value) => {
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
    const status = this.late!.settingCard("Status");
    status.append(this.switchRow("gaming.hardware", "Hardware in status", "Off until you turn this on. Lark then reads this computer's GPU name, CPU temperature on macOS when a sensor answers, and the current game. Windows leaves temperature blank. That line becomes your Discord custom status, kept to 128 characters, and it refreshes about once a minute. macOS and Windows only.", this.config.desktop.hardware_status, (value) => {
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
    const profiles = this.late!.settingCard("Game profiles");
    profiles.dataset.setting = "gaming.profiles";
    this.appendGameProfiles(profiles);
    wrap.append(mode, status, profiles);
    return wrap;
  }

  panePlugins(): HTMLElement {
    const wrap = el("div", "settings-stack");
    const head = this.late!.settingHead("Plugins and Themes", "Install from the store list, then turn an item on. Lark still runs with none installed.");
    const browse = el("button", "text-button", "Browse");
    browse.type = "button";
    browse.addEventListener("click", () => void this.openStorePage());
    head.append(browse);
    wrap.append(head);
    const card = this.late!.settingCard("Plugins");
    card.dataset.setting = "plugins.list";
    card.append(el("p", "setting-help", "Reading tools stay on this device. They never receive the token."));
    const pack = new Set<string>(PACK_IDS);
    const plugins = this.installed.filter((item) => item.kind === "plugin");
    const themes = this.installed.filter((item) => item.kind === "theme");
    const samples = plugins.filter((item) => !pack.has(item.id));
    const packed = plugins.filter((item) => pack.has(item.id));
    const paintPlugin = (item: InstalledRecord) => {
      const enabled = this.config.plugins.enabled.includes(item.id);
      card.append(this.switchRow(`plugin.${item.id}`, item.name || item.id, this.storeBlurb(item), enabled, (value) => this.setPluginEnabled(item.id, value)));
      card.append(this.storeActions(item));
      if (enabled) this.appendPluginPanel(card, item.id);
    };
    for (const item of samples) paintPlugin(item);
    if (packed.length) card.append(el("h3", "", "Pack"));
    for (const item of packed) paintPlugin(item);
    if (!plugins.length) card.append(el("p", "setting-help", "No plugins installed. Browse the store to add one."));
    const themeCard = this.late!.settingCard("Themes");
    themeCard.append(el("p", "setting-help", "One theme can be on. Turning it off keeps the built-in colours."));
    for (const item of themes) {
      const on = !this.preferBuiltin && this.config.appearance.theme === item.id;
      themeCard.append(this.switchRow(`theme.${item.id}`, item.name || item.id, this.storeBlurb(item), on, (value) => this.setThemeEnabled(item.id, value)));
      themeCard.append(this.storeActions(item));
    }
    if (!themes.length) themeCard.append(el("p", "setting-help", "No themes installed. The built-in colours stay on."));
    wrap.append(this.storeCatalogCard(), card, themeCard);
    return wrap;
  }

  storeCatalogCard(): HTMLElement {
    const card = this.late!.settingCard("Store");
    card.dataset.setting = "plugins.store";
    if (!this.storeIndex) {
      card.append(el("p", "setting-help", this.storeIndexTried ? "The store could not be reached." : "Loading the store…"));
      return card;
    }
    const index = this.storeIndex;
    const search = el("input", "store-search");
    search.type = "search";
    search.placeholder = "Search the store";
    search.setAttribute("aria-label", "Search the store");
    search.value = this.storeQuery;
    const chips = el("div", "store-chips");
    chips.setAttribute("role", "toolbar");
    chips.setAttribute("aria-label", "Store filters");
    const results = el("div", "store-results");
    const paint = () => {
      const browsed = browseStore(index, this.installed, {
        query: this.storeQuery,
        kind: this.storeKind,
        category: this.storeCategory,
      });
      if (this.storeCategory && !browsed.categories.includes(this.storeCategory)) this.storeCategory = "";
      chips.replaceChildren();
      for (const kind of ["all", "plugin", "theme"] as const) {
        const label = kind === "all" ? "All" : kind === "plugin" ? "Plugins" : "Themes";
        const button = el("button", "store-chip", label);
        button.type = "button";
        button.setAttribute("aria-pressed", this.storeKind === kind ? "true" : "false");
        button.addEventListener("click", () => {
          this.storeKind = kind;
          paint();
        });
        chips.append(button);
      }
      for (const category of browsed.categories) {
        const button = el("button", "store-chip", categoryLabel(category));
        button.type = "button";
        button.setAttribute("aria-pressed", this.storeCategory === category ? "true" : "false");
        button.addEventListener("click", () => {
          this.storeCategory = this.storeCategory === category ? "" : category;
          paint();
        });
        chips.append(button);
      }
      results.replaceChildren();
      if (this.themePreview) {
        const name = index.themes.find((item) => item.id === this.themePreview?.id)?.name ?? this.themePreview.id;
        const bar = el("div", "store-preview");
        bar.append(el("span", "", `Previewing ${name}. Nothing is installed.`));
        const revert = el("button", "text-button", "Revert");
        revert.type = "button";
        revert.addEventListener("click", () => this.revertStoreTheme());
        bar.append(revert);
        results.append(bar);
      }
      const empty = !browsed.plugins.length && !browsed.themes.length;
      const unfiltered = browseStore(index, this.installed, { query: "", kind: "all", category: "" });
      if (empty && !unfiltered.plugins.length && !unfiltered.themes.length) {
        results.append(el("p", "setting-help", "Everything in the store is installed."));
        return;
      }
      if (empty) {
        results.append(el("p", "setting-help", "Nothing matches."));
        return;
      }
      const paintItem = (item: StoreItem, theme = false) => {
        const busy = this.storeInstalling === item.id;
        const controls = el("div", "store-row-actions");
        if (theme) {
          const previewing = this.themePreview?.id === item.id;
          const preview = el("button", "text-button", previewing ? "Revert" : "Preview");
          preview.type = "button";
          preview.disabled = this.storeInstalling !== "";
          preview.addEventListener("click", () => void this.toggleStoreThemePreview(item));
          controls.append(preview);
        }
        const install = el("button", "text-button", busy ? "Installing…" : "Install");
        install.type = "button";
        install.disabled = this.storeInstalling !== "";
        install.addEventListener("click", () => void this.installFromCatalog(item.id));
        controls.append(install);
        const needs = larkVersionOk(item.minLark, APP_VERSION) ? "" : ` · Needs Lark ${item.minLark}`;
        const note = item.changelog ? ` · ${item.changelog}` : "";
        const row = this.late!.settingRow(`store.${item.id}`, item.name, `${item.description} · v${item.version}${needs}${note}`, controls);
        const swatches = storeSwatches(item.swatches);
        if (swatches) row.querySelector(".setting-copy")?.append(swatches);
        results.append(row);
      };
      if (browsed.plugins.length) results.append(el("h3", "", "Plugins"));
      for (const item of browsed.plugins) paintItem(item);
      if (browsed.themes.length) results.append(el("h3", "", "Themes"));
      for (const item of browsed.themes) paintItem(item, true);
    };
    search.addEventListener("input", () => {
      this.storeQuery = search.value;
      paint();
    });
    card.append(search, chips, results);
    paint();
    return card;
  }

  async installFromCatalog(id: string) {
    if (this.storeInstalling) return;
    if (this.themePreview?.id === id) this.revertStoreTheme();
    this.storeInstalling = id;
    if (this.settings && this.section === "plugins") this.renderSettings();
    const name = await this.installStoreItem(id);
    this.storeInstalling = "";
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  }

  storeBlurb(item: InstalledRecord): string {
    const remote = this.storeIndex ? findStoreItem(this.storeIndex, item.id) : null;
    const update = remote && newerVersion(item.version, remote.item.version) ? " · Update available" : "";
    const description = item.description ? `${item.description} · ` : "";
    return `${description}v${item.version}${update}`;
  }

  storeActions(item: InstalledRecord): HTMLElement {
    const row = el("div", "store-actions");
    const remote = this.storeIndex ? findStoreItem(this.storeIndex, item.id) : null;
    if (remote && newerVersion(item.version, remote.item.version)) {
      const update = el("button", "text-button", "Update");
      update.type = "button";
      update.addEventListener("click", () => void this.updateStoreItem(item.id));
      row.append(update);
    }
    const remove = el("button", "text-button", "Uninstall");
    remove.type = "button";
    remove.addEventListener("click", () => void this.uninstallStoreItem(item.id));
    row.append(remove);
    return row;
  }

  async refreshPluginsPane() {
    if (this.storeRefreshing) return;
    this.storeRefreshing = true;
    const before = this.installed.map((item) => `${item.kind}:${item.id}:${item.version}`).join();
    const indexBefore = this.storeIndex ? `${this.storeIndex.plugins.length}:${this.storeIndex.themes.length}` : "";
    const triedBefore = this.storeIndexTried;
    try {
      await this.refreshStore();
    } finally {
      this.storeRefreshing = false;
      this.storeIndexTried = true;
    }
    const after = this.installed.map((item) => `${item.kind}:${item.id}:${item.version}`).join();
    const indexAfter = this.storeIndex ? `${this.storeIndex.plugins.length}:${this.storeIndex.themes.length}` : "";
    if ((before !== after || indexBefore !== indexAfter || !triedBefore) && this.settings && this.section === "plugins") this.renderSettings();
  }

  async openStorePage() {
    if (isTauri()) {
      try {
        await invoke("open_store_page");
      } catch (err) {
        this.toast("Store", commandError(err, "Couldn't open the store."));
      }
      return;
    }
    window.open(STORE_PAGE_URL, "_blank", "noopener");
  }

  async refreshStore() {
    if (isTauri()) {
      try {
        this.installed = await invoke<InstalledRecord[]>("installed_store");
      } catch {
        this.installed = [];
      }
      try {
        const parsed = parseStoreIndex(await invoke<string>("store_index"));
        if (parsed) this.storeIndex = parsed;
      } catch {
        /* Installed items still show when the store is offline. */
      }
    } else {
      const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
      this.installed = [
        ...Object.entries(local.plugins).map(([id, item]) => ({
          id,
          kind: "plugin" as const,
          name: item.name,
          description: item.description,
          version: item.version,
          sha256: item.sha256,
        })),
        ...Object.entries(local.themes).map(([id, item]) => ({
          id,
          kind: "theme" as const,
          name: item.name,
          description: item.description,
          version: item.version,
          sha256: item.sha256,
        })),
      ].sort((a, b) => a.id.localeCompare(b.id));
      try {
        const res = await fetch(STORE_INDEX_URL, { cache: "no-store" });
        if (res.ok) {
          const parsed = parseStoreIndex(await res.json());
          if (parsed) this.storeIndex = parsed;
        }
      } catch {
        /* The preview still shows what is already installed. */
      }
    }
    this.catalog = this.installed
      .filter((item) => item.kind === "plugin")
      .map((item) => ({ id: item.id, name: item.name || item.id, description: item.description }));
  }

  async installStoreItem(id: string): Promise<string | null> {
    if (!validPluginId(id)) return null;
    try {
      if (isTauri()) {
        const record = await invoke<InstalledRecord>("install_store_item", { id });
        await this.refreshStore();
        return record.name || id;
      }
      if (!this.storeIndex) {
        const res = await fetch(STORE_INDEX_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("The store could not be reached.");
        this.storeIndex = parseStoreIndex(await res.json());
      }
      const found = this.storeIndex ? findStoreItem(this.storeIndex, id) : null;
      if (!found) throw new Error(`"${id}" is not in the store.`);
      if (!larkVersionOk(found.item.minLark, APP_VERSION)) throw new Error(`"${id}" needs Lark ${found.item.minLark} or newer.`);
      const url = entryUrl(found.item);
      if (!url) throw new Error("The store path was refused.");
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("The download failed.");
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const problem = acceptBytes(found.item, bytes, hash);
      if (problem) throw new Error(problem);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
      if (found.kind === "theme") {
        const issue = validateThemeCss(text);
        if (issue) throw new Error(issue);
        local.themes[id] = { version: found.item.version, sha256: hash, css: text, name: found.item.name, description: found.item.description };
      } else {
        local.plugins[id] = { version: found.item.version, sha256: hash, source: text, name: found.item.name, description: found.item.description };
      }
      localStorage.setItem(STORE_LOCAL_KEY, writeLocalStore(local));
      await this.refreshStore();
      return found.item.name;
    } catch (err) {
      this.toast("Store", err instanceof Error ? err.message : "Couldn't install that.");
      return null;
    }
  }

  async updateStoreItem(id: string) {
    const name = await this.installStoreItem(id);
    if (!name) return;
    this.loaded.delete(id);
    this.themeCache.delete(id);
    if (this.config.plugins.enabled.includes(id)) await this.ensurePlugin(id);
    if (this.config.appearance.theme === id && !this.preferBuiltin) await this.applyTheme();
    this.toast("Store", `${name} is up to date.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  }

  async uninstallStoreItem(id: string) {
    try {
      if (isTauri()) await invoke("uninstall_store_item", { id });
      else {
        const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
        delete local.plugins[id];
        delete local.themes[id];
        localStorage.setItem(STORE_LOCAL_KEY, writeLocalStore(local));
      }
    } catch (err) {
      this.toast("Store", commandError(err, "Couldn't uninstall that."));
      return;
    }
    this.loaded.delete(id);
    this.themeCache.delete(id);
    if (this.config.plugins.enabled.includes(id)) {
      this.config.plugins.enabled = this.config.plugins.enabled.filter((item) => item !== id);
      this.persist();
    }
    if (this.config.appearance.theme === id) {
      this.preferBuiltin = true;
      localStorage.setItem("lark.theme.builtin", "1");
      await this.applyTheme();
    }
    await this.refreshStore();
    this.msgSig = "";
    if (this.settings) this.renderSettings();
    else this.paint();
  }

  setThemeEnabled(id: string, enabled: boolean) {
    if (enabled) {
      this.selectTheme(id);
      return;
    }
    this.themePreview = null;
    if (this.config.appearance.theme !== id) return;
    this.preferBuiltin = true;
    localStorage.setItem("lark.theme.builtin", "1");
    void this.applyTheme();
    if (this.settings && this.section === "appearance") this.paintThemeGallery();
  }

  showThemeCss(css: string | null, theme: string, builtin: boolean) {
    if (builtin || !css) {
      document.getElementById("lark-theme")?.remove();
      delete document.documentElement.dataset.theme;
      this.syncMaterial("none");
      applyUserChrome(this.root, this.config);
      return;
    }
    let style = document.getElementById("lark-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "lark-theme";
      document.head.append(style);
    }
    style.textContent = css;
    document.documentElement.dataset.theme = theme;
    this.syncMaterial(parseThemeCss(css).material);
    applyUserChrome(this.root, this.config);
  }

  async toggleStoreThemePreview(item: StoreItem) {
    if (this.themePreview?.id === item.id) {
      this.revertStoreTheme();
      return;
    }
    try {
      const css = await this.fetchStoreThemeCss(item);
      const issue = validateThemeCss(css);
      if (issue) throw new Error(issue);
      if (this.themePreview) {
        const next = swapThemePreview(this.themePreview, { id: item.id, css });
        if (!next) return;
        this.themePreview = next;
      } else {
        const node = document.getElementById("lark-theme");
        const session = beginThemePreview({
          css: node?.textContent ?? null,
          theme: this.config.appearance.theme,
          builtin: this.preferBuiltin || !node,
        }, { id: item.id, css });
        if (!session) return;
        this.themePreview = session;
      }
      this.showThemeCss(css, item.id, false);
      if (this.settings && this.section === "plugins") this.renderSettings();
    } catch (err) {
      this.toast("Store", err instanceof Error ? err.message : "Couldn't preview that theme.");
    }
  }

  revertStoreTheme() {
    const session = this.themePreview;
    if (!session) return;
    this.themePreview = null;
    const previous = revertThemePreview(session);
    this.showThemeCss(previous.css, previous.theme, previous.builtin);
    if (this.settings && this.section === "plugins") this.renderSettings();
  }

  async fetchStoreThemeCss(item: StoreItem): Promise<string> {
    if (isTauri()) return invoke<string>("preview_store_theme", { id: item.id });
    const url = entryUrl(item);
    if (!url) throw new Error("The store path was refused.");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("The download failed.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = await sha256Hex(bytes);
    const problem = acceptBytes(item, bytes, hash);
    if (problem) throw new Error(problem);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const issue = validateThemeCss(text);
    if (issue) throw new Error(issue);
    return text;
  }

  async installFromLink(id: string) {
    const name = await this.installStoreItem(id);
    this.section = "plugins";
    this.openSettings();
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
  }

  async listenForStoreLinks() {
    if (!isTauri() || this.storeListening) return;
    this.storeListening = true;
    try {
      const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const handle = (urls: string[]) => {
        for (const url of urls) {
          const id = parseInstallUrl(url);
          if (id) void this.installFromLink(id);
        }
      };
      const current = await getCurrent();
      if (current?.length) handle(current);
      await onOpenUrl(handle);
    } catch {
      /* The desktop scheme is unavailable in this session. */
    }
  }

  segmentRow(id: string, label: string, description: string, values: string[], labels: Record<string, string>, current: string, onPick: (value: string) => void): HTMLElement {
    const control = this.late!.segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
    return this.late!.settingRow(id, label, description, control, true);
  }

  sliderRow(id: string, label: string, description: string, value: number, min: number, max: number, onInput: (value: number) => void): HTMLElement {
    return this.late!.settingRow(id, label, description, this.late!.sliderControl(value, min, max, label, onInput), true);
  }

  switchRow(id: string, label: string, description: string, on: boolean, change: (value: boolean) => void | Promise<void>): HTMLElement {
    const button = this.late!.switchControl(on, label);
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
    return this.late!.settingRow(id, label, description, button);
  }

  deviceRow(id: string, label: string, description: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    return this.late!.settingRow(id, label, description, this.late!.selectControl(label, current, options, onChange), true);
  }

  devicePicker(label: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrap = el("label", "device", label);
    wrap.append(this.late!.selectControl(label, current, options, onChange));
    return wrap;
  }

  platformCard(title: string, body: string, extra: string): HTMLElement {
    const current = (title === "macOS" && this.platform.os === "macos") || (title === "Windows" && this.platform.os === "windows");
    const card = el("article", `platform-card${current ? " is-current" : ""}`);
    card.append(el("strong", "", title), el("div", "", body), el("div", "hint", extra));
    return card;
  }

  choice(values: string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
    return this.late!.segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
  }

  toggle(label: string, on: boolean, change: (value: boolean) => void | Promise<void>, description = ""): HTMLElement {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
    return this.switchRow(id || "setting", label, description, on, change);
  }

  runDiscordKeybind(event: KeyboardEvent, os: ReturnType<typeof browserPlatform>["os"]): boolean {
    const id = matchingKeybind(event, this.config.keybinds, os);
    if (!id) return false;
    if (event.repeat && id !== "scroll_chat_up" && id !== "scroll_chat_down") return true;
    if (id === "push_to_mute") {
      this.holdPushMute();
      return true;
    }
    if (id === "toggle_hotkeys") {
      this.hotkeysOff = true;
      this.toast("Keybinds", "Hotkeys are off.");
      return true;
    }
    if (id === "mark_server_read") {
      const ids = this.visibleChannels().filter((channel) => channel.kind !== "category").map((channel) => channel.id);
      if (ids.length) this.markRead(ids);
      return true;
    }
    if (id === "return_previous_text") {
      this.cycle(-1);
      return true;
    }
    if (id === "return_previous_audio") {
      if (this.voice?.channelId) void this.openChannel(this.voice.channelId);
      return true;
    }
    if (id === "toggle_pins") {
      this.pinsOpen = !this.pinsOpen;
      this.paintPins();
      return true;
    }
    if (id === "toggle_emoji_picker") {
      this.pickerFor = this.pickerFor === "composer" ? null : "composer";
      this.emojiQuery = "";
      if (this.pickerFor) void this.ensureEmojis();
      this.paintComposer();
      return true;
    }
    if (id === "scroll_chat_up" || id === "scroll_chat_down") {
      const delta = id === "scroll_chat_up" ? -1 : 1;
      this.messagesEl.scrollBy({ top: delta * Math.max(120, this.messagesEl.clientHeight * 0.8) });
      return true;
    }
    if (id === "upload_file") {
      this.composerMeta.querySelector<HTMLInputElement>("input[type=file]")?.click();
      return true;
    }
    if (id === "search") {
      this.searchOpen = true;
      this.paintSearch();
      return true;
    }
    if (id === "create_or_join_server") {
      this.openAddServer();
      return true;
    }
    if (id === "toggle_inbox") {
      void this.ensureLate().then((mod) => mod.toggleInbox());
      return true;
    }
    if (id === "toggle_gif_picker") {
      this.toggleGifPicker();
      return true;
    }
    if (id === "toggle_sticker_picker") {
      this.toggleStickerPicker();
      return true;
    }
    if (id === "create_group") {
      this.openGroupCreator();
      return true;
    }
    const call = callKeyAction(id, this.currentChannel() ?? null, this.voice, this.incoming);
    if (call) {
      if (call.op === "answer") this.answerIncoming();
      else if (call.op === "decline") this.declineIncoming();
      else if (call.op === "join") {
        const channel = this.currentChannel();
        if (channel && channel.id === call.channelId) this.startDmCall(channel, false);
      } else if (call.op === "focus") void this.openChannel(call.channelId);
      else if (call.op === "leave") this.leaveVoice();
      else this.toast("Call", call.message);
      return true;
    }
    window.dispatchEvent(new CustomEvent("lark-keybind", { detail: { id } }));
    return true;
  }

  toggleGifPicker() {
    toggleComposerPanel("gif");
    if (composerPanel() === "gif") scheduleGifLoad(gifQueryText());
    this.paintComposer();
  }

  toggleStickerPicker() {
    toggleComposerPanel("stickers");
    const guildId = this.guildId;
    if (composerPanel() === "stickers" && guildId && !this.demo && stickerGuildNow() !== guildId) {
      void invoke<{ id: string; name: string; url?: string | null }[]>("fetch_stickers", { guildId }).then((list) => {
        setStickerHits(guildId, list.map((item) => ({ id: item.id, name: item.name, url: item.url ?? null })));
        if (composerPanel() === "stickers") this.paintComposer();
      }).catch(() => {
        setStickerHits(guildId, []);
        if (composerPanel() === "stickers") this.paintComposer();
      });
    }
    this.paintComposer();
  }

  holdPushMute() {
    if (this.pushMuted) return;
    this.pushMuted = true;
    if (this.voice && !this.voice.muted) {
      this.mutedByPush = true;
      this.toggleMute();
    }
  }

  releasePushMute() {
    if (!this.pushMuted) return;
    this.pushMuted = false;
    if (this.mutedByPush) {
      this.mutedByPush = false;
      if (this.voice?.muted) this.toggleMute();
    }
  }

  openDiscord(url: string) {
    if (!url.startsWith("https://discord.com/")) return;
    if (!isTauri()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void invoke("open_discord_link", { url }).catch((err) => {
      this.toast("Discord", commandError(err, "Couldn't open Discord."));
    });
  }

  async rememberCurrentAccount(id: string, name: string) {
    if (this.demo || !isTauri() || id === ME) return;
    const next = rememberSession(this.config.sessions, { id, name });
    this.config.sessions = next.sessions;
    this.persist();
    try {
      await invoke("remember_account", { userId: id });
      for (const dropped of next.dropped) {
        await invoke("forget_account", { userId: dropped }).catch(() => undefined);
      }
    } catch {
      /* The credential store is unavailable in this preview. */
    }
  }

  async loadAccountOverview() {
    if (!isTauri() || this.demo) return;
    try {
      this.accountOverview = parseAccountOverview(await invoke("account_overview"));
      this.accountNote = "";
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't load the account from Discord.");
    }
    if (this.settings && (this.section === "account" || this.section === "connections")) this.renderSettings();
  }

  async unlinkConnection(type: string, id: string) {
    if (!isTauri()) return;
    try {
      await invoke("remove_connection", { kind: type, id });
      await this.loadAccountOverview();
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't remove that connection.");
      if (this.settings) this.renderSettings();
    }
  }

  async switchTo(id: string) {
    if (!isTauri()) {
      this.toast("Accounts", "Switching accounts runs in the desktop app.");
      return;
    }
    try {
      await invoke("switch_account", { userId: id });
      this.accountOverview = null;
      this.closeSettings();
      this.beginStartup(true);
      await invoke("connect");
    } catch (err) {
      this.abortStartup();
      this.toast("Accounts", commandError(err, "Couldn't switch to that account."));
    }
  }

  async addAccount() {
    this.closeSettings();
    await this.forgetToken();
  }

  async removeAccount(id: string) {
    const current = id === this.me.id;
    this.config.sessions = dropSession(this.config.sessions, id);
    this.persist();
    if (isTauri()) {
      try {
        await invoke("forget_account", { userId: id });
      } catch (err) {
        this.toast("Accounts", commandError(err, "Couldn't remove that account."));
      }
    }
    if (current) await this.logoutAccount();
    else if (this.settings) this.renderSettings();
  }

  async logoutAccount() {
    const current = this.me.id;
    if (current && current !== ME) {
      this.config.sessions = dropSession(this.config.sessions, current);
      this.persist();
      if (isTauri()) await invoke("forget_account", { userId: current }).catch(() => undefined);
    }
    const next = this.config.sessions[0];
    if (next && isTauri()) {
      try {
        await invoke("switch_account", { userId: next.id });
        this.accountOverview = null;
        this.closeSettings();
        this.beginStartup(true);
        await invoke("connect");
        return;
      } catch (err) {
        this.abortStartup();
        this.toast("Log Out", commandError(err, "Couldn't switch accounts."));
      }
    }
    await this.forgetToken();
  }

  async forgetToken() {
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
    const initial = await gateQr(isTauri());
    this.qrSvg = initial.svg;
    this.qrStatus = initial.status;
    this.tokenNote = "";
    this.signInBusy = "";
    this.connection = "Signed out";
    this.closeSettings();
    this.paint();
    this.ensureQr();
  }

  openImage(url: string) {
    if (this.lightbox !== url) this.lightboxZoom = 1;
    this.lightbox = url;
    this.paintLightbox();
  }

  paintLightbox() {
    this.lightboxEl.hidden = !this.lightbox;
    clear(this.lightboxEl);
    if (!this.lightbox) {
      this.lightboxZoom = 1;
      return;
    }
    const img = el("img");
    img.src = this.lightbox;
    img.alt = "Attachment";
    if (this.hookOn("imageZoom")) {
      img.classList.add("is-zoomable");
      if (this.lightboxZoom > 1) img.classList.add("is-zoomed");
      img.style.transform = `scale(${this.lightboxZoom})`;
      img.addEventListener("click", (event) => {
        event.stopPropagation();
        this.lightboxZoom = nextZoom(this.lightboxZoom, 1, this.pack.zoomMax);
        this.paintLightbox();
      });
      img.addEventListener("wheel", (event) => {
        event.preventDefault();
        this.lightboxZoom = nextZoom(this.lightboxZoom, event.deltaY > 0 ? -1 : 1, this.pack.zoomMax);
        this.paintLightbox();
      }, { passive: false });
    }
    this.lightboxEl.append(img);
  }

  openYoutube(url: string) {
    const id = youtubeId(url);
    if (!id) {
      this.toast("YouTube", "That embed doesn't have a video id.");
      return;
    }
    this.youtubeFloat = id;
    this.paintYoutubeFloat();
  }

  paintYoutubeFloat() {
    if (!this.youtubeFloat || !this.hookOn("youtubePip")) {
      this.youtubeFloatEl.hidden = true;
      clear(this.youtubeFloatEl);
      this.youtubeFloatStamp = "";
      if (!this.hookOn("youtubePip")) this.youtubeFloat = null;
      return;
    }
    const box = pipBox(this.pack.youtubePipSize);
    const muted = this.pack.youtubePipStart !== "sound";
    const stamp = `${this.youtubeFloat}:${box.width}:${muted ? 1 : 0}`;
    this.youtubeFloatEl.hidden = false;
    this.youtubeFloatEl.style.width = `${box.width}px`;
    this.youtubeFloatEl.style.height = `${box.height + 36}px`;
    if (stamp === this.youtubeFloatStamp && this.youtubeFloatEl.querySelector("iframe")) return;
    this.youtubeFloatStamp = stamp;
    clear(this.youtubeFloatEl);
    const bar = el("div", "yt-pip-bar");
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.youtubeFloat = null;
      this.paintYoutubeFloat();
    });
    bar.append(el("strong", "", "YouTube"), close);
    const frame = document.createElement("iframe");
    frame.title = "YouTube";
    frame.src = youtubePlayerUrl(this.youtubeFloat, muted) ?? "";
    frame.allow = "autoplay; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    this.youtubeFloatEl.append(bar, frame);
  }

  async shareLatestClip() {
    if (!this.clipItems.length) await this.loadClips();
    const clip = newestClip(this.clipItems);
    if (!clip) {
      this.toast("Clip", "No saved clip to send.");
      return;
    }
    await this.shareClip(clip.name);
  }

  startUpdates() {
    this.updates = initialUpdateState(this.updates.currentVersion || "3.0.4", readAutoInstall(localStorage.getItem(AUTO_INSTALL_KEY)));
    if (!isTauri()) return;
    void this.watchForUpdates();
    void this.watchInterface();
  }

  async watchForUpdates() {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();
      if (version) this.updates = { ...this.updates, currentVersion: version };
    } catch {
      this.updates = { ...this.updates, currentVersion: this.updates.currentVersion || "3.0.4" };
    }
    this.refreshUpdateUi();
    void this.checkForUpdates(false);
    window.clearInterval(this.updateTimer);
    this.updateTimer = window.setInterval(() => void this.checkForUpdates(false), UPDATE_CHECK_MS);
  }

  async checkForUpdates(manual: boolean) {
    if (!isTauri()) {
      if (!manual) return;
      this.updates = { ...this.updates, phase: "error", error: "Updates install from the macOS and Windows apps." };
      this.refreshUpdateUi();
      return;
    }
    const started = beginCheck(this.updates);
    if (started === this.updates) return;
    this.updates = started;
    this.refreshUpdateUi();
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      if (this.updates.phase !== "checking") return;
      if (!found) {
        this.applyUpdateStep(checkFinished(this.updates, null, manual));
        return;
      }
      if (this.pendingUpdate && this.pendingUpdate.version !== found.version) void this.pendingUpdate.close().catch(() => undefined);
      this.pendingUpdate = found;
      const step = checkFinished(this.updates, { version: found.version, notes: found.body ?? "" }, manual);
      this.applyUpdateStep(step);
    } catch (err) {
      this.updates = checkFailed(this.updates, updateErrorMessage(err), manual);
      this.refreshUpdateUi();
    }
  }

  followUpdate(step: UpdateStep) {
    if (step.effect === "download") void this.downloadPending();
    else if (step.effect === "install") void this.installPending();
  }

  applyUpdateStep(step: UpdateStep) {
    this.updates = step.state;
    this.refreshUpdateUi();
    this.followUpdate(step);
  }

  async downloadPending() {
    const update = this.pendingUpdate;
    if (!update || this.updateBusy) return;
    this.updateBusy = true;
    let received = 0;
    try {
      await update.download((event) => {
        if (event.event === "Started") {
          received = 0;
          this.updates = downloadProgress(this.updates, 0, event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          this.updates = downloadProgress(this.updates, received, this.updates.total);
        }
        this.paintUpdateBanner();
      });
      this.applyUpdateStep(downloadFinished({ ...this.updates, inCall: Boolean(this.voice) }));
    } catch (err) {
      if (this.updates.skippedVersion === update.version) return;
      this.updates = { ...this.updates, phase: "error", error: updateErrorMessage(err) };
      this.refreshUpdateUi();
    } finally {
      this.updateBusy = false;
    }
  }

  async installPending() {
    if (this.installingUpdate) return;
    if (this.voice) {
      this.updates = { ...this.updates, inCall: true, phase: "deferred", installRequested: true };
      this.refreshUpdateUi();
      return;
    }
    const update = this.pendingUpdate;
    if (!update) {
      this.updates = { ...this.updates, phase: "error", error: "The update is no longer available." };
      this.refreshUpdateUi();
      return;
    }
    this.installingUpdate = true;
    this.updates = { ...this.updates, phase: "installing", inCall: false };
    this.refreshUpdateUi();
    try {
      await update.install();
      // The Windows NSIS installer exits Lark and starts the new version itself.
      if (this.platform.os !== "windows") {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      this.installingUpdate = false;
      this.updates = { ...this.updates, phase: "error", error: updateErrorMessage(err) };
      this.refreshUpdateUi();
    }
  }

  noteCallForUpdates() {
    const step = setInCall(this.updates, Boolean(this.voice));
    const interfaceUi = setInterfaceCall(this.interfaceUi, Boolean(this.voice));
    if (interfaceUi !== this.interfaceUi) {
      this.interfaceUi = interfaceUi;
      this.refreshInterfaceUi();
    }
    if (step.state === this.updates && step.effect === "none") return;
    this.applyUpdateStep(step);
  }

  async watchInterface() {
    try {
      const status = await invoke<InterfaceSnapshot>("interface_status");
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
    } catch {
      this.interfaceUi = { ...this.interfaceUi, inCall: Boolean(this.voice) };
    }
    this.refreshInterfaceUi();
    void this.checkInterface(false);
    window.clearInterval(this.interfaceTimer);
    this.interfaceTimer = window.setInterval(() => void this.checkInterface(false), INTERFACE_CHECK_MS);
  }

  async checkInterface(manual: boolean) {
    if (!isTauri()) {
      if (!manual) return;
      this.interfaceUi = applyInterfaceError(this.interfaceUi, "Interface updates install from the macOS and Windows apps.", true);
      this.refreshInterfaceUi();
      return;
    }
    if (this.interfaceUi.checking) return;
    this.interfaceUi = { ...this.interfaceUi, checking: true, error: "" };
    this.refreshInterfaceUi();
    try {
      const report = await invoke<InterfaceReport>("interface_check", { manual });
      if (!this.interfaceUi.checking) return;
      this.interfaceUi = applyInterfaceReport({ ...this.interfaceUi, inCall: Boolean(this.voice) }, report, manual);
    } catch (err) {
      this.interfaceUi = applyInterfaceError({ ...this.interfaceUi, inCall: Boolean(this.voice) }, updateErrorMessage(err), manual);
    }
    this.refreshInterfaceUi();
  }

  async setInterfaceChannel(channel: InterfaceChannel) {
    if (!isTauri()) {
      this.interfaceUi = applyInterfaceSnapshot(this.interfaceUi, { ...this.interfaceUi.snapshot, channel });
      this.refreshInterfaceUi();
      return;
    }
    try {
      const status = await invoke<InterfaceSnapshot>("interface_set_channel", { channel });
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
      this.refreshInterfaceUi();
      void this.checkInterface(true);
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  }

  async resetInterface() {
    if (!isTauri()) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, "Interface updates install from the macOS and Windows apps.", true);
      this.refreshInterfaceUi();
      return;
    }
    try {
      const status = await invoke<InterfaceSnapshot>("interface_reset");
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
      this.refreshInterfaceUi();
      if (!this.voice && status.reloadReady) await this.reloadInterface();
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  }

  async reloadInterface() {
    if (this.voice) {
      this.interfaceUi = setInterfaceCall(this.interfaceUi, true);
      this.refreshInterfaceUi();
      return;
    }
    try {
      await invoke("interface_reload");
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  }

  refreshInterfaceUi() {
    this.paintInterfaceToast();
    if (this.settings && this.section === "updates") this.renderSettings();
  }

  paintInterfaceToast() {
    const toast = interfaceToast(this.interfaceUi);
    clear(this.interfaceToastEl);
    if (!toast) {
      this.interfaceToastEl.hidden = true;
      return;
    }
    this.interfaceToastEl.hidden = false;
    const reload = el("button", "primary", toast.action);
    reload.type = "button";
    reload.addEventListener("click", () => void this.reloadInterface());
    this.interfaceToastEl.append(el("span", "", toast.text), reload);
  }

  refreshUpdateUi() {
    this.paintUpdateBanner();
    if (this.settings && this.section === "updates") this.renderSettings();
  }

  paintUpdateBanner() {
    const banner = updateBanner(this.updates);
    clear(this.updateBannerEl);
    if (!banner) {
      this.updateBannerEl.hidden = true;
      return;
    }
    this.updateBannerEl.hidden = false;
    this.updateBannerEl.append(el("strong", "", banner.title));
    if (banner.notes) this.updateBannerEl.append(el("p", "", banner.notes));
    if (banner.status) this.updateBannerEl.append(el("p", "", banner.status));
    if (banner.progress != null) {
      const track = el("div", "update-progress");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(banner.progress * 100)));
      track.setAttribute("aria-label", "Update download");
      const bar = el("span");
      bar.style.width = `${Math.round(banner.progress * 100)}%`;
      track.append(bar);
      this.updateBannerEl.append(track);
    }
    if (!banner.showActions) return;
    const actions = el("div", "update-banner-actions");
    const later = el("button", "text-button", "Later");
    later.type = "button";
    later.addEventListener("click", () => {
      this.updates = dismissUpdate(this.updates);
      this.refreshUpdateUi();
    });
    const restart = el("button", "primary", "Restart to update");
    restart.type = "button";
    restart.addEventListener("click", () => this.applyUpdateStep(requestRestart({ ...this.updates, inCall: Boolean(this.voice) })));
    actions.append(later, restart);
    this.updateBannerEl.append(actions);
  }

  toast(title: string, body: string) {
    const toast = el("div", "toast");
    toast.append(el("strong", "", title), el("span", "", body));
    this.toastWrap.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  loadMissed() {
    try {
      this.missed = sanitizeMissed(JSON.parse(localStorage.getItem(MISSED_KEY) ?? "[]"));
    } catch {
      this.missed = [];
    }
    const seen = Number(localStorage.getItem(MISSED_SEEN_KEY) ?? "0");
    this.missedSeen = Number.isFinite(seen) ? seen : 0;
  }

  saveMissed() {
    localStorage.setItem(MISSED_KEY, JSON.stringify(this.missed));
    localStorage.setItem(MISSED_SEEN_KEY, String(this.missedSeen));
  }

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
  }

  tickSmartNotify() {
    const quiet = inQuietHours(this.config.notifications.quiet, new Date());
    const ended = this.quietOn && !quiet;
    this.quietOn = quiet;
    if (ended) this.surfaceMissed("quiet");
  }

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
  }

  async notify(title: string, body: string) {
    this.toast(title, body);
    if (!isTauri()) return;
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (granted) mod.sendNotification({ title, body });
  }

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
  }

  cycleServer(delta: number) {
    const ids: (string | null)[] = [null, ...orderedGuildIds(this.guilds().map((guild) => guild.id), this.folders)];
    const next = stepServer(ids, this.guildId, delta);
    if (next !== this.guildId) this.selectGuild(next);
  }

  cycle(delta: number) {
    const list = this.visibleChannels().filter((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group" || channel.kind === "announcement" || channel.kind === "forum");
    if (!list.length) return;
    const index = list.findIndex((channel) => channel.id === this.channelId);
    const next = list[(index + delta + list.length) % list.length];
    if (next) void this.openChannel(next.id);
  }

  nextUnread() {
    const list = this.visibleChannels().filter((channel) => (this.unread[channel.id] ?? 0) > 0 || (this.mentions[channel.id] ?? 0) > 0);
    if (list[0]) void this.openChannel(list[0].id);
  }

  async loadPlugins() {
    try {
      await this.refreshStore();
    } catch {
      this.catalog = [];
      this.installed = [];
    }
    await Promise.all(this.config.plugins.enabled.map((id) => this.ensurePlugin(id)));
    if (isTauri()) void this.listenForStoreLinks();
  }

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
  }

  persist(): Promise<void> {
    localStorage.setItem("lark.config.v1", JSON.stringify(this.config));
    if (!isTauri()) return Promise.resolve();
    return invoke("save_config", { config: this.config }).then(
      () => undefined,
      (err: unknown) => {
        this.toast("Settings", commandError(err, "Couldn't save settings."));
      },
    );
  }

  clipStatusLine(): string {
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

  async pullClipStatus() {
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
      if (was !== status.recording && (this.config.privacy.streamer_auto || (this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoShare))) this.noteCapture();
    } catch {
      this.clipStatus = null;
    }
  }

  onClipReady(payload: { ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }) {
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
    this.noteStat({ t: Date.now(), kind: "clip" });
    void this.notify("Clip saved", `${clipDisplayTitle(payload.name)} is on this computer. Share sends it to the open channel. Nothing was uploaded.`);
    if (this.view === "app") this.paintComposer();
  }

  async saveClip() {
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

  paintClipBanner() {
    clear(this.clipBanner);
    const clip = this.pendingClip;
    this.clipBanner.hidden = !clip;
    if (!clip) return;
    const seconds = Math.max(1, Math.round(clip.spanMs / 1000));
    this.clipBanner.append(el("span", "", `Clip saved · ${clipDisplayTitle(clip.name)} · about ${seconds}s · not uploaded`));
    const share = el("button", "primary", "Share");
    share.type = "button";
    const channel = this.textChannel();
    if (channel) share.title = `Send to ${this.channelShareLabel(channel)}`;
    share.addEventListener("click", () => void this.sharePendingClip());
    const attach = el("button", "text-button", "Attach");
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
    this.clipBanner.append(share, attach, folder, dismiss);
  }

  rememberPendingClip() {
    const clip = this.pendingClip;
    if (!clip || this.clipItems.some((item) => item.name === clip.name)) return;
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

  textChannel() {
    const current = this.currentChannel();
    return current && current.kind !== "voice" && current.kind !== "category" ? current : undefined;
  }

  channelShareLabel(channel: { kind: string; name: string }): string {
    return channel.kind === "dm" || channel.kind === "group" ? channel.name : `#${channel.name}`;
  }

  async sharePendingClip() {
    const clip = this.pendingClip;
    if (!clip) return;
    this.rememberPendingClip();
    const name = clip.name;
    this.pendingClip = null;
    this.paintClipBanner();
    await this.shareClip(name);
  }

  async shareClip(name: string) {
    const channel = this.textChannel();
    if (!channel) {
      this.toast("Clip", "Open a channel or a DM first.");
      return;
    }
    await this.deliverClip(name, channel.id);
  }

  async attachPendingClip() {
    const clip = this.pendingClip;
    if (!clip) return;
    if (!this.channelId) {
      this.toast("Clip", "Open a channel, then attach the clip.");
      return;
    }
    this.rememberPendingClip();
    this.pendingClip = null;
    this.paintClipBanner();
    await this.attachClipByName(clip.name);
  }

  async showPendingClip() {
    const clip = this.pendingClip;
    if (!clip || !isTauri()) return;
    try {
      await invoke("show_clip", { name: clip.name });
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't show the clip."));
    }
  }

  async openClipsFolder() {
    if (!isTauri()) return;
    try {
      await invoke("open_clips_dir");
    } catch (err) {
      this.toast("Clips", commandError(err, "Couldn't open the clips folder."));
    }
  }

  openClips() {
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

  async loadClips() {
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

  paintClipLibrary() {
    const stamp = `${this.clipStamp}|${this.channelId ?? ""}|${this.clipSendFor ?? ""}|${this.clipRename ?? ""}|${this.clipProgress?.name ?? ""}:${this.clipProgress?.percent ?? ""}|${this.premiumType}|${this.config.clips.compress}`;
    if (stamp === this.msgSig && this.messagesEl.querySelector(".clip-library")) return;
    this.msgSig = stamp;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    this.appendClipLibrary(this.messagesEl);
  }

  appendClipLibrary(parent: HTMLElement) {
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

  clipCard(clip: ClipCard, limit: number): HTMLElement {
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
    const title = this.clipRename === clip.name ? el("input") : el("strong", "", clipDisplayTitle(clip.name));
    if (!(title instanceof HTMLInputElement)) title.title = clip.name;
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
    const share = this.clipAction("Share", () => void this.shareClip(clip.name));
    const channel = this.textChannel();
    if (channel) share.title = `Send to ${this.channelShareLabel(channel)}`;
    actions.append(share);
    actions.append(this.clipAction("Trim", () => {
      this.clipTrim = clip.name;
      this.paintClipDialog();
    }));
    actions.append(this.clipAction("Rename", () => {
      this.clipRename = clip.name;
      this.msgSig = "";
      this.paint();
    }));
    actions.append(this.clipAction("Delete", () => void this.deleteClip(clip.name)));
    actions.append(this.clipAction("Reveal", () => void this.revealClip(clip.name)));
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

  clipAction(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "text-button", label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  clipSendMenu(name: string): HTMLElement {
    const menu = el("div", "clip-send");
    const sendable = this.textChannel();
    if (sendable) {
      menu.append(this.clipAction(`Send to ${this.channelShareLabel(sendable)}`, () => void this.deliverClip(name, sendable.id)));
    }
    for (const dm of this.dms().slice(0, 6)) {
      if (dm.id === sendable?.id) continue;
      menu.append(this.clipAction(`DM ${dm.name}`, () => void this.deliverClip(name, dm.id)));
    }
    if (!menu.childElementCount) menu.append(el("span", "hint", "Open a channel or a DM first."));
    return menu;
  }

  async deliverClip(name: string, channelId: string) {
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

  async prepareOutgoingFiles(): Promise<boolean> {
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

  async confirmClipCompress() {
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

  async compressClip(name: string, limit: number): Promise<string | null> {
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

  async sendClipFile(name: string, channelId: string) {
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

  async attachClipByName(name: string) {
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

  async materializeClip(file: LocalFile) {
    if (file.bytes.byteLength > 0 || !file.clipName || this.demo || !isTauri()) return;
    const encoded = await invoke<string>("read_clip", { name: file.clipName });
    const bytes = bytesFromBase64(encoded);
    file.bytes = bytes;
    file.declaredBytes = bytes.byteLength;
    file.mime = clipMime(file.clipName);
    file.url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  }

  async replaceClipFile(file: LocalFile, name: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    file.name = name;
    file.clipName = name;
    file.mime = clipMime(name);
    file.declaredBytes = clip?.bytes;
    file.bytes = new Uint8Array();
    file.url = clip?.poster || file.url;
    if (!this.demo && isTauri()) await this.materializeClip(file);
  }

  async playClip(name: string) {
    this.clipPlayer = name;
    this.clipPlayNote = "";
    const clip = this.clipItems.find((item) => item.name === name);
    if (!this.demo && isTauri() && clip && !clip.poster.startsWith("blob:")) {
      try {
        const encoded = await invoke<string>("read_clip", { name });
        if (this.clipPlayer !== name) return;
        const bytes = bytesFromBase64(encoded);
        const block = clipPlaybackBlock(name, bytes);
        if (block) {
          this.clipPlayNote = block;
        } else {
          clip.poster = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        }
      } catch (err) {
        this.toast("Clip", commandError(err, "Couldn't play the clip."));
      }
    }
    this.paintClipDialog();
  }

  async revealClip(name: string) {
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

  async renameClip(name: string, label: string) {
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

  async deleteClip(name: string) {
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

  async applyTrim(name: string, startSec: number, endSec: number) {
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

  appendTrimControls(card: HTMLElement, clip: ClipCard) {
    const durationSec = Math.max(0.1, clip.durationMs / 1000);
    card.append(el("h2", "", "Trim clip"), el("p", "hint", "This writes a new file. The original stays."));
    const start = el("input");
    start.type = "range";
    start.min = "0";
    start.max = String(durationSec);
    start.step = "0.1";
    start.value = "0";
    start.setAttribute("aria-label", "Trim start");
    const end = el("input");
    end.type = "range";
    end.min = "0";
    end.max = String(durationSec);
    end.step = "0.1";
    end.value = String(durationSec);
    end.setAttribute("aria-label", "Trim end");
    const startNum = el("input");
    startNum.type = "number";
    startNum.min = "0";
    startNum.step = "0.1";
    startNum.value = "0";
    startNum.setAttribute("aria-label", "Trim start seconds");
    const endNum = el("input");
    endNum.type = "number";
    endNum.min = "0";
    endNum.step = "0.1";
    endNum.value = String(durationSec);
    endNum.setAttribute("aria-label", "Trim end seconds");
    const times = el("div", "clip-trim-times");
    const startLabel = el("span", "", formatClipDuration(0));
    const endLabel = el("span", "", formatClipDuration(clip.durationMs));
    times.append(startLabel, endLabel);
    const paintTimes = () => {
      const kept = Math.max(0, Number(end.value) - Number(start.value));
      startLabel.textContent = formatClipDuration(Number(start.value) * 1000);
      endLabel.textContent = `${formatClipDuration(Number(end.value) * 1000)} · ${formatClipDuration(kept * 1000)} kept`;
    };
    const apply = (moved: "start" | "end") => {
      const next = clampTrim(durationSec, Number(start.value), Number(end.value), moved);
      start.value = String(next.startSec);
      end.value = String(next.endSec);
      startNum.value = start.value;
      endNum.value = end.value;
      paintTimes();
    };
    start.addEventListener("input", () => {
      startNum.value = start.value;
      apply("start");
    });
    end.addEventListener("input", () => {
      endNum.value = end.value;
      apply("end");
    });
    startNum.addEventListener("input", () => {
      start.value = startNum.value || "0";
      apply("start");
    });
    endNum.addEventListener("input", () => {
      end.value = endNum.value || "0";
      apply("end");
    });
    const ranges = el("div", "clip-trim");
    ranges.append(start, end, times);
    card.append(ranges);
    const presets = el("div", "clip-actions");
    for (const preset of trimPresets(clip.durationMs)) {
      presets.append(this.clipAction(preset.label, () => {
        start.value = String(preset.startSec);
        end.value = String(preset.endSec);
        apply("end");
      }));
    }
    if (presets.childElementCount) card.append(presets);
    const fields = el("div", "clip-trim-fields");
    fields.append(startNum, endNum);
    card.append(fields);
    const actions = el("div", "clip-actions");
    actions.append(this.clipAction("Save trim", () => void this.applyTrim(clip.name, Number(start.value), Number(end.value))));
    actions.append(this.clipAction("Cancel", () => {
      this.clipTrim = null;
      this.paintClipDialog();
    }));
    card.append(actions);
    paintTimes();
  }

  paintClipDialog() {
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
      if (this.clipPlayNote) card.append(el("p", "warning", this.clipPlayNote));
      if (!this.clipPlayNote && playing.poster.startsWith("blob:") && playing.name.endsWith(".mp4")) {
        const video = el("video", "clip-video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "auto";
        const source = document.createElement("source");
        source.src = playing.poster;
        source.type = "video/mp4";
        video.append(source);
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
        this.clipPlayNote = "";
        this.paintClipDialog();
      }));
    } else if (trimming) {
      this.appendTrimControls(card, trimming);
    }
    this.clipDialog.append(card);
    this.clipDialog.onclick = (event) => {
      if (event.target !== this.clipDialog) return;
      this.clipAsk = null;
      this.clipPlayer = null;
      this.clipPlayNote = "";
      this.clipTrim = null;
      this.paintClipDialog();
    };
  }

  async ensureGuild(guildId: string) {
    await this.ensureChannels(guildId);
    await this.ensureMembers(guildId);
  }

  async ensureChannels(guildId: string) {
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
  async loadGuildChannels(guildId: string) {
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
      this.reindexLoaded();
      if (this.holdShell) {
        this.queueChannelCheck();
        return;
      }
      if (this.guildId === guildId) this.paint();
    } catch {
      /* GUILD_CREATE may still fill the list. */
    }
  }

  waitForChannels(guildId: string, ms: number): Promise<boolean> {
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

  wakeChannelWaiters(guildId: string) {
    const waiters = this.channelWaiters.get(guildId);
    if (!waiters) return;
    this.channelWaiters.delete(guildId);
    for (const wake of waiters) wake();
  }

  async ensureMembers(guildId: string) {
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

  guildHasMembers(guildId: string): boolean {
    if (this.membersByGuild[guildId]?.length) return true;
    return Object.entries(this.memberLists).some(([key, list]) => key.startsWith(`${guildId}:`) && list.rows.size > 0);
  }

  queueMemberSubscribe(guildId: string, channelId: string, ranges: [number, number][]) {
    const key = `${guildId}:${channelId}:${ranges.map((range) => range.join("-")).join(",")}`;
    if (key === this.memberRanges) return;
    this.memberRanges = key;
    void invoke("request_members", { guildId, channelId, ranges }).catch(() => undefined);
  }

  onMemberScroll(scroll: HTMLElement) {
    if (this.demo || !this.guildId || !this.channelId) return;
    const list = this.currentMemberList();
    const hint = (list?.memberCount ?? 0) + (list?.groups.length ?? 0);
    const nearEnd = scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 120;
    if (!nearEnd && scroll.scrollTop < 48) return;
    const ranges = rangesForScroll(scroll.scrollTop, scroll.clientHeight || 640, hint);
    this.queueMemberSubscribe(this.guildId, this.channelId, ranges);
  }

  onMemberList(guildId: string, event: MemberListWire) {
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
    this.refreshVoicePortraits();
    this.memberPhase[guildId] = "done";
    if (this.guildId === guildId) this.paintMembers();
  }

  currentMemberList(): MemberListState | null {
    if (!this.guildId) return null;
    const exact = this.memberLists[`${this.guildId}:${this.channelId}`];
    if (exact?.rows.size) return exact;
    const everyone = this.memberLists[`${this.guildId}:everyone`];
    if (everyone?.rows.size) return everyone;
    const prefix = `${this.guildId}:`;
    const found = Object.entries(this.memberLists).find(([key, list]) => key.startsWith(prefix) && list.rows.size);
    return found?.[1] ?? exact ?? everyone ?? null;
  }

  rememberRoles(guildId: string, roles: RoleInfo[]) {
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

  async ensureHome() {
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

  mergeDms(incoming: Channel[]) {
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

  storeFriends(incoming: Person[]) {
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

  notePresence(userId: string, status: Person["status"], custom: string, activity: string, rich?: Person["rich"]) {
    if (userId === this.meId() && this.hideActivity()) {
      custom = "";
      activity = "";
    }
    const apply = (person: Person) => {
      person.status = status;
      person.custom = custom;
      person.activity = activity;
      if (rich !== undefined) person.rich = rich;
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

  schedulePeoplePaint() {
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

  async openDm(userId: string) {
    const existing = this.dmChannels().find((channel) => channel.kind === "dm" && (channel.recipientIds?.includes(userId) || channel.recipients?.some((item) => item.id === userId)));
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

  openProfile(person: Person, statusPicker = false, serverEditor = false) {
    this.popout = person;
    this.statusOpen = statusPicker;
    this.profileFull = false;
    this.profileTab = "about";
    this.serverEditor = serverEditor;
    this.wireProfile = this.wireProfile?.id === person.id ? this.wireProfile : null;
    this.paintPopout();
    if (statusPicker && this.premiumType > 0 && this.guildId) {
      void this.ensureEmojis().then(() => {
        if (this.statusOpen && this.popout?.id === person.id) this.paintPopout();
      });
    }
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

  profileRoles(person: Person): ProfileRole[] {
    const ids = this.wireProfile?.id === person.id ? this.wireProfile.roleIds ?? person.roleIds : person.roleIds;
    const roles = this.guildId ? this.rolesByGuild[this.guildId] ?? [] : [];
    return roles
      .filter((role) => ids?.includes(role.id) && role.id !== this.guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color || null }));
  }

  storeMembers(guildId: string, incoming: Person[]) {
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
    this.refreshVoicePortraits();
    this.msgSig = "";
    if (this.view === "app" && this.channelId) this.paintMessages();
  }

  rememberGuild(guild: Guild) {
    this.liveGuilds = mergeGuilds([guild], this.liveGuilds);
    this.paintRail();
    if (guild.id === this.guildId) this.paintChannels();
  }

  paintConnection() {
    if (this.holdShell) return;
    const next = visibleStatus(this.hideActivity(), this.hideActivity(), this.me.custom ?? "", this.connection);
    const label = this.channelPane.querySelector(".profile-chip .who span");
    if (label instanceof HTMLElement) {
      if (label.textContent !== next) label.textContent = next;
      return;
    }
    this.paintChannels();
  }

  noteGatewayStatus(state: string | undefined) {
    const now = performance.now();
    this.statusFlaps = this.statusFlaps.filter((stamp) => now - stamp < 10_000);
    this.statusFlaps.push(now);
    if (this.statusFlaps.length >= 4) {
      console.warn(`[lark] gateway status changed ${this.statusFlaps.length} times in 10s (${state ?? "unknown"}). Reconnects should resume and leave the open channel alone.`);
    }
  }

  onDiscord(payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    if (trafficArmed()) noteGateway(payload);
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
      const shape = readyShape(event);
      const previous = latestGateway("ready");
      rememberGateway(event);
      if (previous && shape && previous.shape === shape && this.view === "app" && !this.holdShell) {
        this.connection = "Connected";
        this.gatewayReadyAt = Date.now();
        return;
      }
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
      this.noteCallForUpdates();
      this.me = {
        id: event.user.id,
        name: event.user.name,
        bot: event.user.bot,
        status: "online",
        avatarUrl: event.user.avatarUrl,
      };
      if (isTauri() && event.user.id && event.user.id !== ME) void this.rememberCurrentAccount(event.user.id, event.user.name);
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
      this.reindexLoaded();
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
    } else if (event.kind === "blocked") {
      const ids = ((event as { userIds?: unknown }).userIds ?? []) as unknown[];
      const next = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      const replace = Boolean((event as { replace?: boolean }).replace);
      const removed = Boolean((event as { removed?: boolean }).removed);
      if (replace) this.blockedIds = new Set(next);
      else if (removed) for (const id of next) this.blockedIds.delete(id);
      else for (const id of next) this.blockedIds.add(id);
      this.msgSig = "";
      if (this.view === "app") this.paintMessages();
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
      this.refileLists();
      this.wakeChannelWaiters(event.guildId);
      for (const channel of this.liveChannels[event.guildId] ?? []) {
        this.noteChannel(channel);
        this.refreshChannelBadge(channel.id);
      }
      this.reindexLoaded();
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
    } else if (event.kind === "userLists") {
      this.applyUserLists(event as RemoteLists);
    } else if (event.kind === "savedMessage") {
      this.applySavedEvent(event as { channelId?: string; messageId?: string; removed?: boolean; dueAt?: string | null; authorName?: string; excerpt?: string; savedAt?: string });
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
      this.considerAwayReply(message);
      this.absorbMessage(message);
      const bucket = this.pages[message.channelId] ?? [];
      const known = bucket.some((item) => sameOutgoing(item, message));
      this.pages[message.channelId] = mergeIncoming(bucket, message);
      this.queueLocalIndex(message.channelId);
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
      if (viewing && follow && !this.holdRead()) {
        this.localUnread[message.channelId] = 0;
        this.localMentions[message.channelId] = 0;
        this.markers[message.channelId] = { lastMessageId: message.id, mentionCount: 0 };
        this.refreshChannelBadge(message.channelId);
      } else if ((!viewing || this.holdRead()) && message.authorId !== this.meId() && bumpsUnread(level, mentionsMe, direct)) {
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
      const sent = this.deliverAlert(message, level, mentionsMe, direct, body);
      this.considerKeyword(message, level, mentionsMe, alreadyNotified || sent);
      this.considerPattern(message, level, alreadyNotified || sent);
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
          this.noteLoggedEdit(message, message.content, patch.content);
          message.content = patch.content;
          message.edited = true;
          this.queueLocalIndex(event.channelId);
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
      const gone = list?.find((item) => item.id === event.messageId);
      if (gone) this.noteLoggedDelete(gone);
      if (list) {
        this.pages[event.channelId] = list.filter((item) => item.id !== event.messageId);
        this.forgetLocalMessage(event.channelId, event.messageId, gone?.nonce);
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
    } else if (event.kind === "relationships") {
      const payload = event as { relationships?: SocialRelationship[]; replace?: boolean; removed?: boolean };
      this.mergeRelationships(payload.relationships ?? [], Boolean(payload.replace), Boolean(payload.removed));
      this.schedulePeoplePaint();
    } else if (event.kind === "presence" && event.userId) {
      const status = asStatus(String((event as { status?: string }).status ?? "offline"));
      const custom = String((event as { custom?: string }).custom ?? "");
      const activity = String((event as { activity?: string }).activity ?? "");
      const rich = (event as { rich?: Person["rich"] }).rich ?? null;
      this.notePresence(event.userId, status, custom, activity, rich);
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
    } else if (event.kind === "cameraFrame") {
      const frame = event as { annexB?: string; userId?: string; epoch?: number };
      const epoch = Number(frame.epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      this.onCameraFrame(String(frame.userId ?? ""), String(frame.annexB ?? ""));
    } else if (event.kind === "voiceStates" && event.guildId) {
      const states = ((event as { states?: VoiceStateInput[] }).states ?? []).map((state) => this.hydrateVoice(state, event.guildId ?? ""));
      replaceGuildVoice(this.voiceRoster, event.guildId, states);
      this.refreshVoicePortraits();
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      if (this.dashboardOpen) this.refreshDashboard();
    } else if (event.kind === "voiceState" && event.userId) {
      const raw = event as VoiceStateInput;
      const state = this.hydrateVoice({ ...raw, guildId: String(raw.guildId ?? event.guildId ?? ""), userId: event.userId }, String(raw.guildId ?? ""));
      applyVoiceState(this.voiceRoster, state);
      if (state.name && state.name !== "Someone") this.userNames[state.userId] = state.name;
      this.refreshVoicePortraits();
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      if (this.dashboardOpen) this.refreshDashboard();
    } else if (event.kind === "soundboard") {
      this.onSoundEffect(event);
    } else if (event.kind === "voiceSpeaking" && event.userId) {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      this.markSpeaking(event.userId, Boolean((event as { speaking?: boolean }).speaking));
    } else if (event.kind === "voiceLink") {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      const state = String((event as { state?: string }).state ?? "");
      const detail = String((event as { detail?: string }).detail ?? "");
      if (detail.toLowerCase().includes("did not answer")) {
        this.toast("Voice", friendlyVoiceDetail(detail) || "Voice server did not answer");
      }
      if (this.voice && (state === "connected" || state === "connecting" || state === "reconnecting")) {
        this.voice.status = state as VoiceSession["status"];
        this.voice.detail = friendlyVoiceDetail(detail);
        if (state === "connected") this.noteVoiceConnected();
        const link = event as { pingMs?: number; endpoint?: string; mode?: string; lossPct?: number; jitterMs?: number };
        if (link.pingMs !== undefined || link.endpoint) {
          this.voiceDetails = voiceLinkDetails({
            pingMs: link.pingMs ?? this.voiceDetails.pingMs,
            endpoint: link.endpoint ?? this.voiceDetails.endpoint,
            mode: link.mode || this.voiceDetails.mode || detail,
            lossPct: link.lossPct ?? this.voiceDetails.lossPct,
            jitterMs: link.jitterMs ?? this.voiceDetails.jitterMs,
          });
        }
        this.paintVoice();
        this.paintChannels();
      }
      if (state === "left" && epoch === this.voiceEpoch) {
        this.voice = null;
        this.clearVoiceClock();
        this.noteCallForUpdates();
        this.paintVoice();
        this.paintChannels();
      }
    } else if (event.kind === "call") {
      const call = payload as { channelId?: string; ringing?: unknown; ended?: boolean; video?: boolean };
      this.applyIncomingCall(call);
    } else if (event.kind === "typing" && event.channelId && event.userId !== this.meId()) {
      const name = event.username || this.userNames[event.userId ?? ""] || "Someone";
      this.typingNames = this.typingNames.filter((item) => item.channelId !== event.channelId || item.name !== name);
      this.typingNames.push({ channelId: event.channelId, name, until: Date.now() + 8000 });
      window.clearTimeout(this.typingTimer);
      this.paintTyping();
      this.typingTimer = window.setTimeout(() => this.paintTyping(), 8100);
    }
  }

  onKeyUp(event: KeyboardEvent) {
    if (this.pushMuted && matchShortcut(event, this.config.keybinds.push_to_mute, this.platform.os)) {
      this.releasePushMute();
    }
    if (!this.voice || this.voiceMode() !== "ptt") return;
    if (matchShortcut(event, this.pttShortcut(), this.platform.os)) {
      this.pttHeld = false;
      this.refreshSpeaking();
      this.pushTransmit();
    }
  }

  saveDraft() {
    const id = this.channelId;
    if (!id) return;
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      if (!this.composer.value) delete this.drafts[id];
      else this.drafts[id] = this.composer.value.slice(0, 2000);
      if (this.draftsReady) void this.writeDrafts();
    }, 120);
  }

  streamerOn(): boolean {
    return streamerActive(
      this.config.privacy.streamer,
      this.config.privacy.streamer_auto,
      this.shareOn || Boolean(this.clipStatus?.recording),
    );
  }

  maskText(value: string): string {
    return this.scrubText(value);
  }

  streamerSafeOn(): boolean {
    return streamerSafeActive({
      enabled: this.hookOn("streamerSafe"),
      manual: this.pack.privacy.streamerManual,
      autoObs: this.pack.privacy.streamerAutoObs,
      obs: obsDetected([this.frontApp, this.detectedGame]),
      autoShare: this.pack.privacy.streamerAutoShare,
      sharing: this.shareOn || Boolean(this.clipStatus?.recording),
    });
  }

  hideDirect(): boolean {
    return this.streamerOn() || (this.streamerSafeOn() && this.pack.privacy.streamerDms);
  }

  scrubText(value: string): string {
    const safe = this.streamerSafeOn();
    if (!this.streamerOn() && !safe) return value;
    let text = this.streamerOn() || (safe && this.pack.privacy.streamerEmails) ? redactSensitive(value) : value;
    if (safe) text = redactStreamerText(text, { phones: this.pack.privacy.streamerPhones, ids: this.pack.privacy.streamerIds });
    return text;
  }

  cleanOutgoing(content: string): string {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnSend) return content;
    return stripTrackingText(content);
  }

  cleanClickedLink(event: MouseEvent) {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
    const next = stripTrackingUrl(anchor.href);
    if (next && next !== anchor.href) anchor.href = next;
  }

  noteCapture() {
    this.msgSig = "";
    this.channelShape = "";
    this.memberShape = "";
    if (this.view === "app") this.paint();
    else if (this.settings && (this.section === "privacy" || this.section === "messages")) this.renderSettings();
  }

  toggleStreamer() {
    this.config.privacy.streamer = !this.config.privacy.streamer;
    this.persist();
    this.noteCapture();
    this.toast("Streamer mode", this.streamerOn() ? "On. Emails, tokens, DM previews, and personal info are hidden." : "Off.");
  }

  dmActivityLabel(channel: Channel): string {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const known = recipient ? this.directory[recipient.id] : undefined;
    if (!known) return "";
    return this.maskText(friendActivityText(known));
  }

  dmPreviewLabel(channelId: string): string {
    const loaded = this.pages[channelId];
    const source = loaded?.length ? loaded : this.demo ? history[channelId] : undefined;
    const last = [...(source ?? [])].reverse().find((message) => message.content.trim());
    if (!last) return "";
    return dmPreview(plainPreview(last.content, this.renderContext(), 80), this.hideDirect(), 80);
  }

  previewLine(message: RawMessage, limit: number): string {
    const channel = this.channelById(message.channelId);
    const direct = channel?.kind === "dm" || channel?.kind === "group";
    if (this.hideDirect() && direct) return "Message hidden";
    const text = plainPreview(message.content, this.renderContext(), limit) || (message.attachments?.length ? "Attachment" : "Empty message");
    return this.maskText(text);
  }

  notifyBody(message: RawMessage, direct: boolean): string {
    if (this.hideDirect() && direct) return "New direct message";
    const body = plainPreview(message.content, this.renderContext()) || (message.attachments?.length ? "Sent an attachment" : message.stickers?.length ? "Sent a sticker" : "New message");
    return this.maskText(body);
  }

  bookmarkExcerpt(bookmark: { channelId: string; excerpt: string }): string {
    const channel = this.channelById(bookmark.channelId);
    if (this.hideDirect() && (channel?.kind === "dm" || channel?.kind === "group")) return "Direct message";
    return this.maskText(bookmark.excerpt || "Empty message");
  }

  presentView(view: ViewMessage): ViewMessage {
    const named = this.hookOn("localNicks")
      ? { ...view, authorName: displayName(this.pack.localNicks, view.authorId, view.authorName) }
      : view;
    if (!this.streamerOn() && !this.streamerSafeOn()) return named;
    const text = (value: string) => this.scrubText(value);
    return {
      ...named,
      authorName: text(named.authorName),
      blocks: redactBlocks(view.blocks, text),
      raw: text(view.raw),
      reply: view.reply
        ? { ...view.reply, authorName: text(view.reply.authorName), preview: text(view.reply.preview) }
        : null,
      embeds: view.embeds.map((embed) => ({
        ...embed,
        author: embed.author ? text(embed.author) : null,
        title: embed.title ? text(embed.title) : null,
        footer: embed.footer ? text(embed.footer) : null,
        description: redactBlocks(embed.description, text),
        fields: embed.fields.map((field) => ({
          ...field,
          name: text(field.name),
          value: redactBlocks(field.value, text),
        })),
      })),
    };
  }

  async hydrateDrafts() {
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

  applyOpenDraft() {
    const id = this.channelId;
    if (!id || this.editing || !this.composer) return;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.composer.value) {
      this.composer.value = draft;
      this.paintComposer();
    }
  }

  async writeDrafts() {
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

  saveReminders() {
    localStorage.setItem("lark.reminders.v1", JSON.stringify(this.reminders));
  }

  beginReminder(message: RawMessage) {
    const existing = reminderFor(this.reminders, message.channelId, message.id);
    if (existing) {
      this.reminders = cancelReminder(this.reminders, existing.id);
      this.saveReminders();
      this.toast("Reminder", "Removed.");
      this.msgSig = "";
      this.paintMessages();
      if (this.settings && this.section === "messages") this.renderSettings();
      const kept = isBookmarked(this.pack.bookmarks, message.channelId, message.id);
      void this.pushSaved(message.channelId, message.id, kept, null);
      return;
    }
    this.reminding = message;
    this.scheduling = false;
    this.paintComposer();
  }

  queueReminder(at: number) {
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
    const saved = result.list.find((item) => item.channelId === message.channelId && item.messageId === message.id);
    if (saved) void this.pushSaved(message.channelId, message.id, true, new Date(saved.remindAt).toISOString());
  }

  paintReminderBanner() {
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

  tickReminders() {
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

  savedRow(bookmark: Bookmark): HTMLElement {
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

  reminderRow(reminder: Reminder): HTMLElement {
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

  scheduledRow(item: ScheduledSend): HTMLElement {
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

  rememberCache() {
    const pages: Record<string, RawMessage[]> = {};
    for (const id of this.recent) {
      const list = this.pages[id];
      if (list) pages[id] = initialHistory(list).map((message) => ({ ...message, attachments: (message.attachments ?? []).map((file) => ({ ...file, url: file.url.startsWith("blob:") ? "" : file.url })) }));
    }
    localStorage.setItem("lark.cache.v1", JSON.stringify({ pages }));
  }

  prefetchAround(id: string) {
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
          const page = pageMessages(history[channelId] ?? [], undefined, HISTORY_PAGE);
          if (token !== this.prefetchToken || this.pages[channelId]) continue;
          this.pages[channelId] = page.messages;
          this.more[channelId] = page.hasMore;
          this.warm.add(channelId);
          this.queueLocalIndex(channelId);
          continue;
        }
        try {
          const page = await this.livePage(channelId);
          if (!this.pages[channelId]) {
            this.pages[channelId] = page.messages;
            this.more[channelId] = page.hasMore;
            this.warm.add(channelId);
            this.queueLocalIndex(channelId);
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

  trimPages() {
    const keep = new Set<string>([this.channelId ?? "", this.splitId ?? "", ...this.recent, ...this.warm]);
    const keys = Object.keys(this.pages);
    if (keys.length <= 12) return;
    for (const key of keys) {
      if (keep.has(key)) continue;
      this.forgetHeights((this.pages[key] ?? []).map((message) => message.id));
      delete this.pages[key];
    }
    if (this.warm.size > 4) {
      const extra = [...this.warm].filter((key) => key !== this.channelId && key !== this.splitId && !this.recent.includes(key));
      for (const key of extra.slice(0, this.warm.size - 4)) this.warm.delete(key);
    }
  }

  channelById(id: string): Channel | undefined {
    const dm = this.dmChannels().find((channel) => channel.id === id);
    if (dm) return dm;
    for (const guild of this.guilds()) {
      const found = this.channelsOf(guild.id).find((channel) => channel.id === id);
      if (found) return found;
    }
    return undefined;
  }

  localClient(): Promise<LocalSearchClient> {
    if (!this.localClientPromise) {
      this.localClientPromise = import("../local-search-client").then((mod) => mod.startLocalSearch());
    }
    return this.localClientPromise;
  }

  localOp(task: () => Promise<void>): void {
    this.localOps = this.localOps.then(task).catch(() => undefined);
  }

  reindexLoaded() {
    if (this.bench) return;
    for (const id of Object.keys(this.pages)) this.queueLocalIndex(id);
  }

  queueLocalIndex(channelId: string) {
    if (this.bench || !channelId) return;
    const list = this.pages[channelId];
    if (!list?.length) return;
    this.localPending.set(channelId, list.slice());
    this.armLocalFlush();
  }

  armLocalFlush() {
    if (this.localFlushQueued) return;
    this.localFlushQueued = true;
    const run = () => {
      this.localFlushQueued = false;
      this.localOp(() => this.flushLocalIndex());
    };
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") idle(() => run(), { timeout: 700 });
    else window.setTimeout(run, 200);
  }

  async flushLocalIndex(): Promise<void> {
    const pending = [...this.localPending.entries()];
    this.localPending.clear();
    if (!pending.length) return;
    const { localDocFromMessage } = await import("../local-search");
    const docs = [];
    for (const [, messages] of pending) {
      for (const message of messages) {
        const doc = localDocFromMessage({ ...message, mentionUsers: this.mentionNames(message) }, this.placeFor(message.channelId));
        if (!doc || this.localTombstones.has(doc.key)) continue;
        docs.push(doc);
      }
    }
    if (docs.length) (await this.localClient()).upsert(docs);
    if (this.localPending.size) this.armLocalFlush();
  }

  forgetLocalMessage(channelId: string, messageId: string, nonce?: string | null) {
    if (this.bench || !channelId || !messageId) return;
    this.localOp(async () => {
      const { docKey, localKeys } = await import("../local-search");
      const keys = localKeys(channelId, messageId, nonce);
      for (const key of keys) this.localTombstones.add(key);
      const queued = this.localPending.get(channelId);
      if (queued) {
        this.localPending.set(channelId, queued.filter((message) => !keys.includes(docKey(message.channelId || channelId, message.id, message.nonce))));
      }
      (await this.localClient()).remove(keys);
    });
  }

  mentionNames(message: RawMessage): { id: string; name: string }[] {
    const names = new Map<string, string>();
    for (const mention of message.mentionUsers ?? []) {
      if (mention.id && mention.name && mention.name !== "someone") names.set(mention.id, mention.name);
    }
    for (const id of message.mentionIds ?? []) {
      if (names.has(id)) continue;
      const name = this.userNames[id];
      if (name) names.set(id, name);
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }

  placeFor(channelId: string): { guildId: string; guildName: string; channelName: string } {
    const channel = this.channelById(channelId);
    const guildId = this.guildForChannel(channelId) ?? "";
    const guildName = guildId
      ? (this.guilds().find((guild) => guild.id === guildId)?.name ?? "")
      : channel?.kind === "group" ? "Group DM" : "Direct messages";
    return { guildId, guildName, channelName: channel?.name ?? "" };
  }

  openLocalSearch() {
    this.searchOpen = false;
    this.paintSearch();
    this.closeSwitcher();
    this.localSearchPanel?.destroy();
    this.localSearchPanel = null;
    const seq = ++this.localSearchSeq;
    this.localSearchOpen = true;
    void import("./local-search-view").then(({ openLocalSearchPanel }) => {
      if (seq !== this.localSearchSeq || !this.localSearchOpen) return;
      this.localSearchPanel = openLocalSearchPanel(this.root, {
        query: (query) => this.localClient().then((client) => client.query(query)),
        present: (hit) => this.localHitText(hit),
        jump: (channelId, messageId) => {
          this.closeLocalSearch();
          void this.jumpToMessage(channelId, messageId);
        },
        close: () => this.closeLocalSearch(),
      });
    });
  }

  closeLocalSearch() {
    this.localSearchOpen = false;
    this.localSearchSeq += 1;
    this.localSearchPanel?.destroy();
    this.localSearchPanel = null;
  }

  localHitText(hit: { channelId: string; guildId: string; authorName: string; channelName: string; guildName: string; preview: string }): { author: string; where: string; preview: string } {
    const channel = this.channelById(hit.channelId);
    const direct = !hit.guildId || channel?.kind === "dm" || channel?.kind === "group";
    if (direct && this.hideDirect()) return { author: "Someone", where: "Direct message", preview: "Message hidden" };
    const place = this.placeFor(hit.channelId);
    const guild = place.guildName || hit.guildName || "Server";
    const name = place.channelName || hit.channelName;
    const where = (place.guildId || hit.guildId) ? `${guild} · #${name || "channel"}` : `${guild} · ${name || "conversation"}`;
    return { author: this.maskText(hit.authorName), where: this.maskText(where), preview: this.maskText(hit.preview) };
  }

  paintSearch() {
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
    input.placeholder = searchPlaceholder(searchPlace(this.guildId, this.channelId));
    input.setAttribute("aria-label", "Search messages");
    const results = el("div", "switcher-results");
    let timer = 0;
    const show = (hits: RawMessage[], note: string) => {
      clear(results);
      if (!hits.length) results.append(el("div", "empty", note || "No matches."));
      else if (note) results.append(el("div", "hint", note));
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
      const place = searchPlace(this.guildId, this.channelId);
      input.placeholder = searchPlaceholder(place);
      const ctx = this.searchDirectory();
      const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
      const local = this.localSearch(query);
      const criteria = hasSearchCriteria(resolved);
      const note = (phase: "local" | "remote" | "fallback") => searchNote({
        place,
        query,
        hasCriteria: criteria,
        unresolved: resolved.unresolved,
        phase,
      });
      show(local, note("local"));
      if (!criteria || this.demo) return;
      const call = remoteSearchCall(this.guildId, this.channelId);
      window.clearTimeout(timer);
      const token = ++this.searchToken;
      timer = window.setTimeout(() => {
        void invoke<RawMessage[]>("search_filtered", {
          guildId: call.guildId,
          channelId: call.channelId,
          search: {
            content: resolved.content,
            authorIds: resolved.authorIds,
            mentionIds: resolved.mentionIds,
            has: resolved.has,
            beforeId: resolved.beforeId,
            afterId: resolved.afterId,
            channelIds: resolved.channelIds,
            pinned: resolved.pinned,
          },
        }).then((messages) => {
          if (token !== this.searchToken || !this.searchOpen) return;
          const hits = messages.map(normalizeMessage);
          for (const message of hits) this.absorbMessage(message);
          show(hits, note("remote"));
        }).catch(() => {
          if (token === this.searchToken) show(local, note("fallback"));
        });
      }, 280);
    };
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 48);
    });
    const loaded = el("div", "local-search-jump");
    const loadedButton = el("button", "text-button", "Search loaded messages");
    loadedButton.type = "button";
    loadedButton.title = "Messages already on this device, across servers";
    loadedButton.addEventListener("click", () => this.openLocalSearch());
    loaded.append(loadedButton);
    card.append(input, loaded, results);
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

  searchDirectory() {
    const ctx = this.renderContext();
    return { ...ctx, users: searchUsers(ctx.users, this.friends) };
  }

  localSearch(query: string): RawMessage[] {
    const ctx = this.searchDirectory();
    const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
    if (!hasSearchCriteria(resolved)) return [];
    const pools = this.demo ? Object.values(history).flat() : Object.values(this.pages).flat();
    return filterLoadedMessages(pools, resolved);
  }

  paintNickBanner() {
    const target = this.nickTarget;
    if (!target) return;
    this.composerBanner.hidden = false;
    const field = el("input");
    field.value = this.pack.localNicks[target.id] ?? "";
    field.placeholder = "Nickname";
    field.maxLength = 32;
    field.setAttribute("aria-label", `Local nickname for ${target.name}`);
    const save = el("button", "primary", "Save");
    save.type = "button";
    save.addEventListener("click", () => {
      this.pack.localNicks = setLocalNick(this.pack.localNicks, target.id, field.value);
      this.savePack();
      this.nickTarget = null;
      this.msgSig = "";
      this.paint();
    });
    const clearNick = el("button", "ghost", "Clear");
    clearNick.type = "button";
    clearNick.addEventListener("click", () => {
      this.pack.localNicks = setLocalNick(this.pack.localNicks, target.id, "");
      this.savePack();
      this.nickTarget = null;
      this.msgSig = "";
      this.paint();
    });
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.nickTarget = null;
      this.paintComposer();
    });
    this.composerBanner.append(el("span", "", `Nickname for ${this.maskText(target.name)}`), field, save, clearNick, cancel);
  }

  openReplyChain(message: RawMessage) {
    const loaded = (this.pages[message.channelId] ?? []).map((item) => ({
      id: item.id,
      authorName: item.authorName,
      content: item.content,
      replyId: item.reply?.id ?? null,
    }));
    const chain = replyChain(loaded, message.id);
    let panel = document.getElementById("lark-chain");
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-chain";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Reply chain"));
    if (!chain.steps.length) panel.append(el("p", "empty", "That message isn't loaded."));
    for (const step of chain.steps) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      button.append(el("strong", "", this.maskText(step.authorName)), el("span", "", this.maskText(step.preview)));
      button.addEventListener("click", () => {
        panel?.remove();
        void this.jumpToMessage(message.channelId, step.id);
      });
      panel.append(button);
    }
    const note = chain.stopped === "missing"
      ? "An earlier message isn't loaded. Lark did not fetch it."
      : chain.stopped === "cap"
        ? "Showing the newest 12. Lark did not fetch older ones."
        : chain.stopped === "loop"
          ? "The chain repeats, so it stops."
          : "Built from messages already loaded.";
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => panel?.remove());
    panel.append(el("p", "hint", note), close);
  }

  async openConnections(message: RawMessage) {
    const cached = this.connectionCache.get(message.authorId);
    const fresh = cached && Date.now() - cached.at < 5 * 60_000 ? cached.lines : null;
    let lines = fresh;
    if (!lines && !this.demo && isTauri()) {
      try {
        const profile = await invoke<WireProfile>("fetch_profile", { userId: message.authorId, guildId: this.guildId ?? "" });
        lines = connectionLines(profile?.widgets);
        this.connectionCache.set(message.authorId, { lines, at: Date.now() });
      } catch {
        this.toast("Connections", "Couldn't load that profile.");
        return;
      }
    }
    lines = lines ?? [];
    let card = document.getElementById("lark-connections");
    if (!card) {
      card = el("aside", "pins");
      card.id = "lark-connections";
      this.stage.append(card);
    }
    clear(card);
    card.append(el("h2", "", "Connections"));
    if (!lines.length) card.append(el("p", "empty", "No linked accounts on that profile."));
    for (const line of lines) card.append(el("p", "", this.maskText(connectionLabel(line))));
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => card?.remove());
    card.append(el("p", "hint", "One profile, because you asked. Nobody else is looked up."), close);
  }

  messageSeen(channelId: string, messageId: string): boolean {
    if (!this.hookOn("readReceipts") || !this.pack.showReceipts) return false;
    return atOrBefore(this.pack.seenCursors[channelId] ?? "", messageId);
  }

  newestVisibleId(): string {
    const view = this.messagesEl.getBoundingClientRect();
    let newest = "";
    for (const wrap of this.messagesEl.querySelectorAll<HTMLElement>(".message-wrap")) {
      const id = wrap.dataset.mid ?? "";
      if (!id) continue;
      const box = wrap.getBoundingClientRect();
      if (box.bottom < view.top || box.top > view.bottom) continue;
      newest = noteSeen({ here: newest }, "here", id).here ?? newest;
    }
    return newest;
  }

  noteLocalReceipts() {
    if (!this.hookOn("readReceipts") || !this.channelId || this.scrollLock > 0 || this.receiptNote) return;
    const newest = this.newestVisibleId();
    if (!newest) return;
    const next = noteSeen(this.pack.seenCursors, this.channelId, newest);
    if ((next[this.channelId] ?? "") === (this.pack.seenCursors[this.channelId] ?? "")) return;
    this.pack.seenCursors = next;
    this.savePack();
    this.msgSig = "";
    this.receiptNote = true;
    queueMicrotask(() => {
      this.receiptNote = false;
      this.paintMessages();
    });
  }

  mentionDigestRows() {
    const rows: { channelId: string; name: string; where: string; mentions: number; kind: string }[] = [];
    for (const guild of this.guilds()) {
      for (const channel of this.channelsOf(guild.id)) {
        rows.push({
          channelId: channel.id,
          name: channel.name,
          where: guild.name,
          mentions: this.mentions[channel.id] ?? channel.mentions ?? 0,
          kind: channel.kind,
        });
      }
    }
    for (const channel of this.dms()) {
      rows.push({
        channelId: channel.id,
        name: channel.name,
        where: "Direct messages",
        mentions: this.mentions[channel.id] ?? channel.mentions ?? 0,
        kind: channel.kind,
      });
    }
    return digestRows(rows, this.pack.digestDms);
  }

  paintDigest() {
    let panel = document.getElementById("lark-digest");
    if (!this.digestOpen || !this.hookOn("mentionDigest")) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-digest";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Mentions"));
    const rows = this.mentionDigestRows();
    if (!rows.length) panel.append(el("p", "empty", "No mentions waiting."));
    for (const row of rows) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      const where = row.where ? `${row.where} · ` : "";
      button.append(el("strong", "", this.maskText(row.name)), el("span", "", `${where}${row.mentions} mention${row.mentions === 1 ? "" : "s"}`));
      button.addEventListener("click", () => {
        this.digestOpen = false;
        this.paintDigest();
        void this.openChannel(row.channelId);
      });
      panel.append(button);
    }
    panel.append(el("p", "hint", "Counts already on this device. Nothing is fetched."));
  }

  paintPins() {
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
  }

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
  }

  enabledPlugins(): PluginSource[] {
    return enabledSources(this.config.plugins.enabled, this.loaded);
  }

  hookOn(flag: keyof PluginHooks): boolean {
    return this.enabledPlugins().some((plugin) => plugin.hooks[flag] === true);
  }

  holdRead(): boolean {
    return privacyHoldRead(this.hookOn("incognito"), this.pack.privacy.incognitoHoldRead);
  }

  hideActivity(): boolean {
    return this.hookOn("incognito") && this.pack.privacy.incognitoHideActivity;
  }

  tryPanic(event: KeyboardEvent): boolean {
    if (!this.hookOn("panicKey")) return false;
    if (!matchShortcut(event, this.pack.privacy.panicKey, this.platform.os)) return false;
    event.preventDefault();
    void this.runPanic();
    return true;
  }

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
  }

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
  }

  quickReactionEmoji(): string[] {
    for (const plugin of this.enabledPlugins()) {
      if (plugin.hooks.quickReactions.length) return plugin.hooks.quickReactions;
    }
    return [];
  }

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
  }

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
  }

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
  }

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
  }

  messageMenuItems(message: RawMessage): MenuEntry[] {
    const items: MenuEntry[] = [];
    if (this.hookOn("inlineTranslate")) items.push({ id: "translate", label: this.translated[message.id] ? "Show original" : "Translate" });
    if (this.hookOn("copyMarkdown")) items.push({ id: "copy-md", label: "Copy Markdown" });
    if (this.hookOn("replyChain") && message.reply) items.push({ id: "reply-chain", label: "Reply chain" });
    if (this.hookOn("showConnections")) items.push({ id: "connections", label: "Connections" });
    if (this.hookOn("localNicks")) items.push({ id: "local-nick", label: "Local nickname" });
    return items;
  }

  bindMessageMenu(node: HTMLElement, message: RawMessage) {
    const items = this.messageMenuItems(message);
    if (!items.length) return;
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showMenu(event.clientX, event.clientY, items, (id) => {
        void this.onMessageMenu(message, id);
      });
    });
  }

  async onMessageMenu(message: RawMessage, id: string) {
    if (id === "translate") await this.onInlineTranslate(message);
    if (id === "copy-md") await this.copyMessageMarkdown(message);
    if (id === "reply-chain") this.openReplyChain(message);
    if (id === "connections") await this.openConnections(message);
    if (id === "local-nick") {
      this.nickTarget = { id: message.authorId, name: message.authorName };
      this.paintComposer();
    }
  }

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
  }

  async copyMessageMarkdown(message: RawMessage) {
    const text = messageMarkdown(message, this.pack.copyMeta);
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", "Message markdown is on the clipboard.");
    } catch {
      this.toast("Copy", "Couldn't copy that message.");
    }
  }

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
  }

  messageExtras(message: RawMessage): { log?: { deleted: boolean; history: string[] } } {
    if (!this.hookOn("messageLog")) return {};
    const view = logView(findLog(this.pack.messageLog, message.channelId, message.id), this.pack.logDeleted, this.pack.logEdits);
    return view ? { log: view } : {};
  }

  timeClock(): { mode: TimeMode; hours: HourCycle } | undefined {
    if (!this.hookOn("betterTime")) return undefined;
    return { mode: this.pack.timeMode, hours: this.pack.timeHours };
  }

  relativeClock(): boolean {
    return this.hookOn("relativeTime") || (this.hookOn("betterTime") && this.pack.timeMode === "relative");
  }

  logStamp(): string {
    if (!this.hookOn("messageLog")) return "";
    return this.pack.messageLog.map((entry) => `${entry.id}:${entry.deleted ? 1 : 0}:${entry.edits.length}`).join(".");
  }

  noteLoggedEdit(message: RawMessage, previous: string, next: string) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordEdit(this.pack.messageLog, message, previous, next, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
  }

  noteLoggedDelete(message: RawMessage) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordDelete(this.pack.messageLog, message, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
  }

  savePack() {
    localStorage.setItem("lark.pack.v1", JSON.stringify(this.pack));
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  onHideAuthor(message: RawMessage) {
    this.pack.hiddenAuthors = toggleHidden(this.pack.hiddenAuthors, { id: message.authorId, name: message.authorName });
    this.savePack();
    this.msgSig = "";
    this.paintMessages();
    const hidden = this.pack.hiddenAuthors.some((author) => author.id === message.authorId);
    this.toast(hidden ? "Hidden" : "Visible", hidden ? `${message.authorName} is hidden on this device.` : `${message.authorName} is visible again.`);
  }

  absorbMessage(message: RawMessage) {
    if (message.authorId && message.authorName && message.authorName !== "Unknown" && !this.userNames[message.authorId]) {
      this.userNames[message.authorId] = message.authorName;
    }
    for (const mention of message.mentionUsers ?? []) {
      if (mention.id && mention.name && mention.name !== "someone" && !this.userNames[mention.id]) this.userNames[mention.id] = mention.name;
    }
  }

  noteChannel(channel: Channel) {
    if (channel.lastMessageId) this.channelLast[channel.id] = channel.lastMessageId;
    this.refreshBehind(channel.id);
  }

  refreshBehind(id: string) {
    this.behind[id] = id === this.channelId ? false : channelIsBehind(this.channelLast[id], this.lastRead[id]);
  }

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
  }

  paintNewBar() {
    if (!this.newBar) return;
    this.newBar.hidden = this.freshCount <= 0;
    this.newBar.textContent = this.freshCount > 1 ? `${this.freshCount} new messages` : "New messages";
  }

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
  }

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
  }

  threadsFor(parentId: string): Channel[] {
    const live = !this.guildId ? [] : this.channelsOf(this.guildId).filter((channel) => channel.kind === "thread" && channel.parentId === parentId);
    return this.threadCore?.mergeThreadChannels(parentId, live) ?? live;
  }

  mergeThreads(guildId: string, parentId: string, threads: Channel[]) {
    const guild = guildId || this.guildForChannel(parentId) || this.guildId;
    if (!guild || !threads.length) return;
    const existing = this.liveChannels[guild] ?? [];
    const incoming = threads.map((thread) => ({ ...thread, kind: "thread" as const, parentId: thread.parentId || parentId || null }));
    const ids = new Set(incoming.map((thread) => thread.id));
    this.liveChannels[guild] = [...existing.filter((channel) => !ids.has(channel.id)), ...incoming];
    this.msgSig = "";
    if (this.guildId === guild) this.paint();
  }

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
  }

  ensureThreadChannel(thread: { id: string; name: string }) {
    if (!this.guildId) return;
    const list = this.liveChannels[this.guildId] ?? [];
    if (list.some((channel) => channel.id === thread.id)) return;
    this.liveChannels[this.guildId] = [
      ...list,
      { id: thread.id, name: thread.name, kind: "thread", parentId: this.channelId, position: 0 },
    ];
  }

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
  }

  /** Stream A: + Create Thread. */
  onCreateThread(input?: unknown) {
    const payload = input ?? { channelId: this.channelId };
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreateThread(payload);
    });
  }

  /** Stream A: + Create Poll. */
  onCreatePoll(input?: unknown) {
    const payload = input ?? { channelId: this.channelId };
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreatePoll(payload);
    });
  }

  /** Stream B: Create Event, and the events list behind the sidebar row. */
  onCreateEvent(input?: unknown) {
    const payload = input ?? this.guildId ?? "";
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.onCreateEvent(payload);
    });
  }

  openEvents(input?: unknown) {
    const payload = input ?? this.guildId ?? "";
    void this.ensureThreadCore().then((mod) => {
      mod.bindParityHost(this.parityHost());
      mod.openEvents(payload);
    });
  }

  ensureThreadCore(): Promise<typeof import("../threads")> {
    if (this.threadCore) return Promise.resolve(this.threadCore);
    if (!this.threadCoreTask) {
      this.threadCoreTask = import("../threads").then((mod) => {
        this.threadCore = mod;
        return mod;
      });
    }
    return this.threadCoreTask;
  }

  bindThreadHost() {
    this.threadCore?.bindParityHost(this.parityHost());
  }

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
  }

  async ensureEmojis() {
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

  emojiPicker(onPick: (emoji: string, emojiId?: string | null, animated?: boolean, name?: string) => void): HTMLElement {
    return renderEmojiPicker({
      query: this.emojiQuery,
      unicode: EMOJI,
      recent: frecency(this.emojiUses, Date.now()).map((item) => item.emoji).filter((emoji) => !emoji.includes(":")),
      server: (this.guildId ? this.guildEmojis[this.guildId] : []) ?? [],
      allowServer: true,
      onQuery: (value) => {
        this.emojiQuery = value;
      },
      onPick,
    });
  }

  statusEmojiSource() {
    return {
      recent: frecency(this.emojiUses, Date.now()).map((item) => item.emoji).filter((emoji) => !emoji.includes(":")),
      server: (this.guildId ? this.guildEmojis[this.guildId] : []) ?? [],
      allowServer: this.premiumType > 0,
    };
  }

  insertEmoji(emoji: string, emojiId?: string | null, animated?: boolean, name?: string) {
    const token = emojiId ? `<${animated ? "a" : ""}:${name ?? emoji}:${emojiId}>` : emoji;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, caret, caret, token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.pickerFor = null;
    this.composer.focus();
    this.paintComposer();
  }

  refreshSuggest() {
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

  commitSuggest() {
    const hit = this.suggest[this.suggestIndex];
    if (!hit) return;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, this.suggestStart, caret, hit.token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.closeSuggest();
    this.composer.focus();
  }

  closeSuggest() {
    this.suggest = [];
    this.suggestKey = "";
    if (!this.suggestEl) return;
    this.suggestEl.hidden = true;
    clear(this.suggestEl);
  }

  async pinMessage(message: RawMessage) {
    const unpin = Boolean(message.pinned);
    if (this.demo) {
      this.toast(unpin ? "Unpinned" : "Pinned", "Demo pins stay in the sample data.");
      return;
    }
    try {
      await invoke(unpin ? "unpin_message" : "pin_message", { channelId: message.channelId, messageId: message.id });
      message.pinned = !unpin;
      const stored = (this.pages[message.channelId] ?? []).find((item) => item.id === message.id);
      if (stored) stored.pinned = message.pinned;
      delete this.pinCache[message.channelId];
      this.msgSig = "";
      this.toast(unpin ? "Unpinned" : "Pinned", unpin ? "Message unpinned." : "Message pinned.");
      if (this.pinsOpen) this.paintPins();
      this.paintMessages();
    } catch (err) {
      this.toast(unpin ? "Couldn't unpin" : "Couldn't pin", err instanceof Error ? err.message : "Discord refused the pin.");
    }
  }

  considerKeyword(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, alreadyNotified: boolean) {
    if (!this.hookOn("keywords")) return;
    if (inQuietHours(this.config.notifications.quiet, new Date())) return;
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

  considerPattern(message: RawMessage, level: NotifyLevel, alreadyNotified: boolean) {
    if (!this.hookOn("patternNotify") || !this.pack.highlightNotify) return;
    if (inQuietHours(this.config.notifications.quiet, new Date())) return;
    const guildId = message.guildId || this.guildForChannel(message.channelId) || "";
    const hit = patternHit(message.content, patternsFor(this.pack.highlightPatterns, this.pack.highlightGuilds, guildId));
    if (!shouldPatternNotify({
      notify: true,
      muted: level === "mute",
      fromMe: message.authorId === this.meId(),
      windowFocused: this.focused,
      sameChannel: message.channelId === this.channelId,
      hit: Boolean(hit),
      alreadyNotified,
    })) return;
    const gate = allowKeywordNotify(`pattern:${message.channelId}:${hit}`, Date.now(), this.keywordLast);
    this.keywordLast = gate.last;
    if (!gate.ok || !hit) return;
    void this.notify(this.maskText(message.authorName), this.maskText(plainPreview(message.content, this.renderContext()) || hit));
  }

  paintDirectMessages(scroll: HTMLElement) {
    this.ensureDmPins();
    const dms = [...this.dms()].sort((a, b) => a.position - b.position).filter((channel) => !this.closedDms.has(channel.id));
    if (!this.hookOn("pinDms")) {
      scroll.append(el("div", "category", "Direct messages"));
      if (!dms.length) scroll.append(el("p", "empty", "No direct messages yet."));
      for (const dm of floatPinned(dms, this.dmPins)) scroll.append(this.channelButton(dm, true));
      return;
    }
    if (!dms.length) {
      scroll.append(el("div", "category", "Direct messages"));
      scroll.append(el("p", "empty", "No direct messages yet."));
      return;
    }
    const split = orderDms(dms, [...this.dmPins]);
    if (split.pinned.length) {
      scroll.append(el("div", "category", "Pinned"));
      for (const dm of split.pinned) scroll.append(this.channelButton(dm, true));
    }
    if (split.rest.length) {
      scroll.append(el("div", "category", "Direct messages"));
      for (const dm of split.rest) scroll.append(this.channelButton(dm, true));
    }
  }

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
  }

  tickClock() {
    if (!this.relativeClock() || this.view !== "app") return;
    this.clock = Date.now();
    this.msgSig = "";
    this.paintMessages();
  }

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
  }

  tickAway() {
    if (!this.hookOn("autoAway")) return;
    const step = stepAway(this.away, Date.now(), this.pack.awayMinutes * 60_000);
    this.away = step.state;
    if (!step.write || step.write === this.me.status) return;
    this.setStatus(step.write, this.me.custom ?? "", "plugin");
  }

  tickPlaying() {
    if (!this.hookOn("nowPlaying")) return;
    const session = navigator.mediaSession?.metadata;
    if (!session?.title) return;
    this.writePlaying(playingLine(session.title, session.artist ?? ""), false);
  }

  tickMediaStatus() {
    if (!this.hookOn("mediaStatus")) return;
    const session = navigator.mediaSession?.metadata;
    const line = mediaStatusLine(this.pack.mediaStatusSource, this.detectedGame ?? "", session?.title ?? "", session?.artist ?? "");
    if (!line) return;
    this.writePlaying(line, false, this.pack.mediaStatusReplace);
  }

  presenceGame(): string {
    if (!this.hookOn("gameActivity")) return "";
    return gameActivityName(this.pack.gameActivity, this.detectedGame ?? "");
  }

  pushPresence() {
    if (this.demo) return;
    const status = this.presenceStatus();
    const wireStatus = status === "invisible" ? "invisible" : status;
    void invoke("set_presence", { status: wireStatus, custom: this.me.custom ?? "", game: this.presenceGame() });
  }

  tickHardware() {
    if (!this.config.desktop.hardware_status) {
      if (this.hardware.enabled || this.hardware.owned) this.applyHardware(null);
      return;
    }
    this.retryHardwarePush();
    if (!isTauri() || this.demo || this.hardwareBusy || this.hardware.paused) return;
    if (!hardwareSampleDue(this.hardwareSampleAt, Date.now(), pollInterval("hardware", this.gameMode))) return;
    void this.sampleHardware(false);
  }

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
  }

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
  }

  applyHardware(sample: { ok: boolean; line: string | null } | null) {
    const step = stepHardware({ ...this.hardware, enabled: this.config.desktop.hardware_status }, this.me.custom ?? "", sample);
    this.hardware = step.state;
    this.rememberHardware();
    if (step.custom === undefined) return;
    const status = this.presenceStatus();
    if ((this.me.custom ?? "") !== step.custom || this.me.status !== status) {
      this.setStatus(status, step.custom, "plugin");
    }
  }

  presenceStatus(): "online" | "idle" | "dnd" | "invisible" {
    const status = this.me.status;
    if (status === "idle" || status === "dnd" || status === "invisible" || status === "online") return status;
    return "online";
  }

  rememberHardware() {
    const saved = serializeHardwareState(this.hardware);
    if (saved) localStorage.setItem(HARDWARE_STORAGE_KEY, saved);
    else localStorage.removeItem(HARDWARE_STORAGE_KEY);
  }

  gameDeskList(): { plugin: PluginSource; catalog: GameCatalog }[] {
    if (!this.late) return [];
    const out: { plugin: PluginSource; catalog: GameCatalog }[] = [];
    for (const plugin of this.enabledPlugins()) {
      if (!plugin.hooks.gameDesk) continue;
      const catalog = this.late!.readCatalog(plugin.source);
      if (catalog) out.push({ plugin, catalog });
    }
    return out;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  syncGameSessions(force: boolean) {
    const now = Date.now();
    for (const { plugin, catalog } of this.gameDeskList()) {
      const desk = this.pack.gameDesks[plugin.id];
      if (!desk?.sessionStart || !desk.presence) continue;
      const line = this.late!.sessionStatusLine(this.late!.displayName(catalog, desk), desk.sessionStart, now);
      if (line) this.writeSession(line, desk.presenceReplace, force);
      return;
    }
  }

  writeSession(line: string, replace: boolean, force: boolean) {
    if (this.demo) return;
    if (!this.late!.canReplaceSession(this.me.custom ?? "", this.sessionShown, replace)) return;
    const now = Date.now();
    if (!force && !shouldWritePlaying(this.sessionShown, line, this.sessionWrite, now)) return;
    this.sessionShown = line;
    this.sessionWrite = now;
    this.setStatus(this.me.status ?? "online", line, "plugin");
  }

  clearSessionStatus() {
    if (this.sessionShown && (this.me.custom ?? "") === this.sessionShown) {
      this.setStatus(this.me.status ?? "online", "", "plugin");
    }
    this.sessionShown = "";
    this.sessionWrite = 0;
  }

  armSessionClock() {
    const live = Object.values(this.pack.gameDesks).some((desk) => desk.sessionStart > 0);
    if (!live) {
      if (this.sessionTick) window.clearInterval(this.sessionTick);
      this.sessionTick = 0;
      return;
    }
    if (this.sessionTick) return;
    this.sessionTick = window.setInterval(() => this.syncGameSessions(false), 15_000);
  }

  writePlaying(line: string, fromButton: boolean, replace = this.pack.playingReplace) {
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
  }

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
  }

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
  }

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
  }

  storeEcho(channelId: string, message: RawMessage) {
    history[channelId] = mergeIncoming(history[channelId] ?? [], message);
    this.pages[channelId] = mergeIncoming(this.pages[channelId] ?? [], message);
    this.queueLocalIndex(channelId);
  }

  dropEcho(channelId: string, localId: string) {
    const keep = (item: RawMessage) => item.id !== localId && item.nonce !== localId;
    history[channelId] = (history[channelId] ?? []).filter(keep);
    this.pages[channelId] = (this.pages[channelId] ?? []).filter(keep);
    this.forgetLocalMessage(channelId, localId, localId);
  }

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
  }

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
  }

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
  }

  refreshChannelBadge(channelId: string) {
    const channel = this.channelById(channelId);
    const flags = channelFlags({
      lastMessageId: channel?.lastMessageId,
      marker: this.markers[channelId],
      localUnread: this.localUnread[channelId] ?? 0,
      localMentions: this.localMentions[channelId] ?? 0,
      viewing: channelId === this.channelId && !this.holdRead(),
    });
    if (flags.unread) this.unread[channelId] = flags.unread;
    else delete this.unread[channelId];
    if (flags.mentions) this.mentions[channelId] = flags.mentions;
    else delete this.mentions[channelId];
  }

  toggleCategory(channelId: string) {
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

  applyNotify(entries: {
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
        this.discordNotify.dms = channels;
        this.discordNotify.dmsReady = true;
        for (const dm of this.dms()) {
          if (!channels[dm.id]) delete this.config.notifications.channels[dm.id];
        }
        for (const [id, pref] of Object.entries(channels)) this.config.notifications.channels[id] = this.overrideFromPref(pref);
        continue;
      }
      const level = entry.level === "all" || entry.level === "mentions" || entry.level === "mute" ? entry.level : null;
      this.discordNotify.guilds[entry.guildId] = {
        muted: Boolean(entry.muted),
        level,
        suppressEveryone: Boolean(entry.suppressEveryone),
        suppressRoles: Boolean(entry.suppressRoles),
        channels,
        authoritative: true,
      };
      this.config.notifications.guilds[entry.guildId] = entry.muted ? { muted: true } : { muted: false, level: level ?? undefined };
      const known = new Set(Object.keys(channels));
      for (const channel of this.channelsOf(entry.guildId)) {
        if (!known.has(channel.id)) delete this.config.notifications.channels[channel.id];
      }
      for (const [id, pref] of Object.entries(channels)) this.config.notifications.channels[id] = this.overrideFromPref(pref);
    }
    if (entries.length) this.persist();
  }

  overrideFromPref(pref: { muted: boolean; level: "all" | "mentions" | "mute" | null }): { muted: boolean; level?: NotifyLevel } {
    if (pref.muted || pref.level === "mute") return { muted: true };
    return pref.level ? { muted: false, level: pref.level } : { muted: false };
  }

  stageNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
    const muted = level === "mute";
    const pref = { muted, level: muted ? "mute" as const : level, collapsed: false };
    if (guildId && channelId) {
      const guild = this.discordNotify.guilds[guildId] ?? {
        muted: false,
        level: null,
        suppressEveryone: false,
        suppressRoles: false,
        channels: {},
      };
      const previous = guild.channels[channelId];
      guild.channels[channelId] = { ...pref, collapsed: previous?.collapsed ?? false };
      this.discordNotify.guilds[guildId] = guild;
      return;
    }
    if (guildId) {
      const guild = this.discordNotify.guilds[guildId] ?? {
        muted: false,
        level: null,
        suppressEveryone: false,
        suppressRoles: false,
        channels: {},
      };
      guild.muted = muted;
      guild.level = muted ? "mute" : level;
      this.discordNotify.guilds[guildId] = guild;
      return;
    }
    if (channelId) this.discordNotify.dms[channelId] = pref;
  }

  markReadFromEscape() {
    const current = this.channelId;
    const pending = (id: string) => (this.unread[id] ?? 0) + (this.mentions[id] ?? 0);
    if (current && pending(current) > 0) {
      this.markRead([current]);
      return;
    }
    const ids = this.visibleChannels().filter((channel) => channel.kind !== "category" && pending(channel.id) > 0).map((channel) => channel.id);
    if (ids.length) this.markRead(ids);
  }

  markRead(ids: string[]) {
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

  openInvite(code: string) {
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

  paintInvite() {
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

  async listDevices() {
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

  diagnosticsButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Copy voice diagnostics");
    button.type = "button";
    button.addEventListener("click", () => void this.copyVoiceDiagnostics());
    return button;
  }

  async copyVoiceDiagnostics() {
    if (!isTauri()) {
      this.toast("Voice", "Voice diagnostics are available in the desktop app.");
      return;
    }
    let text = "";
    try {
      text = await invoke<string>("voice_diagnostics");
    } catch (err) {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't read voice diagnostics.");
      return;
    }
    if (await writeClipboard(text)) this.toast("Copied", "Voice diagnostics are on the clipboard.");
    else this.toast("Voice", "Couldn't copy voice diagnostics.");
  }

  railIcon(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "rail-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const face = el("span", "server-face");
    face.append(icon(path));
    button.append(face, el("span", "pip"));
    button.addEventListener("click", onClick);
    return button;
  }

  railGlyph(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "rail-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const face = el("span", "server-face rail-glyph", glyph);
    button.append(face, el("span", "pip"));
    button.addEventListener("click", onClick);
    return button;
  }

  sidebarRow(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "channel-row");
    button.type = "button";
    button.append(el("span", "row-label", label));
    button.addEventListener("click", onClick);
    return button;
  }

  serverHeadButton(guild: Guild): HTMLButtonElement {
    const button = el("button", "channel-head-button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", `${guild.name} server menu`);
    button.append(el("h1", "", guild.name), el("span", "chev", "▾"));
    button.addEventListener("click", (event) => {
      const rect = button.getBoundingClientRect();
      this.openServerMenu(guild.id, rect.left, rect.bottom + 4, true);
      event.stopPropagation();
    });
    return button;
  }

  viewAsBar(guildId: string): HTMLElement {
    const role = (this.rolesByGuild[guildId] ?? []).find((item) => item.id === this.viewAsRoleId);
    const bar = el("div", "view-as-bar");
    bar.append(el("span", "", `Viewing as ${role?.name ?? "role"}`));
    const stop = el("button", "text-button", "Stop");
    stop.type = "button";
    stop.addEventListener("click", () => {
      this.viewAsRoleId = null;
      this.viewAsPermissions = "";
      this.paint();
    });
    bar.append(stop);
    return bar;
  }

  viewingAccess(guildId: string): GuildAccess | null {
    if (this.viewAsRoleId && this.guildId === guildId) {
      return {
        owner: false,
        permissions: this.viewAsPermissions,
        roles: [{ id: this.viewAsRoleId, permissions: this.viewAsPermissions }],
        myRoles: [this.viewAsRoleId],
      };
    }
    return this.access[guildId] ?? null;
  }

  channelHeading(channel: Channel): string {
    if (channel.kind === "voice" || channel.kind === "stage") return channel.name;
    if (channel.kind === "media") return channel.name;
    return `# ${channel.name}`;
  }

  closeContextMenu() {
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  }

  showMenu(x: number, y: number, items: ReturnType<typeof serverContextItems>, onPick: (id: string) => void) {
    this.closeContextMenu();
    const menu = mountMenu(x, y, items, (id) => {
      this.closeContextMenu();
      onPick(id);
    });
    this.contextMenuEl = menu;
    const closer = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      this.closeContextMenu();
      document.removeEventListener("pointerdown", closer, true);
    };
    document.addEventListener("pointerdown", closer, true);
  }

  openServerMenu(guildId: string, x: number, y: number, header = false) {
    const folders = this.folders.filter((folder) => folder.id).map((folder) => ({ id: folder.id as string, name: folder.name?.trim() || "Folder" }));
    const flags = {
      developerMode: readDeveloperMode(this.config),
      muted: this.guildMuted(guildId),
      hideMuted: this.hideMuted,
    };
    const items = header ? headerMenuItems(null, flags) : withMoveTargets(serverContextItems(flags), folders);
    this.showMenu(x, y, items, (id) => this.onServerAction(guildId, id));
  }

  onServerAction(guildId: string, id: string) {
    if (id === "mark-read") {
      const ids = this.channelsOf(guildId).filter((channel) => channel.kind !== "category").map((channel) => channel.id);
      this.markRead(ids);
      return;
    }
    if (id === "invite") {
      const channel = this.channelsOf(guildId).find((item) => item.kind === "text" || item.kind === "announcement");
      if (!channel) {
        this.toast("Invite", "This server has no text channel yet.");
        return;
      }
      void import("./channel-settings").then(({ mountInviteModal }) => mountInviteModal(this.channelHost(guildId), channel.id));
      return;
    }
    if (id === "mute") {
      this.onServerAction(guildId, this.guildMuted(guildId) ? "guild-notify:all" : "guild-notify:mute");
      return;
    }
    if (id === "hide-muted") {
      this.hideMuted = !this.hideMuted;
      localStorage.setItem("lark.hide-muted.v1", this.hideMuted ? "1" : "0");
      this.paintChannels();
      this.toast("Channels", this.hideMuted ? "Muted channels are hidden." : "Muted channels are shown.");
      return;
    }
    if (id === "settings") {
      this.openGuildSettings(guildId);
      return;
    }
    if (id === "privacy") {
      this.section = "privacy";
      this.openSettings();
      return;
    }
    if (id === "profile") {
      if (this.guildId !== guildId) this.selectGuild(guildId);
      const me = this.demo ? people[0] : this.me;
      this.openProfile(me, false, true);
      return;
    }
    if (id === "create-channel") {
      void import("./channel-settings").then(({ mountCreateChannel }) => mountCreateChannel(this.channelHost(guildId), "text"));
      return;
    }
    if (id === "create-category") {
      void import("./channel-settings").then(({ mountCreateChannel }) => mountCreateChannel(this.channelHost(guildId), "category"));
      return;
    }
    if (id === "create-event") {
      if (openCreateEvent(guildId) === "missing") this.toast("Events", "The event wizard is not available yet.");
      return;
    }
    if (id === "boost") {
      externalLink(DISCORD_LINKS.boost);
      return;
    }
    if (id === "apps") {
      this.openAppDirectory(guildId);
      return;
    }
    if (id === "copy-id") {
      void this.copyText(guildId);
      return;
    }
    if (id.startsWith("guild-notify:")) {
      const level = id.slice("guild-notify:".length) as NotifyLevel;
      this.config.notifications.guilds[guildId] = level === "mute" ? { muted: true } : { level, muted: false };
      this.stageNotify(guildId, null, level);
      this.persist();
      void this.writeNotify(guildId, null, level);
      this.toast("Notifications", `Server notifications are set to ${level}.`);
      this.paint();
      return;
    }
    if (id.startsWith("move:")) {
      const folderId = id.slice("move:".length);
      const intent = folderId === "loose" ? { kind: "end" as const } : { kind: "into-folder" as const, folderId };
      this.commitFolders(applyFolderDrop(this.guilds().map((guild) => guild.id), this.folders, { kind: "guild", id: guildId }, intent, Date.now()));
    }
  }

  openEventsEntry() {
    if (!this.guildId) return;
    this.openEvents(this.guildId);
  }

  openDiscover() {
    void import("./discover-view").then(({ openDiscover }) => {
      openDiscover({
        invoke: (command, args) => invoke(command, args),
        toast: (title, detail) => this.toast(title, detail),
        onJoined: (guildId) => {
          this.guildId = guildId;
          void this.ensureGuild(guildId);
          this.paint();
        },
      });
    });
  }

  openAddServer() {
    mountAddServer({
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      openInvite: (code) => this.openInvite(code),
      openDiscover: () => this.openDiscover(),
      onCreated: (guildId) => {
        this.guildId = guildId;
        void this.ensureGuild(guildId);
        this.paint();
      },
    });
  }

  openAppDirectory(guildId: string) {
    const guild = this.guilds().find((item) => item.id === guildId);
    void import("./app-directory-view").then(({ openAppDirectory }) => {
      openAppDirectory({
        invoke: (command, args) => invoke(command, args),
        toast: (title, detail) => this.toast(title, detail),
        guildId,
        guildName: guild?.name ?? "Server",
        onInstalled: () => this.toast("Installed", "The app was added to this server."),
      });
    });
  }

  openGuildSettings(guildId: string) {
    const opener = (globalThis as { larkOpenGuildSettings?: (guildId: string) => void }).larkOpenGuildSettings;
    if (typeof opener === "function") {
      opener(guildId);
      return;
    }
    const guild = this.guilds().find((item) => item.id === guildId);
    if (!guild) return;
    this.guildSettingsEl?.remove();
    this.guildSettingsEl = null;
    const ticket = ++this.guildSettingsTicket;
    void import("./guild-pages").then(({ mountGuildSettings }) => {
    if (ticket !== this.guildSettingsTicket) return;
    this.guildSettingsEl?.remove();
    this.guildSettingsEl = mountGuildSettings({
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      guild: () => this.guilds().find((item) => item.id === guildId) ?? guild,
      channels: () => this.channelsOf(guildId),
      me: () => ({ id: this.meId(), name: this.me.name }),
      access: () => {
        const access = this.access[guildId];
        return access ? { owner: access.owner, permissions: access.permissions } : null;
      },
      refresh: () => {
        void this.ensureGuild(guildId);
        this.paint();
      },
      close: () => {
        this.guildSettingsEl?.remove();
        this.guildSettingsEl = null;
      },
      viewAs: (roleId, permissions, name) => {
        this.viewAsRoleId = roleId;
        this.viewAsPermissions = permissions;
        this.toast("View as role", roleId ? `Viewing as ${name}` : "Stopped.");
        this.paint();
      },
      copy: (text) => this.copyText(text),
    });
    });
  }

  channelHost(guildId: string) {
    return {
      invoke: <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args),
      toast: (title: string, detail: string) => this.toast(title, detail),
      guildId,
      userId: this.meId(),
      channels: this.channelsOf(guildId),
      friends: this.friends.map((person) => ({ id: person.id, name: person.name })),
      roles: (this.rolesByGuild[guildId] ?? []).map((role) => ({ id: role.id, name: role.name })),
      copy: (text: string) => this.copyText(text),
      onChannel: (channel: Channel) => this.rememberServerChannel(guildId, channel),
    };
  }

  rememberServerChannel(guildId: string, channel: Channel) {
    const list = this.liveChannels[guildId] ?? [];
    const next = list.filter((item) => item.id !== channel.id);
    next.push(channel);
    this.liveChannels[guildId] = next;
    if (this.guildId === guildId) {
      this.paintChannels();
      if (channel.kind !== "category" && channel.kind !== "voice") void this.openChannel(channel.id);
    }
  }

  openChannelMenu(channel: Channel, x: number, y: number) {
    const items = [...channelContextItems(channel.kind, {
      developerMode: readDeveloperMode(this.config),
      muted: this.levelFor(this.guildId, channel.id) === "mute",
      hideNames: this.callView.hideNames,
    }), ...extraChannelItems(channel)];
    const favorite = (this.favorites[this.guildId ?? ""] ?? []).includes(channel.id);
    const pinned = (this.pinnedChannels[this.guildId ?? ""] ?? []).includes(channel.id);
    for (const item of items) {
      if (item.id === "favorite" && favorite) item.label = "Unfavorite";
      if (item.id === "pin-top" && pinned) item.label = "Unpin Channel";
    }
    this.showMenu(x, y, items, (id) => this.onChannelAction(channel, id));
  }

  onChannelAction(channel: Channel, id: string) {
    const guildId = this.guildId;
    if (id === "mark-read") {
      this.markRead([channel.id]);
      return;
    }
    if (id === "favorite" && guildId) {
      this.toggleFavorite(channel.id);
      return;
    }
    if (id === "invite" && guildId) {
      void import("./channel-settings").then(({ mountInviteModal }) => mountInviteModal(this.channelHost(guildId), channel.id));
      return;
    }
    if (id === "pin-top" && guildId) {
      this.toggleChannelPin(guildId, channel.id);
      return;
    }
    if (id === "copy-link" && guildId) {
      void this.copyText(channelLink(guildId, channel.id));
      return;
    }
    if (id === "copy-id") {
      void this.copyText(channel.id);
      return;
    }
    if (id === "mute") {
      const next: NotifyLevel = this.levelFor(guildId, channel.id) === "mute" ? "all" : "mute";
      this.writeChannelLevel(channel.id, next);
      return;
    }
    if (id === "join-quiet" || id === "open-chat" || id === "hide-names" || id === "set-status") {
      void this.runVoiceChannelAction(channel, id);
      return;
    }
    if (id.startsWith("notify:")) {
      this.writeChannelLevel(channel.id, id.slice("notify:".length) as NotifyLevel);
      return;
    }
    if (id === "edit" && guildId) {
      void import("./channel-settings").then(({ mountChannelEditor }) => mountChannelEditor(this.channelHost(guildId), channel));
      return;
    }
    if (id === "duplicate" && guildId) {
      const body = duplicateChannelBody(channel);
      if (!body) return;
      void invoke<Channel>("guild_admin", { request: { op: "create_channel", guildId, body } })
        .then((created) => this.rememberServerChannel(guildId, created))
        .catch((err) => this.toast("Couldn't duplicate", err instanceof Error ? err.message : "Discord refused the channel."));
      return;
    }
    if (id === "delete") {
      if (!window.confirm(`Delete #${channel.name}? This cannot be undone.`)) return;
      void invoke("guild_admin", { request: { op: "delete_channel", channelId: channel.id } })
        .then(() => {
          if (guildId) this.liveChannels[guildId] = (this.liveChannels[guildId] ?? []).filter((item) => item.id !== channel.id);
          this.toast("Channel deleted", channel.name);
          this.paintChannels();
        })
        .catch((err) => this.toast("Couldn't delete", err instanceof Error ? err.message : "Discord refused the delete."));
      return;
    }
    if ((id === "move:up" || id === "move:down") && guildId) {
      const siblings = this.channelsOf(guildId);
      const ordered = [...siblings.filter((item) => (item.parentId ?? null) === (channel.parentId ?? null))].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((item) => item.id === channel.id);
      const neighbor = ordered[id === "move:up" ? index - 1 : index + 1];
      if (!neighbor) return;
      void invoke("guild_admin", { request: { op: "patch_channel", channelId: channel.id, body: { position: neighbor.position } } })
        .then(() => {
          const previous = channel.position;
          channel.position = neighbor.position;
          neighbor.position = previous;
          this.paintChannels();
        })
        .catch((err) => this.toast("Couldn't move", err instanceof Error ? err.message : "Discord refused the move."));
    }
  }

  openCategoryMenu(category: Channel, x: number, y: number) {
    const muted = this.levelFor(this.guildId, category.id) === "mute";
    this.showMenu(x, y, categoryContextItems({ muted }), (id) => {
      if (id === "edit" && this.guildId) {
        const guildId = this.guildId;
        void import("./channel-settings").then(({ mountChannelEditor }) => mountChannelEditor(this.channelHost(guildId), category));
        return;
      }
      if (id === "delete") {
        if (!window.confirm(`Delete the ${category.name} category?`)) return;
        void invoke("guild_admin", { request: { op: "delete_channel", channelId: category.id } })
          .then(() => {
            if (this.guildId) this.liveChannels[this.guildId] = (this.liveChannels[this.guildId] ?? []).filter((item) => item.id !== category.id);
            this.paintChannels();
          })
          .catch((err) => this.toast("Couldn't delete", err instanceof Error ? err.message : "Discord refused the delete."));
        return;
      }
      if (id === "mute" || id.startsWith("notify:")) {
        const level: NotifyLevel = id === "mute" ? (muted ? "all" : "mute") : id.slice("notify:".length) as NotifyLevel;
        const ids = this.guildId ? categoryChannelIds(this.channelsOf(this.guildId), category.id) : [category.id];
        this.writeChannelLevels(ids, level);
      }
    });
  }

  writeChannelLevel(channelId: string, level: NotifyLevel) {
    this.writeChannelLevels([channelId], level);
  }

  writeChannelLevels(channelIds: string[], level: NotifyLevel) {
    const ids = [...new Set(channelIds.filter(Boolean))];
    if (!ids.length) return;
    for (const channelId of ids) {
      this.config.notifications.channels[channelId] = level === "mute" ? { muted: true } : { level, muted: false };
      this.stageNotify(this.guildId, channelId, level);
    }
    this.persist();
    void this.writeNotifyChannels(this.guildId, ids, level);
    this.toast("Notifications", `${level}.`);
    this.paint();
  }

  async writeNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
    await this.writeNotifyChannels(guildId, channelId ? [channelId] : [], level);
  }

  async writeNotifyChannels(guildId: string | null, channelIds: string[], level: NotifyLevel) {
    if (this.demo || !isTauri()) return;
    try {
      if (guildId && channelIds.length) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: channelsNotifyBody(channelIds, level) } });
      } else if (guildId) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: guildNotifyBody(level) } });
      } else if (channelIds[0]) {
        await invoke("guild_admin", { request: { op: "patch_dm_settings", body: channelNotifyBody(channelIds[0], level) } });
      }
    } catch (err) {
      this.toast("Notifications", err instanceof Error ? err.message : "Discord did not save that. Lark kept it on this device.");
    }
  }

  channelsInFolder(folderId: string): string[] {
    const folder = this.folders.find((item) => item.id === folderId);
    if (!folder) return [];
    const ids: string[] = [];
    for (const guildId of folder.guildIds) {
      for (const channel of this.channelsOf(guildId)) {
        if (channel.kind !== "category") ids.push(channel.id);
      }
    }
    return ids;
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
