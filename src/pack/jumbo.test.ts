import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { isJumbo, jumboCount, jumboSize } from "./jumbo";

describe("bigger emoji", () => {
  it("treats emoji-only messages as jumbo and keeps a size from the list", () => {
    expect(isJumbo("😀")).toBe(true);
    expect(isJumbo("  😀   🎉  ")).toBe(true);
    expect(jumboCount("<:wave:12345678901234567>")).toBe(1);
    expect(jumboCount("<a:wave:12345678901234567>")).toBe(1);
    expect(isJumbo("😀 hello")).toBe(false);
    expect(isJumbo("")).toBe(false);
    expect(jumboCount("😀".repeat(28))).toBe(0);
    expect(jumboSize(64)).toBe(64);
    expect(jumboSize(40)).toBe(48);
    expect(sanitizePack({ jumboSize: 96, imageLens: false }).jumboSize).toBe(96);
    expect(sanitizePack({ imageLens: false }).imageLens).toBe(false);
  });

  it("declares the jumbo hook", () => {
    const plugin = describePlugin(readFileSync("plugins/bigger-emoji.js", "utf8"), "bigger-emoji");
    expect(plugin.hooks.jumboEmoji).toBe(true);
    expect(plugin.name).toBe("Bigger emoji");
  });
});
