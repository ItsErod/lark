import { describe, expect, it, beforeEach } from "vitest";
import {
  heldRequestIds,
  isHeldRequest,
  localMessageRequests,
  mergeMessageRequests,
  messageRequestGroups,
  messageRequestsFromPayload,
  releaseHeldRequest,
  replaceHeldRequests,
} from "./message-requests";

const friend = "100000000000000002";
const stranger = "100000000000000009";
const blocked = "100000000000000006";
const me = "100000000000000001";

const dms = [
  { id: "100000000000000041", name: "Maya Chen", kind: "dm", recipientIds: [friend], preview: "hey" },
  { id: "100000000000000044", name: "Stranger", kind: "dm", recipientIds: [me, stranger], preview: "hi" },
  { id: "100000000000000045", name: "Blocked", kind: "dm", recipientIds: [blocked] },
  { id: "100000000000000043", name: "Ridge trail", kind: "group", recipientIds: [friend, stranger] },
  { id: "100000000000000046", name: "Solo", kind: "dm", recipientIds: [me] },
];

describe("local message requests", () => {
  it("keeps non-friend direct messages and skips friends, blocks, and groups", () => {
    const rows = localMessageRequests({
      dms,
      friendIds: [friend],
      blockedIds: [blocked],
      meId: me,
      spamFilter: "non_friends",
    });
    expect(rows).toEqual([
      { id: "100000000000000044", name: "Stranger", preview: "hi", spam: true, userId: stranger },
    ]);
  });

  it("uses the message-request folder when the spam filter is off", () => {
    const rows = localMessageRequests({
      dms,
      friendIds: [friend],
      blockedIds: [],
      meId: me,
      spamFilter: "off",
    });
    expect(rows.map((row) => row.spam)).toEqual([false, false]);
    expect(rows.map((row) => row.id)).toEqual(["100000000000000044", "100000000000000045"]);
  });

  it("puts everyone and non-friends into spam", () => {
    for (const spamFilter of ["everyone", "non_friends"]) {
      const rows = localMessageRequests({ dms, friendIds: [], blockedIds: [], meId: me, spamFilter });
      expect(rows.every((row) => row.spam)).toBe(true);
    }
  });
});

describe("message request payloads", () => {
  it("reads an array, a wrapped list, and an empty list", () => {
    const rows = messageRequestsFromPayload(
      [
        {
          id: "100000000000000044",
          recipients: [{ id: stranger, username: "stranger", global_name: "Stranger" }],
          last_message: { content: "hello there" },
        },
      ],
      false,
    );
    expect(rows).toEqual([
      { id: "100000000000000044", name: "Stranger", preview: "hello there", spam: false, userId: stranger },
    ]);
    const wrapped = messageRequestsFromPayload(
      { message_requests: [{ channel_id: "100000000000000047", is_spam: true, name: "Inbox" }] },
      false,
    );
    expect(wrapped[0]).toMatchObject({ id: "100000000000000047", spam: true, name: "Inbox" });
    expect(messageRequestsFromPayload([], true)).toEqual([]);
    expect(messageRequestsFromPayload({ channels: [{ id: "nope" }] }, true)).toEqual([]);
  });

  it("lets a spam flag on the row win, and merges duplicates into spam", () => {
    const merged = mergeMessageRequests([
      { id: "100000000000000044", name: "Stranger", preview: "", spam: false },
      { id: "100000000000000044", name: "Stranger", preview: "spam", spam: true },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].spam).toBe(true);
    expect(merged[0].preview).toBe("spam");
    expect(messageRequestGroups(merged)).toEqual({ requests: [], spam: merged });
  });
});

describe("held message requests", () => {
  beforeEach(() => replaceHeldRequests([]));

  it("hides a channel until it is released", () => {
    replaceHeldRequests(["100000000000000044", ""]);
    expect(isHeldRequest("100000000000000044")).toBe(true);
    expect(heldRequestIds()).toEqual(["100000000000000044"]);
    releaseHeldRequest("100000000000000044");
    expect(isHeldRequest("100000000000000044")).toBe(false);
  });
});
