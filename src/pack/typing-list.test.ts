import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { typingLabel } from "./typing-list";

const now = 10_000;

describe("typing list", () => {
  it("names one person and counts a crowd", () => {
    const people = [
      { channelId: "c1", name: "Maya", until: now + 1000 },
      { channelId: "c1", name: "Maya", until: now + 1000 },
      { channelId: "c1", name: "Jonah", until: now - 1 },
      { channelId: "c2", name: "Priya", until: now + 1000 },
    ];
    expect(typingLabel(people, "c1", now)).toEqual({ label: "typing", title: "Maya is typing" });
    expect(typingLabel([...people, { channelId: "c1", name: "Jonah", until: now + 5 }], "c1", now)).toEqual({
      label: "2 typing",
      title: "Maya and Jonah are typing",
    });
    expect(typingLabel(people, "c2", now)?.title).toBe("Priya is typing");
    expect(typingLabel(people, "c9", now)).toBeNull();
  });

  it("declares the hook and keeps the list toggles", () => {
    const plugin = describePlugin(readFileSync("store/plugins/typing-list/plugin.js", "utf8"), "typing-list");
    expect(plugin.hooks.typingList).toBe(true);
    const pack = sanitizePack({ typingChannels: false, typingDms: true });
    expect(pack.typingChannels).toBe(false);
    expect(pack.typingDms).toBe(true);
    expect(sanitizePack({}).typingChannels).toBe(true);
    const silent = describePlugin(readFileSync("store/plugins/silent-typing/plugin.js", "utf8"), "silent-typing");
    expect(silent.hooks.silentTyping).toBe(true);
  });
});
