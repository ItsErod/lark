import { describe, expect, it, beforeEach } from "vitest";
import type { Bookmark } from "./pack/bookmarks";
import type { Reminder } from "./reminders";
import {
  CHANNEL_MEDIA,
  REQUIRE_TAG_FLAG,
  THREAD_ANNOUNCEMENT,
  THREAD_NOTIFY_ALL,
  THREAD_NOTIFY_MENTIONS,
  THREAD_PRIVATE,
  THREAD_PUBLIC,
  ackAllStates,
  ackBulkBody,
  applyPollVote,
  archivePlan,
  bookmarkRows,
  canStartEvent,
  canVote,
  chunkAck,
  clearParityMemory,
  defaultForumSort,
  endPollPlan,
  eventPlan,
  filterPosts,
  followPlan,
  forumFollowPlan,
  galleryPosts,
  guidelinesText,
  inboxFriendBadge,
  isMediaChannel,
  memberPlan,
  mergeThreadChannels,
  normalizeCreateThreadInput,
  onCreateEvent,
  onCreatePoll,
  onCreateThread,
  openCreateEvent,
  openEvents,
  openPollComposer,
  partitionBoard,
  registerEventOpener,
  registerEventsListOpener,
  registerPollOpener,
  registerThreadOpener,
  pollPlan,
  readPendingFriendCount,
  reminderRows,
  rsvpPlan,
  rememberPosts,
  sortPosts,
  startEventPlan,
  startThreadFromMessage,
  tagsRequired,
  threadKindLabel,
  unreadRows,
  votePlan,
  type BoardPost,
} from "./threads";
import type { Channel, Poll } from "./types";

const CHANNEL = "100000000000000022";
const MESSAGE = "100000000000000220";
const GUILD = "100000000000000010";
const TAG = "100000000000000901";

function post(partial: Partial<BoardPost> & { id: string; name: string }): BoardPost {
  return { archived: false, appliedTags: [], ...partial };
}

describe("threads", () => {
  it("starts a public thread from a message without sending a type", () => {
    const plan = startThreadFromMessage({ channelId: CHANNEL, messageId: MESSAGE, name: "Ship notes" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.route).toBe("from-message");
    expect(plan.plan.path).toBe(`/channels/${CHANNEL}/messages/${MESSAGE}/threads`);
    expect(plan.plan.body).toEqual({ name: "Ship notes", auto_archive_duration: 1440 });
    expect(plan.plan.body).not.toHaveProperty("type");
  });

  it("starts a private thread on its own route even when a message is attached", () => {
    const plan = startThreadFromMessage({
      channelId: CHANNEL,
      messageId: MESSAGE,
      name: "Quiet",
      type: THREAD_PRIVATE,
      invitable: false,
      autoArchiveDuration: 60,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.route).toBe("standalone");
    expect(plan.plan.path).toBe(`/channels/${CHANNEL}/threads`);
    expect(plan.plan.body).toEqual({
      name: "Quiet",
      auto_archive_duration: 60,
      type: THREAD_PRIVATE,
      invitable: false,
    });
  });

  it("uses an announcement thread in an announcement channel and refuses one in text", () => {
    const made = startThreadFromMessage(
      { channelId: CHANNEL, name: "News", type: THREAD_ANNOUNCEMENT },
      { kind: "announcement", rawKind: 5 },
    );
    expect(made.ok).toBe(true);
    if (made.ok) expect(made.plan.body).toMatchObject({ type: THREAD_ANNOUNCEMENT });
    const refused = startThreadFromMessage({ channelId: CHANNEL, name: "News", type: THREAD_ANNOUNCEMENT }, { kind: "text", rawKind: 0 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/announcement/i);
    expect(threadKindLabel(THREAD_PUBLIC)).toBe("Public");
    expect(threadKindLabel(THREAD_PRIVATE)).toBe("Private");
    expect(threadKindLabel(THREAD_ANNOUNCEMENT)).toBe("Announcement");
  });

  it("archives with a boolean and follows by thread-member flags", () => {
    const archived = archivePlan(CHANNEL, true);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.method).toBe("PATCH");
      expect(archived.path).toBe(`/channels/${CHANNEL}`);
      expect(archived.body).toEqual({ archived: true });
    }
    const follow = followPlan(CHANNEL, true);
    const mute = followPlan(CHANNEL, false);
    expect(follow.ok && follow.body.flags).toBe(THREAD_NOTIFY_ALL);
    expect(mute.ok && mute.body.flags).toBe(THREAD_NOTIFY_MENTIONS);
    expect(follow.ok && follow.path).toBe(`/channels/${CHANNEL}/thread-members/@me/settings`);
    const added = memberPlan(CHANNEL, MESSAGE, true);
    expect(added.ok && added.method).toBe("PUT");
    expect(added.ok && added.path).toContain(`/thread-members/${MESSAGE}`);
  });

  it("reads a message object the composer hook may pass", () => {
    const draft = normalizeCreateThreadInput({ id: MESSAGE, channelId: CHANNEL, content: "hello", authorId: "1" });
    expect(draft.messageId).toBe(MESSAGE);
    expect(draft.channelId).toBe(CHANNEL);
    expect(draft.content).toBeUndefined();
  });
});

describe("forums and media", () => {
  const parent = {
    id: CHANNEL,
    kind: "forum" as const,
    rawKind: 15,
    flags: REQUIRE_TAG_FLAG,
    topic: "  Be kind.\nBring a frame. ",
    availableTags: [{ id: TAG, name: "Wordmark" }],
  };

  it("requires a tag and a message, then posts on the forum route", () => {
    expect(tagsRequired(REQUIRE_TAG_FLAG)).toBe(true);
    expect(guidelinesText(parent.topic)).toBe("Be kind. Bring a frame.");
    expect(defaultForumSort(1)).toBe("creation");
    expect(defaultForumSort(null)).toBe("latest");
    const missing = startThreadFromMessage({ channelId: CHANNEL, name: "Mark", content: "Hello" }, parent);
    expect(missing.ok).toBe(false);
    const made = startThreadFromMessage({ channelId: CHANNEL, name: "Mark", content: "Hello", appliedTags: [TAG] }, parent);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.plan.route).toBe("forum-post");
    expect(made.plan.path).toBe(`/channels/${CHANNEL}/threads`);
    expect(made.plan.body).toMatchObject({
      name: "Mark",
      applied_tags: [TAG],
      message: { content: "Hello" },
    });
    expect(made.plan.body).not.toHaveProperty("type");
  });

  it("sorts by latest activity or creation and filters tags", () => {
    const posts = [
      post({ id: "100000000000000003", name: "Old", lastMessageId: "100000000000000010", appliedTags: [TAG] }),
      post({ id: "100000000000000009", name: "New", lastMessageId: "100000000000000004" }),
      post({ id: "100000000000000008", name: "Archived", lastMessageId: "100000000000000050", archived: true, appliedTags: [TAG] }),
    ];
    expect(sortPosts(posts, "latest").map((item) => item.name)).toEqual(["Archived", "Old", "New"]);
    expect(sortPosts(posts, "creation").map((item) => item.name)).toEqual(["New", "Archived", "Old"]);
    const board = partitionBoard(posts, "latest", TAG);
    expect(board.active.map((item) => item.name)).toEqual(["Old"]);
    expect(board.archived.map((item) => item.name)).toEqual(["Archived"]);
    expect(filterPosts(posts, null, false)).toHaveLength(2);
  });

  it("treats kind media and raw kind 16 as a gallery, separate from forum list sort", () => {
    expect(isMediaChannel({ kind: "text", rawKind: CHANNEL_MEDIA })).toBe(true);
    expect(isMediaChannel({ kind: "media" })).toBe(true);
    expect(isMediaChannel({ kind: "forum", rawKind: 15 })).toBe(false);
    const tiles = galleryPosts(
      [
        post({ id: "100000000000000002", name: "Still", imageUrl: null, lastMessageId: "100000000000000020" }),
        post({ id: "100000000000000001", name: "Clip", imageUrl: "https://cdn.discordapp.com/a.png", lastMessageId: "100000000000000030" }),
      ],
      "latest",
      null,
    );
    expect(tiles.map((item) => item.name)).toEqual(["Clip", "Still"]);
    const missing = startThreadFromMessage(
      { channelId: CHANNEL, name: "Poster", content: "Look", appliedTags: [] },
      { rawKind: CHANNEL_MEDIA, kind: "media" },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/image or video/i);
    const follow = forumFollowPlan(GUILD, CHANNEL, true);
    expect(follow.ok).toBe(true);
    if (follow.ok) {
      expect(follow.path).toBe(`/users/@me/guilds/${GUILD}/settings`);
      expect(follow.body.channel_overrides).toMatchObject({ [CHANNEL]: { muted: false, message_notifications: 0 } });
    }
  });

  it("keeps archived raw kinds when the live list only has the thread name", () => {
    rememberPosts([
      post({ id: MESSAGE, name: "Wordmark", parentId: CHANNEL, rawKind: THREAD_PRIVATE, archived: true, messageCount: 4 }),
    ]);
    const live: Channel = { id: MESSAGE, name: "Wordmark", kind: "thread", parentId: CHANNEL, position: 0 };
    const merged = mergeThreadChannels(CHANNEL, [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("thread");
    expect(merged[0].rawKind).toBe(THREAD_PRIVATE);
    expect(merged[0].archived).toBe(true);
    expect(merged[0].messageCount).toBe(4);
    clearParityMemory();
  });
});

describe("polls", () => {
  const poll: Poll = {
    messageId: MESSAGE,
    channelId: CHANNEL,
    question: "Lunch?",
    answers: [
      { answerId: 1, text: "Yes", count: 1, meVoted: false },
      { answerId: 2, text: "No", count: 0, meVoted: false },
    ],
    expiry: null,
    allowMultiselect: false,
    layoutType: 1,
    finalized: false,
  };

  it("builds Discord's poll message body", () => {
    const plan = pollPlan({
      channelId: CHANNEL,
      question: " Lunch? ",
      answers: [{ text: "Yes", emojiName: "👍" }, { text: " " }, { text: "No" }],
      durationHours: 24,
      allowMultiselect: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.path).toBe(`/channels/${CHANNEL}/messages`);
    expect(plan.plan.body).toEqual({
      content: "",
      poll: {
        question: { text: "Lunch?" },
        answers: [{ poll_media: { text: "Yes", emoji: { name: "👍" } } }, { poll_media: { text: "No" } }],
        duration: 24,
        allow_multiselect: false,
        layout_type: 1,
      },
    });
    expect(pollPlan({ channelId: CHANNEL, question: "Q", answers: [{ text: "Only" }], durationHours: 24 }).ok).toBe(false);
    expect(pollPlan({ channelId: CHANNEL, question: "Q", answers: [{ text: "A" }, { text: "B" }], durationHours: 3 }).ok).toBe(false);
  });

  it("votes with PUT, ends with expire, and will not vote twice on a single-choice poll", () => {
    expect(canVote(poll, 1)).toBe(true);
    const vote = votePlan(poll, 1);
    expect(vote.ok && vote.method).toBe("PUT");
    expect(vote.ok && vote.path).toBe(`/channels/${CHANNEL}/polls/${MESSAGE}/answers/1`);
    const voted = applyPollVote(poll, 1, true, true);
    expect(voted.answers[0]).toMatchObject({ count: 2, meVoted: true });
    expect(canVote(voted, 2)).toBe(false);
    expect(votePlan(voted, 2).ok).toBe(false);
    const end = endPollPlan(poll);
    expect(end.ok && end.path).toBe(`/channels/${CHANNEL}/polls/${MESSAGE}/expire`);
    expect(endPollPlan({ ...poll, finalized: true }).ok).toBe(false);
  });
});

describe("events", () => {
  const now = Date.parse("2026-10-12T18:00:00.000Z");

  it("creates a voice event and an elsewhere event with a recurrence rule", () => {
    const voice = eventPlan(
      {
        guildId: GUILD,
        topic: "Ship review",
        description: "Look at the build",
        location: "voice",
        channelId: CHANNEL,
        start: "2026-10-13T18:00:00.000Z",
        end: "2026-10-13T19:00:00.000Z",
        frequency: "weekly",
      },
      now,
    );
    expect(voice.ok).toBe(true);
    if (voice.ok) {
      expect(voice.plan.path).toBe(`/guilds/${GUILD}/scheduled-events`);
      expect(voice.plan.body).toMatchObject({
        name: "Ship review",
        privacy_level: 2,
        entity_type: 2,
        channel_id: CHANNEL,
        recurrence_rule: { frequency: 2, interval: 1 },
      });
      expect(voice.plan.body).not.toHaveProperty("entity_metadata");
    }
    const elsewhere = eventPlan(
      {
        guildId: GUILD,
        topic: "Coffee",
        location: "elsewhere",
        elsewhere: "The lobby",
        start: "2026-10-13T18:00:00.000Z",
        end: "2026-10-13T19:00:00.000Z",
        frequency: "none",
      },
      now,
    );
    expect(elsewhere.ok).toBe(true);
    if (elsewhere.ok) {
      expect(elsewhere.plan.body).toMatchObject({
        entity_type: 3,
        channel_id: null,
        entity_metadata: { location: "The lobby" },
      });
    }
    expect(eventPlan({ guildId: GUILD, topic: "Coffee", location: "external", elsewhere: "Lobby", start: "2026-10-13T18:00:00.000Z" }, now).ok).toBe(false);
  });

  it("starts voice and stage events and RSVPs with PUT or DELETE", () => {
    const scheduled = { id: MESSAGE, guildId: GUILD, status: 1, entityType: 2 };
    expect(canStartEvent(scheduled)).toBe(true);
    expect(canStartEvent({ ...scheduled, entityType: 3 })).toBe(false);
    expect(canStartEvent({ ...scheduled, status: 2 })).toBe(false);
    const start = startEventPlan(scheduled);
    expect(start.ok && start.body).toEqual({ status: 2 });
    expect(start.ok && start.path).toBe(`/guilds/${GUILD}/scheduled-events/${MESSAGE}`);
    expect(rsvpPlan(scheduled, true).ok && rsvpPlan(scheduled, true).ok).toBe(true);
    const interested = rsvpPlan(scheduled, true);
    const leave = rsvpPlan(scheduled, false);
    expect(interested.ok && interested.method).toBe("PUT");
    expect(leave.ok && leave.method).toBe("DELETE");
    expect(interested.ok && interested.path.endsWith("/users/@me")).toBe(true);
  });
});

describe("inbox", () => {
  const saved: Bookmark[] = [
    { messageId: MESSAGE, channelId: CHANNEL, authorName: "Maya", excerpt: "Frame", savedAt: 1 },
  ];
  const reminders: Reminder[] = [
    { id: "remind-1", messageId: MESSAGE, channelId: CHANNEL, authorName: "Maya", excerpt: "Frame", remindAt: 10 },
  ];

  beforeEach(() => clearParityMemory());

  it("reads bookmark and reminder lists without copying them into a new store", () => {
    expect(bookmarkRows(saved)).toBe(saved);
    expect(reminderRows(reminders)).toBe(reminders);
  });

  it("marks every unread channel read in Discord's bulk ack body", () => {
    const states = ackAllStates([
      { id: CHANNEL, name: "general", unread: 2, lastMessageId: MESSAGE },
      { id: "100000000000000023", name: "quiet", unread: 0, mentions: 0, lastMessageId: MESSAGE },
      { id: "not-an-id", name: "bad", unread: 1, lastMessageId: MESSAGE },
    ]);
    expect(states).toEqual([{ channelId: CHANNEL, messageId: MESSAGE }]);
    expect(ackBulkBody(states)).toEqual({
      read_states: [{ channel_id: CHANNEL, message_id: MESSAGE, read_state_type: 0 }],
    });
    expect(chunkAck(states.concat(states), 1)).toHaveLength(2);
    expect(unreadRows([{ id: CHANNEL, name: "general", mentions: 1 }])).toHaveLength(1);
  });

  it("uses Stream C's pending count and falls back when it is not published", () => {
    expect(readPendingFriendCount(null, undefined)).toBeNull();
    expect(readPendingFriendCount({ pendingFriendCount: 3 }, undefined)).toBe(3);
    expect(readPendingFriendCount({ pendingCount: () => 2 }, undefined)).toBe(2);
    expect(readPendingFriendCount({ pendingFriends: [{ id: "1" }, { id: "2" }] }, undefined)).toBe(2);
    expect(readPendingFriendCount(null, 4)).toBe(4);
    expect(inboxFriendBadge(null, [{ id: "1", name: "Maya", incoming: true }])).toBe(1);
    expect(inboxFriendBadge(0, [{ id: "1", name: "Maya", incoming: true }])).toBe(0);
    expect(inboxFriendBadge(5, [])).toBe(5);
  });

  it("exposes the composer and server-menu contracts", () => {
    const threads: unknown[] = [];
    const polls: unknown[] = [];
    const created: unknown[] = [];
    const listed: unknown[] = [];
    registerThreadOpener((draft) => threads.push(draft));
    registerPollOpener((draft) => polls.push(draft));
    registerEventOpener((guildId) => created.push(guildId));
    registerEventsListOpener((guildId) => listed.push(guildId));
    onCreateThread({ id: MESSAGE, channelId: CHANNEL, content: "hi", authorName: "Maya" });
    onCreatePoll({ channelId: CHANNEL });
    openPollComposer(CHANNEL);
    onCreateEvent(GUILD);
    openCreateEvent({ guildId: GUILD });
    openEvents({ guildId: GUILD });
    expect(threads).toEqual([expect.objectContaining({ channelId: CHANNEL, messageId: MESSAGE })]);
    expect(polls).toEqual([{ channelId: CHANNEL }, { channelId: CHANNEL }]);
    expect(created).toEqual([GUILD, GUILD]);
    expect(listed).toEqual([GUILD]);
  });
});
