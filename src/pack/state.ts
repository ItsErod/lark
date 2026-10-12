import type { Lang } from "./phrases";
import type { GlossaryEntry } from "./translate";
import type { Bookmark } from "./bookmarks";
import type { HiddenAuthor } from "./hidden";
import type { ChannelWords, RuleLevel } from "./keywords";
import type { ScheduledSend } from "./schedule";
import type { LogEntry } from "./logger";
import { sanitizeLog } from "./logger";
import type { HourCycle, TimeMode } from "./time";
import type { TranslatePrefer } from "./inline-translate";
import type { ReplyTemplate } from "./replies";
import { sanitizeTemplates } from "./replies";
import type { ClipShareKey } from "../media/watch";
import { cleanWords } from "./keywords";
import { cleanPinnedDms } from "./pin-dms";
import { cleanPatterns, patternsFor } from "./patterns";
import { defaultPrivacy, sanitizePrivacy, spoilerMode, type PrivacyOptions } from "./privacy";
import { sanitizeCursors } from "./receipts";
import { wordMin, type WordMin } from "./words";
import { sanitizeNicks } from "./nicks";

export interface PackState {
  translateLang: Lang;
  glossary: GlossaryEntry[];
  mediaPreviews: "hide" | "show";
  mediaCompact: "on" | "off";
  schedule: ScheduledSend[];
  bookmarks: Bookmark[];
  hiddenAuthors: HiddenAuthor[];
  keywordGlobal: string[];
  keywordChannels: Record<string, ChannelWords>;
  playingTitle: string;
  playingArtist: string;
  playingReplace: boolean;
  awayMinutes: 5 | 15 | 30;
  callTimerFrom: "connected" | "join";
  callTimerStyle: "auto" | "clock";
  volumeCap: 200 | 300 | 400;
  messageLog: LogEntry[];
  logDeleted: boolean;
  logEdits: boolean;
  timeMode: TimeMode;
  timeHours: HourCycle;
  typingChannels: boolean;
  typingDms: boolean;
  inlineLang: Lang;
  inlineSource: Lang;
  inlinePrefer: TranslatePrefer;
  hiddenTopics: boolean;
  spotifyPresence: boolean;
  spotifyLinks: boolean;
  highlightPatterns: string[];
  highlightGuilds: Record<string, string[]>;
  highlightNotify: boolean;
  pinnedDms: string[];
  privacy: PrivacyOptions;
  templates: ReplyTemplate[];
  copyMeta: boolean;
  zoomMax: 2 | 3 | 4;
  readAllMuted: boolean;
  readAllDms: boolean;
  whoisAge: boolean;
  whoisMutuals: boolean;
  whoisJoin: boolean;
  emoteStickers: boolean;
  schedulePreset: 15 | 60 | 1440;
  imageLens: boolean;
  imageTineye: boolean;
  imageYandex: boolean;
  jumboSize: 32 | 48 | 64 | 96;
  voiceDownloadScope: "voice" | "all";
  originalImageAction: "both" | "open" | "download";
  youtubePipSize: "small" | "medium";
  youtubePipStart: "muted" | "sound";
  clipShareKey: ClipShareKey;
  gameActivity: "show" | "hide";
  mediaStatusSource: "game" | "spotify" | "either";
  mediaStatusReplace: boolean;
  seenCursors: Record<string, string>;
  showReceipts: boolean;
  digestDms: boolean;
  wordMin: WordMin;
  localNicks: Record<string, string>;
}

export const PACK_IDS = [
  "message-translate",
  "inline-syntax",
  "quiet-media",
  "send-later",
  "quick-react",
  "keyword-ping",
  "auto-away",
  "now-playing",
  "bookmarks",
  "hide-muted",
  "relative-time",
  "silent-typing",
  "call-timer",
  "volume-booster",
  "message-logger",
  "better-timestamps",
  "typing-list",
  "inline-translate",
  "show-hidden",
  "spotify-controls",
  "keyword-highlights",
  "pin-dms",
  "panic-key",
  "incognito",
  "streamer-safe",
  "clean-links",
  "spoiler-everything",
  "hide-blocked",
  "quick-replies",
  "copy-markdown",
  "image-zoom",
  "read-all",
  "user-whois",
  "emote-cloner",
  "message-scheduler",
  "reverse-image",
  "bigger-emoji",
  "voice-download",
  "original-image",
  "youtube-pip",
  "clip-share",
  "game-activity",
  "media-status",
  "read-receipts",
  "mention-digest",
  "word-counter",
  "reply-chain",
  "show-connections",
  "local-nicknames",
] as const;

const LANGS = new Set<Lang>(["en", "es", "fr", "de", "ja"]);
const LEVELS = new Set<RuleLevel>(["all", "mentions", "mute"]);

export function defaultPack(): PackState {
  return {
    translateLang: "es",
    glossary: [],
    mediaPreviews: "hide",
    mediaCompact: "on",
    schedule: [],
    bookmarks: [],
    hiddenAuthors: [],
    keywordGlobal: [],
    keywordChannels: {},
    playingTitle: "",
    playingArtist: "",
    playingReplace: false,
    awayMinutes: 5,
    callTimerFrom: "connected",
    callTimerStyle: "auto",
    volumeCap: 400,
    messageLog: [],
    logDeleted: true,
    logEdits: true,
    timeMode: "relative",
    timeHours: "12",
    typingChannels: true,
    typingDms: true,
    inlineLang: "es",
    inlineSource: "en",
    inlinePrefer: "remote",
    hiddenTopics: true,
    spotifyPresence: true,
    spotifyLinks: true,
    highlightPatterns: [],
    highlightGuilds: {},
    highlightNotify: true,
    pinnedDms: [],
    privacy: defaultPrivacy(),
    templates: [],
    copyMeta: false,
    zoomMax: 3,
    readAllMuted: false,
    readAllDms: true,
    whoisAge: true,
    whoisMutuals: true,
    whoisJoin: true,
    emoteStickers: true,
    schedulePreset: 15,
    imageLens: true,
    imageTineye: true,
    imageYandex: true,
    jumboSize: 48,
    voiceDownloadScope: "voice",
    originalImageAction: "both",
    youtubePipSize: "small",
    youtubePipStart: "muted",
    clipShareKey: "mod+shift+x",
    gameActivity: "show",
    mediaStatusSource: "either",
    mediaStatusReplace: false,
    seenCursors: {},
    showReceipts: true,
    digestDms: true,
    wordMin: 0,
    localNicks: {},
  };
}

export function sanitizePack(input: unknown): PackState {
  const base = defaultPack();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<PackState>;
  if (typeof raw.translateLang === "string" && LANGS.has(raw.translateLang as Lang)) base.translateLang = raw.translateLang as Lang;
  if (raw.mediaPreviews === "hide" || raw.mediaPreviews === "show") base.mediaPreviews = raw.mediaPreviews;
  if (raw.mediaCompact === "on" || raw.mediaCompact === "off") base.mediaCompact = raw.mediaCompact;
  if (raw.awayMinutes === 5 || raw.awayMinutes === 15 || raw.awayMinutes === 30) base.awayMinutes = raw.awayMinutes;
  if (typeof raw.playingTitle === "string") base.playingTitle = raw.playingTitle.trim().slice(0, 80);
  if (typeof raw.playingArtist === "string") base.playingArtist = raw.playingArtist.trim().slice(0, 80);
  if (typeof raw.playingReplace === "boolean") base.playingReplace = raw.playingReplace;
  if (raw.callTimerFrom === "join" || raw.callTimerFrom === "connected") base.callTimerFrom = raw.callTimerFrom;
  if (raw.callTimerStyle === "clock" || raw.callTimerStyle === "auto") base.callTimerStyle = raw.callTimerStyle;
  if (raw.volumeCap === 200 || raw.volumeCap === 300 || raw.volumeCap === 400) base.volumeCap = raw.volumeCap;
  if (typeof raw.logDeleted === "boolean") base.logDeleted = raw.logDeleted;
  if (typeof raw.logEdits === "boolean") base.logEdits = raw.logEdits;
  if (raw.timeMode === "relative" || raw.timeMode === "absolute") base.timeMode = raw.timeMode;
  if (raw.timeHours === "12" || raw.timeHours === "24") base.timeHours = raw.timeHours;
  if (typeof raw.typingChannels === "boolean") base.typingChannels = raw.typingChannels;
  if (typeof raw.typingDms === "boolean") base.typingDms = raw.typingDms;
  if (typeof raw.inlineLang === "string" && LANGS.has(raw.inlineLang as Lang)) base.inlineLang = raw.inlineLang as Lang;
  if (typeof raw.inlineSource === "string" && LANGS.has(raw.inlineSource as Lang)) base.inlineSource = raw.inlineSource as Lang;
  if (raw.inlinePrefer === "remote" || raw.inlinePrefer === "local") base.inlinePrefer = raw.inlinePrefer;
  if (typeof raw.hiddenTopics === "boolean") base.hiddenTopics = raw.hiddenTopics;
  if (typeof raw.spotifyPresence === "boolean") base.spotifyPresence = raw.spotifyPresence;
  if (typeof raw.spotifyLinks === "boolean") base.spotifyLinks = raw.spotifyLinks;
  if (typeof raw.copyMeta === "boolean") base.copyMeta = raw.copyMeta;
  if (raw.zoomMax === 2 || raw.zoomMax === 3 || raw.zoomMax === 4) base.zoomMax = raw.zoomMax;
  base.templates = sanitizeTemplates(raw.templates);
  base.messageLog = sanitizeLog(raw.messageLog);
  if (raw.voiceDownloadScope === "voice" || raw.voiceDownloadScope === "all") base.voiceDownloadScope = raw.voiceDownloadScope;
  if (raw.originalImageAction === "both" || raw.originalImageAction === "open" || raw.originalImageAction === "download") base.originalImageAction = raw.originalImageAction;
  if (raw.youtubePipSize === "small" || raw.youtubePipSize === "medium") base.youtubePipSize = raw.youtubePipSize;
  if (raw.youtubePipStart === "muted" || raw.youtubePipStart === "sound") base.youtubePipStart = raw.youtubePipStart;
  if (raw.clipShareKey === "mod+shift+x" || raw.clipShareKey === "mod+shift+k" || raw.clipShareKey === "mod+alt+x") base.clipShareKey = raw.clipShareKey;
  if (raw.gameActivity === "show" || raw.gameActivity === "hide") base.gameActivity = raw.gameActivity;
  if (raw.mediaStatusSource === "game" || raw.mediaStatusSource === "spotify" || raw.mediaStatusSource === "either") base.mediaStatusSource = raw.mediaStatusSource;
  if (typeof raw.mediaStatusReplace === "boolean") base.mediaStatusReplace = raw.mediaStatusReplace;
  if (Array.isArray(raw.keywordGlobal)) base.keywordGlobal = cleanWords(raw.keywordGlobal.filter((word) => typeof word === "string").join(", "));
  base.glossary = sanitizeGlossary(raw.glossary);
  base.schedule = sanitizeSchedule(raw.schedule);
  base.bookmarks = sanitizeBookmarks(raw.bookmarks);
  base.hiddenAuthors = sanitizeHidden(raw.hiddenAuthors);
  base.keywordChannels = sanitizeChannels(raw.keywordChannels);
  if (Array.isArray(raw.highlightPatterns)) {
    base.highlightPatterns = cleanPatterns(raw.highlightPatterns.filter((item) => typeof item === "string").join("\n"));
  }
  if (typeof raw.highlightNotify === "boolean") base.highlightNotify = raw.highlightNotify;
  base.highlightGuilds = sanitizeHighlightGuilds(raw.highlightGuilds);
  base.pinnedDms = cleanPinnedDms(raw.pinnedDms);
  base.privacy = sanitizePrivacy(raw.privacy);
  if (typeof raw.readAllMuted === "boolean") base.readAllMuted = raw.readAllMuted;
  if (typeof raw.readAllDms === "boolean") base.readAllDms = raw.readAllDms;
  if (typeof raw.whoisAge === "boolean") base.whoisAge = raw.whoisAge;
  if (typeof raw.whoisMutuals === "boolean") base.whoisMutuals = raw.whoisMutuals;
  if (typeof raw.whoisJoin === "boolean") base.whoisJoin = raw.whoisJoin;
  if (typeof raw.emoteStickers === "boolean") base.emoteStickers = raw.emoteStickers;
  if (raw.schedulePreset === 15 || raw.schedulePreset === 60 || raw.schedulePreset === 1440) base.schedulePreset = raw.schedulePreset;
  if (typeof raw.imageLens === "boolean") base.imageLens = raw.imageLens;
  if (typeof raw.imageTineye === "boolean") base.imageTineye = raw.imageTineye;
  if (typeof raw.imageYandex === "boolean") base.imageYandex = raw.imageYandex;
  if (raw.jumboSize === 32 || raw.jumboSize === 48 || raw.jumboSize === 64 || raw.jumboSize === 96) base.jumboSize = raw.jumboSize;
  base.seenCursors = sanitizeCursors(raw.seenCursors);
  if (typeof raw.showReceipts === "boolean") base.showReceipts = raw.showReceipts;
  if (typeof raw.digestDms === "boolean") base.digestDms = raw.digestDms;
  if (raw.wordMin !== undefined) base.wordMin = wordMin(raw.wordMin);
  base.localNicks = sanitizeNicks(raw.localNicks);
  return base;
}

export function settingsFor(pack: PackState, pluginId: string, channelId: string, guildId = ""): Record<string, string> {
  if (pluginId === "message-translate") return { lang: pack.translateLang };
  if (pluginId === "quiet-media") return { previews: pack.mediaPreviews, compact: pack.mediaCompact };
  if (pluginId === "spoiler-everything") return { mode: spoilerMode(pack.privacy, channelId) };
  if (pluginId === "keyword-ping") {
    const local = pack.keywordChannels[channelId]?.words ?? [];
    const words = local.length ? local : pack.keywordGlobal;
    return { words: words.join(", ") };
  }
  if (pluginId === "keyword-highlights") {
    return { patterns: patternsFor(pack.highlightPatterns, pack.highlightGuilds, guildId).join("\n") };
  }
  if (pluginId === "voice-download") return { scope: pack.voiceDownloadScope };
  if (pluginId === "original-image") return { action: pack.originalImageAction };
  if (pluginId === "youtube-pip") return { size: pack.youtubePipSize, start: pack.youtubePipStart };
  if (pluginId === "clip-share") return { hotkey: pack.clipShareKey };
  if (pluginId === "game-activity") return { visibility: pack.gameActivity };
  if (pluginId === "media-status") return { source: pack.mediaStatusSource, replace: pack.mediaStatusReplace ? "replace" : "keep" };
  if (pluginId === "word-counter") return { min: String(pack.wordMin) };
  return {};
}

function sanitizeGlossary(value: unknown): GlossaryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: GlossaryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<GlossaryEntry>;
    if (typeof record.text !== "string" || typeof record.translation !== "string") continue;
    if (typeof record.lang !== "string" || !LANGS.has(record.lang)) continue;
    const text = record.text.trim().slice(0, 500);
    const translation = record.translation.trim().slice(0, 500);
    if (!text || !translation) continue;
    out.push({ text, lang: record.lang, translation });
    if (out.length >= 100) break;
  }
  return out;
}

function sanitizeSchedule(value: unknown): ScheduledSend[] {
  if (!Array.isArray(value)) return [];
  const out: ScheduledSend[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<ScheduledSend>;
    if (typeof record.id !== "string" || typeof record.channelId !== "string" || typeof record.content !== "string") continue;
    if (typeof record.sendAt !== "number" || !Number.isFinite(record.sendAt)) continue;
    const content = record.content.trim().slice(0, 2000);
    if (!content || record.channelId.length > 40) continue;
    out.push({
      id: record.id.slice(0, 40),
      channelId: record.channelId,
      content,
      sendAt: record.sendAt,
      attempts: typeof record.attempts === "number" && record.attempts > 0 ? Math.min(3, Math.floor(record.attempts)) : 0,
    });
    if (out.length >= 20) break;
  }
  return out.sort((a, b) => a.sendAt - b.sendAt);
}

function sanitizeBookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const out: Bookmark[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<Bookmark>;
    if (typeof record.messageId !== "string" || typeof record.channelId !== "string") continue;
    out.push({
      messageId: record.messageId.slice(0, 40),
      channelId: record.channelId.slice(0, 40),
      authorName: typeof record.authorName === "string" ? record.authorName.slice(0, 80) : "Someone",
      excerpt: typeof record.excerpt === "string" ? record.excerpt.slice(0, 140) : "",
      savedAt: typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? record.savedAt : 0,
    });
    if (out.length >= 200) break;
  }
  return out;
}

function sanitizeHidden(value: unknown): HiddenAuthor[] {
  if (!Array.isArray(value)) return [];
  const out: HiddenAuthor[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<HiddenAuthor>;
    if (typeof record.id !== "string") continue;
    const id = record.id.trim();
    if (!id || id.length > 40 || /\s/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : id });
    if (out.length >= 200) break;
  }
  return out;
}

function sanitizeHighlightGuilds(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [guildId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(guildId) || !Array.isArray(raw)) continue;
    const patterns = cleanPatterns(raw.filter((item) => typeof item === "string").join("\n"));
    if (!patterns.length) continue;
    out[guildId] = patterns;
    if (Object.keys(out).length >= 50) break;
  }
  return out;
}

function sanitizeChannels(value: unknown): Record<string, ChannelWords> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, ChannelWords> = {};
  for (const [channelId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(channelId) || !raw || typeof raw !== "object") continue;
    const record = raw as { words?: unknown; level?: unknown };
    const words = Array.isArray(record.words) ? cleanWords(record.words.filter((word) => typeof word === "string").join(", ")) : [];
    const level = typeof record.level === "string" && LEVELS.has(record.level as RuleLevel) ? (record.level as RuleLevel) : undefined;
    if (!words.length && !level) continue;
    out[channelId] = level ? { words, level } : { words };
    if (Object.keys(out).length >= 100) break;
  }
  return out;
}
