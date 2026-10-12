import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlugins, describePlugin } from "../plugins";
import { digestRows, digestTotal } from "./digest";
import { atOrBefore, MAX_RECEIPT_CHANNELS, noteSeen, sanitizeCursors } from "./receipts";
import { sanitizePack } from "./state";
import { composerCount, countWords, wordBadge, wordMin } from "./words";

const message = {
  id: "m1",
  content: "one two three",
  authorName: "Maya",
  authorId: "7",
  timestamp: "2026-10-06T15:00:00.000Z",
  mentionsMe: false,
  kind: "default",
  highlights: [],
  badges: [],
  effects: [],
  channelId: "c1",
};

describe("local read receipts", () => {
  it("moves the cursor forward and never backward", () => {
    const first = noteSeen({}, "100", "50");
    expect(first["100"]).toBe("50");
    const later = noteSeen(first, "100", "80");
    expect(later["100"]).toBe("80");
    expect(noteSeen(later, "100", "40")["100"]).toBe("80");
    expect(atOrBefore("80", "80")).toBe(true);
    expect(atOrBefore("80", "81")).toBe(false);
    expect(atOrBefore("80", "nope")).toBe(false);
  });

  it("drops broken cursors and stops at the channel cap", () => {
    expect(sanitizeCursors({ "../x": "1", ok: "12", bad: "no" })).toEqual({ ok: "12" });
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_RECEIPT_CHANNELS + 5; i += 1) many[`c${i}`] = String(1000 + i);
    const stored = sanitizeCursors(many);
    expect(Object.keys(stored)).toHaveLength(MAX_RECEIPT_CHANNELS);
    const plugin = describePlugin(readFileSync("store/plugins/read-receipts/plugin.js", "utf8"), "read-receipts");
    expect(plugin.hooks.readReceipts).toBe(true);
    expect(plugin.name).toBe("Read receipts");
    const source = readFileSync("store/plugins/read-receipts/plugin.js", "utf8");
    expect(source).not.toMatch(/ack_message|fetch\s*\(|\btoken\b/i);
  });
});

describe("mention digest", () => {
  it("lists mention counts already on this device and can skip direct messages", () => {
    const rows = digestRows([
      { channelId: "a", name: "general", where: "Northwind", mentions: 2, kind: "text" },
      { channelId: "b", name: "Maya", where: "Direct messages", mentions: 4, kind: "dm" },
      { channelId: "c", name: "voice", where: "Northwind", mentions: 0, kind: "voice" },
      { channelId: "a", name: "general", where: "Northwind", mentions: 9, kind: "text" },
    ], false);
    expect(rows).toEqual([{ channelId: "a", name: "general", where: "Northwind", mentions: 2 }]);
    const withDms = digestRows([
      { channelId: "a", name: "general", where: "Northwind", mentions: 2, kind: "text" },
      { channelId: "b", name: "Maya", where: "Direct messages", mentions: 4, kind: "dm" },
    ], true);
    expect(withDms.map((row) => row.channelId)).toEqual(["b", "a"]);
    expect(digestTotal(withDms)).toBe(6);
    const plugin = describePlugin(readFileSync("store/plugins/mention-digest/plugin.js", "utf8"), "mention-digest");
    expect(plugin.hooks.mentionDigest).toBe(true);
  });
});

describe("word counter", () => {
  it("counts words for the composer and badges a long message", () => {
    expect(countWords("  one   two ")).toBe(2);
    expect(countWords("")).toBe(0);
    expect(composerCount("one two", true)).toBe("2 words · 7 / 2000");
    expect(composerCount("one", false)).toBe("3 / 2000");
    expect(wordBadge("one two", 0)).toBeNull();
    expect(wordBadge("one two", 2)).toBe("2 words");
    expect(wordMin("40")).toBe(40);
    expect(wordMin("12")).toBe(0);
    const pack = sanitizePack({ wordMin: 100, showReceipts: false, digestDms: false });
    expect(pack.wordMin).toBe(100);
    expect(pack.showReceipts).toBe(false);
    expect(pack.digestDms).toBe(false);
    expect(sanitizePack({ wordMin: 7 }).wordMin).toBe(0);
    const plugin = describePlugin(readFileSync("store/plugins/word-counter/plugin.js", "utf8"), "word-counter");
    expect(plugin.hooks.wordCount).toBe(true);
    const long = "word ".repeat(40).trim();
    const badged = applyPlugins({ ...message, content: long }, [plugin], { settings: { "word-counter": { min: "40" } } });
    expect(badged?.badges).toEqual(["40 words"]);
    const short = applyPlugins(message, [plugin], { settings: { "word-counter": { min: "40" } } });
    expect(short?.badges).toEqual([]);
  });
});
