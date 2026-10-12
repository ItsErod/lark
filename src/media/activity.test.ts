import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { gameActivityName, gameStatusLine, mediaSource, mediaStatusLine } from "./activity";

describe("game activity", () => {
  it("sends the detected game only while it is shown", () => {
    expect(gameActivityName("show", "  Hades  II ")).toBe("Hades II");
    expect(gameActivityName("hide", "Hades II")).toBe("");
    expect(gameActivityName("show", "   ")).toBe("");
  });

  it("declares the toggle hook", () => {
    const source = readFileSync("plugins/game-activity.js", "utf8");
    const plugin = describePlugin(source, "game-activity");
    expect(plugin.name).toBe("Game Activity Toggle");
    expect(plugin.hooks.gameActivity).toBe(true);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});

describe("now playing status", () => {
  it("builds a status from the game, the system player, or either", () => {
    expect(gameStatusLine("Hades II")).toBe("Playing Hades II");
    expect(mediaStatusLine("game", "Hades II", "Apricot", "Maya")).toBe("Playing Hades II");
    expect(mediaStatusLine("spotify", "Hades II", "Apricot", "Maya")).toBe("Listening to Apricot — Maya");
    expect(mediaStatusLine("either", "Hades II", "", "")).toBe("Playing Hades II");
    expect(mediaStatusLine("either", "Hades II", "Apricot", "")).toBe("Listening to Apricot");
    expect(mediaStatusLine("spotify", "Hades II", "", "")).toBe("");
    expect(mediaSource("radio")).toBe("either");
  });

  it("declares a status hook separate from the existing player", () => {
    const source = readFileSync("plugins/media-status.js", "utf8");
    const plugin = describePlugin(source, "media-status");
    expect(plugin.hooks.mediaStatus).toBe(true);
    expect(plugin.hooks.nowPlaying).toBe(false);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});
