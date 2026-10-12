import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { findLog, ghostMessage, logView, overlayDeletes, recordDelete, recordEdit, sanitizeLog } from "./logger";

const message = {
  id: "m1",
  channelId: "c1",
  authorId: "7",
  authorName: "Maya",
  timestamp: "2026-10-06T15:00:00.000Z",
  content: "first draft",
};

describe("message logger", () => {
  it("keeps each earlier draft and the deleted copy", () => {
    const edited = recordEdit([], message, "first draft", "second draft", 10);
    const again = recordEdit(edited, { ...message, content: "second draft" }, "second draft", "final", 20);
    expect(findLog(again, "c1", "m1")?.edits.map((edit) => edit.content)).toEqual(["first draft", "second draft"]);
    expect(findLog(again, "c1", "m1")?.content).toBe("final");
    expect(recordEdit(again, message, "final", "final", 30)).toBe(again);
    const deleted = recordDelete(again, { ...message, content: "final" }, 40);
    expect(findLog(deleted, "c1", "m1")?.deleted).toBe(true);
    expect(recordDelete(deleted, message, 50)).toBe(deleted);
    const view = logView(findLog(deleted, "c1", "m1"), true, true);
    expect(view).toEqual({ deleted: true, history: ["first draft", "second draft"] });
    expect(logView(findLog(deleted, "c1", "m1"), false, false)).toBeNull();
  });

  it("shows a deleted message in place without putting it back in the live page", () => {
    const log = recordDelete([], message, 10);
    const live = [{ ...ghostMessage(log[0]), id: "m2", content: "later", timestamp: "2026-10-06T16:00:00.000Z" }];
    const shown = overlayDeletes(live, log, "c1");
    expect(shown.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(live.map((item) => item.id)).toEqual(["m2"]);
    expect(overlayDeletes(shown, log, "c1")).toBe(shown);
    expect(overlayDeletes(live, log, "other")).toBe(live);
  });

  it("drops a broken log and declares the host hook", () => {
    expect(sanitizeLog([{ id: "m", channelId: "c", content: "hi", deleted: true, edits: [{ content: "old", at: 1 }, { content: 2 }] }])).toEqual([
      {
        id: "m",
        channelId: "c",
        authorId: "",
        authorName: "Someone",
        timestamp: "",
        content: "hi",
        deleted: true,
        edits: [{ content: "old", at: 1 }],
      },
    ]);
    const pack = sanitizePack({ messageLog: [{ id: 1 }, { id: "m", channelId: "c", content: "kept", edits: [] }], logDeleted: false });
    expect(pack.messageLog).toHaveLength(1);
    expect(pack.logDeleted).toBe(false);
    expect(pack.logEdits).toBe(true);
    const plugin = describePlugin(readFileSync("plugins/message-logger.js", "utf8"), "message-logger");
    expect(plugin.hooks.messageLog).toBe(true);
    expect(plugin.name).toBe("Message logger");
  });
});
