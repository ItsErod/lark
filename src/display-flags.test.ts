import { describe, expect, it } from "vitest";
import { defaultConfig, sanitizeConfig } from "./config";
import { developerMode, readDisplayFlags, showEmbeds, showSpoilers } from "./display-flags";

describe("display flags", () => {
  it("defaults developer mode and spoilers off, and embeds on", () => {
    expect(readDisplayFlags(null)).toEqual({
      developer_mode: false,
      show_embeds: true,
      show_spoilers: false,
    });
    expect(readDisplayFlags({})).toEqual(readDisplayFlags(null));
    expect(readDisplayFlags({ display: null })).toEqual(readDisplayFlags(null));
    expect(developerMode(defaultConfig())).toBe(false);
    expect(showEmbeds(defaultConfig())).toBe(true);
    expect(showSpoilers(defaultConfig())).toBe(false);
  });

  it("reads booleans and ignores unknown or mistyped fields", () => {
    const config = {
      display: {
        developer_mode: true,
        show_embeds: false,
        show_spoilers: true,
        show_future: "yes",
      },
    };
    expect(developerMode(config)).toBe(true);
    expect(showEmbeds(config)).toBe(false);
    expect(showSpoilers(config)).toBe(true);
    expect(showEmbeds({ display: { show_embeds: "no" as unknown as boolean } })).toBe(true);
    expect(developerMode({ display: { developer_mode: 1 as unknown as boolean } })).toBe(false);
  });

  it("keeps the flags through sanitize, including a config that omits them", () => {
    expect(sanitizeConfig({}).display).toEqual(defaultConfig().display);
    const saved = sanitizeConfig({
      display: { developer_mode: true, show_embeds: false, show_spoilers: true, extra: true },
    });
    expect(saved.display).toEqual({
      developer_mode: true,
      show_embeds: false,
      show_spoilers: true,
    });
    expect(sanitizeConfig({ appearance: { theme: "nord" } }).display.show_embeds).toBe(true);
  });
});
