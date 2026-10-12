import { describe, expect, it } from "vitest";
import { loadSettingsPages, peekSettingsPages } from "./lazy-chrome";

describe("lazy settings chrome", () => {
  it("stays unloaded until a pane asks for it", async () => {
    const pages = await loadSettingsPages();
    expect(typeof pages.renderAdvancedPane).toBe("function");
    expect(peekSettingsPages()).toBe(pages);
  });
});