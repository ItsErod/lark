import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import {
  ADMINISTRATOR,
  VIEW_CHANNEL,
  canViewChannel,
  channelFlags,
  dockBadge,
  effectiveLevel,
  folderBadge,
  inviteCode,
  isNewerSnowflake,
  layoutRail,
  mentionsUser,
  type GuildAccess,
} from "./shell";

const guild = "100000000000000010";
const user = "100000000000000001";
const role = "100000000000000099";

function access(extra: Partial<GuildAccess> = {}): GuildAccess {
  return {
    owner: false,
    permissions: String(VIEW_CHANNEL),
    roles: [],
    myRoles: [],
    ...extra,
  };
}

describe("server folders", () => {
  it("orders folders, loose servers, and anything Discord left out", () => {
    const entries = layoutRail(
      [guild, "100000000000000011", "100000000000000012", "100000000000000013"],
      [
        { id: "4", name: "Friends", color: "#ff0000", guildIds: ["100000000000000011", guild] },
        { id: null, name: null, color: null, guildIds: ["100000000000000012"] },
      ],
    );
    expect(entries.map((entry) => (entry.kind === "folder" ? entry.name : entry.guildId))).toEqual([
      "Friends",
      "100000000000000012",
      "100000000000000013",
    ]);
    if (entries[0].kind === "folder") expect(entries[0].guildIds).toEqual(["100000000000000011", guild]);
  });

  it("sums mention badges inside a collapsed folder", () => {
    const badge = folderBadge([guild, "100000000000000011"], (id) =>
      id === guild ? { mentions: 2, unread: 0 } : { mentions: 0, unread: 1 },
    );
    expect(badge).toEqual({ mentions: 2, unread: true });
  });
});

describe("channel visibility", () => {
  it("hides a channel when the user lacks view channel", () => {
    expect(canViewChannel({ userId: user, guildId: guild, access: null, overwrites: [] })).toBe(true);
    expect(canViewChannel({ userId: user, guildId: guild, access: access({ owner: true, permissions: "0" }) })).toBe(true);
    expect(canViewChannel({ userId: user, guildId: guild, access: access({ permissions: String(ADMINISTRATOR) }), overwrites: [{ id: guild, kind: 0, allow: "0", deny: String(VIEW_CHANNEL) }] })).toBe(true);
    expect(canViewChannel({ userId: user, guildId: guild, access: access(), overwrites: [{ id: guild, kind: 0, allow: "0", deny: String(VIEW_CHANNEL) }] })).toBe(false);
    expect(
      canViewChannel({
        userId: user,
        guildId: guild,
        access: access({ myRoles: [role] }),
        overwrites: [
          { id: guild, kind: 0, allow: "0", deny: String(VIEW_CHANNEL) },
          { id: role, kind: 0, allow: String(VIEW_CHANNEL), deny: "0" },
        ],
      }),
    ).toBe(true);
    expect(
      canViewChannel({
        userId: user,
        guildId: guild,
        access: access({ myRoles: [role] }),
        overwrites: [
          { id: role, kind: 0, allow: String(VIEW_CHANNEL), deny: "0" },
          { id: user, kind: 1, allow: "0", deny: String(VIEW_CHANNEL) },
        ],
      }),
    ).toBe(false);
    expect(canViewChannel({ userId: user, guildId: guild, access: access({ permissions: "0" }) })).toBe(false);
  });
});

describe("read badges", () => {
  it("treats a newer snowflake as unread and keeps the mention count", () => {
    expect(isNewerSnowflake("100000000000000300", "100000000000000200")).toBe(true);
    expect(isNewerSnowflake("99", "100")).toBe(false);
    expect(channelFlags({ lastMessageId: "100000000000000300", marker: { lastMessageId: "100000000000000200", mentionCount: 2 }, localUnread: 0, localMentions: 0, viewing: false })).toEqual({ unread: 1, mentions: 2 });
    expect(channelFlags({ lastMessageId: "100000000000000100", marker: { lastMessageId: "100000000000000200", mentionCount: 0 }, localUnread: 3, localMentions: 1, viewing: false })).toEqual({ unread: 3, mentions: 1 });
    expect(channelFlags({ lastMessageId: "100000000000000300", marker: { lastMessageId: "1", mentionCount: 4 }, localUnread: 1, localMentions: 0, viewing: true })).toEqual({ unread: 0, mentions: 0 });
  });

  it("badges mentions and unread direct messages on the dock", () => {
    expect(dockBadge([
      { mentions: 2, unread: 5, dm: false },
      { mentions: 0, unread: 4, dm: false },
      { mentions: 0, unread: 1, dm: true },
    ])).toBe(3);
  });
});

describe("discord notification settings", () => {
  it("lets a discord channel mute beat the lark default", () => {
    const config = defaultConfig();
    const discord = {
      guilds: {
        g1: {
          muted: false,
          level: "all" as const,
          suppressEveryone: true,
          suppressRoles: false,
          channels: { c1: { muted: true, level: null, collapsed: false } },
        },
      },
      dms: {},
    };
    expect(effectiveLevel(config, "g1", "c1", discord)).toBe("mute");
    expect(effectiveLevel(config, "g1", "c2", discord)).toBe("all");
    config.notifications.channels["c2"] = { muted: true };
    expect(effectiveLevel(config, "g1", "c2", discord)).toBe("mute");
    discord.guilds.g1.authoritative = true;
    expect(effectiveLevel(config, "g1", "c2", discord)).toBe("all");
    expect(effectiveLevel(config, "g1", "c1", discord)).toBe("mute");
    const dms = { ...discord, dmsReady: true, dms: { dm1: { muted: true, level: "mute" as const, collapsed: false } } };
    config.notifications.channels["dm2"] = { muted: true };
    expect(effectiveLevel(config, null, "dm1", dms)).toBe("mute");
    expect(effectiveLevel(config, null, "dm2", dms)).toBe("all");
    expect(mentionsUser({
      mentionIds: [],
      mentionRoles: [],
      mentionEveryone: true,
      meId: user,
      myRoles: [],
      suppressEveryone: true,
      suppressRoles: false,
      direct: false,
    })).toBe(false);
    expect(mentionsUser({
      mentionIds: [],
      mentionRoles: [role],
      mentionEveryone: false,
      meId: user,
      myRoles: [role],
      suppressEveryone: false,
      suppressRoles: false,
      direct: false,
    })).toBe(true);
    expect(mentionsUser({
      mentionIds: [],
      mentionRoles: [],
      mentionEveryone: false,
      meId: user,
      myRoles: [],
      suppressEveryone: false,
      suppressRoles: false,
      direct: true,
    })).toBe(true);
  });
});

describe("invite links", () => {
  it("reads a code from discord.gg and discord.com/invite", () => {
    expect(inviteCode("https://discord.gg/AbC-12")).toBe("AbC-12");
    expect(inviteCode("https://discord.com/invite/AbC-12?event=1")).toBe("AbC-12");
    expect(inviteCode("https://ptb.discord.gg/ok12")).toBe("ok12");
    expect(inviteCode("https://example.com/discord.gg/abc")).toBeNull();
    expect(inviteCode("javascript:discord.gg/abc")).toBeNull();
    expect(inviteCode("https://discord.com/channels/1/2")).toBeNull();
  });
});
