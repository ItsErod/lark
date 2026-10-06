import { describe, expect, it } from "vitest";
import { nextScrollTop, PANEL_SCROLL_SELECTOR, pixelDelta } from "./scroll";

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