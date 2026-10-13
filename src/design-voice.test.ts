import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design-voice.css", import.meta.url), "utf8");

describe("voice styling", () => {
  it("keeps the panel, tiles, speaking state, stage, and control bar", () => {
    for (const hook of [".voice-panel:not(.is-resting)", ".voice-board", ".voice-panel .icon-button.is-on", ".voice-tile", ".voice-tile.is-speaking", ".voice-tile-name", ".voice-bar", ".call-button", ".stage-board", ".call-strip"]) {
      expect(css).toContain(hook);
    }
  });

  it("keeps a camera tile inside the focus band", () => {
    expect(css).toContain("#app .call-split.is-focus");
    expect(css).toContain("max-height: 252px");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("#app .voice-media > .voice-camera");
    expect(css).toContain("max-height: none");
    expect(css).toContain("pointer-events: none");
  });

  it("floats the control bar inside the stage", () => {
    expect(css).toContain("position: absolute");
    expect(css).toContain("translateX(-50%)");
    expect(css).not.toContain("position: fixed");
  });
});
