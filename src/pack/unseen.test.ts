import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { unseenChannels } from "./unseen";

const channel = (id: string, kind: string, position = 0) => ({ id, kind, position, name: id, topic: `${id} topic` });

describe("hidden channels", () => {
  it("lists only channels the viewer cannot open", () => {
    const channels = [
      channel("open", "text", 1),
      channel("secret", "text", 0),
      channel("voice", "voice", 2),
      channel("group", "category", 3),
    ];
    const hidden = unseenChannels(channels, (item) => item.id === "open");
    expect(hidden.map((item) => item.id)).toEqual(["secret", "voice"]);
    expect(unseenChannels(channels, () => true)).toEqual([]);
  });

  it("declares the hook and the topic option", () => {
    const plugin = describePlugin(readFileSync("plugins/show-hidden.js", "utf8"), "show-hidden");
    expect(plugin.hooks.showHidden).toBe(true);
    expect(plugin.name).toBe("Show hidden channels");
    expect(sanitizePack({ hiddenTopics: false }).hiddenTopics).toBe(false);
    expect(sanitizePack({}).hiddenTopics).toBe(true);
  });
});
