import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { AWAY_REPLY_GAP_MS, awayReplyDecision, cleanAwayText, sanitizeAwayReplied } from "./away-reply";
import { sanitizePack } from "./state";
import { themeAttributeLines, themeAttributeText } from "./theme-attrs";

const base = {
  armed: true,
  text: "I am away.",
  kind: "dm",
  authorBot: false,
  authorId: "20",
  meId: "10",
  channelId: "30",
  lookingAt: false,
  content: "hello",
  repliedChannels: [] as string[],
  lastSentAt: 0,
  now: AWAY_REPLY_GAP_MS,
};

describe("auto reply when away", () => {
  it("sends one paced direct-message reply and refuses everything else", () => {
    expect(awayReplyDecision(base)).toEqual({ send: true, text: "I am away." });
    expect(awayReplyDecision({ ...base, kind: "text" }).send).toBe(false);
    expect(awayReplyDecision({ ...base, kind: "group" }).send).toBe(false);
    expect(awayReplyDecision({ ...base, authorBot: true }).send).toBe(false);
    expect(awayReplyDecision({ ...base, authorId: "10" }).send).toBe(false);
    expect(awayReplyDecision({ ...base, lookingAt: true }).send).toBe(false);
    expect(awayReplyDecision({ ...base, content: "I am away." }).send).toBe(false);
    expect(awayReplyDecision({ ...base, repliedChannels: ["30"] }).send).toBe(false);
    expect(awayReplyDecision({ ...base, now: AWAY_REPLY_GAP_MS - 1 }).send).toBe(false);
    expect(awayReplyDecision({ ...base, armed: false }).send).toBe(false);
    expect(cleanAwayText(`  ${"a".repeat(300)}`)).toHaveLength(200);
    expect(sanitizeAwayReplied(["30", "../x", "30"])).toEqual(["30"]);
    const pack = sanitizePack({ awayReplyArmed: true, awayReplyText: " Back later ", awayReplied: ["30"] });
    expect(pack.awayReplyArmed).toBe(true);
    expect(pack.awayReplyText).toBe("Back later");
    expect(pack.awayReplied).toEqual(["30"]);
    expect(sanitizePack({}).awayReplyArmed).toBe(false);
    const plugin = describePlugin(readFileSync("store/plugins/auto-reply/plugin.js", "utf8"), "auto-reply");
    expect(plugin.hooks.autoReply).toBe(true);
    expect(readFileSync("store/plugins/auto-reply/plugin.js", "utf8")).not.toMatch(/fetch\s*\(|\btoken\b|discord\.com\/api/i);
  });
});

describe("theme attributes", () => {
  it("reads the colour tokens and skips an empty one", () => {
    const lines = themeAttributeLines({
      getPropertyValue: (name) => (name === "--accent" ? " #5865f2 " : name === "--font" ? "" : "ok"),
    });
    expect(lines.find((line) => line.name === "--accent")?.value).toBe("#5865f2");
    expect(lines.some((line) => line.name === "--font")).toBe(false);
    expect(themeAttributeText(lines.slice(0, 1))).toBe("--bg-0: ok");
    const plugin = describePlugin(readFileSync("store/plugins/theme-attributes/plugin.js", "utf8"), "theme-attributes");
    expect(plugin.hooks.themeAttrs).toBe(true);
  });
});
