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
import { cleanWords } from "./keywords";
import { defaultPrivacy, sanitizePrivacy, type PrivacyOptions } from "./privacy";

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
  privacy: PrivacyOptions;
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
  "panic-key",
  "incognito",
  "streamer-safe",
  "clean-links",
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
    privacy: defaultPrivacy(),
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
  base.messageLog = sanitizeLog(raw.messageLog);
  if (Array.isArray(raw.keywordGlobal)) base.keywordGlobal = cleanWords(raw.keywordGlobal.filter((word) => typeof word === "string").join(", "));
  base.glossary = sanitizeGlossary(raw.glossary);
  base.schedule = sanitizeSchedule(raw.schedule);
  base.bookmarks = sanitizeBookmarks(raw.bookmarks);
  base.hiddenAuthors = sanitizeHidden(raw.hiddenAuthors);
  base.keywordChannels = sanitizeChannels(raw.keywordChannels);
  base.privacy = sanitizePrivacy(raw.privacy);
  return base;
}

export function settingsFor(pack: PackState, pluginId: string, channelId: string): Record<string, string> {
  if (pluginId === "message-translate") return { lang: pack.translateLang };
  if (pluginId === "quiet-media") return { previews: pack.mediaPreviews, compact: pack.mediaCompact };
  if (pluginId === "keyword-ping") {
    const local = pack.keywordChannels[channelId]?.words ?? [];
    const words = local.length ? local : pack.keywordGlobal;
    return { words: words.join(", ") };
  }
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
