import { channelIsBehind, firstUnreadId, mergeIncoming, outgoingNonce, sameOutgoing, sameReaction, shouldGroup, typingLine } from "../chat";
import { composedError, spoilerUploadName } from "../compose";
import { reportCrash } from "../crash";
import { defaultConfig, sanitizeConfig } from "../config";
import { ARCHIVE, CRIT, booth, history, ME, NORTHWIND, channels as demoChannels, dms as demoDms, guilds as demoGuilds, pageMessages, people, pins as demoPins } from "../demo/data";
import { benchHistory, benchPeople } from "../bench/corpus";
import { latestGateway, readyShape, rememberGateway } from "../gateway-cache";
import { messageSignature } from "../list-sig";
import { REST_PAGE_TTL_MS, readRestCache, writeRestCache, type RestHit } from "../rest-cache";
import { bindEmojiLoader, expandShortcodes, rememberEmoji, frecency, EMOJI, setCustomEmojis, type EmojiUse } from "../emoji";
import { applyMention, mentionHits, mentionQuery, plainPreview, type MentionHit } from "../mentions";
import { bumpsUnread, effectiveLevel, shouldDesktopNotify } from "../notify";
import {
  MISSED_KEY,
  MISSED_SEEN_KEY,
  cleanAlertList,
  clockMinutes,
  digestLines,
  digestSummary,
  dropChannel,
  inQuietHours,
  matchAlert,
  planNotification,
  releaseHeld,
  rememberMissed,
  sanitizeMissed,
  type MissedNote,
} from "../smart-notify";
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
  cycleServer as stepServer,
  dockBadge,
  folderBadge,
  inviteCode,
  layoutRail,
  orderedGuildIds,
  mentionsUser,
  normalizeFolder,
  type ChannelOverwrite,
  type DiscordNotify,
  type GuildAccess,
  type GuildFolder,
  type GuildPref,
  type ReadMarker,
} from "../shell";
import { ListSync, applyRemoteLists, flattenFavoriteIds, mapToPins, readIdList, refileFavorites, toggleListed, uniqueSnowflakes, type ListPayload, type RemoteLists } from "../user-lists";
import { noteActivity, stepAway, type AwayClock } from "../pack/away";
import { isBookmarked, toggleBookmark, type Bookmark } from "../pack/bookmarks";
import { mergeSaved, rowsFromPayload } from "../saved-sync";
import { localizeTree, setLocale } from "../i18n";
import { hiddenIds, toggleHidden } from "../pack/hidden";
import { allowKeywordNotify, cleanWords, firstHit, shouldKeywordNotify, wordsFor } from "../pack/keywords";
import { orderDms } from "../pack/pin-dms";
import { cleanPatterns, patternHit, patternsFor, shouldPatternNotify } from "../pack/patterns";
import { queueAcks, readAllIds, READ_ALL_GAP_MS, takeAck, type ReadTarget } from "../pack/read-all";
import { cloneTargets, discordMedia, emojiCloneBody, stickerCloneRequest } from "../pack/emote-clone";
import { dropDue, presetLead, queueDraft } from "../pack/live-schedule";
import { enabledEngines, engineLabel, searchHref, httpsImage, type ImageEngine } from "../pack/image-search";
import { isJumbo } from "../pack/jumbo";
import { atOrBefore, noteSeen } from "../pack/receipts";
import { digestRows, digestTotal } from "../pack/digest";
import { composerCount } from "../pack/words";
import { replyChain } from "../pack/chain";
import { connectionLabel, connectionLines, type ConnectionLine } from "../pack/connections";
import { displayName, setLocalNick } from "../pack/nicks";
import { folderTitle, orderUnreadFirst, peekNames, summarizeFolder, type FolderServer } from "../pack/folder-extra";
import { awayReplyDecision, cleanAwayText } from "../pack/away-reply";
import {
  activeStatKind,
  buildText,
  canReplaceSession,
  crewText,
  deskActions,
  displayName as deskName,
  emptyDesk,
  lfgText,
  parseSteamProfile,
  profileTarget,
  readCatalog,
  sessionClock,
  sessionStatusLine,
  setSession,
  statsCard,
  type GameCatalog,
} from "../pack/game-desk";
import { mountGameDesk } from "./game-desk-panel";
import { themeAttributeLines, themeAttributeText } from "../pack/theme-attrs";
import { mutualNames, whoisLines } from "../pack/whois";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "../pack/playing";
import { formatRelative } from "../pack/relative";
import { backoff, cancelSend, queueSend, takeDue, type ScheduledSend } from "../pack/schedule";
import { defaultPack, PACK_IDS, sanitizePack, settingsFor, type PackState } from "../pack/state";
import { callTimerLabel } from "../media/call-timer";
import { downloadName, originalImageUrl } from "../media/files";
import { newestClip, pipBox, youtubeId, youtubePlayerUrl } from "../media/watch";
import { boostedPlayback, volumeCeiling } from "../media/volume";
import { renderMediaPanel, type MediaHost } from "../media/registry";
import "../media/call-volume";
import "../media/files-panel";
import "../media/watch-panel";
import "../media/activity-panel";
import { gameActivityName, mediaStatusLine } from "../media/activity";
import { findLog, logView, overlayDeletes, recordDelete, recordEdit } from "../pack/logger";
import { holdRead as privacyHoldRead, obsDetected, panicPlan, publishActivity, redactStreamerText, streamerSafeActive, visibleStatus } from "../pack/privacy";
import { stripTrackingText, stripTrackingUrl } from "../pack/links";
import type { HourCycle, TimeMode } from "../pack/time";
import { typingLabel } from "../pack/typing-list";
import { unseenChannels } from "../pack/unseen";
import { openTarget, playerTrack } from "../pack/spotify";
import { messageMarkdown } from "../pack/markdown";
import { addTemplate, insertTemplate, removeTemplate } from "../pack/replies";
import { nextZoom } from "../pack/zoom";
import { commandCatalog, matchCommands } from "../palette";
import { DRAFTS_PLAIN_KEY, DRAFTS_SEALED_KEY, parseDraftMap, planDraftLoad, type DraftMap } from "../drafts";
import { dmPreview, personalLine, redactBlocks, redactSensitive, streamerActive } from "../privacy";
import { addReminder, cancelReminder, reminderFor, reminderPresets, sanitizeReminders, takeDueReminders, type Reminder } from "../reminders";
import { browserPlatform, fontStack, type PlatformInfo } from "../platform";
import { describePlugin, enabledSources, validPluginId, type PluginCatalogItem, type PluginHooks, type PluginSource } from "../plugins";
import {
  acceptBytes,
  APP_VERSION,
  availableStoreItems,
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
import { HISTORY_PAGE, initialHistory, reconcileHistory } from "../history";
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
import { bytesFromBase64, clipBehaviorNote, CLIP_BUFFER_OPTIONS, CLIP_FPS_OPTIONS, CLIP_RESOLUTION_OPTIONS, sanitizeClipBuffer, sanitizeClipFps, sanitizeClipResolution } from "../clip";
import {
  CLIP_DRAG,
  clipMime,
  clipPlaybackBlock,
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
  voiceChatInsets,
  clampPip,
  clampSplitRatio,
  dismissCallSurface,
  FOCUS_SPLIT_PX,
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
import { speakColor, speakingMotion, stageTiles, voiceBadges, voiceStatusNote, type RingMotion, type StageMember, type StageTile } from "../voice-stage";
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
  applyMemberListSort,
  applyMemberOps,
  emptyMemberList,
  groupMembers,
  MEMBER_LIST_SORTS,
  type MemberListSort,
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
import {
  activeNowCards,
  blockedIds,
  clampNickname,
  clampNote,
  clearAfterAt,
  developerModeOn,
  dmContextMenu,
  floatPinned,
  friendActivityText,
  friendUsernameOk,
  friendsForTab,
  groupMemberCount,
  memberContextMenu,
  pendingFriendCount,
  readPinList,
  requestAddFavorite,
  requestModView,
  requestRoleToggle,
  serverTagText,
  setRelationshipIndex,
  togglePin,
  voiceSpotFor,
  type ClearAfter,
  type FriendTab,
  type SocialRelationship,
  type VoiceSpot,
} from "../social";
import * as socialApi from "../social";
import {
  applyThreadIndex,
  bindParityHost,
  isMediaChannel,
  mergeThreadChannels,
  onCreateEvent as openCreateEventHook,
  onCreatePoll as openCreatePollHook,
  onCreateThread as openCreateThreadHook,
  readPendingFriendCount,
  type ParityHost,
  type ThreadIndexWire,
} from "../threads";
import { isHeldRequest } from "../message-requests";
import { loadThreadsUi, threadsNow } from "./lazy-threads";
import { writeClipboard } from "../clipboard";
import { acceptHeardSound, clipForHotkey, hearSoundKey, parseSoundEffect, playableClipIds, playableGuildSounds, sanitizeGuildSounds, sanitizeSoundToggles, soundEnabled, soundHotkeyIsGlobal, type GuildSound } from "../soundboard";
import { applyMoreAction, applyUserMix, applyVoiceState, browserMicConstraint, defaultCallView, hydrateMix, isDefaultAvatar, joinVoiceTarget, memberVoiceBody, micLevel, participantMenu, participantsIn, noiseQualityName, placeMenu, preferAvatar, readVoicePrefs, replaceGuildVoice, restingDesk, sanitizeInputProfiles, selectInputProfile, setSpeaking, toggleDeskDeafen, toggleDeskMute, VOICE_PREFS_KEY, voiceChannelLink, voiceChannelMenu, voiceDetailLine, voiceLinkDetails, writeVoicePrefs, type CallViewPrefs, type DeskAudio, type InputProfile, type ParticipantMenuAction, type VoiceParticipant, type VoiceRoster, type VoiceStateInput } from "../voice";
import { voiceHudFrame, type VoiceHudView } from "../voice-hud";
import { ACTIVITIES, activityById, isStageChannel, messagePreview, raiseHand, stageGroups, startStageBody, visibleCallTiles, watchEmbedUrl, watchVideoId, type StagePerson } from "../voice-stage";
import { rowEstimate, sliceWindow, spanWindow, VIRTUAL_MIN, type SpanWindow } from "../virtual";
import { clear, colorFor, el, icon, portrait, paths } from "./dom";
import { mountPrivacyPanel } from "./privacy-panels";
import {
  DISCORD_LINKS,
  categoryContextItems,
  channelContextItems,
  channelIsPrivate,
  channelLink,
  channelNotifyBody,
  duplicateChannelBody,
  extraChannelItems,
  guildNotifyBody,
  headerMenuItems,
  hideMutedChannel,
  openCreateEvent,
  openMediaChannel,
  openPerServerProfile,
  openStageChannel,
  orderChannels,
  parseFlag,
  parseIdMap,
  serverContextItems,
  toggleId,
  type MenuEntry,
  withMoveTargets,
} from "../server-model";
import { mountChatPluginPanel } from "./chat-plugin-panels";
import { renderWhois } from "./whois-card";
import { externalLink, mountAddServer, mountMenu } from "./guild-settings";
import { loadSettingsPages, peekSettingsPages, type SettingsPages } from "./lazy-chrome";
import { httpStatus, noteGateway, noteRest, noteVoice, noteVoiceDiagnostics, setTrafficArmed, trafficArmed } from "../net/traffic";
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
  registerSettingEntries,
  settingsSections,
  SHORTCUT_COPY,
  sliderControl,
  switchControl,
  type SettingEntry,
} from "./settings";
import { installShareSettings } from "../share-settings";
import { demoShareSources, qualityLabel, snapShareFps, snapShareHeight, streamKeyFor, type ShareSource } from "../share";
import { renderVoiceHud } from "./hud";
import { attachCameraTiles, cameraFrameBytes, clearCameraFrames, pushCameraFrame } from "../camera-view";
import { clearStreamFrames, liveBadge, mountStreamTiles, pushStreamFrame, shareDialog } from "./share-view";
import { appendCallControls, renderCallStage, renderCallStrip, renderFocusStage, renderPipTile, signalMeter, speakWrap } from "./voice-view";
import { renderStageBoard, renderVoiceChat } from "./stage-view";
import { bindLazyMedia, renderBlockedMessage, renderMessage } from "./messages";
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
import { renderContextMenu, renderFriendsBoard, type ActiveCardModel, type FriendRowModel, type PendingRowModel } from "./friends";
import { toggleInbox } from "./inbox";
import { installModView } from "./mod-view";
import { callKeyAction } from "../keybind-actions";
import { renderProfileCard, sampleProfile, sampleRoles, type ProfileActionSlot, type ProfileRole, type WireProfile } from "./profile";
import { patchSignIn, renderSignIn } from "./signin";
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
  lastLoad: number;
  switchAt: number;
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
  spoiler?: boolean;
}

interface ClipAsk {
  name: string;
  channelId: string;
  mode: "send" | "attach";
}

export function mount(root: HTMLElement) {
  try {
    const app = new LarkApp(root);
    void app.start().catch((error) => reportCrash(error));
  } catch (error) {
    reportCrash(error);
  }
}

class LarkApp {
  private config: AppConfig = defaultConfig();
  private platform: PlatformInfo = browserPlatform();
  private view: "gate" | "app" = "gate";
  private demo = false;
  private bench = false;
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
  private settingsQueued = false;
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
  private lightboxZoom = 1;
  private youtubeFloat: string | null = null;
  private youtubeFloatStamp = "";
  private catalog: PluginCatalogItem[] = [];
  private storeIndex: StoreIndex | null = null;
  private installed: InstalledRecord[] = [];
  private preferBuiltin = false;
  private storeListening = false;
  private storeRefreshing = false;
  private storeIndexTried = false;
  private storeInstalling = "";
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
  private frontApp: string | null = null;
  private blockedIds = new Set<string>();
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
  private readAllQueue: { channelId: string; messageId: string }[] = [];
  private readAllTimer = 0;
  private whoisUser = "";
  private whoisHide = 0;
  private whoisCache = new Map<string, { joinedAt?: string; mutuals: string[]; at: number }>();
  private liveQueue: ScheduledSend[] = [];
  private sendingLive = false;
  private liveScheduling = false;
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
  private composerFrame = 0;
  private channelShape = "";
  private railShape = "";
  private railBadges = "";
  private memberShape = "";
  private memberPaint: PaintedRow[] | null = null;
  private memberFrame = 0;
  private prefetchToken = 0;
  private pageLoads = new Map<string, Promise<{ messages: RawMessage[]; hasMore: boolean }>>();
  private restPages = new Map<string, RestHit<RawMessage[]>>();
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
  private missed: MissedNote[] = [];
  private missedSeen = 0;
  private quietOn = false;
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
  private splashCapTimer = 0;
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
  private friendTab: FriendTab = "online";
  private relationships: SocialRelationship[] = [];
  private relationshipsRetry = 0;
  private dmPins = new Set<string>();
  private dmPinsReady = false;
  private closedDms = new Set<string>();
  private profilePanelOpen = false;
  private profileFull = false;
  private serverEditor = false;
  private socialMenusBound = false;
  private friendTick = 0;
  private dashboardOpen = false;
  private dashboardTick = 0;
  private dashboardSig = "";
  private dashboardVis = false;
  private dashboardLoading: Promise<typeof import("./dashboard")> | null = null;
  private dashboardMod: typeof import("./dashboard") | null = null;
  private statusEmoji = "";
  private statusClearAt: number | null = null;
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
  private youtubeFloatEl!: HTMLElement;
  private toastWrap!: HTMLElement;
  private updateBannerEl!: HTMLElement;
  private interfaceToastEl!: HTMLElement;
  private updates: UpdateState = initialUpdateState("3.0.3", true);
  private interfaceUi: InterfaceUi = initialInterfaceUi();
  private updateTimer = 0;
  private interfaceTimer = 0;
  private pendingUpdate: Update | null = null;
  private updateBusy = false;
  private installingUpdate = false;
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
  private voiceAvatarFetches = new Set<string>();
  private voiceEpoch = 0;
  private voiceJoinedAt = 0;
  private voiceConnectedAt = 0;
  private callTimerTick = 0;
  private sessionTick = 0;
  private sessionShown = "";
  private sessionWrite = 0;
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
  private soundboardOpen = false;
  private heardSounds = new Map<string, number>();
  private micMenuOpen = false;
  private moreOpen = false;
  private voiceMenu: { userId: string; x: number; y: number } | null = null;
  private channelMenu: { channelId: string; x: number; y: number } | null = null;
  private desk: DeskAudio = restingDesk();
  private callView: CallViewPrefs = defaultCallView();
  private voiceDetails = voiceLinkDetails({});
  private netPanel: { close: () => void } | null = null;
  private netVoiceTimer = 0;
  private netTicket = 0;
  private netOpening = false;
  private inputProfiles: InputProfile[] = [];
  private inputProfileId = "";
  private inputVolume = 100;
  private outputVolume = 100;
  private echoCancellation = true;
  private agc = true;
  private noiseQuality: "standard" | "high" = "standard";
  private soundToggles: Record<string, boolean> = {};
  private guildSounds: GuildSound[] = [];
  private voiceChatLines: { id: string; author: string; text: string }[] = [];
  private voiceChatEl: HTMLElement | null = null;
  private watchUrl = "";
  private watchVideo = "";
  private stageTopic = "";
  private stageRaised = false;
  private stageSpeaker = false;
  private voiceChannelMenuBound = false;
  private deviceMenu: "input" | "output" | null = null;
  private inputLevel = 0;
  private micTestOn = false;
  private micMeterTimer = 0;
  private micPreview: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private cameraTimer = 0;
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
  private clipPlayNote = "";
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
  private pushMuted = false;
  private mutedByPush = false;
  private discordRebind: string | null = null;
  private hotkeysOff = false;
  private accountOverview: AccountOverview | null = null;
  private accountNote = "";
  private gateAccountSig = "";
  private recent: string[] = [];
  private drafts: DraftMap = {};
  private draftTicket = 0;
  private draftsReady = false;
  private emojiUses: EmojiUse[] = [];
  private searchOpen = false;
  private pinsOpen = false;
  private digestOpen = false;
  private receiptNote = false;
  private nickTarget: { id: string; name: string } | null = null;
  private connectionCache = new Map<string, { lines: ConnectionLine[]; at: number }>();
  private awayReplyBusy = false;
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
  private contextMenuEl: HTMLElement | null = null;
  private favorites: Record<string, string[]> = {};
  private favoriteIds: string[] = [];
  private favoritesMuted = false;
  private favoriteExtras: string[] = [];
  private favoritesMigrated = false;
  private pinsMigrated = false;
  private listSync: ListSync | null = null;
  private savedHeld = new Set<string>();
  private pinnedChannels: Record<string, string[]> = {};
  private hideMuted = false;
  private viewAsRoleId: string | null = null;
  private viewAsPermissions = "";
  private guildSettingsEl: HTMLElement | null = null;
  private guildSettingsTicket = 0;
  private memberListSort: MemberListSort = "status";
  private audioInputs: { id: string; label: string }[] = [];
  private audioOutputs: { id: string; label: string }[] = [];
  private videoInputs: { id: string; label: string }[] = [];
  private badgeSent = -1;
  private upload = 0;
  private draftTimer = 0;
  private frames = new FrameClock();

  constructor(private root: HTMLElement) {}

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
      const initial = gateQr(isTauri());
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
    this.revealShell();
    this.splashEl.hidden = true;
    const openClips = new URLSearchParams(location.search).has("clips");
    void this.openChannel(CRIT).then(() => {
      if (openClips) this.openClips();
      if (shareMode === "dialog" || shareMode === "live") this.openDemoShare(shareMode);
    });
  }

  private seedDemoVoice(sharing = false) {
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
    this.armSplashCap();
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
    // The splash does not wait on history. openChannel paints the cached page,
    // or a skeleton, and fetches the newest 20 without blocking the first paint.
    void channelId;
    if (!this.holdShell) return;
    this.startupMilestone = "cache";
    this.startupStepAt = performance.now();
    this.finishStartup();
  }

  private finishStartup(force = false) {
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
    this.clearSplashCap();
    if (this.channelGraceTimer) window.clearTimeout(this.channelGraceTimer);
    if (this.splashFinishTimer) window.clearTimeout(this.splashFinishTimer);
    if (this.splashHideTimer) window.clearTimeout(this.splashHideTimer);
    this.channelGraceTimer = 0;
    this.splashFinishTimer = 0;
    this.splashHideTimer = 0;
  }

  /** Drop the splash if connect, channels, or the first paint never finish. */
  private armSplashCap() {
    this.clearSplashCap();
    this.splashCapTimer = window.setTimeout(() => {
      this.splashCapTimer = 0;
      if (!this.holdShell && !this.splashLeaving) return;
      this.finishStartup(true);
    }, SPLASH_CAP_MS);
  }

  private clearSplashCap() {
    if (!this.splashCapTimer) return;
    window.clearTimeout(this.splashCapTimer);
    this.splashCapTimer = 0;
  }

  /** Show the gate or the shell. Message paint does not do this on its own. */
  private revealShell() {
    if (this.holdShell) return;
    this.gate.hidden = this.view !== "gate";
    this.shell.hidden = this.view !== "app";
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
    try {
      this.paintView();
    } catch (error) {
      reportCrash(error);
    }
  }

  private paintView() {
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
  }

  private applyAppearance() {
    setLocale(this.config.preferences.language || "en");
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
    const rail = appearance.show_server_rail ? "56px" : "0px";
    const channelW = appearance.channel_list === "hidden" ? "0px" : "240px";
    const dmSidebar = !this.guildId && !this.friendsOpen && this.currentChannelIsDm();
    const homeFeed = this.dashboardHome();
    const dashDock = this.dashboardOpen && !homeFeed;
    const members = !this.narrow && (dashDock || (appearance.show_member_list && (this.guildId || dmSidebar))) ? (dashDock ? "320px" : "240px") : "0px";
    this.rail.hidden = !appearance.show_server_rail;
    this.channelPane.hidden = appearance.channel_list === "hidden" && !this.drawer;
    this.membersEl.hidden = members === "0px" && !(this.narrow && dashDock);
    const callSplit = this.callSurface === "split";
    if (this.stage) {
      this.stage.classList.toggle("is-split", Boolean(this.splitId) && !this.narrow && !callSplit);
      this.splitPane.hidden = !this.splitId || this.narrow || callSplit;
    }
    if (this.narrow) {
      if (dashDock) {
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
  }

  private async applyTheme() {
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
  }

  private async fetchThemeCss(name: string): Promise<string> {
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
  }

  private selectTheme(id: string) {
    if (!THEME_ID.test(id)) return;
    this.preferBuiltin = false;
    localStorage.removeItem("lark.theme.builtin");
    for (const name of ["--bg-0", "--bg-2", "--text"]) this.root.style.removeProperty(name);
    this.config.appearance.theme = id;
    this.config.preferences.color_mode = "";
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
      const note = this.themeFilter.trim() ? "No theme matches that." : "No themes installed. The built-in colours stay on.";
      if (!empty) grid.insertAdjacentElement("afterend", el("p", "theme-empty hint", note));
    } else {
      empty?.remove();
    }
  }

  private themeCard(theme: { id: string; title: string; blurb: string }): HTMLButtonElement {
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
  }

  private signInState() {
    return {
      error: this.tokenNote,
      qrSvg: this.qrSvg,
      qrStatus: this.qrStatus,
      store: this.platform.credentialStore,
      busy: this.signInBusy,
      accounts: this.config.sessions ?? [],
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

  private dmChannels(): Channel[] {
    return sortDms(this.demo ? demoDms : this.liveDms);
  }

  private dms(): Channel[] {
    return this.dmChannels().filter((channel) => !isHeldRequest(channel.id));
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
    const hot = this.hookOn("betterFolders") && this.pack.folderUnreadFirst
      ? this.guilds().filter((guild) => this.folderHot(guild.id)).map((guild) => guild.id).join(".")
      : "";
    return `${guilds}|${folders}|${hot}`;
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
      if (this.hookOn("folderStats") && folder.id) button.title = folderTitle(this.folderSummary(folder.id, folder.name?.trim() || "Folder", folder.guildIds));
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
    const add = this.railIcon("Add a Server", paths.plus, () => this.openAddServer());
    const discover = this.railGlyph("Discover", "D", () => externalLink(DISCORD_LINKS.discovery));
    const nitro = this.railGlyph("Nitro", "N", () => externalLink(DISCORD_LINKS.nitro));
    const shop = this.railGlyph("Shop", "S", () => externalLink(DISCORD_LINKS.shop));
    const quests = this.railGlyph("Quests", "Q", () => externalLink(DISCORD_LINKS.quests));
    this.rail.append(home, sep, servers, add, discover, nitro, shop, quests, settings);
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
    const ordered = this.hookOn("betterFolders") && this.pack.folderUnreadFirst
      ? orderUnreadFirst(entry.guildIds, (guildId) => this.folderHot(guildId))
      : entry.guildIds;
    const summary = this.folderSummary(entry.id, entry.name, entry.guildIds);
    button.title = this.hookOn("folderStats")
      ? folderTitle(summary)
      : this.hookOn("betterFolders")
        ? `${entry.name}: ${peekNames(ordered.map((guildId) => this.folderServer(guildId)))}`
        : entry.name;
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
      for (const guildId of ordered) this.appendServerButton(wrap, guildId, entry.id);
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
    const folder = target.closest<HTMLElement>("[data-folder]");
    if (folder?.dataset.folder) {
      event.preventDefault();
      this.openFolderMenu(folder.dataset.folder, event.clientX, event.clientY);
      return;
    }
    const button = target.closest<HTMLElement>("[data-guild]");
    const guildId = button?.dataset.guild;
    if (!guildId || guildId === "home") return;
    event.preventDefault();
    this.openServerMenu(guildId, event.clientX, event.clientY);
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
    const commands = el("div", "folder-commands");
    const read = el("button", "ctx-item", "Mark As Read");
    read.type = "button";
    read.addEventListener("click", () => {
      this.markRead(this.channelsInFolder(folderId));
      this.closeFolderMenu();
    });
    commands.append(read, el("p", "folder-menu-label", "Move to"));
    for (const other of this.folders) {
      if (!other.id || other.id === folderId) continue;
      const move = el("button", "ctx-item", other.name?.trim() || "Folder");
      move.type = "button";
      move.addEventListener("click", () => {
        this.commitFolders(applyFolderDrop(
          this.guilds().map((guild) => guild.id),
          this.folders,
          { kind: "folder", id: folderId },
          { kind: "before-folder", folderId: other.id as string },
          Date.now(),
        ));
        this.closeFolderMenu();
      });
      commands.append(move);
    }
    menu.append(el("p", "folder-menu-label", "Folder"), input, colors, commands);
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

  private folderHot(guildId: string): boolean {
    if (this.guildMuted(guildId)) return false;
    const badge = this.guildBadge(guildId);
    return badge.mentions > 0 || badge.count > 0;
  }

  private folderServer(guildId: string): FolderServer {
    const guild = this.guilds().find((item) => item.id === guildId);
    const badge = this.guildBadge(guildId);
    return {
      id: guildId,
      name: guild?.name ?? "Server",
      mentions: badge.mentions,
      unread: badge.count > 0,
      muted: this.guildMuted(guildId),
    };
  }

  private folderSummary(id: string, name: string, guildIds: readonly string[]) {
    return summarizeFolder(id, name, guildIds.map((guildId) => this.folderServer(guildId)));
  }

  private guildMuted(guildId: string): boolean {
    const remote = this.discordNotify.guilds[guildId];
    if (remote?.authoritative) return remote.muted;
    return Boolean(remote?.muted || this.config.notifications.guilds[guildId]?.muted);
  }

  private levelFor(guildId: string | null, channelId: string) {
    return effectiveLevel(this.config, guildId, channelId, this.discordNotify);
  }

  private canSeeChannel(guildId: string, channel: Channel): boolean {
    const access = this.viewingAccess(guildId);
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
      const typing = this.listTyping(channel, direct)?.title ?? "";
      return `${channel.id}:${channel.name}:${channel.kind}:${channel.parentId ?? ""}:${channel.position}:${muted}:${collapsed}:${voice}:${preview}:${activity}:${typing}`;
    });
    const me = this.demo ? people[0] : this.me;
    const pins = (this.pinnedChannels[this.guildId ?? ""] ?? []).join(".");
    const favs = (this.favorites[this.guildId ?? ""] ?? []).join(".");
    const timer = this.hookOn("callTimer") ? `${this.pack.callTimerFrom}:${this.pack.callTimerStyle}` : "";
    return `${this.guildId ?? ""}|${this.friendsOpen ? 1 : 0}|${this.clipsOpen ? 1 : 0}|${this.streamerOn() ? 1 : 0}|${me.id}|${me.name}|${this.voice?.channelId ?? ""}|${this.voice?.status ?? ""}|${this.voice?.muted ? 1 : 0}|${this.voice?.deafened ? 1 : 0}|${this.shareOn ? 1 : 0}|${this.stripOpen ? 1 : 0}|${this.hideMuted ? 1 : 0}|${this.viewAsRoleId ?? ""}|${timer}|${pins}|${favs}|${this.hiddenStamp()}|${this.spotifyStamp()}|${bits.join(",")}`;
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
      friends.classList.toggle("is-selected", this.friendsOpen && !this.dashboardOpen && !this.channelId && !this.clipsOpen);
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      const pending = pendingFriendCount();
      this.setBadge(friends, pending || online);
    }
    const activity = this.channelPane.querySelector<HTMLElement>("[data-activity]");
    if (activity) activity.classList.toggle("is-selected", this.dashboardHome());
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
    if (guild) head.append(this.serverHeadButton(guild));
    else head.append(el("h1", "", "Direct messages"));
    if (guild && this.viewAsRoleId) head.append(this.viewAsBar(guild.id));
    const scroll = el("div", "channel-scroll");
    if (!this.guildId) {
      const friends = el("button", `channel-row${this.friendsOpen && !this.dashboardOpen ? " is-selected" : ""}`);
      friends.type = "button";
      friends.dataset.friends = "1";
      friends.append(icon(paths.users), el("span", "row-label", "Friends"));
      const online = this.friends.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
      const pending = pendingFriendCount();
      if (pending) friends.append(el("span", "badge", String(pending)));
      else if (online) friends.append(el("span", "badge", String(online)));
      friends.addEventListener("click", () => {
        this.dashboardOpen = false;
        this.stopDashboardTick();
        this.dashboardSig = "";
        this.friendsOpen = true;
        this.returnToChat();
        this.channelId = "";
        this.drawer = false;
        this.msgSig = "";
        this.paint();
      });
      const activity = el("button", `channel-row${this.dashboardHome() ? " is-selected" : ""}`);
      activity.type = "button";
      activity.dataset.activity = "1";
      activity.append(icon(paths.bell), el("span", "row-label", "Activity"));
      activity.addEventListener("click", () => this.showActivity());
      scroll.append(friends, activity, this.clipsNavButton());
      const group = el("button", "channel-row");
      group.type = "button";
      group.append(icon(paths.plus), el("span", "row-label", "New Group DM"));
      group.addEventListener("click", () => this.openGroupCreator());
      scroll.append(group);
      this.paintDirectMessages(scroll);
    } else {
      scroll.append(this.clipsNavButton(), this.sidebarRow("Events", () => this.openEventsEntry()), this.sidebarRow("Server Boosts", () => externalLink(DISCORD_LINKS.boost)));
      const list = [...this.visibleChannels()]
        .filter((channel) => !hideMutedChannel({
          hide: this.hideMuted,
          level: this.levelFor(this.guildId, channel.id),
          selected: channel.id === this.channelId,
          kind: channel.kind,
        }))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const threads = list.filter((channel) => channel.kind === "thread");
      const categories = list.filter((channel) => channel.kind === "category");
      const categoryIds = new Set(categories.map((category) => category.id));
      const pins = this.pinnedChannels[this.guildId ?? ""] ?? [];
      const loose = orderChannels(
        list.filter((channel) => channel.kind !== "category" && channel.kind !== "thread" && (!channel.parentId || !categoryIds.has(channel.parentId))),
        pins,
      );
      const appendChannel = (channel: Channel) => {
        scroll.append(this.channelBlock(channel));
        for (const thread of threads.filter((item) => item.parentId === channel.id)) scroll.append(this.channelButton(thread, false));
      };
      const favs = list.filter((channel) => (this.favorites[this.guildId ?? ""] ?? []).includes(channel.id) && channel.kind !== "category" && channel.kind !== "thread");
      if (favs.length) {
        scroll.append(el("div", "category", "Favorites"));
        for (const channel of favs) appendChannel(channel);
      }
      for (const channel of loose) appendChannel(channel);
      for (const category of categories) {
        const children = orderChannels(
          list.filter((item) => item.parentId === category.id && item.kind !== "category" && item.kind !== "thread"),
          pins,
        );
        const collapsed = this.collapsedCats.has(category.id);
        const header = el("button", `category${collapsed ? " is-collapsed" : ""}`);
        header.type = "button";
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        header.append(el("span", "chev", collapsed ? "▸" : "▾"), el("span", "", category.name));
        header.addEventListener("click", () => this.toggleCategory(category.id));
        header.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.openCategoryMenu(category, event.clientX, event.clientY);
        });
        scroll.append(header);
        if (!collapsed) for (const channel of children) appendChannel(channel);
      }
      this.appendHiddenChannels(scroll);
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
    const gear = el("button", "icon-button user-settings");
    gear.type = "button";
    gear.title = "Settings";
    gear.setAttribute("aria-label", "Open settings");
    gear.append(icon(paths.settings));
    gear.addEventListener("click", () => this.openSettings());
    const dock = el("div", "user-dock");
    dock.append(profile, gear);
    const panel = this.voicePanel();
    const player = this.spotifyPlayer();
    const tail = [panel, player, dock].filter((node): node is HTMLElement => Boolean(node));
    this.channelPane.append(head, scroll, ...tail);
    scroll.scrollTop = kept;
    this.bindSocialMenus();
    this.scheduleSocialChrome();
  }

  private channelBlock(channel: Channel): HTMLElement {
    const button = this.channelButton(channel, false);
    if ((channel.kind !== "voice" && !isStageChannel(channel)) || !this.guildId) return button;
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
    const note = voiceStatusNote({
      self: person.userId === this.meId(),
      speaking: badges.speaking,
      sharing: person.sharing || (person.userId === this.meId() && this.shareOn),
    });
    const copy = el("span", "voice-user-copy");
    copy.append(el("span", "voice-user-name", person.name), el("span", "voice-user-sub", note));
    row.append(copy);
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

  private userVolumeCeiling(): number {
    return volumeCeiling(this.hookOn("volumeBoost"), this.pack.volumeCap);
  }

  private callTimerText(now = Date.now()): string {
    if (!this.hookOn("callTimer") || !this.voice) return "";
    return callTimerLabel(this.pack.callTimerFrom, this.pack.callTimerStyle, this.voiceJoinedAt, this.voiceConnectedAt, now);
  }

  private noteVoiceConnected() {
    if (!this.voiceConnectedAt) this.voiceConnectedAt = Date.now();
  }

  private clearVoiceClock() {
    this.voiceJoinedAt = 0;
    this.voiceConnectedAt = 0;
    if (this.callTimerTick) {
      window.clearInterval(this.callTimerTick);
      this.callTimerTick = 0;
    }
  }

  private armCallTimer() {
    if (this.callTimerTick) return;
    this.callTimerTick = window.setInterval(() => this.syncCallTimer(), 1000);
  }

  private syncCallTimer() {
    const label = this.callTimerText();
    const node = this.root.querySelector(".voice-panel-timer");
    if (!label) {
      node?.remove();
      return;
    }
    if (!(node instanceof HTMLElement)) {
      this.channelShape = "";
      this.paintChannels();
      return;
    }
    if (node.textContent !== label) node.textContent = label;
  }

  private resendVoiceMix() {
    this.sentMix.clear();
    this.syncCallMembers();
    this.paintVoiceFloats();
  }

  private mediaHost(): MediaHost {
    return {
      pack: this.pack,
      savePack: () => this.savePack(),
      choice: (values, current, onPick, labels) => this.choice(values, current, onPick, labels),
      resendVoiceMix: () => this.resendVoiceMix(),
      refreshMessages: () => {
        this.msgSig = "";
        this.paintMessages();
      },
      resendPresence: () => this.pushPresence(),
    };
  }

  private voicePanel(): HTMLElement {
    this.ensureVoicePrefs();
    this.bindVoiceChannelMenu();
    const session = this.voice;
    const panel = el("section", session ? "voice-panel" : "voice-panel is-resting");
    if (!session) {
      panel.setAttribute("aria-label", "Mute and deafen");
      panel.append(this.userAudioRow());
      return panel;
    }
    const status = session.status ?? "connecting";
    const audible = status === "connected" ? "Voice connected" : status === "reconnecting" ? "Reconnecting" : "Connecting";
    const timer = this.callTimerText();
    panel.setAttribute("aria-label", timer ? `${audible}, ${session.name ?? "Voice"}, ${timer}` : `${audible}, ${session.name ?? "Voice"}`);
    const line = el("div", "voice-panel-line");
    const diagnostics = this.diagnosticsButton();
    diagnostics.classList.add("voice-diagnostics");
    line.append(signalMeter(status), el("strong", "voice-panel-name", session.name ?? "Voice"), diagnostics);
    if (timer) line.append(el("time", "voice-panel-timer", timer));
    if (this.shareOn) line.append(liveBadge(this.sharePaused));
    const details = el("p", "voice-panel-details", voiceDetailLine(this.voiceDetails, status, session.detail ?? ""));
    const actions = el("div", "voice-panel-actions");
    const share = this.iconButton(this.shareOn ? "Stop sharing" : "Share your screen", paths.monitor, () => this.toggleShare(), false);
    if (this.shareOn) share.classList.add("is-live");
    const camera = this.iconButton(this.cameraOn ? "Turn off camera" : "Turn on camera", this.cameraOn ? paths.camera : paths.cameraOff, () => this.toggleCamera(), false);
    if (this.cameraOn) camera.classList.add("is-live");
    const activity = this.iconButton(this.activitiesOpen ? "Close activities" : "Activity", paths.activity, () => this.toggleActivities(), false);
    if (this.activitiesOpen) activity.classList.add("is-live");
    const sounds = this.iconButton(this.soundboardOpen ? "Close soundboard" : "Soundboard", paths.volume, () => this.toggleSoundboard(), false);
    if (this.soundboardOpen) sounds.classList.add("is-live");
    const noise = this.iconButton(
      this.config.voice.noise_suppression ? "Noise suppression on" : "Noise suppression off",
      paths.mic,
      () => this.toggleNoiseSuppression(),
      false,
    );
    if (this.config.voice.noise_suppression) noise.classList.add("is-on");
    noise.title = "Lark noise suppression (RNNoise)";
    noise.dataset.voiceNoise = "1";
    const echo = this.iconButton(
      this.echoCancellation ? "Echo cancellation on" : "Echo cancellation off",
      paths.echo,
      () => this.toggleEchoCancellation(),
      false,
    );
    if (this.echoCancellation) echo.classList.add("is-on");
    echo.title = "Echo cancellation";
    echo.dataset.voiceEcho = "1";
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
      camera,
      activity,
      sounds,
      noise,
      echo,
      this.iconButton(session.muted ? "Unmute" : "Mute", session.muted ? paths.micOff : paths.mic, () => this.toggleMute(), Boolean(session.muted)),
      this.deviceChevron("Input device", () => this.toggleDeviceMenu("input")),
      this.iconButton(session.deafened ? "Undeafen" : "Deafen", session.deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), Boolean(session.deafened)),
      this.deviceChevron("Output device", () => this.toggleDeviceMenu("output")),
      hangup,
      el("span", "spacer"),
      strip,
    );
    panel.append(line, details, actions);
    if (this.soundboardOpen) panel.append(this.soundboardPanel());
    if (this.deviceMenu) panel.append(this.deviceMenuPop());
    return panel;
  }

  private soundboardPanel(): HTMLElement {
    const board = el("div", "voice-board");
    board.setAttribute("role", "menu");
    board.setAttribute("aria-label", "Soundboard");
    const deafened = Boolean(this.voice?.deafened);
    if (deafened) {
      board.append(el("p", "hint", "Soundboard is off while you are deafened."));
      return board;
    }
    const sounds = playableGuildSounds(this.guildSounds, this.soundToggles, false);
    board.append(el("span", "hint", "Server sounds"));
    if (!sounds.length) board.append(el("p", "hint", "No server sounds."));
    for (const sound of sounds) {
      const button = el("button", "text-button", sound.name);
      button.type = "button";
      button.addEventListener("click", () => void this.playGuildSound(sound.id));
      board.append(button);
    }
    return board;
  }

  private userAudioRow(): HTMLElement {
    const row = el("div", "user-audio");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Microphone and headphones");
    const muted = this.voice?.muted ?? this.desk.muted;
    const deafened = this.voice?.deafened ?? this.desk.deafened;
    const micSlot = el("div", "user-audio-slot");
    micSlot.append(
      this.iconButton(muted ? "Unmute" : "Mute", muted ? paths.micOff : paths.mic, () => this.toggleMute(), muted),
      this.deviceChevron("Input device", () => this.toggleDeviceMenu("input")),
    );
    const deafSlot = el("div", "user-audio-slot");
    deafSlot.append(
      this.iconButton(deafened ? "Undeafen" : "Deafen", deafened ? paths.headphonesOff : paths.headphones, () => this.toggleDeafen(), deafened),
      this.deviceChevron("Output device", () => this.toggleDeviceMenu("output")),
    );
    row.append(micSlot, deafSlot);
    if (!this.voice && this.deviceMenu) row.append(this.deviceMenuPop());
    return row;
  }

  private deviceChevron(label: string, onClick: () => void): HTMLButtonElement {
    const button = this.iconButton(label, paths.chevronUp, onClick, false);
    button.classList.add("device-chevron");
    return button;
  }

  private channelButton(channel: Channel, dm: boolean): HTMLButtonElement {
    const muted = this.levelFor(dm ? null : this.guildId, channel.id) === "mute";
    const unreadCount = this.unread[channel.id] ?? 0;
    const mentions = this.mentions[channel.id] ?? 0;
    const unread = unreadCount > 0 || mentions > 0;
    const quiet = !unread && Boolean(this.behind[channel.id]);
    const stage = isStageChannel(channel);
    const joined = (channel.kind === "voice" || stage) && this.voice?.channelId === channel.id;
    const button = el("button", `${dm ? "dm-row" : "channel-row"}${channel.kind === "thread" ? " is-thread" : ""}${this.channelSelected(channel.id) ? " is-selected" : ""}${unread || quiet ? " is-unread" : ""}${muted ? " is-muted" : ""}${channel.kind === "voice" || stage ? " is-voice" : ""}${stage ? " is-stage" : ""}${joined ? " is-joined" : ""}`);
    button.type = "button";
    button.dataset.channel = channel.id;
    let known: Person | undefined;
    if (!dm) button.append(icon(channel.kind === "voice" || channel.kind === "stage" ? paths.volume : channel.kind === "announcement" ? paths.bell : paths.hash));
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
      const activity = friendActivityText(known);
      if (activity) label.append(el("span", "dm-activity", this.maskText(activity)));
    }
    if (dm && channel.kind === "group") {
      const ids = channel.recipientIds?.length ? channel.recipientIds : (channel.recipients ?? []).map((item) => item.id);
      label.append(el("span", "dm-count", `${groupMemberCount(ids, this.meId())} members`));
    }
    if (dm) {
      const preview = this.dmPreviewLabel(channel.id);
      if (preview) label.append(el("span", "dm-preview", preview));
    }
    button.append(label);
    if (dm && channel.kind === "dm") {
      const recipientId = channel.recipients?.find((item) => item.id !== this.meId())?.id ?? channel.recipientIds?.find((id) => id !== this.meId());
      const spot = recipientId ? voiceSpotFor(Object.values(this.voiceRoster), recipientId) : null;
      if (spot) {
        const mark = el("span", "dm-voice");
        mark.title = spot.sharing ? "In voice, live" : "In voice";
        mark.append(icon(paths.volume));
        if (spot.sharing) mark.append(el("span", "live-pill", "LIVE"));
        button.append(mark);
      }
    }
    const typing = this.listTyping(channel, dm);
    if (typing) {
      const mark = el("span", "typing-row", typing.label);
      mark.title = typing.title;
      button.append(mark);
    }
    if (!dm && this.guildId && channelIsPrivate(this.guildId, channel.overwrites)) button.append(el("span", "channel-lock", "🔒"));
    if (muted) button.append(el("span", "faint", "muted"));
    else if (mentions > 0) button.append(el("span", "badge", String(mentions)));
    if (dm) {
      const close = el("span", "dm-close");
      close.setAttribute("role", "button");
      close.tabIndex = 0;
      close.setAttribute("aria-label", "Close DM");
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.closeDmChannel(channel);
      });
      button.append(close);
    }
    if (!dm) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openChannelMenu(channel, event.clientX, event.clientY);
      });
    }
    button.addEventListener("click", () => {
      this.drawer = false;
      if (channel.kind === "voice" || isStageChannel(channel)) {
        this.onVoiceChannel(channel);
        return;
      }
      if (channel.kind === "stage" && openStageChannel(channel.id)) return;
      if (channel.kind === "media" && openMediaChannel(channel.id)) return;
      void this.openChannel(channel.id);
    });
    if (dm && this.hookOn("pinDms") && this.dmPins.has(channel.id)) {
      button.classList.add("is-pinned");
      button.append(el("span", "faint", "pinned"));
    }
    if (dm) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openDmMenu(channel, event.clientX, event.clientY);
      });
    }
    return button;
  }

  private hiddenStamp(): string {
    if (!this.guildId || !this.hookOn("showHidden")) return "";
    return unseenChannels(this.channelsOf(this.guildId), (channel) => this.canSeeChannel(this.guildId!, channel))
      .map((channel) => `${channel.id}:${this.pack.hiddenTopics ? channel.topic ?? "" : ""}`)
      .join(",");
  }

  private appendHiddenChannels(scroll: HTMLElement) {
    if (!this.guildId || !this.hookOn("showHidden")) return;
    const hidden = unseenChannels(this.channelsOf(this.guildId), (channel) => this.canSeeChannel(this.guildId!, channel));
    if (!hidden.length) return;
    scroll.append(el("div", "category", "Hidden"));
    for (const channel of hidden) scroll.append(this.lockedChannelRow(channel));
  }

  private lockedChannelRow(channel: Channel): HTMLButtonElement {
    const row = el("button", "channel-row is-locked");
    row.type = "button";
    row.title = "You can't view this channel";
    row.append(el("span", "channel-lock", "🔒"));
    const copy = el("span", "row-copy");
    copy.append(el("span", "row-label", channel.name));
    if (this.pack.hiddenTopics && channel.topic) copy.append(el("span", "dm-preview", channel.topic));
    row.append(copy);
    row.addEventListener("click", () => this.toast("Hidden channel", "You can't view this channel."));
    return row;
  }

  private spotifyStamp(): string {
    const track = this.currentSpotify();
    return track ? `${track.title}:${track.artist}:${track.url}` : "";
  }

  private currentSpotify() {
    if (!this.hookOn("spotify")) return null;
    const me = this.demo ? people[0] : this.me;
    const contents = this.pack.spotifyLinks && this.channelId ? (this.pages[this.channelId] ?? []).map((message) => message.content) : [];
    return playerTrack(me.activity ?? "", contents, this.pack.spotifyPresence, this.pack.spotifyLinks);
  }

  private spotifyPlayer(): HTMLElement | null {
    const track = this.currentSpotify();
    if (!track) return null;
    const panel = el("section", "spotify-player");
    panel.setAttribute("aria-label", "Spotify");
    panel.append(el("strong", "", this.maskText(track.title)));
    if (track.artist) panel.append(el("span", "", this.maskText(track.artist)));
    const open = el("a", "text-button", "Open");
    open.href = openTarget(track);
    open.target = "_blank";
    open.rel = "noreferrer noopener";
    panel.append(open);
    return panel;
  }

  private historyLimit(): number {
    return this.bench ? 80 : HISTORY_PAGE;
  }

  private currentChannel(): Channel | undefined {
    const lists = this.demo ? Object.values(demoChannels) : Object.values(this.liveChannels);
    return [...this.visibleChannels(), ...this.dmChannels(), ...lists.flat()].find((channel) => channel.id === this.channelId);
  }

  /** Demo history is local, so paint it once instead of a skeleton and a second pass. */
  private seedDemoPage(id: string) {
    if (!this.demo || id === ARCHIVE || this.pages[id]?.length) return;
    const page = pageMessages(this.bench ? benchHistory(id) : (history[id] ?? []), undefined, this.historyLimit());
    this.pages[id] = page.messages;
    this.more[id] = page.hasMore;
    this.loading = false;
    for (const message of page.messages) this.absorbMessage(message);
    if (this.divider[id]) return;
    const marker = firstUnreadId(page.messages.map((message) => message.id), this.lastRead[id]);
    const unread = this.unread[id] ?? 0;
    if (marker) this.divider[id] = marker;
    else if (unread > 0) this.divider[id] = page.messages[Math.max(0, page.messages.length - unread)]?.id ?? null;
  }

  private async openChannel(id: string) {
    if (this.holdShell) return;
    this.revealShell();
    this.prefetchToken += 1;
    const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
    if (perf) {
      perf.lastSwitch = -1;
      perf.switchAt = performance.now();
    }
    const started = performance.now();
    this.channelId = id;
    const missed = dropChannel(this.missed, id);
    if (missed.length !== this.missed.length) {
      this.missed = missed;
      this.saveMissed();
    }
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
    const cached = this.pages[id];
    if (cached?.length) {
      const visible = initialHistory(cached, this.historyLimit());
      if (visible.length !== cached.length) {
        this.pages[id] = visible;
        this.more[id] = true;
      } else if (this.more[id] === undefined) {
        this.more[id] = visible.length >= this.historyLimit();
      }
      this.loading = false;
    } else {
      this.loading = true;
    }
    if (!this.holdRead()) {
      this.localUnread[id] = 0;
      this.localMentions[id] = 0;
      this.behind[id] = false;
      if (!this.jumpId) {
        const seen = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
        this.markers[id] = { lastMessageId: seen, mentionCount: 0 };
      }
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
    this.seedDemoPage(id);
    this.openedAt = performance.now();
    this.msgSig = "";
    this.friendsOpen = false;
    this.clipsOpen = false;
    this.paintMessages();
    if (perf) perf.lastSwitch = performance.now() - started;
    window.setTimeout(() => this.finishChannelChrome(id), 0);
    if (this.demo && this.pages[id]?.length) {
      if (perf && perf.switchAt) perf.lastLoad = performance.now() - perf.switchAt;
      const last = this.pages[id].at(-1);
      if (!this.jumpId && last) this.ackChannel(id, last.id);
      return;
    }
    await this.reconcileChannel(id);
  }

  /** Header, channel selection, and composer. Members, threads, and prefetch stay off this path. */
  private finishChannelChrome(id: string) {
    if (this.channelId !== id || this.holdShell) return;
    this.applyAppearance();
    this.paintRail();
    this.paintChannels();
    this.paintHeader();
    this.paintSplit();
    this.paintVoice();
    this.paintComposer();
    this.syncBadge();
    this.paintMembers();
    if (!this.bench) {
      void loadThreadsUi().then(() => {
        if (this.channelId === id) this.paintHeader();
      });
    }
    const token = this.prefetchToken;
    const idle = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 0 }), 48));
    idle(() => {
      if (this.channelId !== id || token !== this.prefetchToken) return;
      const opened = this.currentChannel();
      if (opened && (opened.kind === "text" || opened.kind === "forum" || opened.kind === "announcement" || opened.kind === "thread")) {
        void this.loadThreads(id);
      }
      if (!this.demo && this.guildId) {
        const prefix = `${this.guildId}:${id}:`;
        if (!this.memberRanges.startsWith(prefix)) this.queueMemberSubscribe(this.guildId, id, [[0, 99]]);
      }
      this.prefetchAround(id);
    });
  }

  private async reconcileChannel(id: string) {
    const hadCache = Boolean(this.pages[id]?.length);
    try {
      if (this.demo && id === ARCHIVE) throw new Error("Couldn't load messages in #archive.");
      const page = this.demo
        ? pageMessages(this.bench ? benchHistory(id) : (history[id] ?? []), undefined, this.historyLimit())
        : await this.livePage(id);
      const next = reconcileHistory(this.pages[id] ?? [], page.messages);
      this.pages[id] = next;
      this.more[id] = page.hasMore || next.length > page.messages.length;
      for (const message of page.messages) this.absorbMessage(message);
      if (!this.divider[id]) {
        const marker = firstUnreadId(next.map((message) => message.id), this.lastRead[id]);
        const unread = this.unread[id] ?? 0;
        const before = this.divider[id];
        if (marker) this.divider[id] = marker;
        else if (unread > 0) this.divider[id] = next[Math.max(0, next.length - unread)]?.id ?? null;
        if (this.divider[id] !== before) this.msgSig = "";
      }
      this.loading = false;
      if (this.channelId !== id) return;
      if (!this.jumpId && this.pinnedToBottom) this.scroll = "bottom";
      this.paintMessages();
      const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
      if (perf && perf.switchAt) perf.lastLoad = performance.now() - perf.switchAt;
      const last = next.at(-1);
      if (!this.jumpId && last) this.ackChannel(id, last.id);
    } catch (err) {
      this.loading = false;
      if (this.channelId !== id) return;
      const message = err instanceof Error ? err.message : "Couldn't load messages.";
      if (hadCache && (this.pages[id]?.length ?? 0) > 0) this.toast("History", message);
      else {
        this.error = message;
        this.msgSig = "";
        this.paintMessages();
      }
    }
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
    const key = `GET /channels/${id}/messages${before ? `?before=${before}` : ""}`;
    const cached = readRestCache(this.restPages, key, Date.now(), REST_PAGE_TTL_MS);
    const batch = cached ?? await invoke<RawMessage[]>("fetch_messages", { channelId: id, before });
    if (!cached) writeRestCache(this.restPages, key, batch, Date.now());
    const messages = [...batch].reverse().map(normalizeMessage);
    for (const message of messages) this.absorbMessage(message);
    return { messages, hasMore: batch.length >= HISTORY_PAGE };
  }

  private async loadOlder(force = false) {
    const id = this.channelId;
    if (!id || this.loading || !this.more[id] || (!force && performance.now() - this.openedAt < 300)) return;
    const loaded = this.pages[id] ?? [];
    if (!loaded.length) return;
    this.loading = true;
    try {
      const page = this.demo
        ? pageMessages(history[id] ?? [], loaded[0].id, HISTORY_PAGE)
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
    bindParityHost(this.parityHost());
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
      : this.friendsOpen && !this.guildId ? (this.dashboardOpen ? "Activity" : "Friends") : channel ? (channel.kind === "dm" || channel.kind === "group" ? this.maskText(channel.name) : this.channelHeading(channel)) : "Lark";
    row.append(el("h2", "", heading));
    if (this.demo) row.append(el("span", "demo-pill", "Demo"));
    if (this.streamerOn() || this.streamerSafeOn()) row.append(el("span", "demo-pill", "Streamer"));
    if (this.holdRead() || this.hideActivity()) row.append(el("span", "demo-pill", "Incognito"));
    title.append(row);
    if (channel?.topic) title.append(el("div", "topic", this.maskText(channel.topic)));
    const threadBar = threadsNow()?.parityThreadBar() ?? null;
    if (threadBar) title.append(threadBar);
    const actions = el("div", "head-actions");
    if (this.holdRead() && this.channelId) {
      const mark = el("button", "text-button", "Mark read");
      mark.type = "button";
      const channelId = this.channelId;
      mark.addEventListener("click", () => this.markRead([channelId]));
      actions.append(mark);
    }
    if (this.hookOn("mentionDigest")) {
      const total = digestTotal(this.mentionDigestRows());
      const digest = el("button", "text-button", total ? `Mentions ${total}` : "Mentions");
      digest.type = "button";
      digest.setAttribute("aria-label", "Mention digest");
      digest.addEventListener("click", () => {
        this.digestOpen = !this.digestOpen;
        this.paintDigest();
      });
      actions.append(digest);
    }
    const search = el("button", "icon-button");
    search.type = "button";
    search.title = `Command palette (${formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os)})`;
    search.setAttribute("aria-label", "Command palette");
    search.append(icon(paths.search));
    search.addEventListener("click", () => this.openSwitcher());
    const find = el("button", "icon-button");
    find.type = "button";
    find.title = "Search messages (from:, mentions:, has:, before:, after:, in:, pinned:)";
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
    const feed = el("button", `text-button${this.dashboardOpen ? " is-on" : ""}`);
    feed.type = "button";
    feed.textContent = "Feed";
    feed.title = "Dashboard";
    feed.setAttribute("aria-label", "Dashboard");
    feed.setAttribute("aria-pressed", this.dashboardOpen ? "true" : "false");
    feed.addEventListener("click", () => this.toggleDashboard());
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
    const parityButtons = threadsNow()?.parityHeaderButtons() ?? [];
    const headerButtons = [search, find, pin, ...parityButtons, saved, feed, split, theme, members, bell];
    actions.append(...headerButtons);
    if (this.hookOn("readAll")) actions.append(this.readAllButton());
    const help = el("button", "icon-button");
    help.type = "button";
    help.title = "Help";
    help.setAttribute("aria-label", "Help");
    help.textContent = "?";
    help.addEventListener("click", () => externalLink(DISCORD_LINKS.help));
    actions.append(help);
    this.chatHead.append(title, actions);
    threadsNow()?.mountChannelPolls(this.messagesEl);
  }

  private cycleNotify() {
    if (!this.channelId) return;
    const order: NotifyLevel[] = ["all", "mentions", "mute"];
    const current = this.levelFor(this.guildId, this.channelId);
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.config.notifications.channels[this.channelId] = next === "mute" ? { muted: true } : { level: next, muted: false };
    this.stageNotify(this.guildId, this.channelId, next);
    this.persist();
    void this.writeNotify(this.guildId, this.channelId, next);
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

  /**
   * The first message line that still crosses the scroller's top edge.
   * Day and unread separators live inside `.message-wrap`, so the wrap's box
   * moves when a separator hops onto a newly prepended message. Anchoring the
   * line itself keeps the text the reader was looking at from jumping.
   */
  private readingLine(): { id: string; top: number } | null {
    const edge = this.messagesEl.getBoundingClientRect().top;
    for (const wrap of this.messagesEl.querySelectorAll<HTMLElement>(".message-wrap")) {
      const id = wrap.dataset.mid;
      if (!id) continue;
      const line = wrap.querySelector<HTMLElement>(":scope > .message, :scope > .system-line") ?? wrap;
      const rect = line.getBoundingClientRect();
      if (rect.bottom > edge + 1) return { id, top: rect.top };
    }
    return null;
  }

  private holdReadingLine(reading: { id: string; top: number } | null) {
    if (!reading) return;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(reading.id) : reading.id;
    const wrap = this.messagesEl.querySelector<HTMLElement>(`[data-mid="${escaped}"]`);
    const line = wrap?.querySelector<HTMLElement>(":scope > .message, :scope > .system-line") ?? wrap;
    if (!line) return;
    const shift = line.getBoundingClientRect().top - reading.top;
    if (Math.abs(shift) < 1) return;
    this.messagesEl.scrollTop += shift;
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
    bindLazyMedia(scroller);
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
    return messageSignature(list);
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
      if (this.blockedIds.has(message.authorId) && !this.hookOn("hideBlocked")) {
        parent.append(renderBlockedMessage());
        lastDay = new Date(message.timestamp).toDateString();
        previous = { authorId: message.authorId, timestamp: message.timestamp, kind: message.kind };
        continue;
      }
      const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
        settings,
        hiddenAuthors: hidden,
        blockedAuthors: this.blockedIds,
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
        onImage: (url) => this.openImage(url),
        ...this.messageChrome(message, shown),
        ...this.messageExtras(message),
        clock: this.timeClock(),
        seen: this.messageSeen(channelId, message.id),
      });
      if (this.pickerFor === message.id) node.append(this.emojiPicker((emoji, emojiId) => this.toggleReaction(message, emoji, emojiId)));
      node.dataset.mid = message.id;
      this.bindMessageMenu(node, message);
      if (this.hookOn("userWhois")) this.watchMessageWhois(node, message);
      if (this.hookOn("emoteClone")) this.watchEmoteClone(node);
      if (this.hookOn("imageSearch")) this.watchImageSearch(node);
      this.markJumbo(node, shown.raw);
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
    if (this.hookOn("typingList")) this.paintChannels();
  }

  private listTyping(channel: Channel, dm: boolean): { label: string; title: string } | null {
    if (!this.hookOn("typingList")) return null;
    if (dm ? !this.pack.typingDms : !this.pack.typingChannels) return null;
    return typingLabel(this.typingNames, channel.id, Date.now());
  }

  private paintMessages() {
    try {
      this.paintMessageList();
    } catch (error) {
      reportCrash(error);
    }
    threadsNow()?.mountChannelPolls(this.messagesEl);
  }

  private paintMessageList() {
    if (this.holdShell) return;
    if (this.clipsOpen) {
      this.paintClipLibrary();
      return;
    }
    if (this.friendsOpen && !this.guildId) {
      if (this.dashboardOpen && !this.clipsOpen) {
        if (this.friendTick) {
          window.clearTimeout(this.friendTick);
          this.friendTick = 0;
        }
        this.paintDashboard(this.messagesEl, false);
        return;
      }
      this.paintFriends();
      return;
    }
    this.paintTyping();
    const id = this.channelId;
    let list = id ? this.pages[id] ?? [] : [];
    if (id && list.length) list = this.windowMessages(id, list);
    if (id && this.hookOn("messageLog") && this.pack.logDeleted) list = overlayDeletes(list, this.pack.messageLog, id);
    const receiptCursor = this.channelId ? this.pack.seenCursors[this.channelId] ?? "" : "";
    const pluginStamp = `${this.pack.bookmarks.length}:${this.reminders.length}:${this.streamerOn() ? 1 : 0}:${this.streamerSafeOn() ? 1 : 0}:${this.blockedIds.size}:${this.pack.privacy.spoilerDefault}:${this.channelId ? this.pack.privacy.spoilerChannels[this.channelId] ?? "" : ""}:${this.pack.hiddenAuthors.length}:${Object.keys(this.translated).length}:${this.relativeClock() ? Math.floor(this.clock / 30_000) : 0}:${this.pack.mediaCompact}:${this.pack.mediaPreviews}:${this.pack.timeMode}:${this.pack.timeHours}:${this.pack.voiceDownloadScope}:${this.pack.originalImageAction}:${this.config.plugins.enabled.join(",")}:${this.logStamp()}:${receiptCursor}:${this.pack.showReceipts ? 1 : 0}:${this.pack.wordMin}`;
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
      this.noteLocalReceipts();
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
      this.noteLocalReceipts();
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
      this.noteLocalReceipts();
      return;
    }
    this.noteMessagePaint("replace");
    const reading = intent === "preserve" ? this.readingLine() : null;
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
      } else {
        this.holdReadingLine(reading);
      }
    });
    this.watchMessageLayout();
    this.msgSig = sig;
    this.noteLocalReceipts();
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

  private dashboardHome(): boolean {
    return this.dashboardOpen && this.friendsOpen && !this.guildId && !this.clipsOpen;
  }

  private dashboardDock(): boolean {
    return this.dashboardOpen && !this.dashboardHome();
  }

  private watchDashboardVisibility() {
    if (this.dashboardVis) return;
    this.dashboardVis = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stopDashboardTick();
      else if (this.dashboardOpen) this.refreshDashboard();
    });
  }

  private ensureDashboard() {
    this.watchDashboardVisibility();
    if (this.dashboardMod) return Promise.resolve(this.dashboardMod);
    if (!this.dashboardLoading) {
      this.dashboardLoading = import("./dashboard").then((mod) => {
        this.dashboardMod = mod;
        return mod;
      });
    }
    return this.dashboardLoading;
  }

  private stopDashboardTick() {
    if (!this.dashboardTick) return;
    window.clearTimeout(this.dashboardTick);
    this.dashboardTick = 0;
  }

  private refreshDashboard() {
    if (!this.dashboardOpen) return;
    this.dashboardSig = "";
    if (this.dashboardHome()) this.paintMessages();
    else this.paintMembers();
  }

  private toggleDashboard() {
    this.dashboardOpen = !this.dashboardOpen;
    this.dashboardSig = "";
    this.msgSig = "";
    this.memberShape = "";
    if (this.dashboardOpen) this.watchDashboardVisibility();
    else this.stopDashboardTick();
    this.paint();
  }

  private showActivity() {
    this.dashboardOpen = true;
    this.friendsOpen = true;
    this.clipsOpen = false;
    this.channelId = "";
    this.drawer = false;
    this.dashboardSig = "";
    this.msgSig = "";
    this.memberShape = "";
    this.watchDashboardVisibility();
    this.paint();
  }

  private dashboardPeople(): Person[] {
    const byId = new Map<string, Person>();
    for (const person of this.friends) {
      if (person.id && person.id !== this.meId()) byId.set(person.id, person);
    }
    for (const voice of Object.values(this.voiceRoster)) {
      if (!voice.channelId || !voice.userId || voice.userId === this.meId() || byId.has(voice.userId)) continue;
      const known = this.directory[voice.userId];
      byId.set(voice.userId, known ?? {
        id: voice.userId,
        name: voice.name || "Someone",
        avatarUrl: voice.avatarUrl,
        status: "online",
      });
    }
    return [...byId.values()];
  }

  private armDashboardTick(ticking: boolean) {
    this.stopDashboardTick();
    if (!this.dashboardOpen || !ticking || document.hidden) return;
    this.dashboardTick = window.setTimeout(() => {
      this.dashboardTick = 0;
      this.refreshDashboard();
    }, 1000);
  }

  private paintDashboard(host: HTMLElement, dock: boolean) {
    void this.ensureDashboard().then((mod) => {
      if (!this.dashboardOpen || !host.isConnected) return;
      if (dock ? !this.dashboardDock() : !this.dashboardHome()) return;
      const model = mod.dashboardFeed({
        people: this.dashboardPeople(),
        relationships: this.relationships,
        voices: Object.values(this.voiceRoster).flatMap((person) => person.channelId && person.userId !== this.meId() ? [{
          userId: person.userId,
          guildId: person.guildId,
          channelId: person.channelId,
          sharing: person.sharing,
          streamLabel: person.streamLabel,
          name: person.name,
          avatarUrl: person.avatarUrl,
        }] : []),
        meId: this.meId(),
        now: Date.now(),
        place: (guildId, channelId) => ({
          guild: this.guilds().find((guild) => guild.id === guildId)?.name ?? "",
          channel: this.channelsOf(guildId).find((channel) => channel.id === channelId)?.name ?? "",
        }),
      });
      const masked = {
        ...model,
        rows: model.rows.map((row) => ({
          ...row,
          name: this.maskText(row.name),
          text: this.maskText(row.text),
        })),
      };
      const sig = `${dock ? "dock" : "home"}|${mod.dashboardSig(masked)}`;
      if (sig === this.dashboardSig && host.querySelector(".dash-feed")) {
        this.armDashboardTick(masked.ticking);
        return;
      }
      this.dashboardSig = sig;
      mod.renderDashboard(host, masked, {
        onOpen: (id) => {
          const person = this.dashboardPeople().find((item) => item.id === id) ?? this.personFromRelationship(id);
          if (person) this.openProfile(person);
        },
        onWatch: (id) => this.watchFriend(id),
        onJoin: (id) => this.joinFriendVoice(id),
        onAccept: (id) => void this.changeRelationship(id, "friend"),
        onIgnore: (id) => void this.changeRelationship(id, "ignore"),
        onCancel: (id) => void this.changeRelationship(id, "remove"),
      }, dock);
      this.armDashboardTick(masked.ticking);
    }).catch(() => undefined);
  }

  private paintFriends() {
    if (this.dashboardOpen && !this.guildId) return;
    this.loadRelationships();
    const noteSig = Object.entries(this.notes).map(([id, note]) => `${id}:${note}`).join(",");
    const relSig = this.relationships.map((row) => `${row.id}:${row.kind}:${row.nickname}`).join(",");
    const voiceSig = Object.values(this.voiceRoster).map((person) => `${person.userId}:${person.channelId}:${person.sharing ? 1 : 0}`).join(",");
    const sig = `friends|${this.friendTab}|${pendingFriendCount()}|${this.streamerOn() ? 1 : 0}|${this.friends.map((person) => `${person.id}:${person.status}:${person.custom}:${person.activity}:${person.rich?.startedAt ?? ""}:${serverTagText(person.serverTag)}`).join(",")}|${noteSig}|${relSig}|${voiceSig}|${Math.floor(Date.now() / 15000)}`;
    if (sig === this.msgSig) return;
    this.msgSig = sig;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    const roster = sortPeople(this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends);
    const visible = friendsForTab(roster, this.friendTab);
    const groups = this.friendTab === "all"
      ? [
          ["Online", visible.filter((person) => person.status === "online")],
          ["Idle", visible.filter((person) => person.status === "idle")],
          ["Do not disturb", visible.filter((person) => person.status === "dnd")],
          ["Offline", visible.filter((person) => person.status !== "online" && person.status !== "idle" && person.status !== "dnd")],
        ] as const
      : [
          ["Online", visible.filter((person) => person.status === "online")],
          ["Idle", visible.filter((person) => person.status === "idle")],
          ["Do not disturb", visible.filter((person) => person.status === "dnd")],
        ] as const;
    const voices: Record<string, VoiceSpot | null> = {};
    for (const person of roster) voices[person.id] = voiceSpotFor(Object.values(this.voiceRoster), person.id);
    const now = Date.now();
    const active: ActiveCardModel[] = activeNowCards(roster, voices, now).map((card) => ({
      ...card,
      name: this.maskText(card.name),
      line: this.maskText(card.line),
      detail: this.maskText(card.detail),
    }));
    const rowFor = (person: Person): FriendRowModel => {
      const nick = this.relationshipFor(person.id)?.nickname || person.friendNick || "";
      return {
        id: person.id,
        name: this.maskText(nick || person.name),
        status: person.status ?? "offline",
        line: this.maskText(friendActivityText(person, now) || memberSubtitle(person) || statusLabel(person.status)),
        tag: serverTagText(person.serverTag),
        note: this.maskText(this.notes[person.id] ?? ""),
        avatarUrl: person.avatarUrl,
      };
    };
    const pendingRow = (row: SocialRelationship, incoming: boolean): PendingRowModel => ({
      id: row.id,
      name: this.maskText(row.nickname || row.name),
      username: this.maskText(row.username),
      incoming,
      avatarUrl: row.avatarUrl,
    });
    renderFriendsBoard(this.messagesEl, {
      tab: this.friendTab,
      pending: pendingFriendCount(),
      groups: groups.map(([label, people]) => ({ label, people: people.map(rowFor) })),
      incoming: this.relationships.filter((row) => row.kind === "incoming").map((row) => pendingRow(row, true)),
      outgoing: this.relationships.filter((row) => row.kind === "outgoing").map((row) => pendingRow(row, false)),
      active: this.friendTab === "pending" || this.friendTab === "add" ? [] : active,
    }, {
      onTab: (tab) => {
        this.friendTab = tab;
        this.msgSig = "";
        this.paintFriends();
      },
      onOpen: (id) => {
        const person = roster.find((item) => item.id === id) ?? this.personFromRelationship(id);
        if (person) this.openProfile(person);
      },
      onMessage: (id) => void this.openDm(id),
      onAccept: (id) => void this.changeRelationship(id, "friend"),
      onIgnore: (id) => void this.changeRelationship(id, "ignore"),
      onCancel: (id) => void this.changeRelationship(id, "remove"),
      onAdd: (username) => void this.addFriendUsername(username),
      onWatch: (id) => this.watchFriend(id),
      onJoinVoice: (id) => this.joinFriendVoice(id),
    });
    if (this.friendTick) window.clearTimeout(this.friendTick);
    if (active.some((card) => card.elapsed)) {
      this.friendTick = window.setTimeout(() => {
        this.friendTick = 0;
        if (!this.friendsOpen || this.dashboardOpen) return;
        this.msgSig = "";
        this.paintFriends();
      }, 1000);
    }
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
    const roster = this.demo ? (this.bench ? benchPeople() : people) : this.liveMembers;
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
    const sorted = applyMemberListSort(rows, this.memberListSort);
    rows.length = 0;
    rows.push(...sorted);
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
    return `${this.guildId}|${this.memberListSort}|${note}|${more ? 1 : 0}|${body}`;
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
    if (this.dashboardDock()) {
      this.membersEl.hidden = false;
      this.paintDashboard(this.membersEl, true);
      return;
    }
    if (this.membersEl.querySelector(".dash-feed")) {
      this.memberShape = "";
      this.dashboardSig = "";
      clear(this.membersEl);
    }
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
    const sort = el("button", "text-button", MEMBER_LIST_SORTS.find((item) => item.id === this.memberListSort)?.label ?? "Sort");
    sort.type = "button";
    sort.setAttribute("aria-label", "Sort member list");
    sort.addEventListener("click", (event) => {
      const rect = sort.getBoundingClientRect();
      this.closeContextMenu();
      this.contextMenuEl = mountMenu(rect.left, rect.bottom + 4, MEMBER_LIST_SORTS.map((item) => ({
        id: item.id,
        label: item.label,
        hint: item.id === this.memberListSort ? "On" : "",
      })), (id) => {
        if (id === "status" || id === "name" || id === "activity") this.memberListSort = id;
        this.closeContextMenu();
        this.memberShape = "";
        this.paintMembers();
      });
      event.stopPropagation();
    });
    head.append(sort);
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
    const shownName = this.hookOn("localNicks") ? displayName(this.pack.localNicks, person.id, person.name) : person.name;
    const name = el("strong", "", this.maskText(shownName));
    if (color) name.style.color = color;
    const title = el("div", "member-name");
    title.append(name);
    if (person.bot) title.append(el("span", "bot-tag", "BOT"));
    const line = this.maskText(memberSubtitle(person));
    copy.append(title);
    if (line) copy.append(el("span", "", line));
    row.append(wrap, copy);
    row.addEventListener("click", () => this.openProfile(person));
    if (this.hookOn("userWhois")) {
      row.addEventListener("mouseenter", (event) => this.showWhois(person, event.clientX, event.clientY));
      row.addEventListener("mouseleave", () => this.hideWhoisSoon());
    }
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
    this.noteLoggedDelete(message);
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

  private settingsNow(): SettingsPages | null {
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

  private paneFromSettings(render: (pages: SettingsPages) => HTMLElement): HTMLElement {
    const pages = this.settingsNow();
    if (pages) return render(pages);
    const wrap = el("div", "settings-stack");
    wrap.append(el("p", "setting-help", "Loading settings"));
    return wrap;
  }

  private settingsPane(): HTMLElement {
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

  private paneUpdates(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Updates", "Lark checks for an app update and an interface bundle on startup and every 30 minutes. A voice call finishes before either one reloads."));
    const card = settingCard("This computer");
    card.append(settingRow("updates.version", "Current version", "The version of Lark running on this computer.", el("span", "hint", this.updates.currentVersion || "3.0.3")));
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
    card.append(settingRow("updates.check", "Check for updates", "Look for a Lark update now.", check));
    card.append(el("p", "setting-help", updatesStatus(this.updates)));
    if (!isTauri()) card.append(el("p", "setting-help", "Updates install from the macOS and Windows apps."));
    const notes = this.updates.offer?.notes.trim();
    if (notes && this.updates.skippedVersion !== this.updates.offer?.version) {
      card.append(el("p", "setting-help", notes.length > 1200 ? `${notes.slice(0, 1199).trimEnd()}…` : notes));
    }
    wrap.append(card);
    const uiCard = settingCard("Interface");
    uiCard.append(settingRow("updates.ui", "Interface build", "The interface loaded in this window. Built-in is the one packaged with the app.", el("span", "hint", interfaceBuildLabel(this.interfaceUi.snapshot))));
    uiCard.append(settingRow(
      "updates.channel",
      "Interface channel",
      "Stable or Canary. Canary gets each interface build. Stable gets a promoted build.",
      segmentControl(["stable", "canary"], this.interfaceUi.snapshot.channel, (value) => {
        void this.setInterfaceChannel(value === "canary" ? "canary" : "stable");
      }, { stable: "Stable", canary: "Canary" }),
      true,
    ));
    const checkUi = el("button", "text-button", this.interfaceUi.checking ? "Checking…" : "Check now");
    checkUi.type = "button";
    checkUi.disabled = this.interfaceUi.checking;
    checkUi.addEventListener("click", () => void this.checkInterface(true));
    uiCard.append(settingRow("updates.interface", "Check now", "Look for an interface bundle now.", checkUi));
    const resetUi = el("button", "text-button", "Reset to built-in UI");
    resetUi.type = "button";
    resetUi.addEventListener("click", () => void this.resetInterface());
    uiCard.append(settingRow("updates.reset", "Reset to built-in UI", "Drop the downloaded interface and load the one packaged with Lark.", resetUi));
    if (this.interfaceUi.error) uiCard.append(el("p", "setting-help", this.interfaceUi.error));
    else if (this.interfaceUi.note) uiCard.append(el("p", "setting-help", this.interfaceUi.note));
    if (!isTauri()) uiCard.append(el("p", "setting-help", "Interface updates install from the macOS and Windows apps."));
    wrap.append(uiCard);
    return wrap;
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
    const accountPages = this.settingsNow();
    wrap.append(who, session, ...(accountPages ? accountPages.renderAccountDetails(this.settingsHost()) : []));
    return wrap;
  }

  private settingsHost() {
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

  private openNetworkPanel() {
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

  private pollVoiceTraffic() {
    if (!trafficArmed()) return;
    void invoke<string>("voice_diagnostics").then((text) => {
      if (trafficArmed()) noteVoiceDiagnostics(text);
    }).catch(() => undefined);
  }

  private disarmNetwork() {
    setTrafficArmed(false);
    window.clearInterval(this.netVoiceTimer);
    this.netVoiceTimer = 0;
    this.netPanel = null;
  }

  private closeNetworkPanel() {
    this.netTicket += 1;
    this.netOpening = false;
    const panel = this.netPanel;
    if (panel) panel.close();
    else this.disarmNetwork();
  }

  private paneAppearance(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Appearance", "Each card is that theme's own colours. One click applies it."));
    const appearancePages = this.settingsNow();
    if (appearancePages) wrap.append(appearancePages.colorModeCard(this.settingsHost()));
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
    text.append(this.sliderRow("appearance.size", "Font size", "Interface size, from 12 to 24.", this.config.appearance.font_size, 12, 24, (value) => {
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
    if (appearancePages) wrap.append(appearancePages.appIconCard(this.settingsHost()), appearancePages.mediaCard(this.settingsHost()));
    this.paintThemeGallery(wrap);
    return wrap;
  }

  private accentRow(): HTMLElement {
    const guild = this.guilds().find((item) => item.id === this.guildId);
    const stored = guild ? (this.config.accents[guild.id] ?? "") : "";
    const shown = normalizeHex(stored) || rgbToHex(getComputedStyle(this.root).getPropertyValue("--accent")) || "#fafafa";
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
    const notificationPages = this.settingsNow();
    if (notificationPages) card.append(...notificationPages.notificationExtras(this.settingsHost()));
    wrap.append(card, this.quietCard(), this.alertCard(), this.missedCard());
    return wrap;
  }

  private quietCard(): HTMLElement {
    const quiet = this.config.notifications.quiet;
    const card = settingCard("Quiet hours");
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

  private alertCard(): HTMLElement {
    const card = settingCard("Alerts");
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

  private missedCard(): HTMLElement {
    const card = settingCard("Missed");
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

  private clockRow(id: string, label: string, description: string, value: string, onChange: (value: string) => void): HTMLElement {
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
    return settingRow(id, label, description, input);
  }

  private commaRow(id: string, label: string, description: string, current: readonly string[], apply: (next: string[]) => void): HTMLElement {
    const input = el("input");
    input.type = "text";
    input.value = current.join(", ");
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      apply(cleanAlertList(input.value));
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return settingRow(id, label, description, input, true);
  }

  private openMissed(channelId: string) {
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
    const shortcutPages = this.settingsNow();
    wrap.append(card);
    if (shortcutPages) wrap.append(shortcutPages.discordKeybindCard(this.settingsHost()));
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
    this.ensureVoicePrefs();
    const wrap = el("div", "settings-stack");
    wrap.append(settingHead("Voice & Video", "Push to talk, voice activity, and Lark noise suppression (RNNoise) on the microphone."));
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
    input.append(this.switchRow("voice.noise", "Lark noise suppression", "RNNoise runs on the microphone when this is on. Echo cancellation is separate. Higher quality uses a spectral suppressor. This is not Krisp.", this.config.voice.noise_suppression, (value) => {
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
    this.appendVoiceLab(wrap);
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

  private voicePrefsLoaded = false;

  private ensureVoicePrefs() {
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

  private storeVoicePrefs() {
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

  private appendVoiceLab(wrap: HTMLElement) {
    registerSettingEntries([
      { id: "voice.mic-test", section: "voice", label: "Mic test", description: "Watch the microphone level.", keywords: "meter input" },
      { id: "voice.profiles", section: "voice", label: "Input profiles", description: "Saved microphone, input mode, and sensitivity.", keywords: "profile" },
      { id: "voice.echo", section: "voice", label: "Echo cancellation", description: "Subtract playback from the microphone.", keywords: "aec echo" },
      { id: "voice.quality", section: "voice", label: "Higher quality suppression", description: "Spectral noise suppression and a longer echo filter.", keywords: "aec spectral" },
      { id: "voice.agc", section: "voice", label: "Automatic gain control", description: "Keep the microphone at a steady level.", keywords: "agc volume" },
      { id: "voice.camera-test", section: "voice", label: "Camera test", description: "Preview the camera. In a call, the same picture is sent.", keywords: "video webcam" },
      { id: "voice.stream-preview", section: "voice", label: "Stream preview", description: "The current Go Live picture.", keywords: "share screen" },
      { id: "voice.sound-toggles", section: "voice", label: "Sound toggles", description: "Turn individual sounds on or off.", keywords: "soundboard" },
    ]);
    const test = settingCard("Mic test");
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
    const profiles = settingCard("Input profiles");
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
    const process = settingCard("Processing");
    process.append(this.switchRow("voice.echo", "Echo cancellation", "Subtracts the call playback from the microphone before noise suppression.", this.echoCancellation, (value) => {
      this.echoCancellation = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.quality", "Higher quality suppression", "Spectral noise suppression and a longer echo filter. Standard stays on RNNoise. This is not Krisp.", this.noiseQuality === "high", (value) => {
      this.noiseQuality = noiseQualityName(value ? "high" : "standard");
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.agc", "Automatic gain control", "Keeps a quiet microphone at a steady level. Silence stays silence.", this.agc, (value) => {
      this.agc = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    const camera = settingCard("Camera test");
    camera.dataset.setting = "voice.camera-test";
    const slot = el("div", "camera-preview-slot");
    slot.dataset.cameraTest = "";
    const open = el("button", this.cameraOn ? "text-button is-on" : "text-button", this.cameraOn ? "Stop camera" : "Test camera");
    open.type = "button";
    open.addEventListener("click", () => this.toggleCamera());
    camera.append(el("p", "setting-help", "The preview uses the camera above. In a voice channel the same frames are sent on the voice connection."), slot, open);
    const stream = settingCard("Stream preview");
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
    const profiles = settingCard("Game profiles");
    profiles.dataset.setting = "gaming.profiles";
    this.appendGameProfiles(profiles);
    wrap.append(mode, status, profiles);
    return wrap;
  }

  private panePlugins(): HTMLElement {
    const wrap = el("div", "settings-stack");
    const head = settingHead("Plugins and Themes", "Install from the store list, then turn an item on. Lark still runs with none installed.");
    const browse = el("button", "text-button", "Browse");
    browse.type = "button";
    browse.addEventListener("click", () => void this.openStorePage());
    head.append(browse);
    wrap.append(head);
    const card = settingCard("Plugins");
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
    const themeCard = settingCard("Themes");
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

  private storeCatalogCard(): HTMLElement {
    const card = settingCard("Store");
    card.dataset.setting = "plugins.store";
    if (!this.storeIndex) {
      card.append(el("p", "setting-help", this.storeIndexTried ? "The store could not be reached." : "Loading the store…"));
      return card;
    }
    const plugins = availableStoreItems(this.storeIndex, this.installed, "plugin");
    const themes = availableStoreItems(this.storeIndex, this.installed, "theme");
    if (!plugins.length && !themes.length) {
      card.append(el("p", "setting-help", "Everything in the store is installed."));
      return card;
    }
    const paint = (item: StoreItem) => {
      const busy = this.storeInstalling === item.id;
      const install = el("button", "text-button", busy ? "Installing…" : "Install");
      install.type = "button";
      install.disabled = this.storeInstalling !== "";
      install.addEventListener("click", () => void this.installFromCatalog(item.id));
      const needs = larkVersionOk(item.minLark, APP_VERSION) ? "" : ` · Needs Lark ${item.minLark}`;
      card.append(settingRow(`store.${item.id}`, item.name, `${item.description} · v${item.version}${needs}`, install));
    };
    if (plugins.length) card.append(el("h3", "", "Plugins"));
    for (const item of plugins) paint(item);
    if (themes.length) card.append(el("h3", "", "Themes"));
    for (const item of themes) paint(item);
    return card;
  }

  private async installFromCatalog(id: string) {
    if (this.storeInstalling) return;
    this.storeInstalling = id;
    if (this.settings && this.section === "plugins") this.renderSettings();
    const name = await this.installStoreItem(id);
    this.storeInstalling = "";
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  }

  private storeBlurb(item: InstalledRecord): string {
    const remote = this.storeIndex ? findStoreItem(this.storeIndex, item.id) : null;
    const update = remote && newerVersion(item.version, remote.item.version) ? " · Update available" : "";
    const description = item.description ? `${item.description} · ` : "";
    return `${description}v${item.version}${update}`;
  }

  private storeActions(item: InstalledRecord): HTMLElement {
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

  private async refreshPluginsPane() {
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

  private async openStorePage() {
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

  private async refreshStore() {
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

  private async installStoreItem(id: string): Promise<string | null> {
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

  private async updateStoreItem(id: string) {
    const name = await this.installStoreItem(id);
    if (!name) return;
    this.loaded.delete(id);
    this.themeCache.delete(id);
    if (this.config.plugins.enabled.includes(id)) await this.ensurePlugin(id);
    if (this.config.appearance.theme === id && !this.preferBuiltin) await this.applyTheme();
    this.toast("Store", `${name} is up to date.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  }

  private async uninstallStoreItem(id: string) {
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

  private setThemeEnabled(id: string, enabled: boolean) {
    if (enabled) {
      this.selectTheme(id);
      return;
    }
    if (this.config.appearance.theme !== id) return;
    this.preferBuiltin = true;
    localStorage.setItem("lark.theme.builtin", "1");
    void this.applyTheme();
    if (this.settings && this.section === "appearance") this.paintThemeGallery();
  }

  private async installFromLink(id: string) {
    const name = await this.installStoreItem(id);
    this.section = "plugins";
    this.openSettings();
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
  }

  private async listenForStoreLinks() {
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

  private runDiscordKeybind(event: KeyboardEvent, os: ReturnType<typeof browserPlatform>["os"]): boolean {
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
      this.openDiscord("https://discord.com/channels/@me");
      return true;
    }
    if (id === "toggle_inbox") {
      toggleInbox();
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
    const call = callKeyAction(id, this.currentChannel() ?? null, this.voice);
    if (call) {
      if (call.op === "join") {
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

  private toggleGifPicker() {
    toggleComposerPanel("gif");
    if (composerPanel() === "gif") scheduleGifLoad(gifQueryText());
    this.paintComposer();
  }

  private toggleStickerPicker() {
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

  private holdPushMute() {
    if (this.pushMuted) return;
    this.pushMuted = true;
    if (this.voice && !this.voice.muted) {
      this.mutedByPush = true;
      this.toggleMute();
    }
  }

  private releasePushMute() {
    if (!this.pushMuted) return;
    this.pushMuted = false;
    if (this.mutedByPush) {
      this.mutedByPush = false;
      if (this.voice?.muted) this.toggleMute();
    }
  }

  private openDiscord(url: string) {
    if (!url.startsWith("https://discord.com/")) return;
    if (!isTauri()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void invoke("open_discord_link", { url }).catch((err) => {
      this.toast("Discord", commandError(err, "Couldn't open Discord."));
    });
  }

  private async rememberCurrentAccount(id: string, name: string) {
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

  private async loadAccountOverview() {
    if (!isTauri() || this.demo) return;
    try {
      this.accountOverview = parseAccountOverview(await invoke("account_overview"));
      this.accountNote = "";
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't load the account from Discord.");
    }
    if (this.settings && (this.section === "account" || this.section === "connections")) this.renderSettings();
  }

  private async unlinkConnection(type: string, id: string) {
    if (!isTauri()) return;
    try {
      await invoke("remove_connection", { kind: type, id });
      await this.loadAccountOverview();
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't remove that connection.");
      if (this.settings) this.renderSettings();
    }
  }

  private async switchTo(id: string) {
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

  private async addAccount() {
    this.closeSettings();
    await this.forgetToken();
  }

  private async removeAccount(id: string) {
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

  private async logoutAccount() {
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

  private openImage(url: string) {
    if (this.lightbox !== url) this.lightboxZoom = 1;
    this.lightbox = url;
    this.paintLightbox();
  }

  private paintLightbox() {
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

  private openYoutube(url: string) {
    const id = youtubeId(url);
    if (!id) {
      this.toast("YouTube", "That embed doesn't have a video id.");
      return;
    }
    this.youtubeFloat = id;
    this.paintYoutubeFloat();
  }

  private paintYoutubeFloat() {
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

  private async shareLatestClip() {
    if (!this.clipItems.length) await this.loadClips();
    const clip = newestClip(this.clipItems);
    if (!clip) {
      this.toast("Clip", "No saved clip to send.");
      return;
    }
    const current = this.currentChannel();
    const sendable = current && current.kind !== "voice" && current.kind !== "category" ? current : undefined;
    if (!sendable) {
      this.toast("Clip", "Open a channel first.");
      return;
    }
    await this.deliverClip(clip.name, sendable.id);
  }

  private startUpdates() {
    this.updates = initialUpdateState(this.updates.currentVersion || "3.0.3", readAutoInstall(localStorage.getItem(AUTO_INSTALL_KEY)));
    if (!isTauri()) return;
    void this.watchForUpdates();
    void this.watchInterface();
  }

  private async watchForUpdates() {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();
      if (version) this.updates = { ...this.updates, currentVersion: version };
    } catch {
      this.updates = { ...this.updates, currentVersion: this.updates.currentVersion || "3.0.3" };
    }
    this.refreshUpdateUi();
    void this.checkForUpdates(false);
    window.clearInterval(this.updateTimer);
    this.updateTimer = window.setInterval(() => void this.checkForUpdates(false), UPDATE_CHECK_MS);
  }

  private async checkForUpdates(manual: boolean) {
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

  private followUpdate(step: UpdateStep) {
    if (step.effect === "download") void this.downloadPending();
    else if (step.effect === "install") void this.installPending();
  }

  private applyUpdateStep(step: UpdateStep) {
    this.updates = step.state;
    this.refreshUpdateUi();
    this.followUpdate(step);
  }

  private async downloadPending() {
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

  private async installPending() {
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

  private noteCallForUpdates() {
    const step = setInCall(this.updates, Boolean(this.voice));
    const interfaceUi = setInterfaceCall(this.interfaceUi, Boolean(this.voice));
    if (interfaceUi !== this.interfaceUi) {
      this.interfaceUi = interfaceUi;
      this.refreshInterfaceUi();
    }
    if (step.state === this.updates && step.effect === "none") return;
    this.applyUpdateStep(step);
  }

  private async watchInterface() {
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

  private async checkInterface(manual: boolean) {
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

  private async setInterfaceChannel(channel: InterfaceChannel) {
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

  private async resetInterface() {
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

  private async reloadInterface() {
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

  private refreshInterfaceUi() {
    this.paintInterfaceToast();
    if (this.settings && this.section === "updates") this.renderSettings();
  }

  private paintInterfaceToast() {
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

  private refreshUpdateUi() {
    this.paintUpdateBanner();
    if (this.settings && this.section === "updates") this.renderSettings();
  }

  private paintUpdateBanner() {
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

  private toast(title: string, body: string) {
    const toast = el("div", "toast");
    toast.append(el("strong", "", title), el("span", "", body));
    this.toastWrap.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  private loadMissed() {
    try {
      this.missed = sanitizeMissed(JSON.parse(localStorage.getItem(MISSED_KEY) ?? "[]"));
    } catch {
      this.missed = [];
    }
    const seen = Number(localStorage.getItem(MISSED_SEEN_KEY) ?? "0");
    this.missedSeen = Number.isFinite(seen) ? seen : 0;
  }

  private saveMissed() {
    localStorage.setItem(MISSED_KEY, JSON.stringify(this.missed));
    localStorage.setItem(MISSED_SEEN_KEY, String(this.missedSeen));
  }

  private deliverAlert(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, direct: boolean, body: string): boolean {
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

  private tickSmartNotify() {
    const quiet = inQuietHours(this.config.notifications.quiet, new Date());
    const ended = this.quietOn && !quiet;
    this.quietOn = quiet;
    if (ended) this.surfaceMissed("quiet");
  }

  private surfaceMissed(kind: "focus" | "quiet") {
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

  private cycleServer(delta: number) {
    const ids: (string | null)[] = [null, ...orderedGuildIds(this.guilds().map((guild) => guild.id), this.folders)];
    const next = stepServer(ids, this.guildId, delta);
    if (next !== this.guildId) this.selectGuild(next);
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
      await this.refreshStore();
    } catch {
      this.catalog = [];
      this.installed = [];
    }
    await Promise.all(this.config.plugins.enabled.map((id) => this.ensurePlugin(id)));
    if (isTauri()) void this.listenForStoreLinks();
  }

  private async ensurePlugin(id: string): Promise<boolean> {
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

  private persist(): Promise<void> {
    localStorage.setItem("lark.config.v1", JSON.stringify(this.config));
    if (!isTauri()) return Promise.resolve();
    return invoke("save_config", { config: this.config }).then(
      () => undefined,
      (err: unknown) => {
        this.toast("Settings", commandError(err, "Couldn't save settings."));
      },
    );
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
      if (was !== status.recording && (this.config.privacy.streamer_auto || (this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoShare))) this.noteCapture();
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
      this.clipPlayNote = "";
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
    this.refreshVoicePortraits();
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

  private notePresence(userId: string, status: Person["status"], custom: string, activity: string, rich?: Person["rich"]) {
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

  private openProfile(person: Person, statusPicker = false, serverEditor = false) {
    this.popout = person;
    this.statusOpen = statusPicker;
    this.profileFull = false;
    this.serverEditor = serverEditor;
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
    this.refreshVoicePortraits();
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
    const next = visibleStatus(this.hideActivity(), this.hideActivity(), this.me.custom ?? "", this.connection);
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
        const ping = (event as { pingMs?: number; endpoint?: string; mode?: string }).pingMs;
        if (ping !== undefined || (event as { endpoint?: string }).endpoint) {
          this.voiceDetails = voiceLinkDetails({
            pingMs: ping,
            endpoint: (event as { endpoint?: string }).endpoint ?? this.voiceDetails.endpoint,
            mode: (event as { mode?: string }).mode || this.voiceDetails.mode || detail,
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
    return this.scrubText(value);
  }

  private streamerSafeOn(): boolean {
    return streamerSafeActive({
      enabled: this.hookOn("streamerSafe"),
      manual: this.pack.privacy.streamerManual,
      autoObs: this.pack.privacy.streamerAutoObs,
      obs: obsDetected([this.frontApp, this.detectedGame]),
      autoShare: this.pack.privacy.streamerAutoShare,
      sharing: this.shareOn || Boolean(this.clipStatus?.recording),
    });
  }

  private hideDirect(): boolean {
    return this.streamerOn() || (this.streamerSafeOn() && this.pack.privacy.streamerDms);
  }

  private scrubText(value: string): string {
    const safe = this.streamerSafeOn();
    if (!this.streamerOn() && !safe) return value;
    let text = this.streamerOn() || (safe && this.pack.privacy.streamerEmails) ? redactSensitive(value) : value;
    if (safe) text = redactStreamerText(text, { phones: this.pack.privacy.streamerPhones, ids: this.pack.privacy.streamerIds });
    return text;
  }

  private cleanOutgoing(content: string): string {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnSend) return content;
    return stripTrackingText(content);
  }

  private cleanClickedLink(event: MouseEvent) {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
    const next = stripTrackingUrl(anchor.href);
    if (next && next !== anchor.href) anchor.href = next;
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
    return this.maskText(friendActivityText(known));
  }

  private dmPreviewLabel(channelId: string): string {
    const loaded = this.pages[channelId];
    const source = loaded?.length ? loaded : this.demo ? history[channelId] : undefined;
    const last = [...(source ?? [])].reverse().find((message) => message.content.trim());
    if (!last) return "";
    return dmPreview(plainPreview(last.content, this.renderContext(), 80), this.hideDirect(), 80);
  }

  private previewLine(message: RawMessage, limit: number): string {
    const channel = this.channelById(message.channelId);
    const direct = channel?.kind === "dm" || channel?.kind === "group";
    if (this.hideDirect() && direct) return "Message hidden";
    const text = plainPreview(message.content, this.renderContext(), limit) || (message.attachments?.length ? "Attachment" : "Empty message");
    return this.maskText(text);
  }

  private notifyBody(message: RawMessage, direct: boolean): string {
    if (this.hideDirect() && direct) return "New direct message";
    const body = plainPreview(message.content, this.renderContext()) || (message.attachments?.length ? "Sent an attachment" : message.stickers?.length ? "Sent a sticker" : "New message");
    return this.maskText(body);
  }

  private bookmarkExcerpt(bookmark: { channelId: string; excerpt: string }): string {
    const channel = this.channelById(bookmark.channelId);
    if (this.hideDirect() && (channel?.kind === "dm" || channel?.kind === "group")) return "Direct message";
    return this.maskText(bookmark.excerpt || "Empty message");
  }

  private presentView(view: ViewMessage): ViewMessage {
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
      const kept = isBookmarked(this.pack.bookmarks, message.channelId, message.id);
      void this.pushSaved(message.channelId, message.id, kept, null);
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
    const saved = result.list.find((item) => item.channelId === message.channelId && item.messageId === message.id);
    if (saved) void this.pushSaved(message.channelId, message.id, true, new Date(saved.remindAt).toISOString());
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
      if (list) pages[id] = initialHistory(list).map((message) => ({ ...message, attachments: (message.attachments ?? []).map((file) => ({ ...file, url: file.url.startsWith("blob:") ? "" : file.url })) }));
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
          const page = pageMessages(history[channelId] ?? [], undefined, HISTORY_PAGE);
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

  private bindVoiceChannelMenu() {
    if (this.voiceChannelMenuBound) return;
    this.voiceChannelMenuBound = true;
    this.channelPane.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest("[data-channel]");
      if (!(row instanceof HTMLElement)) return;
      const channel = this.channelById(row.dataset.channel ?? "");
      if (!channel || (channel.kind !== "voice" && !isStageChannel(channel))) return;
      event.preventDefault();
      this.channelMenu = { channelId: channel.id, x: event.clientX, y: event.clientY };
      this.voiceMenu = null;
      this.paintVoiceChannelMenu();
    });
  }

  private toggleDeviceMenu(which: "input" | "output") {
    this.deviceMenu = this.deviceMenu === which ? null : which;
    void this.loadAudioDevices();
    this.paintChannels();
  }

  private deviceMenuPop(): HTMLElement {
    const pop = el("div", "user-device-menu");
    pop.setAttribute("role", "menu");
    const input = this.deviceMenu !== "output";
    pop.append(el("strong", "", input ? "Input device" : "Output device"));
    const options = input ? this.captureDevices() : this.playbackDevices();
    const current = input ? this.config.voice.input_device : this.config.voice.output_device;
    const pick = (id: string) => {
      if (input) this.pickInput(id);
      else this.pickOutput(id);
      this.deviceMenu = null;
      this.paintChannels();
    };
    const def = el("button", current ? "text-button" : "text-button is-on", "Default");
    def.type = "button";
    def.addEventListener("click", () => pick(""));
    pop.append(def);
    for (const option of options) {
      const button = el("button", option.id === current ? "text-button is-on" : "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => pick(option.id));
      pop.append(button);
    }
    if (input && this.inputProfiles.length) {
      pop.append(el("span", "hint", "Input profile"));
      for (const profile of this.inputProfiles) {
        const button = el("button", profile.id === this.inputProfileId ? "text-button is-on" : "text-button", profile.name);
        button.type = "button";
        button.addEventListener("click", () => {
          this.pickInputProfile(profile.id);
          this.deviceMenu = null;
          this.paintChannels();
        });
        pop.append(button);
      }
    }
    return pop;
  }

  private toggleNoiseSuppression() {
    this.config.voice.noise_suppression = !this.config.voice.noise_suppression;
    this.persist();
    this.pushVoiceAudio();
    this.paintChannels();
    this.paintVoiceFloats();
  }

  private toggleEchoCancellation() {
    this.ensureVoicePrefs();
    this.echoCancellation = !this.echoCancellation;
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
    this.paintChannels();
    this.paintVoiceFloats();
  }

  private toggleActivities() {
    this.activitiesOpen = !this.activitiesOpen;
    this.soundboardOpen = false;
    this.gearOpen = false;
    this.micMenuOpen = false;
    this.moreOpen = false;
    this.voiceMenu = null;
    this.paintVoice();
  }

  private toggleSoundboard() {
    this.soundboardOpen = !this.soundboardOpen;
    this.activitiesOpen = false;
    this.gearOpen = false;
    this.micMenuOpen = false;
    this.moreOpen = false;
    this.voiceMenu = null;
    if (this.soundboardOpen && this.voice?.guildId) void this.loadGuildSounds(this.voice.guildId);
    this.paintChannels();
    this.paintVoice();
  }

  private toggleShowChat() {
    this.callView = { ...this.callView, showChat: !this.callView.showChat };
    if (this.callView.showChat) void this.loadVoiceChat();
    this.paintVoice();
  }

  private toggleFullScreen() {
    this.callView = { ...this.callView, fullScreen: !this.callView.fullScreen };
    this.paint();
  }

  private toggleMicMenu() {
    this.micMenuOpen = !this.micMenuOpen;
    this.moreOpen = false;
    this.activitiesOpen = false;
    this.soundboardOpen = false;
    if (this.micMenuOpen) this.watchMicLevel();
    else this.stopMicLevel();
    this.paintVoice();
  }

  private toggleMore() {
    this.moreOpen = !this.moreOpen;
    this.micMenuOpen = false;
    this.paintVoice();
  }

  private onMoreAction(action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") {
    if (action === "settings") {
      this.moreOpen = false;
      this.section = "voice";
      this.openSettings();
      return;
    }
    this.callView = applyMoreAction(this.callView, action);
    this.paint();
  }

  private pickInput(id: string) {
    this.config.voice.input_device = id;
    this.persist();
    this.pushVoiceAudio();
  }

  private pickOutput(id: string) {
    this.config.voice.output_device = id;
    this.persist();
    this.pushVoiceAudio();
  }

  private pickInputProfile(id: string) {
    this.inputProfileId = id;
    const profile = selectInputProfile(this.inputProfiles, id);
    if (!profile) return;
    this.config.voice.input_device = profile.deviceId;
    this.config.voice.mode = profile.mode;
    this.config.voice.sensitivity = profile.sensitivity;
    this.persist();
    this.pushVoiceAudio();
    this.storeVoicePrefs();
    this.paintVoice();
  }

  private setInputVolume(value: number) {
    this.inputVolume = Math.min(200, Math.max(0, Math.round(value)));
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
  }

  private setOutputVolume(value: number) {
    this.outputVolume = Math.min(200, Math.max(0, Math.round(value)));
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
  }

  private pushVoiceProcessing() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_processing", {
      echoCancellation: this.echoCancellation,
      agc: this.agc,
      inputVolume: this.inputVolume,
      outputVolume: this.outputVolume,
      noiseQuality: this.noiseQuality,
    }).catch(() => undefined);
  }

  private joinVoice(channel: Channel, options?: { quiet?: boolean }) {
    this.ensureVoicePrefs();
    const target = joinVoiceTarget(channel, this.guildId);
    if (!target) return;
    this.voiceEpoch += 1;
    const epoch = this.voiceEpoch;
    const profile = selectInputProfile(this.inputProfiles, this.inputProfileId);
    if (profile) {
      this.config.voice.input_device = profile.deviceId;
      this.config.voice.mode = profile.mode;
      this.config.voice.sensitivity = profile.sensitivity;
    }
    applyVoiceState(this.voiceRoster, {
      guildId: target.guildId ?? "",
      channelId: target.channelId,
      userId: this.meId(),
      name: this.demo ? "Ethan Park" : this.me.name,
      avatarUrl: this.me.avatarUrl ?? null,
      selfMute: this.desk.muted,
      selfDeaf: this.desk.deafened,
    });
    this.voice = {
      channelId: target.channelId,
      guildId: target.guildId,
      name: channel.name,
      status: "connecting",
      muted: this.desk.muted,
      deafened: this.desk.deafened,
      members: [],
    };
    this.noteCallForUpdates();
    this.voiceJoinedAt = Date.now();
    this.voiceConnectedAt = 0;
    this.armCallTimer();
    this.stageRaised = false;
    if (target.callKind === "stage") this.stageTopic = channel.topic ?? this.stageTopic;
    this.syncCallMembers();
    this.paintChannels();
    this.paintVoice();
    if (options?.quiet) this.toast("Voice", "Joined without the entrance sound.");
    if (!this.demo && this.guildId) void this.loadGuildSounds(this.guildId);
    if (this.demo) {
      window.setTimeout(() => {
        if (!this.voice || this.voice.channelId !== target.channelId) return;
        this.voice.status = "connected";
        this.noteVoiceConnected();
        this.voiceDetails = voiceLinkDetails({ pingMs: 28, endpoint: "c-demo.discord.gg", mode: "connected" });
        if (trafficArmed()) {
          noteVoice({ ping: 28 });
          noteGateway({ kind: "voiceLink", state: "connected", endpoint: "c-demo.discord.gg", pingMs: 28, mode: "connected" });
        }
        this.refreshSpeaking();
        this.paintChannels();
        this.paintVoice();
      }, 180);
      return;
    }
    void invoke("join_voice", {
      guildId: target.guildId,
      channelId: target.channelId,
      mute: this.desk.muted,
      deaf: this.desk.deafened,
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
    this.pushVoiceProcessing();
    void this.loadAudioDevices();
  }

  private leaveVoice() {
    const guildId = this.voice?.guildId ?? "";
    if (this.voice) applyVoiceState(this.voiceRoster, { guildId, channelId: "", userId: this.meId() });
    this.voice = null;
    this.clearVoiceClock();
    this.noteCallForUpdates();
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
    clearCameraFrames();
    this.callBus?.postMessage({ type: "camera-clear" });
    this.cameraOn = false;
    this.stopCameraSend();
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
    this.desk = toggleDeskMute(this.voice ? { muted: this.voice.muted, deafened: this.voice.deafened } : this.desk);
    if (!this.voice) {
      this.paintChannels();
      return;
    }
    this.voice.muted = this.desk.muted;
    this.voice.deafened = this.desk.deafened;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  }

  private toggleDeafen() {
    this.desk = toggleDeskDeafen(this.voice ? { muted: this.voice.muted, deafened: this.voice.deafened } : this.desk);
    if (!this.voice) {
      this.paintChannels();
      return;
    }
    this.voice.muted = this.desk.muted;
    this.voice.deafened = this.desk.deafened;
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
      const gain = boostedPlayback(member.volume, Boolean(member.localMuted), this.userVolumeCeiling());
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
      avatarUrl: preferAvatar(state.avatarUrl, known?.avatarUrl, state.userId),
      selfMute: Boolean(state.selfMute),
      selfDeaf: Boolean(state.selfDeaf),
      serverMute: Boolean(state.serverMute),
      serverDeaf: Boolean(state.serverDeaf),
      ...(state.selfStream === undefined ? {} : { selfStream: Boolean(state.selfStream) }),
      ...(state.suppress === undefined ? {} : { suppress: Boolean(state.suppress) }),
      ...(state.requestToSpeak === undefined ? {} : { requestToSpeak: Boolean(state.requestToSpeak) }),
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
    const cached = this.directory[id];
    if (cached?.name || cached?.avatarUrl) return { name: cached.name, avatarUrl: cached.avatarUrl ?? null };
    const name = this.userNames[id];
    return name ? { name, avatarUrl: null } : null;
  }

  /** Fill voice rows from the member cache, then fetch anyone still on a default picture. */
  private refreshVoicePortraits() {
    let changed = false;
    for (const person of Object.values(this.voiceRoster)) {
      if (!isDefaultAvatar(person.avatarUrl)) continue;
      const known = this.knownPerson(person.userId);
      const better = preferAvatar(known?.avatarUrl, null, person.userId);
      if (!better || isDefaultAvatar(better) || better === person.avatarUrl) continue;
      person.avatarUrl = better;
      changed = true;
    }
    if (changed) {
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    }
    this.fetchMissingVoiceAvatars();
  }

  private fetchMissingVoiceAvatars() {
    if (this.demo) return;
    for (const person of Object.values(this.voiceRoster)) {
      if (!isDefaultAvatar(person.avatarUrl) || this.voiceAvatarFetches.has(person.userId)) continue;
      this.voiceAvatarFetches.add(person.userId);
      const guildId = person.guildId || this.guildId || "";
      void invoke<WireProfile>("fetch_profile", { userId: person.userId, guildId }).then((profile) => {
        const avatar = preferAvatar(profile.avatarUrl, null, person.userId);
        const current = Object.values(this.voiceRoster).find((item) => item.userId === person.userId);
        if (!current || !avatar || isDefaultAvatar(avatar)) return;
        current.avatarUrl = avatar;
        const name = profile.nick || profile.name;
        if (name && (current.name === "Someone" || !current.name)) current.name = name;
        if (name) this.userNames[current.userId] = name;
        const cached = this.directory[current.userId];
        this.directory[current.userId] = { ...cached, id: current.userId, name: current.name, status: cached?.status ?? "offline", avatarUrl: avatar };
        this.syncCallMembers();
        this.paintChannels();
        this.paintVoice();
      }).catch(() => {
        this.voiceAvatarFetches.delete(person.userId);
      });
    }
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
      const page = pageMessages(history[id] ?? [], undefined, HISTORY_PAGE);
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
    const obs = this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoObs;
    if (!obs) this.frontApp = null;
    if (!detect && this.detectedGame) this.noteGame(null);
    const watch = detect || obs || this.perfOn() || this.config.desktop.hardware_status;
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
      }>("hardware_snapshot", { full: false, game: obs });
      const named = typeof snap.game === "string" ? snap.game : null;
      if (detect) this.noteGame(named);
      if (obs) {
        const was = this.streamerSafeOn();
        this.frontApp = named;
        if (was !== this.streamerSafeOn()) this.noteCapture();
      }
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
    const tiles = textChat ? visibleCallTiles(stageTiles(this.stageMembers()), this.callView.showNonVideo) : [];
    const media = leadMedia(tiles);
    const chrome = callChrome({
      inCall: textChat,
      surface: textChat ? this.callSurface : "chat",
      stripOpen: this.stripOpen,
      hasMedia: Boolean(media),
      showChat: this.callView.showChat,
      fullScreen: this.callView.fullScreen,
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
    const channel = this.voice ? this.channelById(this.voice.channelId) : undefined;
    const stageChannel = Boolean(channel && isStageChannel(channel));
    const focusLayoutOn = showGrid && !stageChannel && !this.callView.grid;
    this.callSplit.classList.toggle("is-focus", focusLayoutOn && !this.callView.fullScreen);
    this.callSplit.hidden = !showGrid;
    this.callHandle.hidden = !showGrid || (focusLayoutOn && !this.callView.fullScreen);
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
      const chat = chrome.voiceChat && !focusLayoutOn ? this.voiceChatPanel() : null;
      if (stageChannel) {
        clear(dock);
        dock.className = "voice-stage";
        renderStageBoard(dock, stageGroups(this.stagePeople()), {
          topic: this.stageTopic,
          raised: this.stageRaised,
          selfSpeaker: this.stageSpeaker,
          onRaise: () => this.toggleRaiseHand(),
          onStart: (topic) => void this.startStage(topic),
          onInviteUp: (userId) => void this.setStageAudience(userId, false),
          onMoveAudience: (userId) => void this.setStageAudience(userId, true),
        });
        if (chat) dock.append(chat);
        appendCallControls(dock, this.callStageHandlers());
      } else {
        if (focusLayoutOn) {
          const members = this.callView.showNonVideo
            ? this.stageMembers()
            : this.stageMembers().filter((member) => member.self || member.video || member.sharing);
          renderFocusStage(dock, members, this.ringMotion(), this.callStageHandlers());
        } else {
          renderCallStage(dock, this.decorateTiles(tiles), this.ringMotion(), this.callStageHandlers(), chat);
        }
      }
    }
    this.paintPip(chrome.pip ? media : null);
    this.mountShareSurfaces();
    attachCameraTiles(this.root);
    this.paintShareDialog();
    this.paintVoiceFloats();
    this.publishVoiceHud();
    this.publishCallFrame();
    const inlineChat = chrome.voiceChat && chrome.grid === "split" && !focusLayoutOn;
    this.placeVoiceChat(chrome.voiceChat && !inlineChat);
    if (this.callView.fullScreen) this.messagesEl.parentElement?.classList.add("is-call-full");
    else this.messagesEl.parentElement?.classList.remove("is-call-full");
    requestAnimationFrame(() => {
      this.placeCallSplit();
      this.placePip();
      this.placeVoiceChat(chrome.voiceChat && (chrome.grid !== "split" || focusLayoutOn));
    });
  }

  private callStageHandlers() {
    const clips = this.config.soundboard.clips
      .filter((clip) => playableClipIds([clip], this.soundToggles).length > 0)
      .map((clip) => ({ id: clip.id, name: clip.name }));
    const guildSounds = playableGuildSounds(this.guildSounds, this.soundToggles, Boolean(this.voice?.deafened))
      .map((sound) => ({ id: sound.id, name: sound.name, enabled: true }));
    return {
      cameraOn: this.cameraOn,
      shareOn: this.shareOn,
      muted: Boolean(this.voice?.muted),
      deafened: Boolean(this.voice?.deafened),
      activitiesOpen: this.activitiesOpen,
      soundboardOpen: this.soundboardOpen,
      clips,
      showChat: this.callView.showChat,
      fullScreen: this.callView.fullScreen,
      gridView: this.callView.grid,
      showNonVideo: this.callView.showNonVideo,
      messagePreviews: this.callView.messagePreviews,
      micMenuOpen: this.micMenuOpen,
      moreOpen: this.moreOpen,
      inputLevel: this.inputLevel,
      profiles: this.inputProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
      profileId: this.inputProfileId,
      inputVolume: this.inputVolume,
      outputVolume: this.outputVolume,
      inputs: this.captureDevices(),
      outputs: this.playbackDevices(),
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
      guildSounds,
      activities: ACTIVITIES.map((activity) => ({ id: activity.id, name: activity.name })),
      watchUrl: this.watchUrl,
      onCamera: () => this.toggleCamera(),
      onShare: () => this.toggleShare(),
      onActivities: () => this.toggleActivities(),
      onSoundboard: () => this.toggleSoundboard(),
      onShowChat: () => this.toggleShowChat(),
      onInvite: () => void this.inviteToCall(),
      onFullScreen: () => this.toggleFullScreen(),
      onMicMenu: () => this.toggleMicMenu(),
      onMore: () => this.toggleMore(),
      onMoreAction: (action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") => this.onMoreAction(action),
      onInput: (id: string) => this.pickInput(id),
      onOutput: (id: string) => this.pickOutput(id),
      onProfile: (id: string) => this.pickInputProfile(id),
      onInputVolume: (value: number) => this.setInputVolume(value),
      onOutputVolume: (value: number) => this.setOutputVolume(value),
      onGuildSound: (id: string) => void this.playGuildSound(id),
      onActivity: (id: string) => void this.launchActivity(id),
      onWatch: (url: string) => void this.startWatchTogether(url),
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
    if (this.callSplit.classList.contains("is-focus")) {
      this.callSplit.style.height = `${FOCUS_SPLIT_PX}px`;
      return;
    }
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
    if (this.cameraOn) void this.startCameraSend();
    else this.stopCameraSend();
    if (this.voice && !this.demo) {
      void invoke("set_voice_camera", { active: this.cameraOn }).catch(() => undefined);
      void invoke("set_voice_video", {
        guildId: this.voice.guildId,
        channelId: this.voice.channelId,
        mute: this.voice.muted,
        deaf: this.voice.deafened,
        video: this.cameraOn,
      }).catch(() => undefined);
    }
    this.paintVoice();
    this.paintChannels();
  }

  private async startCameraSend() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast("Camera", "This window cannot open a camera.");
      this.cameraOn = false;
      return;
    }
    this.stopCameraSend();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: this.config.voice.video_device ? { deviceId: { exact: this.config.voice.video_device } } : true,
        audio: false,
      });
      this.cameraStream = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 176;
      const ctx = canvas.getContext("2d");
      const tick = () => {
        if (!this.cameraOn || !this.cameraStream || !ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!this.demo && this.voice) {
          void invoke("push_camera_frame", { width: canvas.width, height: canvas.height, rgba: Array.from(frame.data) }).catch(() => undefined);
        }
        const previewSlot = document.querySelector("[data-camera-test]");
        if (previewSlot && !previewSlot.querySelector("video")) {
          const preview = document.createElement("video");
          preview.className = "camera-preview";
          preview.muted = true;
          preview.playsInline = true;
          preview.autoplay = true;
          preview.srcObject = stream;
          previewSlot.replaceChildren(preview);
        }
        const slot = document.querySelector(".voice-tile.is-video[data-voice-user=\"" + this.meId() + "\"] .voice-media");
        if (slot && !slot.querySelector("video")) {
          const preview = document.createElement("video");
          preview.className = "camera-preview";
          preview.muted = true;
          preview.playsInline = true;
          preview.autoplay = true;
          preview.srcObject = stream;
          slot.replaceChildren(preview);
        }
      };
      tick();
      this.cameraTimer = window.setInterval(tick, 1000 / 15);
    } catch (err) {
      if (this.demo) return;
      this.cameraOn = false;
      this.toast("Camera", err instanceof Error ? err.message : "Couldn't open the camera.");
      this.paintVoice();
    }
  }

  private stopCameraSend() {
    window.clearInterval(this.cameraTimer);
    this.cameraTimer = 0;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
  }

  private watchMicLevel() {
    this.stopMicLevel();
    if (!navigator.mediaDevices?.getUserMedia) return;
    void navigator.mediaDevices.getUserMedia({
      audio: browserMicConstraint(this.config.voice.input_device, this.audioInputs.map((device) => device.id)),
      video: false,
    }).then((stream) => {
      this.micPreview = stream;
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const bins = new Float32Array(analyser.fftSize);
      const pump = () => {
        if (!this.micMenuOpen && !this.micTestOn) {
          context.close().catch(() => undefined);
          return;
        }
        analyser.getFloatTimeDomainData(bins);
        this.inputLevel = micLevel(bins);
        const fill = document.querySelector(".mic-meter-fill");
        if (fill instanceof HTMLElement) fill.style.width = `${this.inputLevel}%`;
        this.micMeterTimer = window.setTimeout(pump, 80);
      };
      pump();
    }).catch(() => undefined);
  }

  private stopMicLevel() {
    window.clearTimeout(this.micMeterTimer);
    this.micMeterTimer = 0;
    this.micPreview?.getTracks().forEach((track) => track.stop());
    this.micPreview = null;
  }

  private stagePeople(): StagePerson[] {
    if (!this.voice) return [];
    return participantsIn(this.voiceRoster, this.voice.guildId ?? "", this.voice.channelId).map((person) => ({
      userId: person.userId,
      name: person.name,
      avatarUrl: person.avatarUrl,
      suppressed: person.userId === this.meId() ? !this.stageSpeaker : person.suppress,
      requestToSpeak: person.userId === this.meId() ? this.stageRaised : person.requestToSpeak,
      self: person.userId === this.meId(),
      speaking: person.speaking,
    }));
  }

  private toggleRaiseHand() {
    this.stageRaised = !this.stageRaised;
    if (this.stageRaised) this.stageSpeaker = false;
    const stamp = raiseHand(this.stageRaised, new Date().toISOString());
    if (this.voice && !this.demo) {
      void invoke("set_voice_video", {
        guildId: this.voice.guildId,
        channelId: this.voice.channelId,
        mute: this.voice.muted,
        deaf: this.voice.deafened,
        video: this.cameraOn,
        requestToSpeak: stamp.requestToSpeakTimestamp,
      }).catch(() => undefined);
    }
    this.paintVoice();
  }

  private async startStage(topic: string) {
    if (!this.voice) return;
    this.stageTopic = topic.trim().slice(0, 120);
    this.stageSpeaker = true;
    this.stageRaised = false;
    const body = startStageBody(this.voice.channelId, this.stageTopic);
    if (!this.demo) {
      try {
        await invoke("start_stage", { channelId: body.channel_id, topic: body.topic });
      } catch (err) {
        this.toast("Stage", err instanceof Error ? err.message : "Couldn't start the stage.");
      }
    }
    this.paintVoice();
  }

  private async setStageAudience(userId: string, audience: boolean) {
    if (!this.voice?.guildId || this.demo) {
      const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
      if (person) person.suppress = audience;
      this.paintVoice();
      return;
    }
    try {
      await invoke("set_member_voice", { guildId: this.voice.guildId, userId, suppress: audience });
    } catch (err) {
      this.toast("Stage", err instanceof Error ? err.message : "Couldn't move that person.");
    }
  }

  private async loadGuildSounds(guildId: string) {
    if (this.demo) return;
    try {
      const listed = await invoke<unknown>("fetch_soundboard", { guildId });
      this.guildSounds = sanitizeGuildSounds(listed, guildId);
      this.paintVoice();
      if (this.soundboardOpen) this.paintChannels();
    } catch {
      this.guildSounds = [];
      if (this.soundboardOpen) this.paintChannels();
    }
  }

  private async playGuildSound(id: string) {
    if (!this.voice || this.voice.deafened) return;
    if (!soundEnabled(this.soundToggles, id)) return;
    const sound = this.guildSounds.find((item) => item.id === id);
    if (!sound) return;
    this.noteHeardSound(this.meId(), sound.id);
    if (this.demo) return;
    try {
      await invoke("play_guild_sound", { channelId: this.voice.channelId, soundId: sound.id, guildId: sound.guildId, volume: sound.volume });
    } catch (err) {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't play that sound.");
    }
  }

  private noteHeardSound(userId: string, soundId: string) {
    this.heardSounds.set(hearSoundKey(userId, soundId), Date.now());
    if (this.heardSounds.size <= 32) return;
    const cutoff = Date.now() - 5_000;
    for (const [key, at] of this.heardSounds) {
      if (at < cutoff) this.heardSounds.delete(key);
    }
  }

  private onSoundEffect(payload: unknown) {
    const effect = parseSoundEffect(payload);
    if (!effect || !this.voice) return;
    const recent = this.heardSounds.get(hearSoundKey(effect.userId, effect.soundId));
    if (!acceptHeardSound(effect, this.voice.channelId, Boolean(this.voice.deafened), Date.now(), recent)) return;
    this.noteHeardSound(effect.userId, effect.soundId);
    if (this.demo) return;
    void invoke("hear_guild_sound", { soundId: effect.soundId, volume: effect.volume }).catch(() => undefined);
  }

  private async inviteToCall() {
    if (!this.voice) return;
    if (this.demo) {
      const link = voiceChannelLink(this.voice.guildId, this.voice.channelId);
      this.toast("Invite", link || "Invite copied.");
      return;
    }
    try {
      const code = await invoke<string>("create_channel_invite", { channelId: this.voice.channelId });
      const url = code.startsWith("http") ? code : `https://discord.gg/${code}`;
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      this.toast("Invite", "Copied the invite link.");
    } catch (err) {
      this.toast("Invite", err instanceof Error ? err.message : "Couldn't create an invite.");
    }
  }

  private async launchActivity(id: string) {
    const activity = activityById(id);
    if (!activity || !this.voice) return;
    this.activitiesOpen = true;
    if (this.demo) {
      this.toast(activity.name, "Activity invite is ready in the desktop app.");
      return;
    }
    try {
      const url = await invoke<string>("create_activity_invite", { channelId: this.voice.channelId, applicationId: activity.id });
      this.toast(activity.name, url);
    } catch (err) {
      this.toast(activity.name, err instanceof Error ? err.message : "Couldn't start that activity.");
    }
  }

  private async startWatchTogether(url: string) {
    const videoId = watchVideoId(url);
    if (!videoId) {
      this.toast("Watch Together", "Paste a YouTube link.");
      return;
    }
    this.watchUrl = url.trim();
    this.watchVideo = videoId;
    await this.launchActivity(ACTIVITIES[0].id);
    if (this.voice && !this.demo) {
      void invoke("send_message", { channelId: this.voice.channelId, content: url.trim(), replyTo: null, nonce: null, files: [] }).catch(() => undefined);
    }
    this.paintVoice();
  }

  private async loadVoiceChat() {
    if (!this.voice) return;
    const channelId = this.voice.channelId;
    if (this.demo) {
      this.voiceChatLines = (this.pages[channelId] ?? []).slice(-40).map((message) => ({
        id: message.id,
        author: message.authorName,
        text: messagePreview(message.content),
      }));
      this.paintVoice();
      return;
    }
    try {
      const page = await invoke<{ id: string; authorName?: string; content?: string }[]>("fetch_messages", { channelId, before: null });
      this.voiceChatLines = page.slice(-40).map((message) => ({
        id: message.id,
        author: message.authorName || "Someone",
        text: messagePreview(message.content ?? ""),
      }));
      this.paintVoice();
    } catch (err) {
      this.toast("Voice chat", err instanceof Error ? err.message : "Couldn't load the voice channel chat.");
    }
  }

  private async sendVoiceChat(text: string) {
    if (!this.voice) return;
    const content = text.trim();
    if (!content) return;
    const local = { id: `local-${Date.now()}`, author: this.me.name, text: messagePreview(content) };
    this.voiceChatLines = [...this.voiceChatLines, local].slice(-40);
    this.paintVoice();
    if (this.demo) return;
    try {
      await invoke("send_message", { channelId: this.voice.channelId, content, replyTo: null, nonce: null, files: [] });
    } catch (err) {
      this.toast("Voice chat", err instanceof Error ? err.message : "Couldn't send that.");
    }
  }

  private ensureVoiceChat(): HTMLElement {
    if (this.voiceChatEl) return this.voiceChatEl;
    const panel = el("aside", "voice-chat");
    panel.hidden = true;
    this.voiceChatEl = panel;
    return panel;
  }

  private voiceChatPanel(): HTMLElement {
    const panel = this.ensureVoiceChat();
    const sig = `${this.watchVideo}:${this.voiceChatLines.map((line) => line.id + line.text).join("\n")}`;
    if (panel.dataset.sig !== sig) {
      panel.dataset.sig = sig;
      renderVoiceChat(panel, this.voiceChatLines, (value) => void this.sendVoiceChat(value));
      if (this.watchVideo) {
        const frame = el("iframe", "watch-frame");
        frame.src = watchEmbedUrl(this.watchVideo);
        frame.title = "Watch Together";
        frame.setAttribute("allow", "autoplay; encrypted-media");
        panel.prepend(frame);
      }
    }
    panel.hidden = false;
    return panel;
  }

  private placeVoiceChat(docked: boolean) {
    const panel = this.ensureVoiceChat();
    const chat = this.messagesEl.parentElement;
    if (!chat) return;
    if (!docked) {
      panel.classList.remove("is-docked");
      if (!panel.closest(".voice-stage")) panel.hidden = true;
      if (!this.callView.showChat) this.messagesEl.style.marginRight = "";
      return;
    }
    if (panel.parentElement !== chat) chat.append(panel);
    const composer = this.composer.closest(".composer-wrap");
    const composerH = composer instanceof HTMLElement ? composer.offsetHeight : 0;
    const insets = voiceChatInsets(true, chat.clientWidth, composerH);
    panel.hidden = insets.panelWidth === 0;
    panel.classList.toggle("is-docked", insets.panelWidth > 0);
    panel.style.width = `${insets.panelWidth}px`;
    panel.style.bottom = `${insets.panelBottom}px`;
    this.messagesEl.style.marginRight = insets.marginRight ? `${insets.marginRight}px` : "";
    if (insets.panelWidth > 0 && panel.dataset.sig == null) this.voiceChatPanel();
  }

  private decorateTiles<T extends { userId: string; name?: string; badge?: string }>(tiles: T[]): T[] {
    if (!this.callView.messagePreviews) return tiles;
    return tiles.map((tile) => {
      const line = [...this.voiceChatLines].reverse().find((item) => item.author === tile.name);
      if (!line || tile.badge) return tile;
      return { ...tile, badge: line.text };
    });
  }

  private paintVoiceChannelMenu() {
    const host = this.voiceMenuEl;
    if (!host) return;
    const menu = this.channelMenu;
    const channel = menu ? this.channelById(menu.channelId) : undefined;
    if (!menu || !channel) {
      if (!this.voiceMenu) {
        host.hidden = true;
        clear(host);
      }
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("role", "menu");
    host.setAttribute("aria-label", channel.name);
    host.style.left = `${menu.x}px`;
    host.style.top = `${menu.y}px`;
    host.append(el("strong", "", channel.name));
    const labels: Record<(typeof voiceChannelMenu extends () => readonly (infer T)[] ? T : never), string> = {
      "join-quiet": "Join Without Entrance Sound",
      "open-chat": "Open Chat",
      "hide-names": this.callView.hideNames ? "Show Names" : "Hide Names",
      invite: "Invite",
      edit: "Edit Channel",
      duplicate: "Duplicate Channel",
      "copy-link": "Copy Link",
      mute: "Mute Channel",
      "set-status": "Set Channel Status",
    };
    for (const action of voiceChannelMenu()) {
      const button = el("button", "text-button", labels[action]);
      button.type = "button";
      button.addEventListener("click", () => void this.runVoiceChannelAction(channel, action));
      host.append(button);
    }
    this.clampFloat(host, menu.x, menu.y);
  }

  private async runVoiceChannelAction(channel: Channel, action: ReturnType<typeof voiceChannelMenu>[number]) {
    this.channelMenu = null;
    this.paintVoiceChannelMenu();
    if (action === "join-quiet") {
      this.joinVoice(channel, { quiet: true });
      return;
    }
    if (action === "open-chat") {
      this.callView = { ...this.callView, showChat: true };
      if (this.voice?.channelId === channel.id) void this.loadVoiceChat();
      else void this.openChannel(channel.id);
      this.paint();
      return;
    }
    if (action === "hide-names") {
      this.callView = { ...this.callView, hideNames: !this.callView.hideNames };
      this.channelPane.dataset.hideNames = this.callView.hideNames ? "1" : "0";
      this.paintChannels();
      return;
    }
    if (action === "invite") {
      this.joinVoice(channel);
      await this.inviteToCall();
      return;
    }
    if (action === "copy-link") {
      const link = voiceChannelLink(this.guildId, channel.id);
      if (link && navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      this.toast("Link", link || "Couldn't copy that link.");
      return;
    }
    if (action === "mute") {
      const muted = this.levelFor(this.guildId, channel.id) === "mute";
      this.writeChannelLevel(channel.id, muted ? "all" : "mute");
      return;
    }
    if (action === "edit") {
      const opener = (this as unknown as { openChannelSettings?: (item: Channel) => void }).openChannelSettings;
      if (typeof opener === "function") {
        opener.call(this, channel);
        return;
      }
      const name = window.prompt("Channel name", channel.name);
      if (!name || this.demo) return;
      try {
        await invoke("modify_channel", { channelId: channel.id, name: name.trim() });
      } catch (err) {
        this.toast("Edit channel", err instanceof Error ? err.message : "Couldn't edit that channel.");
      }
      return;
    }
    if (action === "duplicate") {
      if (this.demo || !this.guildId) return;
      try {
        await invoke("duplicate_channel", { guildId: this.guildId, channelId: channel.id, name: `${channel.name} copy` });
        this.toast("Channel", "Duplicated.");
      } catch (err) {
        this.toast("Channel", err instanceof Error ? err.message : "Couldn't duplicate that channel.");
      }
      return;
    }
    const status = window.prompt("Channel status", "");
    if (status === null || this.demo) return;
    try {
      await invoke("set_voice_status", { channelId: channel.id, status: status.trim().slice(0, 500) });
    } catch (err) {
      this.toast("Status", err instanceof Error ? err.message : "Couldn't set the channel status.");
    }
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
    if ((state === "live" || state === "stopped") && this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoShare) this.noteCapture();
  }

  private onStreamFrame(event: { annexB?: string; streamKey?: string; preview?: boolean }) {
    if (!event.annexB) return;
    const raw = atob(event.annexB);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    const userId = event.preview || !event.streamKey ? this.meId() : event.streamKey.split(":").at(-1) || "";
    if (userId) pushStreamFrame(userId, bytes);
  }

  private onCameraFrame(userId: string, annexB: string) {
    const bytes = cameraFrameBytes(annexB);
    if (!userId || !bytes) return;
    pushCameraFrame(userId, bytes);
    attachCameraTiles(this.root);
    this.callBus?.postMessage({ type: "camera", userId, annexB });
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
    if (!this.voiceMenu && !this.gearOpen && !this.activitiesOpen && !this.soundboardOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".voice-menu, .voice-gear, .voice-pop, .voice-bar, .voice-board, .voice-panel, .share-dialog, .share-popover, .share-layer, [data-voice-gear]")) return;
    this.voiceMenu = null;
    this.gearOpen = false;
    this.activitiesOpen = false;
    const board = this.soundboardOpen;
    this.soundboardOpen = false;
    this.paintVoiceFloats();
    if (board) this.paintChannels();
    else if (this.callSurface === "split") this.paintVoice();
  }

  private paintVoiceFloats() {
    this.paintVoiceMenu();
    this.paintVoiceChannelMenu();
    this.paintGear();
  }

  private async moderateMember(userId: string, action: ParticipantMenuAction, channelId?: string) {
    const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
    this.voiceMenu = null;
    this.paintVoiceFloats();
    if (!person) return;
    if (action === "profile") {
      const known = this.directory[userId];
      this.openProfile(known ?? { id: userId, name: person.name, avatarUrl: person.avatarUrl });
      return;
    }
    if (action === "pop-out") {
      this.pipUser = userId;
      this.toast("Call", `${person.name} is popped out.`);
      this.paint();
      return;
    }
    if (action === "mod-view") {
      const guildId = person.guildId || this.guildId;
      if (requestModView(userId, guildId) !== "called") this.toast("Mod View", "Mod View is not available yet.");
      return;
    }
    if (action === "move") {
      /* channel id is the destination */
    }
    const moderation = action === "move" || action === "disconnect" || action === "server-mute" || action === "server-deafen" ? action : null;
    if (!moderation) return;
    const body = memberVoiceBody(moderation, person, channelId);
    if (this.demo || !this.voice?.guildId) {
      if (moderation === "server-mute") person.serverMute = !person.serverMute;
      if (moderation === "server-deafen") {
        person.serverDeaf = !person.serverDeaf;
        if (person.serverDeaf) person.serverMute = true;
      }
      if (moderation === "disconnect") applyVoiceState(this.voiceRoster, { guildId: person.guildId, channelId: "", userId });
      if (moderation === "move" && channelId) person.channelId = channelId;
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      return;
    }
    try {
      await invoke("set_member_voice", {
        guildId: this.voice.guildId,
        userId,
        mute: body.mute ?? null,
        deaf: body.deaf ?? null,
        channelId: moderation === "move" ? channelId ?? null : null,
        disconnect: moderation === "disconnect",
        suppress: null,
      });
    } catch (err) {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't update that person.");
    }
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
    const ceiling = this.userVolumeCeiling();
    const shown = Math.min(person.volume, ceiling);
    const readout = el("span", "hint", `User volume ${shown}%`);
    const vol = el("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = String(ceiling);
    vol.value = String(shown);
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
    vol.classList.add("voice-user-volume");
    host.append(readout, vol, mute);
    const labels: Record<ParticipantMenuAction, string> = {
      profile: "Profile",
      "server-mute": person.serverMute ? "Unmute on server" : "Server mute",
      "server-deafen": person.serverDeaf ? "Undeafen on server" : "Server deafen",
      "pop-out": "Pop out user",
      "mod-view": "Mod view",
      move: "Move to",
      disconnect: "Disconnect",
    };
    for (const action of participantMenu()) {
      if (action === "move") {
        host.append(el("span", "hint", "Move to"));
        for (const channel of this.visibleChannels().filter((item) => item.kind === "voice" || isStageChannel(item))) {
          if (channel.id === person.channelId) continue;
          const button = el("button", "text-button", channel.name);
          button.type = "button";
          button.addEventListener("click", () => void this.moderateMember(person.userId, "move", channel.id));
          host.append(button);
        }
        continue;
      }
      const button = el("button", "text-button", labels[action]);
      button.type = "button";
      button.addEventListener("click", () => void this.moderateMember(person.userId, action));
      host.append(button);
    }
    this.anchorVoiceMenu(host, menu.x, menu.y);
  }

  private anchorVoiceMenu(host: HTMLElement, x: number, y: number) {
    const bounds = this.voiceMenuBounds(x, y);
    const place = (width: number, height: number) => {
      const placed = placeMenu({ x, y }, bounds, { width, height });
      host.style.width = `${placed.width}px`;
      host.style.maxHeight = `${placed.maxHeight}px`;
      host.style.left = `${placed.left}px`;
      host.style.top = `${placed.top}px`;
    };
    place(220, 280);
    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      place(Math.min(220, rect.width || 220), rect.height || 180);
    });
  }

  private voiceMenuBounds(x: number, y: number): { left: number; top: number; right: number; bottom: number } {
    const nodes = [this.callSplit, this.channelPane];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.hidden) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 64 || rect.height < 64) continue;
      const near = x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12;
      if (!near) continue;
      return { left: rect.left + 4, top: rect.top + 4, right: rect.right - 4, bottom: rect.bottom - 4 };
    }
    const rect = this.channelPane.getBoundingClientRect();
    return { left: rect.left + 4, top: 8, right: Math.max(rect.left + 160, rect.right - 4), bottom: Math.max(160, window.innerHeight - 8) };
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
    host.append(this.diagnosticsButton());
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
    host.append(this.gearToggle("Lark noise suppression", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.gearToggle("Higher quality noise", this.noiseQuality === "high", (value) => {
      this.noiseQuality = noiseQualityName(value ? "high" : "standard");
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    host.append(this.gearToggle("Echo cancellation", this.echoCancellation, (value) => {
      this.echoCancellation = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    host.append(this.gearToggle("Automatic gain", this.agc, (value) => {
      this.agc = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
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
    const mix = { volume: boostedPlayback(volume, false, this.userVolumeCeiling()), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    void this.persist();
    this.syncCallMembers();
    this.paintVoice();
    this.paintChannels();
  }

  private previewMix(userId: string, volume: number, muted: boolean) {
    const mix = { volume: boostedPlayback(volume, false, this.userVolumeCeiling()), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    const member = this.voice?.members.find((item) => item.id === userId);
    if (member) {
      member.volume = mix.volume;
      member.localMuted = muted;
    }
    if (this.demo || !this.voice) return;
    const gain = boostedPlayback(mix.volume, muted, this.userVolumeCeiling());
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
    if (!clip || !soundEnabled(this.soundToggles, id)) return;
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
      const enabled = soundEnabled(this.soundToggles, clip.id);
      const toggle = el("button", enabled ? "text-button is-on" : "text-button", enabled ? "On" : "Off");
      toggle.type = "button";
      toggle.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${clip.name}`);
      toggle.addEventListener("click", () => {
        this.soundToggles = { ...this.soundToggles, [clip.id]: !enabled };
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      row.append(el("span", "", clip.name), toggle);
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
        if (this.blockedIds.has(message.authorId) && !this.hookOn("hideBlocked")) {
          body.append(renderBlockedMessage());
          continue;
        }
        const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
          settings,
          hiddenAuthors: hidden,
          blockedAuthors: this.blockedIds,
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
          onImage: (url) => this.openImage(url),
          ...this.messageChrome(message, shown),
          ...this.messageExtras(message),
          clock: this.timeClock(),
          seen: this.messageSeen(this.splitId, message.id),
        }));
        const last = body.lastElementChild;
        if (last instanceof HTMLElement && this.hookOn("userWhois")) this.watchMessageWhois(last, message);
        if (last instanceof HTMLElement && this.hookOn("emoteClone")) this.watchEmoteClone(last);
        if (last instanceof HTMLElement && this.hookOn("imageSearch")) this.watchImageSearch(last);
        if (last instanceof HTMLElement) this.markJumbo(last, shown.raw);
      }
    }
    this.splitPane.append(head, body);
  }

  private channelById(id: string): Channel | undefined {
    const dm = this.dmChannels().find((channel) => channel.id === id);
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
    input.placeholder = "Search — from: mentions: has: before: after: in: pinned:";
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
      const ctx = this.renderContext();
      const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
      const local = this.localSearch(query);
      const unmatched = resolved.unresolved.length ? `Couldn't match ${resolved.unresolved.join(", ")}.` : "";
      const idle = "Filters: from:, mentions:, has:, before:, after:, in:, pinned:";
      show(local, !query ? idle : unmatched);
      if (!hasSearchCriteria(resolved) || this.demo) return;
      const guildId = this.guildId;
      const channelId = this.channelId;
      if (!guildId && !channelId) return;
      window.clearTimeout(timer);
      const token = ++this.searchToken;
      timer = window.setTimeout(() => {
        void invoke<RawMessage[]>("search_filtered", {
          guildId: guildId || null,
          channelId: guildId ? null : channelId,
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
          show(hits, unmatched);
        }).catch(() => {
          if (token === this.searchToken) show(local, unmatched || "Discord search missed. Showing loaded messages.");
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
    const ctx = this.renderContext();
    const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
    if (!hasSearchCriteria(resolved)) return [];
    const pools = this.demo ? Object.values(history).flat() : Object.values(this.pages).flat();
    return filterLoadedMessages(pools, resolved);
  }

  private paintNickBanner() {
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

  private openReplyChain(message: RawMessage) {
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

  private async openConnections(message: RawMessage) {
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

  private messageSeen(channelId: string, messageId: string): boolean {
    if (!this.hookOn("readReceipts") || !this.pack.showReceipts) return false;
    return atOrBefore(this.pack.seenCursors[channelId] ?? "", messageId);
  }

  private newestVisibleId(): string {
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

  private noteLocalReceipts() {
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

  private mentionDigestRows() {
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

  private paintDigest() {
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

  private pinRow(message: RawMessage): HTMLElement {
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
    const sample = this.demo && !details ? sampleProfile(person) : null;
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
    renderProfileCard(pop, {
      person: personView,
      self: person.id === this.meId(),
      statusPicker: this.statusOpen && person.id === this.meId(),
      roles: roles.length ? roles : (sample ? sampleRoles() : []),
      placement: this.profileFull ? "full" : "modal",
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
        this.paintPopout();
      },
      onSaveServerProfile: (nick, bio, avatar) => void this.saveServerProfile(nick, bio, avatar),
      slots: this.profileSlots(person),
    });
  }

  private enabledPlugins(): PluginSource[] {
    return enabledSources(this.config.plugins.enabled, this.loaded);
  }

  private hookOn(flag: keyof PluginHooks): boolean {
    return this.enabledPlugins().some((plugin) => plugin.hooks[flag] === true);
  }

  private holdRead(): boolean {
    return privacyHoldRead(this.hookOn("incognito"), this.pack.privacy.incognitoHoldRead);
  }

  private hideActivity(): boolean {
    return this.hookOn("incognito") && this.pack.privacy.incognitoHideActivity;
  }

  private tryPanic(event: KeyboardEvent): boolean {
    if (!this.hookOn("panicKey")) return false;
    if (!matchShortcut(event, this.pack.privacy.panicKey, this.platform.os)) return false;
    event.preventDefault();
    void this.runPanic();
    return true;
  }

  private async runPanic() {
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

  private forceMute() {
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

  private quickReactionEmoji(): string[] {
    for (const plugin of this.enabledPlugins()) {
      if (plugin.hooks.quickReactions.length) return plugin.hooks.quickReactions;
    }
    return [];
  }

  private pluginSettings(channelId: string): Record<string, Record<string, string>> {
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

  private async saveRemote(url: string, name: string) {
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

  private viewOriginal(url: string, name: string) {
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

  private messageChrome(message: RawMessage, view: ViewMessage) {
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

  private messageMenuItems(message: RawMessage): MenuEntry[] {
    const items: MenuEntry[] = [];
    if (this.hookOn("inlineTranslate")) items.push({ id: "translate", label: this.translated[message.id] ? "Show original" : "Translate" });
    if (this.hookOn("copyMarkdown")) items.push({ id: "copy-md", label: "Copy Markdown" });
    if (this.hookOn("replyChain") && message.reply) items.push({ id: "reply-chain", label: "Reply chain" });
    if (this.hookOn("showConnections")) items.push({ id: "connections", label: "Connections" });
    if (this.hookOn("localNicks")) items.push({ id: "local-nick", label: "Local nickname" });
    return items;
  }

  private bindMessageMenu(node: HTMLElement, message: RawMessage) {
    const items = this.messageMenuItems(message);
    if (!items.length) return;
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showMenu(event.clientX, event.clientY, items, (id) => {
        void this.onMessageMenu(message, id);
      });
    });
  }

  private async onMessageMenu(message: RawMessage, id: string) {
    if (id === "translate") await this.onInlineTranslate(message);
    if (id === "copy-md") await this.copyMessageMarkdown(message);
    if (id === "reply-chain") this.openReplyChain(message);
    if (id === "connections") await this.openConnections(message);
    if (id === "local-nick") {
      this.nickTarget = { id: message.authorId, name: message.authorName };
      this.paintComposer();
    }
  }

  private repliesButton(): HTMLButtonElement {
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

  private async copyMessageMarkdown(message: RawMessage) {
    const text = messageMarkdown(message, this.pack.copyMeta);
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", "Message markdown is on the clipboard.");
    } catch {
      this.toast("Copy", "Couldn't copy that message.");
    }
  }

  private async onInlineTranslate(message: RawMessage) {
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

  private messageExtras(message: RawMessage): { log?: { deleted: boolean; history: string[] } } {
    if (!this.hookOn("messageLog")) return {};
    const view = logView(findLog(this.pack.messageLog, message.channelId, message.id), this.pack.logDeleted, this.pack.logEdits);
    return view ? { log: view } : {};
  }

  private timeClock(): { mode: TimeMode; hours: HourCycle } | undefined {
    if (!this.hookOn("betterTime")) return undefined;
    return { mode: this.pack.timeMode, hours: this.pack.timeHours };
  }

  private relativeClock(): boolean {
    return this.hookOn("relativeTime") || (this.hookOn("betterTime") && this.pack.timeMode === "relative");
  }

  private logStamp(): string {
    if (!this.hookOn("messageLog")) return "";
    return this.pack.messageLog.map((entry) => `${entry.id}:${entry.deleted ? 1 : 0}:${entry.edits.length}`).join(".");
  }

  private noteLoggedEdit(message: RawMessage, previous: string, next: string) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordEdit(this.pack.messageLog, message, previous, next, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
  }

  private noteLoggedDelete(message: RawMessage) {
    if (!this.hookOn("messageLog")) return;
    const logged = recordDelete(this.pack.messageLog, message, Date.now());
    if (logged === this.pack.messageLog) return;
    this.pack.messageLog = logged;
    this.savePack();
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
    if (id === "volume-booster") this.resendVoiceMix();
    this.paint();
  }

  private appendPluginPanel(wrap: HTMLElement, id: string) {
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

  private repliesPanel(): HTMLElement {
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
    const kept = isBookmarked(this.pack.bookmarks, message.channelId, message.id);
    const reminder = reminderFor(this.reminders, message.channelId, message.id);
    void this.pushSaved(message.channelId, message.id, kept || Boolean(reminder), reminder ? new Date(reminder.remindAt).toISOString() : null);
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
    const live = !this.guildId ? [] : this.channelsOf(this.guildId).filter((channel) => channel.kind === "thread" && channel.parentId === parentId);
    return mergeThreadChannels(parentId, live);
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
    bindParityHost(this.parityHost());
    if (this.demo || !this.guildId) return;
    try {
      const threads = await invoke<Channel[]>("fetch_threads", { channelId });
      this.mergeThreads(this.guildId, channelId, threads.map(normalizeChannel));
    } catch {
      /* Active threads are optional. */
    }
    try {
      const index = await invoke<ThreadIndexWire>("fetch_thread_index", { channelId });
      applyThreadIndex(index);
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
    bindParityHost(this.parityHost());
    const channel = this.currentChannel();
    if (!channel || channel.id !== channelId) return null;
    if (channel.kind !== "forum" && !isMediaChannel(channel)) return null;
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
    bindParityHost(this.parityHost());
    openCreateThreadHook(input ?? { channelId: this.channelId });
  }

  /** Stream A: + Create Poll. */
  onCreatePoll(input?: unknown) {
    bindParityHost(this.parityHost());
    openCreatePollHook(input ?? { channelId: this.channelId });
  }

  /** Stream B: Create Event, and the events list behind the sidebar row. */
  onCreateEvent(input?: unknown) {
    bindParityHost(this.parityHost());
    openCreateEventHook(input ?? this.guildId ?? "");
  }

  openEvents(input?: unknown) {
    bindParityHost(this.parityHost());
    void import("../threads").then((mod) => mod.openEvents(input ?? this.guildId ?? ""));
  }

  private parityHost(): ParityHost {
    const pending = readPendingFriendCount(socialApi, (globalThis as { __larkPendingFriends?: unknown }).__larkPendingFriends);
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

  private considerKeyword(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, alreadyNotified: boolean) {
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

  private considerPattern(message: RawMessage, level: NotifyLevel, alreadyNotified: boolean) {
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

  private paintDirectMessages(scroll: HTMLElement) {
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

  private appendChatPluginPanel(wrap: HTMLElement, id: string) {
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

  private tickClock() {
    if (!this.relativeClock() || this.view !== "app") return;
    this.clock = Date.now();
    this.msgSig = "";
    this.paintMessages();
  }

  private tickPlugins() {
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

  private tickMediaStatus() {
    if (!this.hookOn("mediaStatus")) return;
    const session = navigator.mediaSession?.metadata;
    const line = mediaStatusLine(this.pack.mediaStatusSource, this.detectedGame ?? "", session?.title ?? "", session?.artist ?? "");
    if (!line) return;
    this.writePlaying(line, false, this.pack.mediaStatusReplace);
  }

  private presenceGame(): string {
    if (!this.hookOn("gameActivity")) return "";
    return gameActivityName(this.pack.gameActivity, this.detectedGame ?? "");
  }

  private pushPresence() {
    if (this.demo) return;
    const status = this.presenceStatus();
    const wireStatus = status === "invisible" ? "invisible" : status;
    void invoke("set_presence", { status: wireStatus, custom: this.me.custom ?? "", game: this.presenceGame() });
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
    void invoke("set_presence", { status, custom, game: this.presenceGame() }).then(() => {
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

  private gameDeskList(): { plugin: PluginSource; catalog: GameCatalog }[] {
    const out: { plugin: PluginSource; catalog: GameCatalog }[] = [];
    for (const plugin of this.enabledPlugins()) {
      if (!plugin.hooks.gameDesk) continue;
      const catalog = readCatalog(plugin.source);
      if (catalog) out.push({ plugin, catalog });
    }
    return out;
  }

  private mountGameDeskCard(wrap: HTMLElement, plugin: PluginSource) {
    const catalog = readCatalog(plugin.source);
    if (!catalog) {
      wrap.append(el("p", "hint", "This desk has no options."));
      return;
    }
    const settings = this.pack.gameDesks[plugin.id] ?? emptyDesk();
    mountGameDesk(wrap, {
      catalog,
      settings,
      clock: sessionClock(settings.sessionStart, Date.now()),
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

  private deskButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Desk");
    button.type = "button";
    button.setAttribute("aria-label", "Game desk");
    button.addEventListener("click", () => {
      const items = this.gameDeskList().flatMap(({ plugin, catalog }) => deskActions(plugin.id, catalog, this.pack.gameDesks[plugin.id] ?? emptyDesk()));
      if (!items.length) {
        this.toast("Desk", "Turn on a game plugin first.");
        return;
      }
      const rect = button.getBoundingClientRect();
      this.showMenu(rect.left, rect.bottom + 4, items, (id) => this.onDeskAction(id));
    });
    return button;
  }

  private onDeskAction(actionId: string) {
    const [pluginId, action, encoded] = actionId.split(":");
    const found = this.gameDeskList().find((item) => item.plugin.id === pluginId);
    if (!found || !action) return;
    const desk = this.pack.gameDesks[pluginId] ?? emptyDesk();
    const name = deskName(found.catalog, desk);
    if (action === "session") {
      this.toggleDeskSession(pluginId);
      return;
    }
    if (action === "lfg") {
      this.insertDesk(lfgText(name, desk));
      return;
    }
    if (action === "build") {
      const text = buildText(name, found.catalog.slots, desk);
      if (!text) this.toast("Build", "Fill in a slot first.");
      else this.insertDesk(text);
      return;
    }
    if (action === "callout" && encoded) {
      this.insertDesk(decodeURIComponent(encoded));
      return;
    }
    if (action === "crew") {
      const text = crewText(name, desk);
      if (!text) this.toast("Crew", "Add a line in the plugin settings.");
      else this.insertDesk(text);
      return;
    }
    if (action === "stats") void this.lookupDesk(pluginId);
  }

  private toggleDeskSession(id: string) {
    const current = this.pack.gameDesks[id] ?? emptyDesk();
    const running = current.sessionStart === 0;
    this.pack.gameDesks = setSession(this.pack.gameDesks, id, running, Date.now());
    this.savePack();
    if (!running) this.clearSessionStatus();
    else this.syncGameSessions(true);
    this.armSessionClock();
    if (this.settings) this.renderSettings();
    else this.paintComposer();
  }

  private insertDesk(text: string) {
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

  private async lookupDesk(pluginId: string) {
    const found = this.gameDeskList().find((item) => item.plugin.id === pluginId);
    if (!found) return;
    const desk = this.pack.gameDesks[pluginId] ?? emptyDesk();
    const name = deskName(found.catalog, desk);
    const kind = activeStatKind(found.catalog, desk);
    if (kind === "card") {
      const text = statsCard(name, desk);
      if (!text) this.toast("Stats", "Add a line first.");
      else this.insertDesk(text);
      return;
    }
    const target = profileTarget(kind, desk.statId);
    if (!target) {
      this.toast("Stats", found.catalog.stats?.hint || "That is not a public profile.");
      return;
    }
    if (kind === "steam" && isTauri()) {
      try {
        const xml = await invoke<string>("read_public_profile", { kind: "steam", id: desk.statId.trim() });
        const card = parseSteamProfile(xml, target.url);
        if (card) {
          this.insertDesk(statsCard(name, desk, card));
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
    const text = statsCard(name, desk, null, target.url);
    if (text) this.insertDesk(text);
    else this.toast("Stats", "Opened the public page.");
  }

  private syncGameSessions(force: boolean) {
    const now = Date.now();
    for (const { plugin, catalog } of this.gameDeskList()) {
      const desk = this.pack.gameDesks[plugin.id];
      if (!desk?.sessionStart || !desk.presence) continue;
      const line = sessionStatusLine(deskName(catalog, desk), desk.sessionStart, now);
      if (line) this.writeSession(line, desk.presenceReplace, force);
      return;
    }
  }

  private writeSession(line: string, replace: boolean, force: boolean) {
    if (this.demo) return;
    if (!canReplaceSession(this.me.custom ?? "", this.sessionShown, replace)) return;
    const now = Date.now();
    if (!force && !shouldWritePlaying(this.sessionShown, line, this.sessionWrite, now)) return;
    this.sessionShown = line;
    this.sessionWrite = now;
    this.setStatus(this.me.status ?? "online", line, "plugin");
  }

  private clearSessionStatus() {
    if (this.sessionShown && (this.me.custom ?? "") === this.sessionShown) {
      this.setStatus(this.me.status ?? "online", "", "plugin");
    }
    this.sessionShown = "";
    this.sessionWrite = 0;
  }

  private armSessionClock() {
    const live = Object.values(this.pack.gameDesks).some((desk) => desk.sessionStart > 0);
    if (!live) {
      if (this.sessionTick) window.clearInterval(this.sessionTick);
      this.sessionTick = 0;
      return;
    }
    if (this.sessionTick) return;
    this.sessionTick = window.setInterval(() => this.syncGameSessions(false), 15_000);
  }

  private writePlaying(line: string, fromButton: boolean, replace = this.pack.playingReplace) {
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

  private considerAwayReply(message: RawMessage) {
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

  private async sendAwayReply(channelId: string, content: string) {
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

  private setStatus(status: NonNullable<Person["status"]>, custom: string, source: "user" | "plugin" = "user", extra?: { emoji: string; clearAfter: ClearAfter }) {
    if (!publishActivity(this.hookOn("incognito"), this.pack.privacy.incognitoHideActivity, source)) return;
    if (source === "user") {
      this.hardware = noteHardwareEdit(this.hardware, custom);
      if (!custom.trim() && this.config.desktop.hardware_status) this.hardwareSampleAt = 0;
      this.rememberHardware();
    }
    const emoji = extra?.emoji ?? (source === "user" ? this.statusEmoji : "");
    const clearAt = extra ? clearAfterAt(extra.clearAfter, Date.now()) : this.statusClearAt;
    if (source === "user" && extra) {
      this.statusEmoji = emoji;
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
        ? invoke("set_custom_status", { status: wireStatus, custom, emoji, expiresAt: clearAt, game: this.presenceGame() })
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
    const count = this.config.preferences.unread_badge === false ? 0 : dockBadge(entries);
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
      viewing: channelId === this.channelId && !this.holdRead(),
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

  private overrideFromPref(pref: { muted: boolean; level: "all" | "mentions" | "mute" | null }): { muted: boolean; level?: NotifyLevel } {
    if (pref.muted || pref.level === "mute") return { muted: true };
    return pref.level ? { muted: false, level: pref.level } : { muted: false };
  }

  private stageNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
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

  private diagnosticsButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Copy voice diagnostics");
    button.type = "button";
    button.addEventListener("click", () => void this.copyVoiceDiagnostics());
    return button;
  }

  private async copyVoiceDiagnostics() {
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

  private railIcon(label: string, path: string, onClick: () => void): HTMLButtonElement {
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

  private railGlyph(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "rail-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const face = el("span", "server-face rail-glyph", glyph);
    button.append(face, el("span", "pip"));
    button.addEventListener("click", onClick);
    return button;
  }

  private sidebarRow(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "channel-row");
    button.type = "button";
    button.append(el("span", "row-label", label));
    button.addEventListener("click", onClick);
    return button;
  }

  private serverHeadButton(guild: Guild): HTMLButtonElement {
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

  private viewAsBar(guildId: string): HTMLElement {
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

  private viewingAccess(guildId: string): GuildAccess | null {
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

  private channelHeading(channel: Channel): string {
    if (channel.kind === "voice" || channel.kind === "stage") return channel.name;
    if (channel.kind === "media") return channel.name;
    return `# ${channel.name}`;
  }

  private closeContextMenu() {
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  }

  private showMenu(x: number, y: number, items: ReturnType<typeof serverContextItems>, onPick: (id: string) => void) {
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

  private openServerMenu(guildId: string, x: number, y: number, header = false) {
    const folders = this.folders.filter((folder) => folder.id).map((folder) => ({ id: folder.id as string, name: folder.name?.trim() || "Folder" }));
    const items = header ? headerMenuItems(null) : withMoveTargets(serverContextItems(), folders);
    this.showMenu(x, y, items, (id) => this.onServerAction(guildId, id));
  }

  private onServerAction(guildId: string, id: string) {
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
      if (openPerServerProfile(guildId, this.meId()) === "missing") {
        this.toast("Per-server Profile", "Profile editing for this server is not available yet.");
      }
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
      externalLink(DISCORD_LINKS.apps);
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

  private openEventsEntry() {
    if (!this.guildId) return;
    this.openEvents(this.guildId);
  }

  private openAddServer() {
    mountAddServer({
      invoke: (command, args) => invoke(command, args),
      toast: (title, detail) => this.toast(title, detail),
      openInvite: (code) => this.openInvite(code),
      onCreated: (guildId) => {
        this.guildId = guildId;
        void this.ensureGuild(guildId);
        this.paint();
      },
    });
  }

  private openGuildSettings(guildId: string) {
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

  private channelHost(guildId: string) {
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

  private rememberServerChannel(guildId: string, channel: Channel) {
    const list = this.liveChannels[guildId] ?? [];
    const next = list.filter((item) => item.id !== channel.id);
    next.push(channel);
    this.liveChannels[guildId] = next;
    if (this.guildId === guildId) {
      this.paintChannels();
      if (channel.kind !== "category" && channel.kind !== "voice") void this.openChannel(channel.id);
    }
  }

  private openChannelMenu(channel: Channel, x: number, y: number) {
    const items = [...channelContextItems(channel.kind), ...extraChannelItems(channel)];
    const favorite = (this.favorites[this.guildId ?? ""] ?? []).includes(channel.id);
    const pinned = (this.pinnedChannels[this.guildId ?? ""] ?? []).includes(channel.id);
    for (const item of items) {
      if (item.id === "favorite" && favorite) item.label = "Unfavorite";
      if (item.id === "pin-top" && pinned) item.label = "Unpin Channel";
    }
    this.showMenu(x, y, items, (id) => this.onChannelAction(channel, id));
  }

  private onChannelAction(channel: Channel, id: string) {
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
      this.writeChannelLevel(channel.id, "mute");
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

  private openCategoryMenu(category: Channel, x: number, y: number) {
    this.showMenu(x, y, categoryContextItems(), (id) => {
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
      if (id === "mute") this.writeChannelLevel(category.id, "mute");
      if (id.startsWith("notify:")) this.writeChannelLevel(category.id, id.slice("notify:".length) as NotifyLevel);
    });
  }

  private writeChannelLevel(channelId: string, level: NotifyLevel) {
    this.config.notifications.channels[channelId] = level === "mute" ? { muted: true } : { level, muted: false };
    this.stageNotify(this.guildId, channelId, level);
    this.persist();
    void this.writeNotify(this.guildId, channelId, level);
    this.toast("Notifications", `${level}.`);
    this.paint();
  }

  private async writeNotify(guildId: string | null, channelId: string | null, level: NotifyLevel) {
    if (this.demo || !isTauri()) return;
    try {
      if (guildId && channelId) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: channelNotifyBody(channelId, level) } });
      } else if (guildId) {
        await invoke("guild_admin", { request: { op: "patch_guild_settings", guildId, body: guildNotifyBody(level) } });
      } else if (channelId) {
        await invoke("guild_admin", { request: { op: "patch_dm_settings", body: channelNotifyBody(channelId, level) } });
      }
    } catch (err) {
      this.toast("Notifications", err instanceof Error ? err.message : "Discord did not save that. Lark kept it on this device.");
    }
  }

  private channelsInFolder(folderId: string): string[] {
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

  private async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", text);
    } catch {
      this.toast("Copy", "The clipboard is not available.");
    }
  }

  private guildForChannel(channelId: string): string | null {
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      if (list.some((channel) => channel.id === channelId)) return guildId;
    }
    return null;
  }

  private ensureDmPins() {
    if (this.dmPinsReady) return;
    this.dmPinsReady = true;
    this.dmPins = new Set(readPinList(localStorage.getItem("lark.dm.pins.v1")));
  }

  private saveDmPins() {
    localStorage.setItem("lark.dm.pins.v1", JSON.stringify([...this.dmPins]));
  }

  private loadRelationships() {
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

  private mergeRelationships(rows: SocialRelationship[], replace: boolean, removed: boolean) {
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

  private relationshipFor(userId: string): SocialRelationship | undefined {
    return this.relationships.find((row) => row.id === userId);
  }

  private personFromRelationship(userId: string): Person | null {
    const row = this.relationshipFor(userId);
    if (!row) return this.directory[userId] ?? null;
    return this.directory[userId] ?? { id: row.id, name: row.nickname || row.name, avatarUrl: row.avatarUrl, status: "offline", friendNick: row.nickname, serverTag: row.serverTag };
  }

  private async changeRelationship(userId: string, action: "friend" | "remove" | "block" | "ignore") {
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

  private async addFriendUsername(username: string) {
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

  private scheduleSocialChrome() {
    queueMicrotask(() => this.paintSocialChrome());
  }

  private paintSocialChrome() {
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

  private socialHeaderButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "icon-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  }

  private startDmCall(channel: Channel, video: boolean) {
    if (channel.kind !== "dm" && channel.kind !== "group") return;
    if (video !== this.cameraOn) this.toggleCamera();
    this.friendsOpen = false;
    try {
      this.joinVoice(channel);
    } catch (err) {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't start that call.");
    }
  }

  private joinFriendVoice(userId: string) {
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

  private watchFriend(userId: string) {
    const spot = voiceSpotFor(Object.values(this.voiceRoster), userId);
    if (!spot) {
      this.toast("Stream", "They are not in a voice channel.");
      return;
    }
    if (this.voice?.channelId !== spot.channelId) this.joinFriendVoice(userId);
    this.watchMember(userId);
  }

  private bindSocialMenus() {
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

  private closeSocialMenu() {
    document.getElementById("lark-social-menu")?.remove();
  }

  private showSocialMenu(x: number, y: number, items: { id: string; label: string; danger?: boolean }[], onPick: (id: string) => void) {
    this.closeSocialMenu();
    const menu = renderContextMenu(x, y, items, (id) => {
      this.closeSocialMenu();
      onPick(id);
    });
    menu.id = "lark-social-menu";
    this.root.append(menu);
  }

  private openDmMenu(channel: Channel, x: number, y: number) {
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

  private runDmMenu(channel: Channel, userId: string, id: string) {
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

  private openMemberMenu(person: Person, x: number, y: number) {
    const self = person.id === this.meId();
    this.showSocialMenu(x, y, memberContextMenu({ developerMode: developerModeOn(this.config), self }), (id) => {
      if (id === "profile") this.openProfile(person);
      else if (id === "mention") this.mentionPerson(person);
      else if (id === "server-profile") this.openProfile(self ? person : person, false, self);
      else if (id === "apps") window.open("https://discord.com/app-directory", "_blank", "noopener");
      else if (id === "roles") this.openRoleMenu(person);
      else if (id === "mod") {
        if (requestModView(person.id, this.guildId) !== "called") this.toast("Mod View", "Mod View is not available yet.");
      } else if (id === "copy-id") void this.copySocialId(person.id, "User ID");
    });
  }

  private openRoleMenu(person: Person) {
    const roles = this.profileRoles(person);
    if (!roles.length) {
      this.toast("Roles", "No roles on this member yet.");
      return;
    }
    this.openChoice("Roles", roles.map((role) => ({ id: role.id, label: role.name })), (roleId) => {
      this.toast("Roles", requestRoleToggle(person.id, roleId, this.guildId) === "called" ? "Role updated." : "Role changes open from server settings.");
    });
  }

  private mentionPerson(person: Person) {
    const token = `<@${person.id}>`;
    const current = this.composer.value;
    this.composer.value = current && !/\s$/.test(current) ? `${current} ${token} ` : `${current}${token} `;
    this.composer.focus();
  }

  private dmUserId(channel: Channel): string {
    return channel.recipients?.find((item) => item.id !== this.meId())?.id
      ?? channel.recipientIds?.find((id) => id !== this.meId())
      ?? "";
  }

  private markDmRead(channel: Channel) {
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

  private async muteDm(channelId: string, muted: boolean) {
    const level: NotifyLevel = muted ? "mute" : "all";
    this.config.notifications.channels[channelId] = muted ? { muted: true } : { level: "all", muted: false };
    this.stageNotify(null, channelId, level);
    void this.persist();
    this.paint();
    await this.writeNotify(null, channelId, level);
  }

  private async closeDmChannel(channel: Channel) {
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

  private async saveFriendNick(userId: string, nickname: string) {
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

  private async renameGroup(channelId: string, name: string) {
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

  private openGroupCreator() {
    const roster = this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends;
    this.openPicker("New Group DM", roster.map((person) => ({ id: person.id, label: person.name })), 2, (ids) => void this.createGroup(ids));
  }

  private openAddRecipient(channel: Channel) {
    const present = new Set([...(channel.recipientIds ?? []), ...(channel.recipients ?? []).map((item) => item.id)]);
    const roster = (this.demo ? people : this.friends).filter((person) => person.id !== this.meId() && !present.has(person.id));
    this.openPicker("Add to DM", roster.map((person) => ({ id: person.id, label: person.name })), 1, (ids) => void this.addRecipient(channel, ids[0]));
  }

  private async createGroup(ids: string[]) {
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

  private async addRecipient(channel: Channel, userId: string | undefined) {
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

  private async invitePerson(channel: Channel) {
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

  private async saveServerProfile(nick: string, bio: string, avatar: string | null) {
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

  private profileSlots(person: Person): ProfileActionSlot[] {
    const host = globalThis as { larkProfileSlots?: (person: { id: string; guildId: string | null }) => ProfileActionSlot[] };
    if (typeof host.larkProfileSlots !== "function") return [];
    try {
      return host.larkProfileSlots({ id: person.id, guildId: this.guildId }) ?? [];
    } catch {
      return [];
    }
  }

  private paintProfilePanel() {
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
    const sample = this.demo && !details ? sampleProfile(person) : null;
    const roles = this.profileRoles(person);
    renderProfileCard(panel, {
      person,
      self: false,
      statusPicker: false,
      roles: roles.length ? roles : (sample ? sampleRoles() : []),
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

  private dmCounterparty(channel: Channel): Person | null {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const id = recipient?.id ?? channel.recipientIds?.find((item) => item !== this.meId());
    if (!id) return null;
    return this.directory[id] ?? { id, name: recipient?.name || channel.name, avatarUrl: recipient?.avatarUrl, status: "offline" };
  }

  private async copySocialId(id: string, label: string) {
    try {
      await navigator.clipboard.writeText(id);
      this.toast(label, "Copied.");
    } catch {
      this.toast(label, id);
    }
  }

  private openPrompt(title: string, value: string, multiline: boolean, onSave: (text: string) => void) {
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

  private openChoice(title: string, options: { id: string; label: string }[], onPick: (id: string) => void) {
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

  private openPicker(title: string, options: { id: string; label: string }[], minimum: number, onPick: (ids: string[]) => void) {
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

  private readAllButton(): HTMLButtonElement {
    const button = el("button", "text-button", "Read all");
    button.type = "button";
    button.setAttribute("aria-label", "Mark every server read");
    button.addEventListener("click", () => this.readEverything());
    return button;
  }

  private readEverything() {
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

  private pumpReadAll() {
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

  private watchMessageWhois(node: HTMLElement, message: RawMessage) {
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

  private showWhois(person: Person, x: number, y: number) {
    if (!this.hookOn("userWhois") || this.streamerOn() || !person.id) return;
    window.clearTimeout(this.whoisHide);
    this.whoisUser = person.id;
    const cached = this.whoisCache.get(person.id);
    this.paintWhois(this.maskText(person.name), this.whoisText(person.id, cached?.joinedAt, cached?.mutuals ?? this.mutualsFor(person.id)), x, y);
    if (!cached || Date.now() - cached.at > 5 * 60_000) void this.loadWhois(person.id, x, y);
  }

  private hideWhoisSoon() {
    window.clearTimeout(this.whoisHide);
    this.whoisHide = window.setTimeout(() => this.clearWhois(), 180);
  }

  private whoisText(userId: string, joinedAt?: string, mutuals: string[] = []): string[] {
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

  private mutualsFor(userId: string, profileNames: string[] = []): string[] {
    return mutualNames(userId, this.guilds().map((guild) => ({
      name: guild.name,
      memberIds: (this.membersByGuild[guild.id] ?? []).map((member) => member.id),
    })), profileNames);
  }

  private async loadWhois(userId: string, x: number, y: number) {
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

  private paintWhois(title: string, lines: string[], x: number, y: number) {
    let card = document.getElementById("lark-whois");
    if (!card) {
      card = el("div", "whois-card");
      card.id = "lark-whois";
      this.root.append(card);
    }
    renderWhois(card, title, lines, x, y);
  }

  private clearWhois() {
    this.whoisUser = "";
    document.getElementById("lark-whois")?.remove();
  }

  private markJumbo(node: HTMLElement, content: string) {
    if (!this.hookOn("jumboEmoji") || !isJumbo(content)) return;
    const article = node.querySelector("article.message");
    if (!(article instanceof HTMLElement)) return;
    article.classList.add("is-jumbo");
    article.style.setProperty("--lark-jumbo", `${this.pack.jumboSize}px`);
  }

  private watchImageSearch(node: HTMLElement) {
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

  private watchEmoteClone(node: HTMLElement) {
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

  private async cloneEmote(url: string, name: string, guildId: string, kind: "emoji" | "sticker", animated: boolean) {
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

  private paintLiveScheduleBanner() {
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

  private async tickLiveSchedule() {
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

  private bootModView() {
    installModView({
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

  private bootLists() {
    this.ensureDmPins();
    const stored = readIdList(localStorage.getItem("lark.favorite-ids.v1"));
    this.favoriteIds = stored.length ? stored : flattenFavoriteIds(this.favorites);
    (globalThis as { larkFavorites?: { addFavoriteChannel: (id: string) => void } }).larkFavorites = {
      addFavoriteChannel: (id) => this.toggleFavorite(id),
    };
  }

  private ensureListSync(): ListSync {
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

  private listPayload(): ListPayload {
    return {
      favorites: uniqueSnowflakes(this.favoriteIds, 200),
      favoritesMuted: this.favoritesMuted,
      favoriteExtras: this.favoriteExtras.slice(0, 50),
      pinnedDms: uniqueSnowflakes([...this.dmPins], 40),
      channelPins: mapToPins(this.pinnedChannels),
    };
  }

  private refileLists() {
    const known = this.demo ? demoChannels : this.liveChannels;
    if (!Object.keys(known).length) return;
    this.favorites = refileFavorites(this.favoriteIds, known);
  }

  private persistLists() {
    localStorage.setItem("lark.favorite-ids.v1", JSON.stringify(this.favoriteIds));
    localStorage.setItem("lark.favorites.v1", JSON.stringify(this.favorites));
    localStorage.setItem("lark.channel-pins.v1", JSON.stringify(this.pinnedChannels));
    this.saveDmPins();
  }

  private toggleFavorite(channelId: string) {
    this.favoriteIds = toggleListed(this.favoriteIds, channelId);
    this.refileLists();
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
  }

  private toggleChannelPin(guildId: string, channelId: string) {
    this.pinnedChannels[guildId] = toggleId(this.pinnedChannels[guildId], channelId);
    if (!this.pinnedChannels[guildId]?.length) delete this.pinnedChannels[guildId];
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
  }

  private toggleDmPin(channelId: string, repaintSettings = false) {
    this.ensureDmPins();
    this.dmPins = togglePin(this.dmPins, channelId);
    this.persistLists();
    if (!this.demo) this.ensureListSync().edit(this.listPayload());
    this.paintChannels();
    if (repaintSettings && this.settings) this.renderSettings();
  }

  private applyUserLists(event: RemoteLists) {
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

  private async pullSaved() {
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

  private async pushSaved(channelId: string, messageId: string, keep: boolean, dueAt: string | null) {
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

  private applySavedEvent(event: { channelId?: string; messageId?: string; removed?: boolean; dueAt?: string | null; authorName?: string; excerpt?: string; savedAt?: string }) {
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
  if (!trafficArmed()) {
    const { invoke: call } = await import("@tauri-apps/api/core");
    return call<T>(command, args);
  }
  const started = performance.now();
  try {
    const { invoke: call } = await import("@tauri-apps/api/core");
    const body = await call<T>(command, args);
    noteRest({ command, args, ok: true, ms: performance.now() - started, status: 200, body });
    return body;
  } catch (error) {
    noteRest({ command, args, ok: false, ms: performance.now() - started, status: httpStatus(error) });
    throw error;
  }
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

const CHANNEL_KINDS = new Set<Channel["kind"]>(["text", "voice", "category", "forum", "dm", "group", "announcement", "thread", "stage", "media"]);

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
