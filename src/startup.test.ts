import { appSource } from "./app-source.dev";
import { describe, expect, it } from "vitest";
import { CHANNEL_GATEWAY_GRACE_MS } from "./guilds";
import {
  CACHE_WARM_MS,
  MIN_SPLASH_MS,
  SLOW_CONNECT_MS,
  SPLASH_CAP_MS,
  STARTUP_CHANNEL_WAIT_MS,
  STARTUP_FLOOR,
  cacheWarmDone,
  channelsReady,
  landingTarget,
  parsePlace,
  preferredGuild,
  shouldShowSplash,
  splashReleaseDelay,
  startupLabel,
  startupProgress,
  type StartupMilestone,
} from "./startup";

describe("startup splash", () => {
  it("uses the same channel wait as the gateway grace", () => {
    expect(STARTUP_CHANNEL_WAIT_MS).toBe(CHANNEL_GATEWAY_GRACE_MS);
  });

  it("shows on a cold shell and only after a slow reconnect on a live shell", () => {
    expect(shouldShowSplash(false, 0)).toBe(true);
    expect(shouldShowSplash(true, SLOW_CONNECT_MS - 1)).toBe(false);
    expect(shouldShowSplash(true, SLOW_CONNECT_MS)).toBe(true);
  });

  it("creeps toward the next step and stops short of it", () => {
    const steps: StartupMilestone[] = ["connect", "ready", "channels", "cache"];
    for (const step of steps) {
      const floor = STARTUP_FLOOR[step];
      const next = STARTUP_FLOOR[steps[steps.indexOf(step) + 1] ?? "ui"];
      expect(startupProgress(step, 0)).toBeCloseTo(floor, 5);
      let previous = 0;
      for (const elapsed of [0, 200, 800, 5_000, 60_000]) {
        const value = startupProgress(step, elapsed);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeLessThan(next);
        previous = value;
      }
    }
    expect(startupProgress("ui", 0)).toBe(1);
    expect(startupProgress("connect", Number.NaN)).toBeCloseTo(STARTUP_FLOOR.connect, 5);
  });

  it("names the step that is still in flight", () => {
    expect(startupLabel("connect", true)).toBe("Connecting to Discord");
    expect(startupLabel("connect", false)).toBe("Reconnecting");
    expect(startupLabel("ready", true)).toBe("Loading servers and channels");
    expect(startupLabel("channels", true)).toBe("Opening a channel");
    expect(startupLabel("ui", true)).toBe("Ready");
  });

  it("gives the splash a finite cap past the channel grace", () => {
    expect(SPLASH_CAP_MS).toBeGreaterThan(STARTUP_CHANNEL_WAIT_MS + MIN_SPLASH_MS);
    expect(SPLASH_CAP_MS).toBeLessThanOrEqual(15_000);
  });

  it("shows the shell when the splash ends, and cannot hold the splash forever", () => {
    const source = appSource();
    const finish = source.slice(source.indexOf("  finishStartup("), source.indexOf("  hideSplash("));
    const revealAt = finish.indexOf("this.revealShell()");
    const openAt = finish.indexOf("this.openChannel(id)");
    expect(revealAt).toBeGreaterThan(0);
    expect(openAt).toBeGreaterThan(revealAt);
    expect(finish).toContain("this.clearSplashCap()");
    expect(finish).toContain("force");
    const begin = source.slice(source.indexOf("  beginStartup("), source.indexOf("  showPreviewSplash("));
    expect(begin).toContain("this.armSplashCap()");
    const open = source.slice(source.indexOf("  async openChannel("), source.indexOf("  finishChannelChrome("));
    expect(open.indexOf("this.revealShell()")).toBeGreaterThan(0);
    expect(open.indexOf("this.revealShell()")).toBeLessThan(open.indexOf("this.paintMessages()"));
    expect(source).toContain("SPLASH_CAP_MS");
    expect(source).toContain("reportCrash");
  });

  it("holds a finished splash only for the crossfade", () => {
    expect(splashReleaseDelay(0)).toBe(MIN_SPLASH_MS);
    expect(splashReleaseDelay(100)).toBe(MIN_SPLASH_MS - 100);
    expect(splashReleaseDelay(MIN_SPLASH_MS)).toBe(0);
    expect(splashReleaseDelay(MIN_SPLASH_MS + 50)).toBe(0);
  });

  it("treats channel maps as ready when the landing guild arrived, everything arrived, or the grace elapsed", () => {
    const base = {
      ready: true,
      guildIds: ["a", "b"],
      channeled: new Set(["a"]),
      landingGuildId: "b",
      readyAt: 1_000,
      now: 1_000,
    };
    expect(channelsReady({ ...base, ready: false })).toBe(false);
    expect(channelsReady({ ...base, guildIds: [] })).toBe(true);
    expect(channelsReady(base)).toBe(false);
    expect(channelsReady({ ...base, landingGuildId: "a" })).toBe(true);
    expect(channelsReady({ ...base, channeled: new Set(["a", "b"]) })).toBe(true);
    expect(channelsReady({ ...base, now: 1_000 + STARTUP_CHANNEL_WAIT_MS })).toBe(true);
    expect(channelsReady({ ...base, now: 1_000 + STARTUP_CHANNEL_WAIT_MS - 1 })).toBe(false);
  });

  it("opens the saved channel, then the first text channel, then a DM", () => {
    const channelsByGuild = {
      a: [
        { id: "voice", kind: "voice" },
        { id: "general", kind: "text" },
      ],
      b: [{ id: "announcements", kind: "announcement" }],
    };
    const dms = [{ id: "dm-1", kind: "dm" }];
    expect(landingTarget({
      place: { guildId: "b", channelId: "announcements" },
      guildIds: ["a", "b"],
      channelsByGuild,
      dms,
    })).toEqual({ guildId: "b", channelId: "announcements" });
    expect(landingTarget({
      place: { guildId: null, channelId: "dm-1" },
      guildIds: ["a", "b"],
      channelsByGuild,
      dms,
    })).toEqual({ guildId: null, channelId: "dm-1" });
    expect(landingTarget({
      place: { guildId: "missing", channelId: "gone" },
      guildIds: ["a", "b"],
      channelsByGuild,
      dms,
    })).toEqual({ guildId: "a", channelId: "general" });
    expect(landingTarget({
      place: { guildId: "b", channelId: null },
      guildIds: ["b"],
      channelsByGuild: { b: [{ id: "announcements", kind: "announcement" }] },
      dms,
    })).toEqual({ guildId: "b", channelId: "announcements" });
    expect(landingTarget({
      place: { guildId: null, channelId: null },
      guildIds: [],
      channelsByGuild: {},
      dms,
    })).toEqual({ guildId: null, channelId: "dm-1" });
  });

  it("finishes the cache step from a page, an empty landing, or the warm budget", () => {
    expect(cacheWarmDone({ channelId: null, hasPage: false, elapsedMs: 0 })).toBe(true);
    expect(cacheWarmDone({ channelId: "general", hasPage: true, elapsedMs: 0 })).toBe(true);
    expect(cacheWarmDone({ channelId: "general", hasPage: false, elapsedMs: CACHE_WARM_MS - 1 })).toBe(false);
    expect(cacheWarmDone({ channelId: "general", hasPage: false, elapsedMs: CACHE_WARM_MS })).toBe(true);
  });

  it("keeps a saved guild when it is still in the account", () => {
    expect(preferredGuild(["a", "b"], "b")).toBe("b");
    expect(preferredGuild(["a", "b"], "nope")).toBe("a");
    expect(preferredGuild([], "a")).toBeNull();
    expect(parsePlace({ guildId: "a", channelId: "c" })).toEqual({ guildId: "a", channelId: "c" });
    expect(parsePlace({ guildId: "", channelId: 4 })).toEqual({ guildId: null, channelId: null });
    expect(parsePlace(null)).toEqual({ guildId: null, channelId: null });
  });
});
