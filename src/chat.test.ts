import { describe, expect, it } from "vitest";
import {
  channelIsBehind,
  firstUnreadId,
  mergeIncoming,
  outgoingNonce,
  sameOutgoing,
  sameReaction,
  shouldGroup,
  snowflakeAfter,
  typingLine,
} from "./chat";

describe("message grouping", () => {
  const prev = { authorId: "7", timestamp: "2026-10-06T15:00:00.000Z", kind: "default" };

  it("groups the same author inside seven minutes", () => {
    const next = { authorId: "7", timestamp: "2026-10-06T15:06:00.000Z", kind: "default" };
    expect(shouldGroup(prev, next, true)).toBe(true);
    expect(shouldGroup(prev, { ...next, timestamp: "2026-10-06T15:07:01.000Z" }, true)).toBe(false);
  });

  it("breaks the group on a reply, a new day, or a system line", () => {
    const next = { authorId: "7", timestamp: "2026-10-06T15:01:00.000Z", kind: "default" };
    expect(shouldGroup(prev, { ...next, reply: { id: "1" } }, true)).toBe(false);
    expect(shouldGroup(prev, next, false)).toBe(false);
    expect(shouldGroup(prev, { ...next, kind: "join" }, true)).toBe(false);
    expect(shouldGroup({ ...prev, kind: "system" }, next, true)).toBe(false);
    expect(shouldGroup(prev, { ...next, authorId: "8" }, true)).toBe(false);
  });
});

describe("typing line", () => {
  it("names one or two people and collapses the rest", () => {
    expect(typingLine([])).toBe("");
    expect(typingLine(["Maya"])).toBe("Maya is typing");
    expect(typingLine(["Maya", "Maya"])).toBe("Maya is typing");
    expect(typingLine(["Maya", "Jonah"])).toBe("Maya and Jonah are typing");
    expect(typingLine(["Maya", "Jonah", "Priya"])).toBe("Several people are typing");
  });
});

describe("read markers", () => {
  it("compares snowflakes and finds the first unread id", () => {
    expect(snowflakeAfter("100001", "100000")).toBe(true);
    expect(snowflakeAfter("100000", "100001")).toBe(false);
    expect(snowflakeAfter("local-1", "100000")).toBe(false);
    expect(firstUnreadId(["100000", "100001", "100002"], "100001")).toBe("100002");
    expect(firstUnreadId(["100000", "100001"], "100001")).toBeNull();
    expect(firstUnreadId(["10"], undefined)).toBeNull();
    expect(channelIsBehind("100002", "100001")).toBe(true);
    expect(channelIsBehind("100001", "100001")).toBe(false);
  });
});

describe("outgoing echo", () => {
  it("keeps one row when the gateway copy and the send response both arrive", () => {
    const local = { id: "local-1", nonce: "local-1", content: "test", embeds: [] as string[] };
    const gateway = { id: "900", nonce: "local-1", content: "test", embeds: ["video"] };
    const rest = { id: "900", nonce: "local-1", content: "test", embeds: ["video"] };
    let list = mergeIncoming([local], gateway);
    list = mergeIncoming(list, rest);
    expect(list).toEqual([gateway]);
    const raced = mergeIncoming([local, { id: "900", content: "test", embeds: ["video"] }], rest);
    expect(raced).toHaveLength(1);
    expect(raced[0].id).toBe("900");
    expect(raced[0].embeds).toEqual(["video"]);
  });

  it("does not collapse two sends that only share text", () => {
    const first = { id: "local-1", nonce: "local-1", content: "test" };
    const second = { id: "local-2", nonce: "local-2", content: "test" };
    const list = mergeIncoming(mergeIncoming([], first), second);
    expect(list.map((item) => item.id)).toEqual(["local-1", "local-2"]);
    const confirmed = mergeIncoming(list, { id: "901", nonce: "local-2", content: "test" });
    expect(confirmed.map((item) => item.id)).toEqual(["local-1", "901"]);
  });

  it("mints a nonce Discord will echo", () => {
    const first = outgoingNonce(1_700_000_000_000);
    const second = outgoingNonce(1_700_000_000_000);
    expect(first.startsWith("local-")).toBe(true);
    expect(first.length).toBeLessThanOrEqual(25);
    expect(second).not.toBe(first);
    expect(sameOutgoing({ id: first, nonce: first }, { id: "55", nonce: first })).toBe(true);
    expect(sameOutgoing({ id: "55" }, { id: "56" })).toBe(false);
  });
});

describe("reactions", () => {
  it("matches custom emoji by id and unicode by character", () => {
    expect(sameReaction({ emoji: "🔥" }, "🔥", null)).toBe(true);
    expect(sameReaction({ emoji: "🔥" }, "❤️", null)).toBe(false);
    expect(sameReaction({ emoji: "lark", emojiId: "99" }, "lark", "99")).toBe(true);
    expect(sameReaction({ emoji: "lark", emojiId: "99" }, "lark", "100")).toBe(false);
    expect(sameReaction({ emoji: "lark", emojiId: "99" }, "lark", null)).toBe(false);
  });
});
