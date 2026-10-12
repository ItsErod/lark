import { describe, expect, it } from "vitest";
import type { Bookmark } from "./pack/bookmarks";
import type { Reminder } from "./reminders";
import { mergeSaved, rowsFromPayload } from "./saved-sync";

const bookmark: Bookmark = {
  messageId: "100000000000000301",
  channelId: "100000000000000021",
  authorName: "Maya",
  excerpt: "keep this",
  savedAt: 1,
};

const reminder: Reminder = {
  id: "local",
  messageId: "100000000000000302",
  channelId: "100000000000000021",
  authorName: "Leo",
  excerpt: "later",
  remindAt: Date.parse("2026-10-13T15:00:00.000Z"),
};

describe("saved messages", () => {
  it("reads Discord's saved-message results", () => {
    const rows = rowsFromPayload({
      results: [{
        message: { id: "100000000000000301", channel_id: "100000000000000021", content: "from discord", author: { username: "maya" } },
        save_data: { channel_id: "100000000000000021", message_id: "100000000000000301", saved_at: "2026-10-12T12:00:00.000Z", due_at: "2026-10-13T15:00:00.000Z" },
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].authorName).toBe("maya");
    expect(rows[0].excerpt).toBe("from discord");
    expect(rows[0].dueAt).toBe("2026-10-13T15:00:00.000Z");
  });

  it("uploads local-only rows once and then treats Discord as the list", () => {
    const keep = new Set(["100000000000000021:100000000000000301", "100000000000000021:100000000000000302"]);
    const first = mergeSaved([bookmark], [reminder], [], keep);
    expect(first.bookmarks.map((item) => item.messageId)).toEqual(["100000000000000301", "100000000000000302"]);
    expect(first.upload).toHaveLength(2);
    expect(first.upload[1].dueAt).toBe("2026-10-13T15:00:00.000Z");
    const remote = rowsFromPayload({
      results: [{
        message: { id: "100000000000000301", content: "from discord", author: { global_name: "Maya" } },
        save_data: { channel_id: "100000000000000021", message_id: "100000000000000301", saved_at: "2026-10-12T12:00:00.000Z", due_at: null },
      }],
    });
    const second = mergeSaved([bookmark, ...first.bookmarks], [reminder], remote, new Set());
    expect(second.bookmarks.map((item) => item.messageId)).toEqual(["100000000000000301"]);
    expect(second.reminders).toEqual([]);
    expect(second.upload).toEqual([]);
    expect(second.bookmarks[0].excerpt).toBe("from discord");
  });
});
