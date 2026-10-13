import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-voice.css", import.meta.url), "utf8");

describe("voice styling", () => {
  it("keeps the panel, tiles, speaking state, stage, and control bar", () => {
    for (const hook of [".voice-panel:not(.is-resting)", ".voice-board", ".voice-panel .icon-button.is-on", ".voice-tile", ".voice-tile.is-speaking", ".voice-tile-name", ".voice-bar", ".call-button", ".stage-board", ".call-strip"]) {
      expect(css).toContain(hook);
    }
  });

  it("floats the control bar inside the stage", () => {
    expect(css).toContain("position: absolute");
    expect(css).toContain("translateX(-50%)");
    expect(css).not.toContain("position: fixed");
  });
});
