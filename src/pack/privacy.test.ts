import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { stripTrackingText, stripTrackingUrl } from "./links";
import {
  cleanPanicKey,
  defaultPrivacy,
  holdRead,
  obsDetected,
  panicPlan,
  publishActivity,
  redactStreamerText,
  sanitizePrivacy,
  streamerSafeActive,
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

describe("streamer safe", () => {
  it("turns on for a manual switch, OBS, or a live share", () => {
    const base = { enabled: true, manual: false, autoObs: true, obs: false, autoShare: true, sharing: false };
    expect(streamerSafeActive({ ...base, enabled: false, manual: true })).toBe(false);
    expect(streamerSafeActive(base)).toBe(false);
    expect(streamerSafeActive({ ...base, manual: true })).toBe(true);
    expect(streamerSafeActive({ ...base, obs: true })).toBe(true);
    expect(streamerSafeActive({ ...base, autoObs: false, obs: true })).toBe(false);
    expect(streamerSafeActive({ ...base, sharing: true })).toBe(true);
    expect(obsDetected([null, "Chrome"])).toBe(false);
    expect(obsDetected(["obs64.exe"])).toBe(true);
    expect(obsDetected(["OBS Studio"])).toBe(true);
  });

  it("hides phone numbers and snowflake ids and leaves the sentence", () => {
    const text = redactStreamerText("call 415-555-0134 about 100000000000000001 today", { phones: true, ids: true });
    expect(text).not.toContain("415-555-0134");
    expect(text).not.toContain("100000000000000001");
    expect(text).toContain("[phone hidden]");
    expect(text).toContain("[id hidden]");
    expect(text).toContain("today");
    expect(redactStreamerText("415-555-0134", { phones: false, ids: true })).toBe("415-555-0134");
  });

  it("hides a direct message and a phone when the plugin is active", () => {
    const plugin = describePlugin(readFileSync("plugins/streamer-safe.js", "utf8"), "streamer-safe");
    expect(plugin.hooks.streamerSafe).toBe(true);
    const message = {
      id: "m",
      content: "mail ada@example.com or 415-555-0199 id 100000000000000001",
      authorName: "Maya",
      authorId: "7",
      timestamp: "2026-10-06T15:00:00.000Z",
      mentionsMe: false,
      kind: "default",
      highlights: [],
      badges: [],
      effects: [],
    };
    const idle = plugin.run(message, { settings: { active: "0" }, hiddenAuthors: new Set() });
    expect(idle?.content).toContain("ada@example.com");
    const live = plugin.run(message, { settings: { active: "1", direct: "0", emails: "1", phones: "1", ids: "1" }, hiddenAuthors: new Set() });
    expect(live?.content).not.toContain("ada@example.com");
    expect(live?.content).not.toContain("415-555-0199");
    expect(live?.content).toContain("[id hidden]");
    const dm = plugin.run(message, { settings: { active: "1", direct: "1", dms: "1" }, hiddenAuthors: new Set() });
    expect(dm?.content).toBe("Message hidden");
  });
});

describe("clean links", () => {
  it("drops tracking parameters and keeps the rest of the link", () => {
    expect(stripTrackingUrl("https://example.com/a?utm_source=news&id=4")).toBe("https://example.com/a?id=4");
    expect(stripTrackingUrl("https://youtu.be/abc?si=tracking")).toBe("https://youtu.be/abc");
    expect(stripTrackingUrl("https://shop.example/item?fbclid=abc&gclid=def&color=red")).toBe("https://shop.example/item?color=red");
    expect(stripTrackingText("see https://example.com/docs?utm_medium=email, thanks")).toBe("see https://example.com/docs, thanks");
    expect(stripTrackingUrl("not a url")).toBe("not a url");
    expect(stripTrackingUrl("https://example.com/a?id=4")).toBe("https://example.com/a?id=4");
  });

  it("cleans a received message and can leave it when opening is off", () => {
    const plugin = describePlugin(readFileSync("plugins/clean-links.js", "utf8"), "clean-links");
    expect(plugin.hooks.cleanLinks).toBe(true);
    const message = {
      id: "m",
      content: "https://example.com/a?utm_source=news&id=4",
      authorName: "Maya",
      authorId: "7",
      timestamp: "2026-10-06T15:00:00.000Z",
      mentionsMe: false,
      kind: "default",
      highlights: [],
      badges: [],
      effects: [],
    };
    const cleaned = plugin.run(message, { settings: {}, hiddenAuthors: new Set() });
    expect(cleaned?.content).toBe("https://example.com/a?id=4");
    const kept = plugin.run(message, { settings: { receive: "0" }, hiddenAuthors: new Set() });
    expect(kept?.content).toContain("utm_source");
  });
});
