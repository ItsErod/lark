import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-messages.css", import.meta.url), "utf8");

describe("message styling", () => {
  it("keeps grouping, hover actions, reactions, embeds, and code hooks", () => {
    for (const hook of [".message:not(.is-grouped)", ".message.is-grouped", ".message-actions", ".reaction", ".reaction.is-mine", ".embed", ".codeblock", ".inline-code"]) {
      expect(css).toContain(hook);
    }
  });

  it("does not fix message heights, so virtualized rows can still measure", () => {
    expect(css).not.toMatch(/\.message\s*\{[^}]*height:\s*\d/);
    expect(css).toContain("var(--motion-fast)");
  });
});
