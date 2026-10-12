import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { replyChain } from "./chain";
import { connectionLabel, connectionLines } from "./connections";
import { displayName, sanitizeNicks, setLocalNick } from "./nicks";
import { sanitizePack } from "./state";

describe("reply chain", () => {
  const messages = [
    { id: "1", authorName: "Ada", content: "first", replyId: null },
    { id: "2", authorName: "Bea", content: "second", replyId: "1" },
    { id: "3", authorName: "Cal", content: "third", replyId: "2" },
  ];

  it("walks loaded parents and stops when one is missing", () => {
    const full = replyChain(messages, "3");
    expect(full.steps.map((step) => step.id)).toEqual(["3", "2", "1"]);
    expect(full.stopped).toBe("end");
    const gap = replyChain(messages.filter((message) => message.id !== "1"), "3");
    expect(gap.steps.map((step) => step.id)).toEqual(["3", "2"]);
    expect(gap.stopped).toBe("missing");
    expect(replyChain([{ id: "9", authorName: "Ada", content: "loop", replyId: "9" }], "9").stopped).toBe("loop");
    const plugin = describePlugin(readFileSync("store/plugins/reply-chain/plugin.js", "utf8"), "reply-chain");
    expect(plugin.hooks.replyChain).toBe(true);
  });
});

describe("show connections", () => {
  it("keeps a short unique list from a profile", () => {
    const lines = connectionLines([
      { kind: "spotify", name: "Ada", verified: true },
      { kind: "spotify", name: "Ada", verified: true },
      { kind: "youtube", name: "" },
      { kind: "", name: "" },
    ]);
    expect(lines).toEqual([
      { kind: "spotify", name: "Ada", verified: true },
      { kind: "youtube", name: "youtube", verified: false },
    ]);
    expect(connectionLabel(lines[0])).toBe("Ada · spotify · verified");
    const plugin = describePlugin(readFileSync("store/plugins/show-connections/plugin.js", "utf8"), "show-connections");
    expect(plugin.hooks.showConnections).toBe(true);
  });
});

describe("local nicknames", () => {
  it("overrides a name on this device and drops a bad id", () => {
    const named = setLocalNick({}, "100", "  Pip  ");
    expect(displayName(named, "100", "Ada")).toBe("Pip");
    expect(displayName(setLocalNick(named, "100", " "), "100", "Ada")).toBe("Ada");
    expect(sanitizeNicks({ "../x": "no", "12": "Ok" })).toEqual({ "12": "Ok" });
    const pack = sanitizePack({ localNicks: { "7": "Pip" } });
    expect(pack.localNicks["7"]).toBe("Pip");
    const plugin = describePlugin(readFileSync("store/plugins/local-nicknames/plugin.js", "utf8"), "local-nicknames");
    expect(plugin.hooks.localNicks).toBe(true);
    const source = readFileSync("store/plugins/local-nicknames/plugin.js", "utf8");
    expect(source).not.toMatch(/fetch\s*\(|\btoken\b|discord\.com\/api/i);
  });
});
