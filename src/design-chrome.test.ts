import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-chrome.css", import.meta.url), "utf8");

describe("chrome styling", () => {
  it("keeps rail, channel, member, settings, menu, and toast hooks", () => {
    for (const hook of [".server-face", ".channel-row", ".member-row", ".settings-layer", ".setting-card", ".theme-card", ".ctx-menu", ".toast", ".modal-card"]) {
      expect(css).toContain(hook);
    }
  });

  it("leaves virtual member rows at the measured height", () => {
    expect(css).toContain(".member-scroll.is-virtual .member-row");
    expect(css).toContain("height: 42px");
  });
});
