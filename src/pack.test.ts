import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AWAY_COOLDOWN_MS, noteActivity, stepAway, type AwayClock } from "./pack/away";
import { toggleBookmark } from "./pack/bookmarks";
import { toggleHidden } from "./pack/hidden";
import { allowKeywordNotify, cleanWords, firstHit, shouldKeywordNotify, wordsFor } from "./pack/keywords";
import { canReplaceCustom, playingLine, shouldWritePlaying } from "./pack/playing";
import { formatAbsolute, formatRelative } from "./pack/relative";
import { backoff, queueSend, takeDue } from "./pack/schedule";
import { sanitizePack, settingsFor } from "./pack/state";
import { translateText } from "./pack/translate";
import { describePlugin } from "./plugins";
import { inlineLang } from "./syntax";

const clock = (partial: Partial<AwayClock> = {}): AwayClock => ({
  lastActivity: 0,
  away: false,
  lastWrite: 0,
  savedStatus: "online",
  ...partial,
});

describe("plugin pack", () => {
  it("translates a known line locally and leaves unknown lines alone", () => {
    const spanish = translateText("I'll take the type ramp after lunch.", "es");
    expect(spanish.matched).toBe(true);
    expect(spanish.text).toContain("escala");
    const glossary = translateText("the rail", "fr", [{ text: "the rail", lang: "fr", translation: "le rail" }]);
    expect(glossary).toEqual({ text: "le rail", matched: true });
    expect(translateText("an unlisted sentence about the booth", "de").matched).toBe(false);
    expect(translateText("gracias", "en").text.toLowerCase()).toContain("thank");
  });

  it("queues a single future send and releases one due message at a time", () => {
    const now = 1_000_000;
    const first = queueSend([], { channelId: "c", content: "one", sendAt: now + 20_000 }, now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = queueSend(first.list, { channelId: "c", content: "two", sendAt: now + 16_000 }, now);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const early = queueSend(second.list, { channelId: "c", content: "now", sendAt: now + 1000 }, now);
    expect(early.ok).toBe(false);
    const due = takeDue(second.list, now + 21_000);
    expect(due.due?.content).toBe("two");
    expect(due.rest).toHaveLength(1);
    expect(takeDue(due.rest, now + 21_000).due?.content).toBe("one");
    const failed = { ...due.due!, attempts: 0 };
    expect(backoff(failed, now)?.sendAt).toBe(now + 30_000);
    expect(backoff({ ...failed, attempts: 2 }, now)).toBeNull();
  });

  it("changes presence once per away transition and respects the cooldown", () => {
    const idle = stepAway(clock(), 5 * 60_000, 5 * 60_000);
    expect(idle.write).toBe("idle");
    const blocked = stepAway(idle.state, 5 * 60_000 + 1000, 5 * 60_000);
    expect(blocked.write).toBeNull();
    const back = stepAway(noteActivity(idle.state, 5 * 60_000 + AWAY_COOLDOWN_MS), 5 * 60_000 + AWAY_COOLDOWN_MS, 5 * 60_000);
    expect(back.write).toBe("online");
    expect(stepAway(clock({ savedStatus: "dnd" }), 9 * 60_000, 5 * 60_000).write).toBeNull();
    expect(stepAway(clock({ savedStatus: "idle" }), 9 * 60_000, 5 * 60_000).write).toBeNull();
  });

  it("writes a listening line only when it changes and the cooldown has passed", () => {
    expect(playingLine("  Apricot  ", "Maya")).toBe("Listening to Apricot — Maya");
    expect(shouldWritePlaying("", "Listening to Apricot", 0, 0)).toBe(true);
    expect(shouldWritePlaying("Listening to Apricot", "Listening to Apricot", 1_000, 60_000)).toBe(false);
    expect(shouldWritePlaying("Listening to Apricot", "Listening to Ink", 1_000, 10_000)).toBe(false);
    expect(shouldWritePlaying("Listening to Apricot", "Listening to Ink", 1_000, 31_000)).toBe(true);
    expect(canReplaceCustom("In the booth", false)).toBe(false);
    expect(canReplaceCustom("Listening to Apricot", false)).toBe(true);
    expect(canReplaceCustom("In the booth", true)).toBe(true);
  });

  it("stores bookmarks and hidden people locally", () => {
    const saved = toggleBookmark([], {
      messageId: "m",
      channelId: "c",
      authorName: "Maya",
      excerpt: "hello   there",
      savedAt: 1,
    });
    expect(saved[0].excerpt).toBe("hello there");
    expect(toggleBookmark(saved, saved[0])).toEqual([]);
    const hidden = toggleHidden([], { id: "7", name: "Maya" });
    expect(toggleHidden(hidden, { id: "7", name: "Maya" })).toEqual([]);
    expect(toggleHidden([], { id: "bad id", name: "Maya" })).toEqual([]);
  });

  it("notifies on a keyword in a mentions-only channel, once per minute, and never when muted", () => {
    expect(cleanWords(" deploy, deploy, a ")).toEqual(["deploy"]);
    expect(wordsFor(["ship"], { c1: { words: ["deploy"] } }, "c1")).toEqual(["deploy"]);
    expect(firstHit("please deploy", ["deploy"])).toBe("deploy");
    const base = {
      level: "mentions" as const,
      mentionsMe: false,
      fromMe: false,
      windowFocused: false,
      sameChannel: false,
      hit: true,
      alreadyNotified: false,
    };
    expect(shouldKeywordNotify(base)).toBe(true);
    expect(shouldKeywordNotify({ ...base, level: "mute" })).toBe(false);
    expect(shouldKeywordNotify({ ...base, level: "all" })).toBe(false);
    expect(shouldKeywordNotify({ ...base, sameChannel: true, windowFocused: true })).toBe(false);
    const first = allowKeywordNotify("c:deploy", 1_000, {});
    expect(first.ok).toBe(true);
    expect(allowKeywordNotify("c:deploy", 2_000, first.last).ok).toBe(false);
    expect(allowKeywordNotify("c:deploy", 61_000, first.last).ok).toBe(true);
  });

  it("formats relative labels and keeps an absolute local tooltip", () => {
    const now = Date.parse("2026-10-06T15:00:00.000Z");
    expect(formatRelative(new Date(now - 3 * 60_000).toISOString(), now)).toBe("3m ago");
    expect(formatRelative(new Date(now - 10_000).toISOString(), now)).toBe("just now");
    expect(formatAbsolute(new Date(now).toISOString())).toContain("2026");
  });

  it("picks a language for inline code and declares pack hooks", () => {
    expect(inlineLang("const rail = 4")).toBe("ts");
    expect(inlineLang("padding: 0")).toBe("css");
    expect(inlineLang("fn main()")).toBe("rust");
    const hooks = {
      "silent-typing": "silentTyping",
      "auto-away": "autoAway",
      "send-later": "schedule",
      "now-playing": "nowPlaying",
      bookmarks: "bookmarks",
      "relative-time": "relativeTime",
      "keyword-ping": "keywords",
    } as const;
    for (const [id, flag] of Object.entries(hooks)) {
      const plugin = describePlugin(readFileSync(`plugins/${id}.js`, "utf8"), id);
      expect(plugin.hooks[flag as keyof typeof plugin.hooks]).toBe(true);
    }
    const quick = describePlugin(readFileSync("plugins/quick-react.js", "utf8"), "quick-react");
    expect(quick.hooks.quickReactions).toEqual(["👍", "❤️", "😂", "🎉", "👀"]);
    const media = describePlugin(readFileSync("plugins/quiet-media.js", "utf8"), "quiet-media");
    const view = media.run(
      {
        id: "1",
        content: "https://example.com",
        authorName: "Leo",
        authorId: "5",
        timestamp: "2026-10-06T15:00:00.000Z",
        mentionsMe: false,
        kind: "default",
        highlights: [],
        badges: [],
        effects: [],
      },
      { settings: { previews: "hide", compact: "on" }, hiddenAuthors: new Set() },
    );
    expect(view?.effects).toEqual(["hide-previews", "compact-media"]);
  });

  it("drops broken pack state instead of trusting it", () => {
    const pack = sanitizePack({
      translateLang: "es",
      schedule: [{ id: "a", channelId: "c", content: "  hi  ", sendAt: 10, attempts: 9 }, { id: 1 }],
      hiddenAuthors: [{ id: "bad id", name: "no" }, { id: "7", name: "Maya" }],
      keywordGlobal: ["ok", "x"],
      playingTitle: "x".repeat(200),
    });
    expect(pack.translateLang).toBe("es");
    expect(pack.schedule).toEqual([{ id: "a", channelId: "c", content: "hi", sendAt: 10, attempts: 3 }]);
    expect(pack.hiddenAuthors).toEqual([{ id: "7", name: "Maya" }]);
    expect(pack.keywordGlobal).toEqual(["ok"]);
    expect(pack.playingTitle).toHaveLength(80);
    expect(settingsFor(pack, "keyword-ping", "c")).toEqual({ words: "ok" });
  });
});
