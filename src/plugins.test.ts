import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { PACK_IDS } from "./pack/state";
import {
  applyPlugins,
  compilePlugin,
  describePlugin,
  enabledSources,
  parseCatalog,
  type PluginMessage,
} from "./plugins";

const message = (): PluginMessage => ({
  id: "m1",
  content: "hello ```ts",
  authorName: "Maya",
  authorId: "7",
  timestamp: "2026-10-06T15:00:00.000Z",
  mentionsMe: false,
  kind: "default",
  highlights: [],
  badges: [],
  effects: [],
  channelId: "c1",
});

describe("plugin api", () => {
  it("keeps identity fields and only known effects", () => {
    const plugin = compilePlugin(`
      function onMessage(message, api) {
        message.authorId = "stolen";
        message.timestamp = "nope";
        api.effect(message, "inline-code");
        api.effect(message, "token");
        api.effect(message, "inline-code");
        api.badge(message, "code");
        return message;
      }
    `);
    const result = plugin.run(message(), { settings: {}, hiddenAuthors: new Set() });
    expect(result?.authorId).toBe("7");
    expect(result?.timestamp).toBe("2026-10-06T15:00:00.000Z");
    expect(result?.effects).toEqual(["inline-code"]);
    expect(result?.badges).toEqual(["code"]);
    expect(Object.keys(plugin.run)).not.toContain("token");
  });

  it("hides an author only through the host list", () => {
    const plugin = describePlugin(readFileSync("plugins/hide-muted.js", "utf8"), "hide-muted");
    expect(plugin.hooks.hideUsers).toBe(true);
    const hidden = applyPlugins(message(), [plugin], { hiddenAuthors: new Set(["7"]) });
    expect(hidden).toBeNull();
    const shown = applyPlugins(message(), [plugin], { hiddenAuthors: new Set(["8"]) });
    expect(shown?.content).toBe("hello ```ts");
  });

  it("reads settings without giving the plugin a network handle", () => {
    const plugin = compilePlugin(`
      function onMessage(message, api) {
        if (api.setting("previews") !== "show") api.effect(message, "hide-previews");
        if (api.setting("compact") !== "off") api.effect(message, "compact-media");
        return message;
      }
    `);
    const hidden = plugin.run(message(), { settings: {}, hiddenAuthors: new Set() });
    expect(hidden?.effects).toEqual(["hide-previews", "compact-media"]);
    const open = plugin.run(message(), { settings: { previews: "show", compact: "off" }, hiddenAuthors: new Set() });
    expect(open?.effects).toEqual([]);
  });

  it("parses a catalog of ids or objects and drops unsafe ids", () => {
    const catalog = parseCatalog({
      plugins: [
        "highlight-mentions",
        { id: "message-translate", name: "Message translator", description: "Local" },
        { id: "../token", name: "nope" },
        "highlight-mentions",
      ],
    });
    expect(catalog.map((item) => item.id)).toEqual(["highlight-mentions", "message-translate"]);
    expect(catalog[1].name).toBe("Message translator");
  });

  it("loads only enabled plugins that are already compiled", () => {
    const one = describePlugin("function onMessage(message){ return message }", "alpha");
    const loaded = new Map([[one.id, one]]);
    expect(enabledSources(["missing", "alpha", "alpha"], loaded).map((item) => item.id)).toEqual(["alpha"]);
  });

  it("ships the pack off by default", () => {
    const enabled = new Set(defaultConfig().plugins.enabled);
    for (const id of PACK_IDS) expect(enabled.has(id)).toBe(false);
    expect(enabled.has("highlight-mentions")).toBe(true);
  });

  it("keeps pack scripts free of the token and the network", () => {
    const files = readdirSync("plugins").filter((name) => name.endsWith(".js"));
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const name of files) {
      const source = readFileSync(`plugins/${name}`, "utf8").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|discord\.com\/api|Authorization|localStorage|document\.cookie|\btoken\b/i);
    }
  });
});
