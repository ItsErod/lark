import { appSource } from "./app-source.dev";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  captchaNote,
  cdnImage,
  countLine,
  dedupeCards,
  discoverMode,
  emptyNote,
  moreGuilds,
  type DiscoverCard,
} from "./discover";

const card = (id: string): DiscoverCard => ({
  id,
  name: "Northwind",
  description: "A quiet server",
  bannerUrl: "https://cdn.discordapp.com/discovery-splashes/100000000000000010/aabb.png?size=480",
  iconUrl: "",
  members: 155455,
  online: 21125,
  vanity: "northwind",
});

describe("discover screen", () => {
  it("moves from loading to a browse grid, an empty note, or a preview", () => {
    expect(discoverMode({ loading: true, error: "", preview: false })).toBe("loading");
    expect(discoverMode({ loading: false, error: "", preview: false })).toBe("browse");
    expect(discoverMode({ loading: false, error: "Offline", preview: false })).toBe("error");
    expect(discoverMode({ loading: false, error: "", preview: true })).toBe("preview");
    expect(emptyNote("", null)).toBe("No servers in Discovery right now.");
    expect(emptyNote("chess", "Gaming")).toBe("No servers in Gaming match that search.");
    expect(countLine(155455, 21125)).toBe("21.1K online · 155K members");
    expect(countLine(0, 4)).toBe("4 online · 0 members");
    expect(moreGuilds(24, 40, 24, 24)).toBe(true);
    expect(moreGuilds(40, 40, 16, 24)).toBe(false);
    expect(moreGuilds(0, 10, 0, 24)).toBe(false);
  });

  it("keeps only Discord CDN art and one card per server", () => {
    expect(cdnImage(card("1").bannerUrl)).toContain("cdn.discordapp.com");
    expect(cdnImage("https://evil.example/banner.png")).toBe("");
    expect(cdnImage("http://cdn.discordapp.com/icons/1/a.png")).toBe("");
    expect(cdnImage("https://user:pass@cdn.discordapp.com/icons/1/a.png")).toBe("");
    expect(dedupeCards([card("1"), card("1"), card("2")]).map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("explains a captcha join as a link-out and loads the screen on demand", () => {
    expect(captchaNote()).toContain("does not solve captchas");
    const app = appSource();
    expect(app).not.toMatch(/from ["']\.\/discover-view["']/);
    expect(app).toContain('import("./discover-view")');
    const settings = readFileSync("src/ui/guild-settings.ts", "utf8");
    expect(settings).not.toContain("discord.com/discovery");
    const css = readFileSync("src/design-chrome.css", "utf8");
    expect(css).toContain(".lark-discover");
    expect(css).toContain("box-shadow: none");
  });
});
