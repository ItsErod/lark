import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-composer.css", import.meta.url), "utf8");

describe("composer styling", () => {
  it("keeps the composer, reply bar, suggestions, and attachment hooks", () => {
    for (const hook of [".composer-wrap", ".composer:focus-within", ".composer-banner", ".suggest", ".composer-tools", ".file-chip", ".composer-accessories"]) {
      expect(css).toContain(hook);
    }
  });

  it("uses the token scale for radius, focus, and motion", () => {
    expect(css).toContain("var(--radius-xl)");
    expect(css).toContain("var(--focus-ring)");
    expect(css).toContain("var(--motion-fast)");
    expect(css).toContain("var(--ease-out)");
  });
});
