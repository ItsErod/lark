import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { bumpsUnread, effectiveLevel, shouldDesktopNotify } from "./notify";

describe("notifications", () => {
  it("lets a channel mute beat the server setting", () => {
    const config = defaultConfig();
    config.notifications.guilds["g1"] = { level: "all" };
    config.notifications.channels["c1"] = { muted: true };
    expect(effectiveLevel(config, "g1", "c1")).toBe("mute");
    expect(effectiveLevel(config, "g1", "c2")).toBe("all");
  });

  it("uses the server level when the channel has none", () => {
    const config = defaultConfig();
    config.notifications.guilds["g1"] = { level: "mentions" };
    expect(effectiveLevel(config, "g1", "c9")).toBe("mentions");
    expect(effectiveLevel(config, null, "c9")).toBe("all");
  });

  it("only badges mentions when the level says so", () => {
    expect(bumpsUnread("mute", true)).toBe(false);
    expect(bumpsUnread("mentions", false)).toBe(false);
    expect(bumpsUnread("mentions", true)).toBe(true);
    expect(bumpsUnread("all", false)).toBe(true);
  });

  it("skips a desktop alert for your own message or the open channel", () => {
    const base = {
      level: "all" as const,
      mentionsMe: false,
      fromMe: false,
      windowFocused: false,
      channelId: "c1",
      activeChannelId: "c2",
    };
    expect(shouldDesktopNotify(base)).toBe(true);
    expect(shouldDesktopNotify({ ...base, fromMe: true })).toBe(false);
    expect(shouldDesktopNotify({ ...base, level: "mute" })).toBe(false);
    expect(shouldDesktopNotify({ ...base, level: "mentions", mentionsMe: false })).toBe(false);
    expect(shouldDesktopNotify({ ...base, level: "mentions", mentionsMe: true })).toBe(true);
    expect(
      shouldDesktopNotify({ ...base, windowFocused: true, activeChannelId: "c1" }),
    ).toBe(false);
  });
});
