import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { cleanPatterns, patternHit, patternsFor, shouldPatternNotify } from "./patterns";
import { sanitizePack, settingsFor } from "./state";

const base = {
  notify: true,
  muted: false,
  fromMe: false,
  windowFocused: false,
  sameChannel: false,
  hit: true,
  alreadyNotified: false,
};

describe("keyword highlights", () => {
  it("keeps words and a small regex, and drops empty matches and nested quantifiers", () => {
    expect(cleanPatterns(" ship \nship\n/deploy/i\n/(a+)+/\n/a*/\nx")).toEqual(["ship", "/deploy/i"]);
    expect(patternHit("Please Deploy the booth", ["ship", "/deploy/i"])).toBe("/deploy/i");
    expect(patternHit("please ship it", ["ship"])).toBe("ship");
    expect(patternHit("nope", ["ship", "/deploy/i"])).toBeNull();
    expect(patternHit("aaaaaaaaaaaaaaaa!", ["/(a+)+/"])).toBeNull();
  });

  it("merges global patterns with the server you are reading", () => {
    expect(patternsFor(["ship"], { g1: ["booth"] }, "g1")).toEqual(["ship", "booth"]);
    expect(patternsFor(["ship"], { g1: ["booth"] }, "")).toEqual(["ship"]);
    expect(patternHit("the booth", patternsFor(["ship"], { g1: ["booth"] }, "g1"))).toBe("booth");
  });

  it("notifies across servers unless mute, a duplicate, or the open channel wins", () => {
    expect(shouldPatternNotify(base)).toBe(true);
    expect(shouldPatternNotify({ ...base, muted: true })).toBe(false);
    expect(shouldPatternNotify({ ...base, alreadyNotified: true })).toBe(false);
    expect(shouldPatternNotify({ ...base, windowFocused: true, sameChannel: true })).toBe(false);
    expect(shouldPatternNotify({ ...base, windowFocused: true, sameChannel: false })).toBe(true);
    expect(shouldPatternNotify({ ...base, notify: false })).toBe(false);
  });

  it("drops broken highlight lines when the pack is loaded", () => {
    const pack = sanitizePack({
      highlightPatterns: ["ship", "/(a+)+/", "x"],
      highlightNotify: false,
      highlightGuilds: { "bad id": ["ship"], g1: ["booth", "booth"] },
      pinnedDms: ["dm-1", "bad id"],
    });
    expect(pack.highlightPatterns).toEqual(["ship"]);
    expect(pack.highlightNotify).toBe(false);
    expect(pack.highlightGuilds).toEqual({ g1: ["booth"] });
    expect(pack.pinnedDms).toEqual(["dm-1"]);
    expect(settingsFor(pack, "keyword-highlights", "c", "g1")).toEqual({ patterns: "ship\nbooth" });
  });

  it("highlights from the plugin script and declares the notify hook", () => {
    const plugin = describePlugin(readFileSync("store/plugins/keyword-highlights/plugin.js", "utf8"), "keyword-highlights");
    expect(plugin.hooks.patternNotify).toBe(true);
    const hit = plugin.run(
      {
        id: "m",
        content: "Please Deploy",
        authorName: "Maya",
        authorId: "7",
        timestamp: "2026-10-06T15:00:00.000Z",
        mentionsMe: false,
        kind: "default",
        highlights: [],
        badges: [],
        effects: [],
      },
      { settings: { patterns: "ship\n/deploy/i" }, hiddenAuthors: new Set() },
    );
    expect(hit?.highlights).toEqual(["keyword"]);
    expect(hit?.badges).toEqual(["keyword"]);
    const miss = plugin.run(
      {
        id: "m",
        content: "hello",
        authorName: "Maya",
        authorId: "7",
        timestamp: "2026-10-06T15:00:00.000Z",
        mentionsMe: false,
        kind: "default",
        highlights: [],
        badges: [],
        effects: [],
      },
      { settings: { patterns: "ship" }, hiddenAuthors: new Set() },
    );
    expect(miss?.highlights).toEqual([]);
  });
});
