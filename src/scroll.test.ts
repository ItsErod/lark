import { describe, expect, it } from "vitest";
import {
  anchoredScrollTop,
  anchorAfterGrowth,
  capMessages,
  isNearBottom,
  messageListPlan,
  nextScrollTop,
  PANEL_SCROLL_SELECTOR,
  pixelDelta,
  shouldLoadOlder,
} from "./scroll";

describe("panel scroll", () => {
  it("scopes the wheel to the rail, channel list, and chat", () => {
    expect(PANEL_SCROLL_SELECTOR).toContain(".rail-scroll");
    expect(PANEL_SCROLL_SELECTOR).toContain(".channel-scroll");
    expect(PANEL_SCROLL_SELECTOR).toContain(".messages");
    expect(PANEL_SCROLL_SELECTOR.split(", ").includes("body")).toBe(false);
  });

  it("clamps a wheel delta inside the panel", () => {
    expect(nextScrollTop(0, 800, 200, 50)).toBe(50);
    expect(nextScrollTop(580, 800, 200, 80)).toBe(600);
    expect(nextScrollTop(0, 800, 200, -20)).toBe(0);
    expect(pixelDelta(2, 1, 400)).toBe(32);
    expect(pixelDelta(1, 2, 400)).toBe(400);
    expect(pixelDelta(12, 0, 400)).toBe(12);
  });
});

describe("chat scroll anchor", () => {
  it("pins to the bottom when following, and keeps the offset when reading history", () => {
    expect(anchoredScrollTop({
      intent: "bottom",
      prevTop: 0,
      prevHeight: 400,
      nextHeight: 900,
      clientHeight: 200,
      nearBottom: false,
    })).toBe(700);
    expect(anchoredScrollTop({
      intent: "none",
      prevTop: 640,
      prevHeight: 900,
      nextHeight: 1100,
      clientHeight: 200,
      nearBottom: true,
    })).toBe(900);
    expect(anchoredScrollTop({
      intent: "none",
      prevTop: 120,
      prevHeight: 900,
      nextHeight: 1100,
      clientHeight: 200,
      nearBottom: false,
    })).toBe(120);
    expect(isNearBottom(640, 900, 200)).toBe(true);
    expect(isNearBottom(100, 900, 200)).toBe(false);
  });

  it("preserves the viewport when older messages are prepended", () => {
    expect(anchoredScrollTop({
      intent: "preserve",
      prevTop: 40,
      prevHeight: 800,
      nextHeight: 1400,
      clientHeight: 200,
      nearBottom: false,
    })).toBe(640);
  });

  it("anchors image growth above the fold and stays pinned at the bottom", () => {
    expect(anchorAfterGrowth({
      scrollTop: 400,
      scrollHeight: 1200,
      clientHeight: 200,
      delta: 180,
      pinned: false,
      aboveViewport: true,
    })).toBe(580);
    expect(anchorAfterGrowth({
      scrollTop: 400,
      scrollHeight: 1200,
      clientHeight: 200,
      delta: 180,
      pinned: false,
      aboveViewport: false,
    })).toBe(400);
    expect(anchorAfterGrowth({
      scrollTop: 800,
      scrollHeight: 1200,
      clientHeight: 200,
      delta: 180,
      pinned: true,
      aboveViewport: false,
    })).toBe(1000);
  });

  it("does not treat a locked rebuild as the reader reaching the top", () => {
    expect(shouldLoadOlder({
      scrollTop: 0,
      locked: true,
      loading: false,
      hasMore: true,
      sinceOpenMs: 5_000,
    })).toBe(false);
    expect(shouldLoadOlder({
      scrollTop: 0,
      locked: false,
      loading: false,
      hasMore: true,
      sinceOpenMs: 5_000,
    })).toBe(true);
    expect(shouldLoadOlder({
      scrollTop: 0,
      locked: false,
      loading: false,
      hasMore: true,
      sinceOpenMs: 100,
    })).toBe(false);
    expect(shouldLoadOlder({
      scrollTop: 400,
      locked: false,
      loading: false,
      hasMore: true,
      sinceOpenMs: 5_000,
    })).toBe(false);
  });

  it("appends one new message and replaces when earlier rows change", () => {
    const structural = "chan|false||cozy";
    const previous = `${structural}|a:hi~b:yo`;
    expect(messageListPlan(previous, structural, "a:hi~b:yo", true)).toBe("append");
    expect(messageListPlan(previous, structural, "a:hi~b:edited", true)).toBe("replace");
    expect(messageListPlan(previous, "chan|false||compact", "a:hi~b:yo", true)).toBe("replace");
    expect(messageListPlan("", structural, "", false)).toBe("replace");
  });

  it("trims a pinned channel and leaves a short history intact", () => {
    const long = Array.from({ length: 400 }, (_, index) => index);
    expect(capMessages(long, true).trimmed).toBe(true);
    expect(capMessages(long, true).items).toHaveLength(280);
    expect(capMessages(long, false).trimmed).toBe(false);
    expect(capMessages(long.slice(0, 20), true).trimmed).toBe(false);
  });
});