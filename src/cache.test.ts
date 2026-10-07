import { describe, expect, it } from "vitest";
import { prefetchChannelIds, rememberPage } from "./cache";

describe("message cache", () => {
  it("keeps the newest messages for a channel", () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) }));
    const stored = rememberPage([], { channelId: "c", messages }, 2);
    expect(stored[0].messages.map((message) => message.id)).toEqual(["4", "5"]);
  });

  it("warms neighbors before recent channels and skips what is loaded", () => {
    const loaded = new Set(["general"]);
    expect(prefetchChannelIds("general", ["welcome", "general", "crit", "ship"], ["crit", "dms"], loaded)).toEqual([
      "welcome",
      "crit",
      "dms",
    ]);
    expect(prefetchChannelIds("general", ["welcome", "general", "crit"], [], new Set(["welcome", "crit"]))).toEqual([]);
  });
});
