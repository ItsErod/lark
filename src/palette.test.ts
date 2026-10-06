import { describe, expect, it } from "vitest";
import { commandCatalog, matchCommands } from "./palette";

describe("command palette", () => {
  it("includes actions beyond channel jumps", () => {
    const ids = commandCatalog().map((item) => item.id);
    expect(ids).toContain("split");
    expect(ids).toContain("theme");
    expect(ids).toContain("themes");
    expect(matchCommands("nord", commandCatalog()).some((item) => item.id === "themes")).toBe(true);
    expect(ids).toContain("mute");
    expect(ids).toContain("voice-hud");
    expect(matchCommands("voice", commandCatalog()).some((item) => item.id === "mute")).toBe(true);
    expect(matchCommands("zzzz", commandCatalog())).toEqual([]);
  });
});
