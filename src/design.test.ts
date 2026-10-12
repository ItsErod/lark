import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design.css", import.meta.url), "utf8");

const TOKENS = [
  "--color-bg",
  "--color-fg",
  "--color-accent",
  "--color-danger",
  "--color-speak",
  "--space-1",
  "--space-2",
  "--space-4",
  "--space-8",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-full",
  "--elev-1",
  "--elev-2",
  "--elev-3",
  "--focus-ring",
  "--text-sm",
  "--text-base",
  "--text-xl",
  "--weight-medium",
  "--weight-semibold",
  "--leading-tight",
  "--leading-body",
  "--icon-sm",
  "--icon-md",
  "--motion-fast",
  "--motion-base",
  "--motion-slow",
  "--ease-out",
];

describe("design tokens", () => {
  it("keeps colour aliased to the theme variables", () => {
    expect(css).toContain("--color-bg: var(--bg-0)");
    expect(css).toContain("--color-fg: var(--text)");
    expect(css).toContain("--color-accent: var(--accent)");
    expect(css).not.toMatch(/--bg-0:\s*#/);
    expect(css).not.toMatch(/--accent:\s*#/);
  });

  it("defines spacing, radii, elevation, type, icons, and motion", () => {
    for (const token of TOKENS) expect(css).toContain(`${token}:`);
    expect(css).toContain("--space-2: 8px");
    expect(css).toContain("--motion-fast: 120ms");
    expect(css).toContain("--motion-slow: 200ms");
  });

  it("drops motion when the user prefers reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("--motion-fast: 0ms");
    expect(css).toContain("--motion-base: 0ms");
    expect(css).toContain("--motion-slow: 0ms");
  });
});
