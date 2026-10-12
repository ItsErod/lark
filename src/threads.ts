/**
 * Threads, forums, media posts, polls, events, and inbox selection.
 * Payloads match Discord's v10 REST routes. Stream A calls `onCreateThread`
 * and `onCreatePoll`. Stream B calls `onCreateEvent` / `openEvents`.
 */
import type { Bookmark } from "./pack/bookmarks";
import type { Reminder } from "./reminders";
import type { Channel, ForumTag, FriendRequest, Poll, ScheduledEvent } from "./types";

export const THREAD_ANNOUNCEMENT = 10;
export const THREAD_PUBLIC = 11;
export const THREAD_PRIVATE = 12;
export const CHANNEL_ANNOUNCEMENT = 5;
export const CHANNEL_FORUM = 15;
export const CHANNEL_MEDIA = 16;

/** Minutes Discord accepts for auto-archive. */
export const ARCHIVE_DURATIONS = [60, 1440, 4320, 10080] as const;
export type ArchiveDuration = (typeof ARCHIVE_DURATIONS)[number];

/** Channel flag REQUIRE_TAG. A forum post must include one tag. */
export const REQUIRE_TAG_FLAG = 1 << 4;

/** Thread member flags. Follow is all messages. */
export const THREAD_NOTIFY_ALL = 1 << 1;
export const THREAD_NOTIFY_MENTIONS = 1 << 2;

export const POLL_DURATIONS = [1, 4, 8, 24, 72, 168] as const;
export const POLL_QUESTION_MAX = 300;
export const POLL_ANSWER_MAX = 55;
export const POLL_ANSWERS_MIN = 2;
export const POLL_ANSWERS_MAX = 10;
export const POLL_LAYOUT_DEFAULT = 1;

export const EVENT_STAGE = 1;
export const EVENT_VOICE = 2;
export const EVENT_EXTERNAL = 3;
export const EVENT_GUILD_ONLY = 2;
export const EVENT_SCHEDULED = 1;
export const EVENT_ACTIVE = 2;
export const EVENT_TOPIC_MAX = 100;
export const EVENT_DESCRIPTION_MAX = 1000;
export const EVENT_LOCATION_MAX = 100;

export const ACK_CHUNK = 100;
export const THREAD_NAME_MAX = 100;
export const POST_BODY_MAX = 2000;
export const APPLIED_TAG_MAX = 5;
/** Discord forum and media posts accept ten files. Regular messages stay on their own cap. */
export const FORUM_ATTACHMENT_MAX = 10;

export type ThreadRoute = "from-message" | "standalone" | "forum-post";
export type ForumSort = "latest" | "creation";
export type EventFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type InboxTab = "mentions" | "unreads" | "bookmarks" | "reminders" | "requests" | "messages";

export interface ParentChannelInfo {
  id?: string;
  kind?: string;
  rawKind?: number;
  flags?: number;
  topic?: string | null;
  availableTags?: ForumTag[];
  defaultSortOrder?: number | null;
}

export interface ThreadDraft {
  channelId?: string;
  messageId?: string | null;
  name?: string;
  type?: number;
  autoArchiveDuration?: number;
  invitable?: boolean;
  content?: string;
  appliedTags?: string[];
  /** Set when the media post has a file ready to upload. */
  hasAttachment?: boolean;
  /** Forum and media posts. Discord allows ten. `hasAttachment` still means one. */
  attachmentCount?: number;
}

export interface ThreadPlan {
  route: ThreadRoute;
  method: "POST";
  path: string;
  body: Record<string, unknown>;
}

export interface BoardPost {
  id: string;
  name: string;
  parentId?: string | null;
  rawKind?: number;
  archived?: boolean;
  locked?: boolean;
  invitable?: boolean;
  autoArchiveDuration?: number;
  appliedTags?: string[];
  messageCount?: number;
  memberCount?: number;
  lastMessageId?: string | null;
  ownerId?: string | null;
  flags?: number;
  followed?: boolean;
  starter?: string | null;
  imageUrl?: string | null;
  topic?: string | null;
}

export interface PollDraft {
  channelId?: string;
  question?: string;
  answers?: { text?: string; emojiName?: string | null }[];
  durationHours?: number;
  allowMultiselect?: boolean;
}

export interface PollPlan {
  method: "POST";
  path: string;
  body: Record<string, unknown>;
}

export interface EventDraft {
  guildId?: string;
  topic?: string;
  description?: string;
  location?: "voice" | "stage" | "external" | "elsewhere";
  channelId?: string | null;
  elsewhere?: string;
  start?: string;
  end?: string | null;
  frequency?: EventFrequency;
  coverDataUrl?: string | null;
}

export interface EventPlan {
  method: "POST";
  path: string;
  body: Record<string, unknown>;
}

export interface AckState {
  channelId: string;
  messageId: string;
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

export function snowflakeOk(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{5,22}$/.test(value);
}

export function isMediaChannel(channel: { kind?: string; rawKind?: number } | null | undefined): boolean {
  if (!channel) return false;
  return channel.kind === "media" || channel.rawKind === CHANNEL_MEDIA;
}

export function isForumChannel(channel: { kind?: string; rawKind?: number } | null | undefined): boolean {
  if (!channel) return false;
  return channel.kind === "forum" || channel.rawKind === CHANNEL_FORUM || isMediaChannel(channel);
}

export function isAnnouncementChannel(channel: { kind?: string; rawKind?: number } | null | undefined): boolean {
  if (!channel) return false;
  return channel.kind === "announcement" || channel.rawKind === CHANNEL_ANNOUNCEMENT;
}

export function threadKindLabel(rawKind: number | undefined): string {
  if (rawKind === THREAD_ANNOUNCEMENT) return "Announcement";
  if (rawKind === THREAD_PRIVATE) return "Private";
  return "Public";
}

export function archiveLabel(minutes: number | undefined): string {
  if (minutes === 60) return "1 Hour";
  if (minutes === 1440) return "24 Hours";
  if (minutes === 4320) return "3 Days";
  if (minutes === 10080) return "1 Week";
  return "24 Hours";
}

export function tagsRequired(flags: number | undefined): boolean {
  return ((flags ?? 0) & REQUIRE_TAG_FLAG) !== 0;
}

export function guidelinesText(topic: string | null | undefined): string {
  return (topic ?? "").replace(/\s+/g, " ").trim();
}

export function defaultForumSort(order: number | null | undefined): ForumSort {
  return order === 1 ? "creation" : "latest";
}

function fail(error: string): Err {
  return { ok: false, error };
}

/** How many files a forum or media post is trying to send. */
export function forumAttachmentCount(draft: { hasAttachment?: boolean; attachmentCount?: number }): number {
  if (typeof draft.attachmentCount === "number" && Number.isFinite(draft.attachmentCount)) {
    return Math.max(0, Math.floor(draft.attachmentCount));
  }
  return draft.hasAttachment ? 1 : 0;
}

function clampArchive(value: number | undefined): Result<{ duration: ArchiveDuration }> {
  const picked = value ?? 1440;
  if (!(ARCHIVE_DURATIONS as readonly number[]).includes(picked)) {
    return fail("That archive time isn't one Discord offers.");
  }
  return { ok: true, duration: picked as ArchiveDuration };
}

/** Discord route and body for creating a thread or a forum/media post. */
export function startThreadFromMessage(draft: ThreadDraft, parent?: ParentChannelInfo): Result<{ plan: ThreadPlan }> {
  const channelId = draft.channelId || parent?.id || "";
  if (!snowflakeOk(channelId)) return fail("Open a channel first.");
  const name = (draft.name ?? "").trim();
  if (!name) return fail("Name the thread.");
  if ([...name].length > THREAD_NAME_MAX) return fail("Thread names can be 100 characters.");
  const archived = clampArchive(draft.autoArchiveDuration);
  if (!archived.ok) return archived;
  const duration = archived.duration;
  const forum = isForumChannel(parent);
  const media = isMediaChannel(parent);
  const requested = draft.type;
  if (requested != null && requested !== THREAD_ANNOUNCEMENT && requested !== THREAD_PUBLIC && requested !== THREAD_PRIVATE) {
    return fail("Pick a public, private, or announcement thread.");
  }
  if (requested === THREAD_ANNOUNCEMENT && !isAnnouncementChannel(parent)) {
    return fail("Announcement threads belong in an announcement channel.");
  }

  if (forum) {
    const tags = (draft.appliedTags ?? []).filter(snowflakeOk);
    if (tags.length > APPLIED_TAG_MAX) return fail("Five tags is the limit.");
    if (tagsRequired(parent?.flags) && tags.length === 0) return fail("Pick a tag before posting.");
    const content = (draft.content ?? "").trim();
    if ([...content].length > POST_BODY_MAX) return fail("Posts can be 2,000 characters.");
    const attachments = forumAttachmentCount(draft);
    if (attachments > FORUM_ATTACHMENT_MAX) return fail("Forum posts can include 10 attachments.");
    if (!content && attachments === 0) return fail(media ? "Media posts need an image or video." : "A post needs a message.");
    if (media && attachments === 0) return fail("Media posts need an image or video.");
    const body: Record<string, unknown> = {
      name,
      auto_archive_duration: duration,
      applied_tags: tags,
      message: { content },
    };
    return {
      ok: true,
      plan: { route: "forum-post", method: "POST", path: `/channels/${channelId}/threads`, body },
    };
  }

  const messageId = draft.messageId ?? null;
  // Private threads cannot be started from a message. That route also cannot set a type.
  if (requested === THREAD_PRIVATE) {
    const body: Record<string, unknown> = {
      name,
      auto_archive_duration: duration,
      type: THREAD_PRIVATE,
      invitable: draft.invitable !== false,
    };
    return {
      ok: true,
      plan: { route: "standalone", method: "POST", path: `/channels/${channelId}/threads`, body },
    };
  }

  if (snowflakeOk(messageId)) {
    return {
      ok: true,
      plan: {
        route: "from-message",
        method: "POST",
        path: `/channels/${channelId}/messages/${messageId}/threads`,
        body: { name, auto_archive_duration: duration },
      },
    };
  }

  const type = requested ?? (isAnnouncementChannel(parent) ? THREAD_ANNOUNCEMENT : THREAD_PUBLIC);
  const body: Record<string, unknown> = {
    name,
    auto_archive_duration: duration,
    type,
  };
  return {
    ok: true,
    plan: { route: "standalone", method: "POST", path: `/channels/${channelId}/threads`, body },
  };
}

export function archivePlan(threadId: string, archived: boolean): Result<{ method: "PATCH"; path: string; body: { archived: boolean } }> {
  if (!snowflakeOk(threadId)) return fail("That thread is missing.");
  return { ok: true, method: "PATCH", path: `/channels/${threadId}`, body: { archived } };
}

/** Follow sends thread-member flags. All messages is the Follow button. */
export function followPlan(threadId: string, follow: boolean): Result<{ method: "PUT"; path: string; body: { flags: number } }> {
  if (!snowflakeOk(threadId)) return fail("That thread is missing.");
  return {
    ok: true,
    method: "PUT",
    path: `/channels/${threadId}/thread-members/@me/settings`,
    body: { flags: follow ? THREAD_NOTIFY_ALL : THREAD_NOTIFY_MENTIONS },
  };
}

export function joinThreadPlan(threadId: string): Result<{ method: "PUT"; path: string }> {
  if (!snowflakeOk(threadId)) return fail("That thread is missing.");
  return { ok: true, method: "PUT", path: `/channels/${threadId}/thread-members/@me` };
}

export function leaveThreadPlan(threadId: string): Result<{ method: "DELETE"; path: string }> {
  if (!snowflakeOk(threadId)) return fail("That thread is missing.");
  return { ok: true, method: "DELETE", path: `/channels/${threadId}/thread-members/@me` };
}

export function memberPlan(threadId: string, userId: string, add: boolean): Result<{ method: "PUT" | "DELETE"; path: string }> {
  if (!snowflakeOk(threadId) || !snowflakeOk(userId)) return fail("That member id is not a Discord snowflake.");
  return {
    ok: true,
    method: add ? "PUT" : "DELETE",
    path: `/channels/${threadId}/thread-members/${userId}`,
  };
}

export function threadMembersPath(threadId: string): string {
  return `/channels/${threadId}/thread-members?with_member=true`;
}

/** Forum follow is a channel notification override, not a thread membership. */
export function forumFollowPlan(guildId: string, channelId: string, follow: boolean): Result<{ method: "PATCH"; path: string; body: Record<string, unknown> }> {
  if (!snowflakeOk(guildId) || !snowflakeOk(channelId)) return fail("Open a forum first.");
  return {
    ok: true,
    method: "PATCH",
    path: `/users/@me/guilds/${guildId}/settings`,
    body: {
      channel_overrides: {
        [channelId]: follow
          ? { muted: false, message_notifications: 0 }
          : { muted: true, message_notifications: 1 },
      },
    },
  };
}

function snowflakeRank(id: string | null | undefined): bigint {
  if (!snowflakeOk(id)) return 0n;
  try {
    return BigInt(id);
  } catch {
    return 0n;
  }
}

export function sortPosts(posts: readonly BoardPost[], sort: ForumSort): BoardPost[] {
  const copy = [...posts];
  copy.sort((a, b) => {
    const left = sort === "creation" ? snowflakeRank(a.id) : snowflakeRank(a.lastMessageId) || snowflakeRank(a.id);
    const right = sort === "creation" ? snowflakeRank(b.id) : snowflakeRank(b.lastMessageId) || snowflakeRank(b.id);
    if (left === right) return a.name.localeCompare(b.name);
    return left > right ? -1 : 1;
  });
  return copy;
}

export function filterPosts(posts: readonly BoardPost[], tagId: string | null, archived: boolean): BoardPost[] {
  return posts.filter((post) => {
    if (Boolean(post.archived) !== archived) return false;
    if (!tagId) return true;
    return (post.appliedTags ?? []).includes(tagId);
  });
}

export function partitionBoard(posts: readonly BoardPost[], sort: ForumSort, tagId: string | null): { active: BoardPost[]; archived: BoardPost[] } {
  return {
    active: sortPosts(filterPosts(posts, tagId, false), sort),
    archived: sortPosts(filterPosts(posts, tagId, true), sort),
  };
}

/** Gallery tiles keep the forum sort. Posts with media sort to the front of a tie only by staying in order. */
export function galleryPosts(posts: readonly BoardPost[], sort: ForumSort, tagId: string | null): BoardPost[] {
  return sortPosts(filterPosts(posts, tagId, false), sort);
}

export function channelToPost(channel: Channel): BoardPost {
  return {
    id: channel.id,
    name: channel.name,
    parentId: channel.parentId,
    rawKind: channel.rawKind,
    archived: channel.archived,
    locked: channel.locked,
    invitable: channel.invitable,
    autoArchiveDuration: channel.autoArchiveDuration,
    appliedTags: channel.appliedTags,
    messageCount: channel.messageCount,
    memberCount: channel.memberCount,
    lastMessageId: channel.lastMessageId,
    ownerId: channel.ownerId,
    flags: channel.flags,
    followed: channel.followed,
    starter: channel.starterContent,
    imageUrl: channel.starterImage,
    topic: channel.topic,
  };
}

const remembered = new Map<string, BoardPost>();
const parents = new Map<string, ParentChannelInfo>();
const polls = new Map<string, Poll>();
const events = new Map<string, ScheduledEvent>();

export function rememberParent(parent: ParentChannelInfo & { id: string }) {
  parents.set(parent.id, parent);
}

export function parentInfo(id: string): ParentChannelInfo | undefined {
  return parents.get(id);
}

export function rememberPosts(posts: BoardPost[]) {
  for (const post of posts) remembered.set(post.id, post);
}

export function rememberedPosts(parentId: string): BoardPost[] {
  return [...remembered.values()].filter((post) => post.parentId === parentId);
}

export function forgetPost(id: string) {
  remembered.delete(id);
}

/** Live gateway threads win on name; stored archive and raw kind fill the gaps. */
export function mergeThreadChannels(parentId: string, live: readonly Channel[]): Channel[] {
  const byId = new Map<string, Channel>();
  for (const channel of live) {
    if (channel.kind !== "thread" || (channel.parentId ?? parentId) !== parentId && channel.parentId !== parentId) continue;
    const stored = remembered.get(channel.id);
    byId.set(channel.id, stored ? overlayThread(channel, stored) : { ...channel, parentId: channel.parentId ?? parentId });
  }
  for (const post of rememberedPosts(parentId)) {
    if (byId.has(post.id)) continue;
    byId.set(post.id, postToChannel(post));
  }
  return [...byId.values()];
}

function overlayThread(channel: Channel, post: BoardPost): Channel {
  return {
    ...channel,
    parentId: channel.parentId ?? post.parentId ?? null,
    rawKind: channel.rawKind ?? post.rawKind,
    archived: channel.archived ?? post.archived,
    locked: channel.locked ?? post.locked,
    invitable: channel.invitable ?? post.invitable,
    autoArchiveDuration: channel.autoArchiveDuration ?? post.autoArchiveDuration,
    appliedTags: channel.appliedTags ?? post.appliedTags,
    messageCount: channel.messageCount ?? post.messageCount,
    memberCount: channel.memberCount ?? post.memberCount,
    ownerId: channel.ownerId ?? post.ownerId,
    flags: channel.flags ?? post.flags,
    followed: channel.followed ?? post.followed,
    starterContent: channel.starterContent ?? post.starter,
    starterImage: channel.starterImage ?? post.imageUrl,
    lastMessageId: channel.lastMessageId ?? post.lastMessageId,
  };
}

export function postToChannel(post: BoardPost): Channel {
  return {
    id: post.id,
    name: post.name,
    kind: "thread",
    parentId: post.parentId ?? null,
    position: 0,
    topic: post.topic ?? null,
    rawKind: post.rawKind,
    archived: post.archived,
    locked: post.locked,
    invitable: post.invitable,
    autoArchiveDuration: post.autoArchiveDuration,
    appliedTags: post.appliedTags,
    messageCount: post.messageCount,
    memberCount: post.memberCount,
    lastMessageId: post.lastMessageId,
    ownerId: post.ownerId,
    flags: post.flags,
    followed: post.followed,
    starterContent: post.starter,
    starterImage: post.imageUrl,
  };
}

export function rememberPoll(poll: Poll) {
  polls.set(`${poll.channelId}:${poll.messageId}`, poll);
}

export function pollsIn(channelId: string): Poll[] {
  return [...polls.values()].filter((poll) => poll.channelId === channelId);
}

export function rememberEvent(event: ScheduledEvent) {
  events.set(event.id, event);
}

export function forgetEvent(id: string) {
  events.delete(id);
}

export function eventsIn(guildId: string): ScheduledEvent[] {
  return [...events.values()]
    .filter((event) => event.guildId === guildId)
    .sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime));
}

export function clearParityMemory() {
  remembered.clear();
  parents.clear();
  polls.clear();
  events.clear();
}

export function pollPlan(draft: PollDraft): Result<{ plan: PollPlan }> {
  if (!snowflakeOk(draft.channelId)) return fail("Open a channel first.");
  const question = (draft.question ?? "").trim();
  if (!question) return fail("Ask a question.");
  if ([...question].length > POLL_QUESTION_MAX) return fail("Questions can be 300 characters.");
  const duration = draft.durationHours ?? 24;
  if (!(POLL_DURATIONS as readonly number[]).includes(duration)) return fail("That poll length isn't one Discord offers.");
  const answers = (draft.answers ?? [])
    .map((answer) => ({ text: (answer.text ?? "").trim(), emojiName: answer.emojiName?.trim() || "" }))
    .filter((answer) => answer.text.length > 0);
  if (answers.length < POLL_ANSWERS_MIN) return fail("Add at least two answers.");
  if (answers.length > POLL_ANSWERS_MAX) return fail("Ten answers is the limit.");
  if (answers.some((answer) => [...answer.text].length > POLL_ANSWER_MAX)) return fail("Answers can be 55 characters.");
  return {
    ok: true,
    plan: {
      method: "POST",
      path: `/channels/${draft.channelId}/messages`,
      body: {
        content: "",
        poll: {
          question: { text: question },
          answers: answers.map((answer) => {
            const media: Record<string, unknown> = { text: answer.text };
            if (answer.emojiName) media.emoji = { name: answer.emojiName };
            return { poll_media: media };
          }),
          duration,
          allow_multiselect: Boolean(draft.allowMultiselect),
          layout_type: POLL_LAYOUT_DEFAULT,
        },
      },
    },
  };
}

export function pollExpired(poll: Pick<Poll, "finalized" | "expiry">, now = Date.now()): boolean {
  if (poll.finalized) return true;
  if (!poll.expiry) return false;
  const at = Date.parse(poll.expiry);
  return Number.isFinite(at) && at <= now;
}

/** Discord shows the countdown on the poll card, then "Final results" once it closes. */
export function pollExpiryLabel(poll: Pick<Poll, "finalized" | "expiry">, now = Date.now()): string {
  if (poll.finalized) return "Final results";
  if (!poll.expiry) return "";
  const at = Date.parse(poll.expiry);
  if (!Number.isFinite(at)) return "";
  if (at <= now) return "Poll closed";
  const minutes = Math.max(1, Math.round((at - now) / 60_000));
  if (minutes < 60) return minutes === 1 ? "Ends in 1 minute" : `Ends in ${minutes} minutes`;
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 48) return hours === 1 ? "Ends in 1 hour" : `Ends in ${hours} hours`;
  const days = Math.max(1, Math.round(hours / 24));
  return days === 1 ? "Ends in 1 day" : `Ends in ${days} days`;
}

export function pollShowsResults(poll: Poll, now = Date.now()): boolean {
  return poll.finalized || pollExpired(poll, now) || poll.answers.some((answer) => answer.meVoted);
}

export function pollAnswerShare(poll: Poll, count: number): number {
  const total = poll.answers.reduce((sum, answer) => sum + Math.max(0, answer.count), 0);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, count) / total) * 100)));
}

function pollString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Client poll payloads use camelCase. A raw Discord poll object is not accepted here. */
export function pollFromClient(value: unknown, fallback?: { messageId?: string; channelId?: string }): Poll | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const question = pollString(raw.question).trim();
  if (!question) return null;
  const answers: Poll["answers"] = [];
  for (const item of Array.isArray(raw.answers) ? raw.answers : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const answerId = typeof row.answerId === "number" ? row.answerId : typeof row.answer_id === "number" ? row.answer_id : 0;
    const text = pollString(row.text).trim();
    if (!answerId || !text) continue;
    answers.push({
      answerId,
      text,
      emojiName: pollString(row.emojiName) || pollString(row.emoji_name) || null,
      emojiId: pollString(row.emojiId) || pollString(row.emoji_id) || null,
      count: typeof row.count === "number" && row.count > 0 ? row.count : 0,
      meVoted: row.meVoted === true || row.me_voted === true,
    });
  }
  if (!answers.length) return null;
  const messageId = pollString(raw.messageId) || pollString(raw.message_id) || fallback?.messageId || "";
  const channelId = pollString(raw.channelId) || pollString(raw.channel_id) || fallback?.channelId || "";
  return {
    messageId,
    channelId,
    question,
    answers,
    expiry: pollString(raw.expiry) || null,
    allowMultiselect: raw.allowMultiselect === true || raw.allow_multiselect === true,
    layoutType: typeof raw.layoutType === "number" ? raw.layoutType : typeof raw.layout_type === "number" ? raw.layout_type : 1,
    finalized: raw.finalized === true,
  };
}

export function canVote(poll: Poll, answerId: number, now = Date.now()): boolean {
  if (poll.finalized || pollExpired(poll, now)) return false;
  const answer = poll.answers.find((item) => item.answerId === answerId);
  if (!answer || answer.meVoted) return false;
  if (!poll.allowMultiselect && poll.answers.some((item) => item.meVoted)) return false;
  return true;
}

export function votePlan(poll: Poll, answerId: number): Result<{ method: "PUT"; path: string }> {
  if (!canVote(poll, answerId)) return fail(poll.finalized ? "This poll has ended." : "You already voted.");
  if (!snowflakeOk(poll.channelId) || !snowflakeOk(poll.messageId)) return fail("That poll is missing.");
  return {
    ok: true,
    method: "PUT",
    path: `/channels/${poll.channelId}/polls/${poll.messageId}/answers/${answerId}`,
  };
}

export function endPollPlan(poll: Poll): Result<{ method: "POST"; path: string }> {
  if (poll.finalized) return fail("This poll has ended.");
  if (!snowflakeOk(poll.channelId) || !snowflakeOk(poll.messageId)) return fail("That poll is missing.");
  return { ok: true, method: "POST", path: `/channels/${poll.channelId}/polls/${poll.messageId}/expire` };
}

export function votersPath(poll: Poll, answerId: number): string {
  return `/channels/${poll.channelId}/polls/${poll.messageId}/answers/${answerId}?limit=25`;
}

export function applyPollVote(poll: Poll, answerId: number, added: boolean, mine: boolean): Poll {
  return {
    ...poll,
    answers: poll.answers.map((answer) => {
      if (answer.answerId !== answerId) return answer;
      const next = answer.count + (added ? 1 : -1);
      return { ...answer, count: Math.max(0, next), meVoted: mine ? added : answer.meVoted };
    }),
  };
}

const FREQUENCY_CODE: Record<Exclude<EventFrequency, "none">, number> = {
  yearly: 0,
  monthly: 1,
  weekly: 2,
  daily: 3,
};

export function eventPlan(draft: EventDraft, now = Date.now()): Result<{ plan: EventPlan }> {
  if (!snowflakeOk(draft.guildId)) return fail("Open a server first.");
  const topic = (draft.topic ?? "").trim();
  if (!topic) return fail("Name the event.");
  if ([...topic].length > EVENT_TOPIC_MAX) return fail("Event names can be 100 characters.");
  const description = (draft.description ?? "").trim();
  if ([...description].length > EVENT_DESCRIPTION_MAX) return fail("Descriptions can be 1,000 characters.");
  const start = Date.parse(draft.start ?? "");
  if (!Number.isFinite(start)) return fail("Pick a start time.");
  if (start < now - 60_000) return fail("Start the event in the future.");
  const where = draft.location === "elsewhere" ? "external" : draft.location;
  if (where !== "voice" && where !== "stage" && where !== "external") return fail("Pick a voice channel or somewhere else.");
  const endRaw = draft.end?.trim() ?? "";
  const end = endRaw ? Date.parse(endRaw) : NaN;
  if (endRaw && !Number.isFinite(end)) return fail("That end time is not valid.");
  if (Number.isFinite(end) && end <= start) return fail("The end has to be after the start.");
  const body: Record<string, unknown> = {
    name: topic,
    privacy_level: EVENT_GUILD_ONLY,
    scheduled_start_time: new Date(start).toISOString(),
    description,
  };
  if (where === "external") {
    const location = (draft.elsewhere ?? "").trim();
    if (!location) return fail("Say where the event is.");
    if ([...location].length > EVENT_LOCATION_MAX) return fail("Locations can be 100 characters.");
    if (!Number.isFinite(end)) return fail("Somewhere else needs an end time.");
    body.entity_type = EVENT_EXTERNAL;
    body.channel_id = null;
    body.entity_metadata = { location };
    body.scheduled_end_time = new Date(end).toISOString();
  } else {
    if (!snowflakeOk(draft.channelId)) return fail("Pick a channel for the event.");
    body.entity_type = where === "stage" ? EVENT_STAGE : EVENT_VOICE;
    body.channel_id = draft.channelId;
    if (Number.isFinite(end)) body.scheduled_end_time = new Date(end).toISOString();
  }
  const frequency = draft.frequency ?? "none";
  if (frequency !== "none") {
    if (!(frequency in FREQUENCY_CODE)) return fail("That repeat option isn't one Discord offers.");
    body.recurrence_rule = {
      start: body.scheduled_start_time,
      frequency: FREQUENCY_CODE[frequency],
      interval: 1,
    };
  }
  const cover = draft.coverDataUrl?.trim() ?? "";
  if (cover) {
    if (!cover.startsWith("data:image/") || cover.length > 8_000_000) return fail("Use an image for the cover.");
    body.image = cover;
  }
  return {
    ok: true,
    plan: { method: "POST", path: `/guilds/${draft.guildId}/scheduled-events`, body },
  };
}

export function canStartEvent(event: Pick<ScheduledEvent, "status" | "entityType">): boolean {
  return event.status === EVENT_SCHEDULED && (event.entityType === EVENT_STAGE || event.entityType === EVENT_VOICE);
}

export function startEventPlan(event: Pick<ScheduledEvent, "id" | "guildId" | "status" | "entityType">): Result<{ method: "PATCH"; path: string; body: { status: number } }> {
  if (!canStartEvent(event)) return fail("Only a scheduled voice or stage event can be started.");
  if (!snowflakeOk(event.guildId) || !snowflakeOk(event.id)) return fail("That event is missing.");
  return {
    ok: true,
    method: "PATCH",
    path: `/guilds/${event.guildId}/scheduled-events/${event.id}`,
    body: { status: EVENT_ACTIVE },
  };
}

export function rsvpPlan(event: Pick<ScheduledEvent, "id" | "guildId">, interested: boolean): Result<{ method: "PUT" | "DELETE"; path: string }> {
  if (!snowflakeOk(event.guildId) || !snowflakeOk(event.id)) return fail("That event is missing.");
  return {
    ok: true,
    method: interested ? "PUT" : "DELETE",
    path: `/guilds/${event.guildId}/scheduled-events/${event.id}/users/@me`,
  };
}

export interface UnreadChannel {
  id: string;
  name: string;
  kind?: string;
  unread?: number;
  mentions?: number;
  lastMessageId?: string | null;
}

export function unreadRows(channels: readonly UnreadChannel[]): UnreadChannel[] {
  return channels.filter((channel) => (channel.unread ?? 0) > 0 || (channel.mentions ?? 0) > 0);
}

/** Bookmarks stay A's list. This does not copy them into a second store. */
export function bookmarkRows(list: readonly Bookmark[]): readonly Bookmark[] {
  return list;
}

/** Reminders stay A's list. */
export function reminderRows(list: readonly Reminder[]): readonly Reminder[] {
  return list;
}

export function ackAllStates(channels: readonly UnreadChannel[]): AckState[] {
  const states: AckState[] = [];
  for (const channel of unreadRows(channels)) {
    if (!snowflakeOk(channel.id) || !snowflakeOk(channel.lastMessageId)) continue;
    states.push({ channelId: channel.id, messageId: channel.lastMessageId });
  }
  return states;
}

export function chunkAck(states: readonly AckState[], size = ACK_CHUNK): AckState[][] {
  const width = Math.max(1, size);
  const chunks: AckState[][] = [];
  for (let index = 0; index < states.length; index += width) chunks.push(states.slice(index, index + width));
  return chunks;
}

export function ackBulkBody(states: readonly AckState[]): { read_states: { channel_id: string; message_id: string; read_state_type: number }[] } {
  return {
    read_states: states.map((state) => ({
      channel_id: state.channelId,
      message_id: state.messageId,
      read_state_type: 0,
    })),
  };
}

/**
 * Stream C publishes the pending count as `pendingFriendCount` or `pendingCount`
 * (a number or a zero-arg function) on the social module, or as
 * `globalThis.__larkPendingFriends`. Missing means the caller should fall back.
 */
export function readPendingFriendCount(source: object | null | undefined, globalValue?: unknown): number | null {
  if (source) {
    const bag = source as Record<string, unknown>;
    for (const key of ["pendingFriendCount", "pendingCount", "getPendingFriendCount", "getPendingCount"]) {
      const found = countOf(bag[key]);
      if (found != null) return found;
    }
    const list = bag.pendingFriends ?? bag.pendingRequests;
    if (Array.isArray(list)) return list.length;
  }
  return countOf(globalValue);
}

function countOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === "function") {
    try {
      return countOf(value());
    } catch {
      return null;
    }
  }
  return null;
}

/** The inbox badge is the friend-request count. C wins when it has published one. */
export function inboxFriendBadge(pendingFromC: number | null, requests: readonly FriendRequest[]): number {
  if (pendingFromC != null) return pendingFromC;
  return requests.length;
}

export function normalizeCreateThreadInput(input: unknown, fallbackChannelId?: string | null): ThreadDraft {
  if (typeof input === "string") {
    return snowflakeOk(input) ? { channelId: input } : { channelId: fallbackChannelId ?? "" };
  }
  if (!input || typeof input !== "object") return { channelId: fallbackChannelId ?? "" };
  const raw = input as Record<string, unknown>;
  const looksLikeMessage = typeof raw.content === "string" || typeof raw.authorId === "string" || typeof raw.authorName === "string";
  const channelId = typeof raw.channelId === "string" ? raw.channelId : fallbackChannelId ?? "";
  const explicitMessage = typeof raw.messageId === "string" ? raw.messageId : null;
  const messageId = explicitMessage ?? (looksLikeMessage && typeof raw.id === "string" ? raw.id : null);
  return {
    channelId,
    messageId,
    name: typeof raw.name === "string" ? raw.name : undefined,
    type: typeof raw.type === "number" ? raw.type : undefined,
    autoArchiveDuration: typeof raw.autoArchiveDuration === "number" ? raw.autoArchiveDuration : undefined,
    invitable: typeof raw.invitable === "boolean" ? raw.invitable : undefined,
    content: typeof raw.content === "string" && !looksLikeMessage ? raw.content : typeof raw.body === "string" ? raw.body : undefined,
    appliedTags: Array.isArray(raw.appliedTags) ? raw.appliedTags.filter((tag): tag is string => typeof tag === "string") : undefined,
    hasAttachment: raw.hasAttachment === true,
  };
}

export interface ParityHost {
  channelId: string | null;
  guildId: string | null;
  meId: string;
  demo: boolean;
  /** Voice channel the account is in. Activities invite into this channel. */
  voiceChannelId: string | null;
  channel(id: string): Channel | undefined;
  channels(): Channel[];
  /** Direct messages before the message-request hold. Absent on older hosts. */
  dms?(): { id: string; name: string; kind: string; recipientIds?: string[]; preview?: string }[];
  /** null until the relationship index has loaded. Empty means no friends. */
  friendIds?(): string[] | null;
  spamFilter?: string;
  messages(channelId: string): { id: string; content: string; authorName: string; authorId: string; poll?: unknown }[];
  bookmarks: readonly Bookmark[];
  reminders: readonly Reminder[];
  /** null when Stream C has not published a count. */
  pendingFriendCount: number | null;
  unreads(): UnreadChannel[];
  mask(text: string): string;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  openChannel(id: string): void;
  jump(channelId: string, messageId: string): void;
  toast(title: string, body: string): void;
  markAllRead(states: AckState[]): void;
  refresh(): void;
  rememberThread(thread: Channel): void;
}

let parityHost: ParityHost | null = null;

export function bindParityHost(host: ParityHost) {
  parityHost = host;
}

export function currentParityHost(): ParityHost | null {
  return parityHost;
}

export interface ThreadRecordWire {
  id: string;
  name: string;
  rawKind?: number;
  parentId?: string | null;
  archived?: boolean;
  locked?: boolean;
  invitable?: boolean;
  autoArchiveDuration?: number;
  messageCount?: number;
  memberCount?: number;
  lastMessageId?: string | null;
  ownerId?: string | null;
  flags?: number;
  appliedTags?: string[];
  starterContent?: string | null;
  starterImage?: string | null;
}

export interface ThreadIndexWire {
  parent: ParentChannelInfo & { id: string };
  threads: ThreadRecordWire[];
}

export function applyThreadIndex(index: ThreadIndexWire) {
  if (!index.parent?.id) return;
  rememberParent(index.parent);
  rememberPosts(
    index.threads.map((thread) => ({
      id: thread.id,
      name: thread.name,
      parentId: thread.parentId || index.parent.id,
      rawKind: thread.rawKind,
      archived: Boolean(thread.archived),
      locked: thread.locked,
      invitable: thread.invitable,
      autoArchiveDuration: thread.autoArchiveDuration,
      messageCount: thread.messageCount,
      memberCount: thread.memberCount,
      lastMessageId: thread.lastMessageId,
      ownerId: thread.ownerId,
      flags: thread.flags,
      appliedTags: thread.appliedTags ?? [],
      starter: thread.starterContent,
      imageUrl: thread.starterImage,
    })),
  );
}

type Opener<T> = (input: T) => void;

let threadOpener: Opener<ThreadDraft> = () => undefined;
let pollOpener: Opener<PollDraft> = () => undefined;
let eventOpener: Opener<string> = () => undefined;
let eventsListOpener: Opener<string> = () => undefined;

export function registerThreadOpener(opener: Opener<ThreadDraft>) {
  threadOpener = opener;
}

export function registerPollOpener(opener: Opener<PollDraft>) {
  pollOpener = opener;
}

export function registerEventOpener(opener: Opener<string>) {
  eventOpener = opener;
}

export function registerEventsListOpener(opener: Opener<string>) {
  eventsListOpener = opener;
}

/** Stream A: + Create Thread. */
export function onCreateThread(input?: unknown) {
  threadOpener(normalizeCreateThreadInput(input));
}

/** Stream A: + Create Poll. `openPollComposer` is the same opener. */
export function onCreatePoll(input?: unknown) {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const channelId = typeof input === "string" ? input : typeof raw.channelId === "string" ? raw.channelId : undefined;
  pollOpener({ channelId });
}

export const openPollComposer = onCreatePoll;

function guildFrom(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && typeof (input as { guildId?: unknown }).guildId === "string") {
    return (input as { guildId: string }).guildId;
  }
  return "";
}

/** Stream B: Create Event on the server menu. Opens the wizard. */
export function onCreateEvent(input?: unknown) {
  eventOpener(guildFrom(input));
}

export const openCreateEvent = onCreateEvent;

/** Stream B: the sidebar Events row can open the list. The wizard's back button uses this too. */
export function openEvents(input?: unknown) {
  eventsListOpener(guildFrom(input));
}
