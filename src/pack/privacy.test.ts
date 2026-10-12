import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import {
  cleanPanicKey,
  defaultPrivacy,
  holdRead,
  panicPlan,
  publishActivity,
  sanitizePrivacy,
  visibleStatus,
} from "./privacy";

describe("panic key", () => {
  it("hides and mutes unless the options say otherwise", () => {
    expect(panicPlan("hide", true)).toEqual({ action: "hide", mute: true });
    expect(panicPlan("minimize", false)).toEqual({ action: "minimize", mute: false });
  });

  it("keeps a modified shortcut and drops a bare letter", () => {
    expect(cleanPanicKey(" Mod+Shift+J ")).toBe("mod+shift+j");
    expect(cleanPanicKey("h")).toBe("mod+shift+h");
    expect(cleanPanicKey("")).toBe("mod+shift+h");
    expect(cleanPanicKey("mod+shift+!")).toBe("mod+shift+h");
  });

  it("declares the panic hook and leaves messages alone", () => {
    const plugin = describePlugin(readFileSync("plugins/panic-key.js", "utf8"), "panic-key");
    expect(plugin.hooks.panicKey).toBe(true);
    expect(plugin.name).toBe("Panic Key");
    const message = {
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
    };
    expect(plugin.run(message, { settings: {}, hiddenAuthors: new Set() })?.content).toBe("hello");
  });
});

describe("incognito mode", () => {
  it("holds read receipts and hides local activity only while the options are on", () => {
    expect(holdRead(false, true)).toBe(false);
    expect(holdRead(true, false)).toBe(false);
    expect(holdRead(true, true)).toBe(true);
    expect(publishActivity(true, true, "plugin")).toBe(false);
    expect(publishActivity(true, true, "user")).toBe(true);
    expect(publishActivity(true, false, "plugin")).toBe(true);
    expect(visibleStatus(true, true, "Listening to Apricot", "Connected")).toBe("Incognito");
    expect(visibleStatus(true, false, "", "Connected")).toBe("Connected");
    expect(visibleStatus(false, true, "In the booth", "Connected")).toBe("In the booth");
  });

  it("drops a broken privacy blob back to the defaults", () => {
    expect(sanitizePrivacy(null)).toEqual(defaultPrivacy());
    expect(sanitizePrivacy({ panicAction: "minimize", panicMute: false, incognitoHoldRead: false, panicKey: "ctrl+alt+p" })).toEqual({
      ...defaultPrivacy(),
      panicAction: "minimize",
      panicMute: false,
      incognitoHoldRead: false,
      panicKey: "ctrl+alt+p",
    });
    expect(sanitizePrivacy({ panicAction: "explode", panicKey: "x" }).panicAction).toBe("hide");
  });

  it("declares the incognito hook", () => {
    const plugin = describePlugin(readFileSync("plugins/incognito.js", "utf8"), "incognito");
    expect(plugin.hooks.incognito).toBe(true);
    expect(plugin.hooks.panicKey).toBe(false);
    expect(plugin.description).toContain("read");
  });
});
