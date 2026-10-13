import { describe, expect, it } from "vitest";
import { expandShortcodes, setCustomEmojis } from "../emoji";
import { composedError, spoilerUploadName } from "../compose";
import { setRelationshipIndex } from "../social";
import {
  commandsFromPayload,
  discordPageOk,
  filterLoadedMessages,
  gifChoice,
  gifsFromPayload,
  interactionBody,
  joinLine,
  markUnreadPlan,
  messageLink,
  messageMenuItems,
  parseSearchQuery,
  pickQuickReactions,
  plusMenuItems,
  reactorSummary,
  readBlockedIds,
  readDeveloperMode,
  readRevealSpoilers,
  readShowEmbeds,
  registerMessagingHooks,
  requestCreatePoll,
  requestCreateThread,
  requestLaunchActivity,
  resolveSearch,
  systemMessage,
} from "./composer-tools";

describe("composer plus menu and discord pages", () => {
  it("lists upload, thread, poll, and apps", () => {
    expect(plusMenuItems().map((item) => item.label)).toEqual([
      "Upload a File",
      "Create Thread",
      "Create Poll",
      "Use Apps",
    ]);
  });

  it("only allows https://discord.com pages", () => {
    expect(discordPageOk("https://discord.com/nitro")).toBe(true);
    expect(discordPageOk("https://discord.com/app-directory")).toBe(true);
    expect(discordPageOk("http://discord.com/nitro")).toBe(false);
    expect(discordPageOk("https://evil.example/nitro")).toBe(false);
    expect(discordPageOk("https://user:pass@discord.com/nitro")).toBe(false);
  });

  it("sends a gif on click and inserts the url on shift", () => {
    expect(gifChoice("https://media.tenor.com/wave.gif", false)).toEqual({
      mode: "send",
      text: "https://media.tenor.com/wave.gif",
    });
    expect(gifChoice("https://media.tenor.com/wave.gif", true)?.mode).toBe("insert");
    expect(gifChoice("http://evil.example/x.gif", false)).toBeNull();
    expect(gifsFromPayload({
      gifs: [
        { id: "1", title: "wave", url: "https://media.tenor.com/wave.gif", preview: "https://media.tenor.com/tiny.gif" },
        { url: "http://evil.example/x.gif" },
      ],
    })).toEqual([{
      id: "1",
      title: "wave",
      url: "https://media.tenor.com/wave.gif",
      preview: "https://media.tenor.com/tiny.gif",
    }]);
  });

  it("calls F's thread and poll openers and falls back for activities", () => {
    expect(requestCreateThread("", "100000000000000300")).toBe(false);
    expect(requestCreatePoll("")).toBe(false);
    expect(requestCreateThread("100000000000000022", "100000000000000300")).toBe(true);
    expect(requestCreatePoll("100000000000000022")).toBe(true);
    expect(requestLaunchActivity("100000000000000022")).toBe(false);
    let threads = 0;
    let polls = 0;
    registerMessagingHooks({
      onCreateThread: () => {
        threads += 1;
      },
      onCreatePoll: () => {
        polls += 1;
      },
      onLaunchActivity: () => undefined,
    });
    expect(requestCreateThread("100000000000000022", null)).toBe(true);
    expect(requestCreatePoll("100000000000000022")).toBe(true);
    expect(threads).toBe(1);
    expect(polls).toBe(1);
    expect(requestLaunchActivity(null)).toBe(true);
  });
});

describe("message menu", () => {
  const base = {
    mine: false,
    pinned: false,
    developerMode: false,
    bookmarked: false,
    reminded: false,
    hasTranslate: false,
    translated: false,
    hasHide: false,
  };

  it("keeps three quick reactions even when a plugin offers more", () => {
    expect(pickQuickReactions(["👍", "❤️", "😂", "🎉", "👀"], ["🔥"])).toEqual(["👍", "❤️", "😂"]);
    expect(pickQuickReactions(undefined, undefined)).toEqual(["👍", "❤️", "😂"]);
  });

  it("hides Copy Message ID until developer mode is on", () => {
    const hidden = messageMenuItems(base).map((item) => item.label);
    expect(hidden).toContain("Bookmark Message");
    expect(hidden).toContain("Create Reminder");
    expect(hidden).toContain("Mark Unread");
    expect(hidden).toContain("Copy Message Link");
    expect(hidden).toContain("Speak Message");
    expect(hidden).toContain("Forward Message");
    expect(hidden).not.toContain("Copy Message ID");
    expect(messageMenuItems({ ...base, developerMode: true, pinned: true, bookmarked: true, reminded: true }).map((item) => item.label))
      .toEqual(expect.arrayContaining(["Unpin Message", "Remove Bookmark", "Remove Reminder", "Copy Message ID"]));
  });

  it("builds a discord message link and an unread ack before the target", () => {
    expect(messageLink(null, "100000000000000022", "100000000000000300")).toBe(
      "https://discord.com/channels/@me/100000000000000022/100000000000000300",
    );
    expect(messageLink("100000000000000010", "100000000000000022", "100000000000000300")).toContain("/100000000000000010/");
    const ids = ["100000000000000100", "100000000000000200", "100000000000000300"];
    expect(markUnreadPlan(ids, "100000000000000200")).toEqual({ ackId: "100000000000000100", count: 2 });
    expect(markUnreadPlan(ids, ids[0]).ackId).toBe((BigInt(ids[0]) - 1n).toString());
  });

  it("summarizes who reacted", () => {
    expect(reactorSummary([])).toBe("Nobody reacted");
    expect(reactorSummary(["Maya"])).toBe("Maya");
    expect(reactorSummary(["Maya", "Jonah"])).toBe("Maya and Jonah");
    expect(reactorSummary(["Maya", "Jonah", "Ethan", "Priya"])).toBe("Maya, Jonah, and 2 others");
  });
});

describe("search filters and system copy", () => {
  it("parses discord search filters into snowflakes", () => {
    const parsed = parseSearchQuery('hello from:me mentions:@Maya has:image before:2020-01-01 in:#design pinned:true');
    expect(parsed.content).toBe("hello");
    expect(parsed.has).toEqual(["image"]);
    expect(parsed.pinned).toBe(true);
    const resolved = resolveSearch(parsed, {
      meId: "100000000000000001",
      users: { "100000000000000007": "Maya Chen" },
      channels: { "100000000000000022": "design" },
    });
    expect(resolved.authorIds).toEqual(["100000000000000001"]);
    expect(resolved.mentionIds).toEqual(["100000000000000007"]);
    expect(resolved.channelIds).toEqual(["100000000000000022"]);
    expect(resolved.beforeId).toMatch(/^\d{15,}$/);
    expect(resolved.unresolved).toEqual([]);
    const missed = resolveSearch(parseSearchQuery("from:nobody"), {
      meId: "100000000000000001",
      users: {},
      channels: {},
    });
    expect(missed.authorIds).toEqual([]);
    expect(missed.unresolved).toEqual(["from:nobody"]);
  });

  it("filters loaded messages without sending unresolved names", () => {
    const search = resolveSearch(parseSearchQuery("from:Maya has:file"), {
      meId: "1",
      users: { "7": "Maya" },
      channels: {},
    });
    const hits = filterLoadedMessages([
      { id: "a", channelId: "c", authorId: "7", authorName: "Maya", content: "notes", timestamp: "2020-01-02T00:00:00.000Z", attachments: [{ name: "a.pdf" }] },
      { id: "b", channelId: "c", authorId: "8", authorName: "Jonah", content: "notes", timestamp: "2020-01-02T00:00:00.000Z", attachments: [{ name: "a.pdf" }] },
    ], search);
    expect(hits.map((hit) => hit.id)).toEqual(["a"]);
  });

  it("uses discord system-message wording", () => {
    expect(systemMessage({ id: "1", kind: "join", authorName: "Maya", content: "" })?.text).toBe(joinLine("Maya", "1"));
    expect(systemMessage({ id: "2", messageType: 3, authorName: "Maya", content: "", timestamp: "2026-10-06T12:00:00.000Z", callEnded: "2026-10-06T12:05:00.000Z" })?.text)
      .toBe("Maya started a call that lasted 5 minutes.");
    expect(systemMessage({ id: "3", messageType: 6, authorName: "Maya", content: "" })).toMatchObject({
      text: "Maya pinned a message to this channel.",
      pins: true,
    });
    expect(systemMessage({ id: "4", messageType: 8, authorName: "Maya", content: "" })?.text).toBe("Maya just boosted the server!");
    expect(systemMessage({ id: "5", messageType: 9, authorName: "Maya", content: "" })?.text).toContain("Level 1");
  });
});

describe("slash commands, spoilers, and stream flags", () => {
  it("builds an interaction body and reads app commands", () => {
    const command = {
      id: "100000000000000050",
      applicationId: "100000000000000060",
      name: "wave",
      description: "Wave",
      type: 1,
      version: "100000000000000070",
      options: [],
    };
    const body = interactionBody({ command, channelId: "100000000000000022", guildId: "100000000000000010", args: "" });
    expect(body).toMatchObject({
      type: 2,
      application_id: "100000000000000060",
      channel_id: "100000000000000022",
      guild_id: "100000000000000010",
    });
    expect(commandsFromPayload([{
      id: "100000000000000050",
      applicationId: "100000000000000060",
      name: "wave",
      type: 3,
      options: [{ name: "user", type: 6, required: true }],
    }])[0]).toMatchObject({ name: "wave", type: 3, options: [{ name: "user", required: true }] });
  });

  it("prefixes spoiler uploads and allows an empty body when a sticker is attached", () => {
    expect(spoilerUploadName("photo.png", true)).toBe("SPOILER_photo.png");
    expect(spoilerUploadName("SPOILER_photo.png", true)).toBe("SPOILER_photo.png");
    expect(composedError("", 0, 0, 1)).toBeNull();
    expect(composedError("", 0, 0, 0)).toMatch(/Write a message/);
    setCustomEmojis([{ name: "lark", id: "99", animated: false }]);
    expect(expandShortcodes("hi :thumbsup: :lark:")).toBe("hi 👍 <:lark:99>");
  });

  it("reads developer mode, embeds, spoilers, and the blocked-id set from fallbacks", () => {
    const bag = globalThis as unknown as {
      __larkDeveloperMode?: boolean;
      __larkShowEmbeds?: boolean;
      __larkRevealSpoilers?: boolean;
      __larkBlockedIds?: Set<string>;
    };
    delete bag.__larkDeveloperMode;
    delete bag.__larkShowEmbeds;
    delete bag.__larkRevealSpoilers;
    delete bag.__larkBlockedIds;
    setRelationshipIndex([]);
    expect(readDeveloperMode({})).toBe(false);
    expect(readShowEmbeds({})).toBe(true);
    expect(readRevealSpoilers({})).toBe(false);
    expect(readDeveloperMode({ display: { developer_mode: true, show_embeds: false, show_spoilers: true } })).toBe(true);
    expect(readShowEmbeds({ display: { developer_mode: true, show_embeds: false, show_spoilers: true } })).toBe(false);
    expect(readRevealSpoilers({ display: { developer_mode: true, show_embeds: false, show_spoilers: true } })).toBe(true);
    expect(readBlockedIds().size).toBe(0);
    setRelationshipIndex([{ id: "9", kind: "blocked", name: "Blocked", username: "blocked", nickname: "" }]);
    expect([...readBlockedIds()]).toEqual(["9"]);
    bag.__larkDeveloperMode = true;
    bag.__larkBlockedIds = new Set(["7"]);
    expect(readDeveloperMode({})).toBe(true);
    expect([...readBlockedIds()].sort()).toEqual(["7", "9"]);
    delete bag.__larkDeveloperMode;
    delete bag.__larkBlockedIds;
    setRelationshipIndex([]);
  });
});

describe("slash commands with options", () => {
  it("offers the options form instead of a half-typed command", async () => {
    const tools = await import("./composer-tools");
    tools.setSlashCommands(tools.commandsFromPayload([{ id: "100000000000000010", application_id: "100000000000000020", name: "remind", type: 1, options: [{ type: 3, name: "what", required: true }] }]));
    const hit = tools.slashSuggestions("remi").find((item) => item.label === "/remind");
    expect(hit?.token).toContain('"op":"form"');
  });
});
