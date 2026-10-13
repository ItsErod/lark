import { afterEach, describe, expect, it } from "vitest";
import {
  activeFriends,
  activeNowCards,
  blockedIds,
  clampNickname,
  clampNote,
  clearAfterAt,
  developerModeOn,
  dmContextMenu,
  elapsedLabel,
  floatPinned,
  friendActivityText,
  friendGlance,
  friendUsernameOk,
  friendsForTab,
  dmVoiceStamp,
  groupMemberCount,
  indexedRelationships,
  memberContextMenu,
  decideFriendRequest,
  pendingFriendCount,
  readPinList,
  requestAddFavorite,
  requestModView,
  serverTagText,
  setRelationshipIndex,
  togglePin,
} from "./social";
import type { Person } from "./types";

const maya: Person = { id: "2", name: "Maya", status: "online", custom: "At the desk", activity: "Playing Lark" };
const jonah: Person = { id: "3", name: "Jonah", status: "idle", custom: "Walking", activity: "Listening to Noon" };
const priya: Person = { id: "4", name: "Priya", status: "dnd", custom: "Heads down" };
const leo: Person = { id: "5", name: "Leo", status: "offline", activity: "Playing something" };

describe("friend activity", () => {
  it("keeps the game visible next to a custom status", () => {
    expect(friendGlance(maya)).toEqual({
      activity: "Playing Lark",
      custom: "At the desk",
      line: "Playing Lark · At the desk",
    });
    expect(friendGlance(priya).line).toBe("Heads down");
  });

  it("lists only people who are around and in an activity", () => {
    expect(activeFriends([leo, priya, jonah, maya]).map((person) => person.name)).toEqual(["Maya", "Jonah"]);
    expect(activeFriends([maya], 0)).toEqual([]);
  });

  it("caps a note at 256 characters", () => {
    expect(clampNote("hello\0")).toBe("hello");
    expect([...clampNote("n".repeat(300))]).toHaveLength(256);
  });
});

const rows = [
  { id: "2", kind: "friend" as const, name: "Maya", username: "maya", nickname: "" },
  { id: "9", kind: "incoming" as const, name: "Ada", username: "ada", nickname: "" },
  { id: "8", kind: "incoming" as const, name: "Bea", username: "bea", nickname: "" },
  { id: "7", kind: "outgoing" as const, name: "Cy", username: "cy", nickname: "" },
  { id: "6", kind: "blocked" as const, name: "No", username: "no", nickname: "" },
];

describe("relationships", () => {
  afterEach(() => {
    setRelationshipIndex([]);
    delete (globalThis as { larkDeveloperMode?: boolean }).larkDeveloperMode;
    delete (globalThis as { larkFavorites?: unknown }).larkFavorites;
    delete (globalThis as { larkModView?: unknown }).larkModView;
  });

  it("counts only incoming requests and exposes blocked ids", () => {
    expect(pendingFriendCount(rows)).toBe(2);
    expect(pendingFriendCount([{ kind: "outgoing" }])).toBe(0);
    setRelationshipIndex(rows);
    expect(pendingFriendCount()).toBe(2);
    expect([...blockedIds()]).toEqual(["6"]);
    decideFriendRequest("9", "accept");
    expect(pendingFriendCount()).toBe(1);
    expect(indexedRelationships().find((row) => row.id === "9")?.kind).toBe("friend");
    decideFriendRequest("8", "ignore");
    expect(pendingFriendCount()).toBe(0);
    expect([...blockedIds()]).toEqual(["6"]);
  });

  it("keeps online friends on the online tab and everyone on all", () => {
    expect(friendsForTab([maya, jonah, priya, leo], "online").map((person) => person.name)).toEqual(["Maya", "Jonah", "Priya"]);
    expect(friendsForTab([leo, maya], "all").map((person) => person.name)).toEqual(["Maya", "Leo"]);
    expect(friendsForTab([maya], "pending")).toEqual([]);
    expect(friendsForTab([maya], "add")).toEqual([]);
  });

  it("falls back to the one-line glance and prefers rich presence", () => {
    expect(friendActivityText(maya)).toBe("Playing Lark · At the desk");
    const started = 1_000;
    expect(elapsedLabel(started, 63_000)).toBe("1:02 elapsed");
    expect(elapsedLabel(0, 5_000)).toBe("");
    expect(friendActivityText({
      activity: "Playing Lark",
      custom: "At the desk",
      rich: { name: "Lark", type: 0, details: "Northwind", state: "In a match", party: "2 of 5", startedAt: started },
    }, 63_000)).toBe("Playing Lark · Northwind · In a match · 2 of 5 · 1:02 elapsed · At the desk");
  });

  it("keeps a four-character server tag", () => {
    expect(serverTagText({ tag: "LARK" })).toBe("LARK");
    expect(serverTagText({ tag: "TOO LONG" })).toBe("");
    expect(serverTagText(null)).toBe("");
  });

  it("builds active now cards for games and live voice", () => {
    const cards = activeNowCards(
      [{ ...maya, rich: { name: "Lark", type: 0, startedAt: 1_000, largeImage: "https://cdn.discordapp.com/app-assets/1/a.png", live: true }, serverTag: { tag: "LARK" } }, leo],
      { "2": { guildId: "g", channelId: "v", sharing: true, channelName: "Booth" } },
      61_000,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].elapsed).toBe("1:00 elapsed");
    expect(cards[0].live).toBe(true);
    expect(cards[0].inVoice).toBe(true);
    expect(cards[0].voiceLabel).toBe("Booth");
    expect(cards[0].tag).toBe("LARK");
    expect(activeNowCards([leo], {}, 1)).toEqual([]);
  });

  it("hides copy ids until developer mode is on", () => {
    const plain = dmContextMenu({ developerMode: false, pinned: false, muted: false, friend: true, group: false }).map((item) => item.id);
    expect(plain).toContain("favorite");
    expect(plain).toContain("unfriend");
    expect(plain).toContain("block");
    expect(plain).not.toContain("copy-user");
    const dev = dmContextMenu({ developerMode: true, pinned: true, muted: true, friend: false, group: true }).map((item) => item.label);
    expect(dev).toContain("Unpin");
    expect(dev).toContain("Unmute");
    expect(dev).toContain("Rename Group");
    expect(dev).toContain("Copy User ID");
    expect(dev).toContain("Copy Channel ID");
    expect(memberContextMenu({ developerMode: false, self: false }).map((item) => item.id)).toEqual(["profile", "mention", "server-profile", "apps", "roles", "mod"]);
    expect(memberContextMenu({ developerMode: true, self: true }).map((item) => item.id)).toEqual(["profile", "server-profile", "apps", "copy-id"]);
  });

  it("reads developer mode from the keys stream D may set", () => {
    expect(developerModeOn({})).toBe(false);
    expect(developerModeOn({ developerMode: true })).toBe(true);
    expect(developerModeOn({ appearance: { developer_mode: true } })).toBe(true);
    (globalThis as { larkDeveloperMode?: boolean }).larkDeveloperMode = true;
    expect(developerModeOn(null)).toBe(true);
  });

  it("calls the favorites and mod-view helpers when they exist", () => {
    expect(requestAddFavorite("100")).toBe("missing");
    const added: string[] = [];
    (globalThis as { larkFavorites?: { addFavoriteChannel: (id: string) => void } }).larkFavorites = {
      addFavoriteChannel: (id) => added.push(id),
    };
    expect(requestAddFavorite("100")).toBe("called");
    expect(added).toEqual(["100"]);
    expect(requestModView("2", "g")).toBe("missing");
    (globalThis as { larkModView?: { open: (userId: string, guildId: string | null) => void } }).larkModView = { open: () => undefined };
    expect(requestModView("2", null)).toBe("called");
  });

  it("pins, counts group members, and checks usernames", () => {
    expect(floatPinned([{ id: "b" }, { id: "a" }], new Set(["a"])).map((item) => item.id)).toEqual(["a", "b"]);
    expect([...togglePin(new Set(["a"]), "a")]).toEqual([]);
    expect(readPinList(JSON.stringify(["12345", "nope", 4]))).toEqual(["12345"]);
    expect(readPinList("nope")).toEqual([]);
    expect(groupMemberCount(["2", "3"], "1")).toBe(3);
    expect(groupMemberCount(["1", "2"], "1")).toBe(2);
    expect(groupMemberCount([], "1")).toBe(0);
    expect(groupMemberCount(["", ""], "1")).toBe(0);
    expect(dmVoiceStamp(null)).toBe("");
    expect(dmVoiceStamp({ sharing: false })).toBe("voice");
    expect(dmVoiceStamp({ sharing: true })).toBe("live");
    expect(friendUsernameOk("maya.chen")).toBe(true);
    expect(friendUsernameOk("Maya")).toBe(false);
    expect(friendUsernameOk("a")).toBe(false);
    expect(clampNickname("n".repeat(40))).toHaveLength(32);
    expect(clampNickname("  hi\n")).toBe("hi");
    const now = Date.UTC(2026, 9, 12, 15, 0, 0);
    expect(clearAfterAt("never", now)).toBeNull();
    expect(clearAfterAt("30m", now)).toBe(now + 30 * 60 * 1000);
    expect(clearAfterAt("1h", now)).toBe(now + 60 * 60 * 1000);
    expect(clearAfterAt("4h", now)).toBe(now + 4 * 60 * 60 * 1000);
    const today = clearAfterAt("today", now);
    expect(today).toBe(new Date(now).setHours(24, 0, 0, 0));
  });
});
