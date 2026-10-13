import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-profile.css", import.meta.url), "utf8");

describe("profile styling", () => {
  it("keeps the popout, panel, roles, note, and user-area hooks", () => {
    for (const hook of [".profile-card", ".profile-banner", ".profile-badge", ".role-pill", ".profile-note", ".profile-card.is-panel", ".profile-card.is-full", ".profile-status-picker .picker", ".user-dock", ".profile-chip", ".user-settings"]) {
      expect(css).toContain(hook);
    }
  });
});
