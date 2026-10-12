import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  GUILD_SETTINGS_PAGES,
  automodBody,
  boostProgress,
  channelContextItems,
  channelIsPrivate,
  channelLink,
  channelNotifyBody,
  clampBitrate,
  clampChannelName,
  clampSlowmode,
  clampTag,
  communityBody,
  createChannelBody,
  deleteConfirmed,
  duplicateChannelBody,
  expressionSlots,
  guildCreateBody,
  guildNotifyBody,
  hasPerm,
  headerMenuItems,
  hideMutedChannel,
  inviteBody,
  movedPosition,
  openCreateEvent,
  openPerServerProfile,
  orderChannels,
  parseFlag,
  parseIdMap,
  PERMISSION_GROUPS,
  permissionsIn,
  pruneBody,
  reorderRole,
  searchPeople,
  serverContextItems,
  snowflakeTime,
  sortMemberTable,
  syncOverwritePlan,
  systemFlagOn,
  tagOk,
  textChannelPatch,
  timeoutUntil,
  toggleId,
  togglePerm,
  toggleSystemFlag,
  vanityOk,
  VIEW_CHANNEL,
  voiceChannelPatch,
} from "./server-model";

describe("server menus and channel tools", () => {
  it("names every server context command from the parity list", () => {
    const labels = serverContextItems().map((item) => item.label);
    expect(labels).toEqual([
      "Mark As Read",
      "Invite People",
      "Mute Server",
      "Notification Settings",
      "Hide Muted Channels",
      "Server Settings",
      "Privacy Settings",
      "Per-server Profile",
      "Create Channel",
      "Create Category",
      "Create Event",
      "Move to",
      "Copy Server ID",
    ]);
    expect(headerMenuItems(2).some((item) => item.label.includes("Level 2"))).toBe(true);
    expect(headerMenuItems(null).some((item) => item.id === "apps")).toBe(true);
  });

  it("builds channel and category menus", () => {
    const ids = channelContextItems("text").map((item) => item.id);
    expect(ids).toContain("favorite");
    expect(ids).toContain("pin-top");
    expect(ids).toContain("duplicate");
    expect(channelContextItems("text").find((item) => item.id === "delete")?.danger).toBe(true);
  });

  it("locks a channel @everyone cannot view", () => {
    expect(channelIsPrivate("g", [{ id: "g", kind: 0, allow: "0", deny: VIEW_CHANNEL.toString() }])).toBe(true);
    expect(channelIsPrivate("g", [{ id: "g", kind: 0, allow: VIEW_CHANNEL.toString(), deny: "0" }])).toBe(false);
    expect(channelIsPrivate("g", undefined)).toBe(false);
  });

  it("writes notification levels in Discord's integers and keeps a local copy separate", () => {
    expect(channelNotifyBody("12345678901234567", "mentions")).toEqual({
      channel_overrides: { "12345678901234567": { muted: false, message_notifications: 2 } },
    });
    expect(channelNotifyBody("12345678901234567", "mute")).toMatchObject({
      channel_overrides: { "12345678901234567": { muted: true, message_notifications: 3 } },
    });
    expect(guildNotifyBody("all")).toEqual({ muted: false, message_notifications: 0 });
    expect(guildNotifyBody("mute")).toEqual({ muted: true });
  });

  it("creates private text, voice, and forum channels", () => {
    const body = createChannelBody({
      name: "Secret Plans",
      kind: "text",
      isPrivate: true,
      guildId: "100000000000000001",
      userId: "100000000000000002",
      parentId: "100000000000000003",
    });
    expect(body).toMatchObject({ name: "secret-plans", type: 0, parent_id: "100000000000000003" });
    const overwrites = (body?.permission_overwrites ?? []) as { id: string; deny: string }[];
    expect(overwrites[0]?.deny).toBe(VIEW_CHANNEL.toString());
    expect(createChannelBody({ name: "Lobby", kind: "voice", guildId: "1" })?.type).toBe(2);
    expect(createChannelBody({ name: "Posts", kind: "forum", guildId: "1" })?.name).toBe("posts");
    expect(createChannelBody({ name: "   ", kind: "text", guildId: "1" })).toBeNull();
    expect(clampChannelName("Lobby North", "voice")).toBe("Lobby North");
  });

  it("builds an invite and a templated server", () => {
    expect(inviteBody({ maxAge: 3600, maxUses: 5, temporary: true })).toEqual({
      max_age: 3600,
      max_uses: 5,
      temporary: true,
      unique: true,
    });
    expect(inviteBody({ maxAge: 12, maxUses: 3, temporary: false }).max_age).toBe(86400);
    const guild = guildCreateBody("Northwind", "gaming");
    expect(guild?.name).toBe("Northwind");
    expect((guild?.channels as { name: string }[])[0]?.name).toBe("general");
    expect(guildCreateBody("  ", "blank")).toBeNull();
    expect(searchPeople([{ id: "1", name: "Maya Chen" }, { id: "2", name: "Jonah" }], "may")).toEqual([
      { id: "1", name: "Maya Chen" },
    ]);
  });

  it("stores favorites and hides muted rows", () => {
    expect(parseIdMap(JSON.stringify({ "100000000000000001": ["100000000000000002", "nope"] }))).toEqual({
      "100000000000000001": ["100000000000000002"],
    });
    expect(parseIdMap("nope")).toEqual({});
    expect(parseFlag("1")).toBe(true);
    expect(toggleId(["a"], "a")).toEqual([]);
    expect(orderChannels([{ id: "b", position: 0 }, { id: "a", position: 1 }], ["a"]).map((item) => item.id)).toEqual(["a", "b"]);
    expect(hideMutedChannel({ hide: true, level: "mute", selected: false, kind: "text" })).toBe(true);
    expect(hideMutedChannel({ hide: true, level: "mute", selected: true, kind: "text" })).toBe(false);
    expect(channelLink("g", "c")).toBe("https://discord.com/channels/g/c");
  });

  it("edits text and voice channels inside Discord's ranges", () => {
    expect(textChannelPatch({ name: "General", topic: "hello", slowmode: 12, nsfw: true, hideAfter: 1440 })).toMatchObject({
      name: "general",
      rate_limit_per_user: 10,
      nsfw: true,
      default_auto_archive_duration: 1440,
    });
    expect(clampSlowmode(0)).toBe(0);
    expect(voiceChannelPatch({ name: "Booth", bitrateKbps: 4, videoQuality: 2, userLimit: 200, region: "auto" })).toEqual({
      name: "Booth",
      bitrate: 8000,
      video_quality_mode: 2,
      user_limit: 99,
      rtc_region: null,
    });
    expect(clampBitrate(128)).toBe(96000);
    expect(duplicateChannelBody({ name: "general", kind: "text", topic: "t", parentId: "9" })).toMatchObject({
      name: "general-copy",
      type: 0,
      parent_id: "9",
      topic: "t",
    });
  });

  it("syncs overwrites, reorders roles, and moves a channel", () => {
    const plan = syncOverwritePlan(
      [{ id: "role", kind: 0, allow: "1", deny: "0" }],
      [
        { id: "role", kind: 0, allow: "0", deny: "1" },
        { id: "gone", kind: 1, allow: "0", deny: "1" },
      ],
    );
    expect(plan.put).toHaveLength(1);
    expect(plan.remove).toEqual(["gone"]);
    const roles = [
      { id: "everyone", name: "@everyone", position: 0 },
      { id: "a", name: "A", position: 1 },
      { id: "b", name: "B", position: 2 },
    ];
    expect(reorderRole(roles, "everyone", 1)).toBeNull();
    expect(reorderRole(roles, "a", 1)).toEqual([
      { id: "a", position: 2 },
      { id: "b", position: 1 },
    ]);
    expect(movedPosition([{ id: "a", position: 1, parentId: null }, { id: "b", position: 2, parentId: null }], "b", "up")?.position).toBe(1);
  });

  it("covers boosts, tags, safety helpers, members, and automod", () => {
    expect(boostProgress(3)).toMatchObject({ level: 1, next: 7 });
    expect(boostProgress(14).ratio).toBe(1);
    expect(expressionSlots(0).emoji).toBe(50);
    expect(expressionSlots(3).sticker).toBe(60);
    expect(clampTag("la rk!")).toBe("LARK");
    expect(tagOk("LARK")).toBe(true);
    expect(tagOk("LAR")).toBe(false);
    expect(vanityOk("north-wind")).toBe(true);
    expect(vanityOk("A")).toBe(false);
    expect(systemFlagOn(1, 1)).toBe(false);
    expect(toggleSystemFlag(1, 1, true)).toBe(0);
    expect(timeoutUntil(60, 0)).toBe("1970-01-01T00:01:00.000Z");
    expect(snowflakeTime("175928847299117063")).toMatch(/^\d{4}-/);
    const sorted = sortMemberTable(
      [
        { id: "2", name: "Jonah", roles: ["Mod"], signals: [] },
        { id: "1", name: "Maya", roles: ["Admin"], signals: ["Pending"] },
      ],
      "name",
    );
    expect(sorted.map((row) => row.name)).toEqual(["Jonah", "Maya"]);
    expect(pruneBody(99).days).toBe(7);
    expect(automodBody({ kind: "custom", name: "Words", words: ["spam"] })?.trigger_type).toBe(1);
    expect(automodBody({ kind: "mention", name: "Mentions", mentionLimit: 8 })?.trigger_type).toBe(5);
    expect(automodBody({ kind: "spam", name: "Spam" })?.trigger_type).toBe(3);
    expect(automodBody({ kind: "preset", name: "Flagged" })?.trigger_type).toBe(4);
    expect(automodBody({ kind: "custom", name: "Empty", words: [] })).toBeNull();
    expect(communityBody({ rulesChannelId: "100000000000000001", updatesChannelId: "100000000000000002", features: [] })).toMatchObject({
      rules_channel_id: "100000000000000001",
      features: ["COMMUNITY"],
    });
    expect(deleteConfirmed("Northwind", "Northwind")).toBe(true);
    expect(deleteConfirmed("northwind", "Northwind")).toBe(false);
    expect(PERMISSION_GROUPS).toContain("Advanced");
    expect(permissionsIn("Advanced").map((item) => item.label)).toEqual(["Administrator"]);
    expect(hasPerm(togglePerm(0n, VIEW_CHANNEL, true), VIEW_CHANNEL)).toBe(true);
    expect(AUDIT_ACTIONS.some((item) => item.label === "Member banned")).toBe(true);
    const pages = GUILD_SETTINGS_PAGES.map((page) => page.label);
    expect(pages).toEqual([
      "Server Profile",
      "Server Tag",
      "Engagement",
      "Boost Perks",
      "Emoji",
      "Stickers",
      "Soundboard",
      "Members",
      "Roles",
      "Invites",
      "Access",
      "Integrations",
      "Safety Setup",
      "Audit Log",
      "Bans",
      "AutoMod",
      "Enable Community",
      "Server Template",
      "Boosts",
      "Delete Server",
    ]);
  });

  it("falls back when other streams have not registered their hooks", () => {
    expect(openCreateEvent("100000000000000001")).toBe("missing");
    expect(openPerServerProfile("100000000000000001", "100000000000000002")).toBe("missing");
    const calls: string[] = [];
    (globalThis as { larkCreateEvent?: (id: string) => void }).larkCreateEvent = (id) => calls.push(id);
    expect(openCreateEvent("100000000000000001")).toBe("opened");
    expect(calls).toEqual(["100000000000000001"]);
    delete (globalThis as { larkCreateEvent?: unknown }).larkCreateEvent;
  });
});
