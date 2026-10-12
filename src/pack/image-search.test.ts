import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { enabledEngines, httpsImage, searchHref } from "./image-search";

describe("reverse image search", () => {
  it("keeps https image addresses and drops the rest", () => {
    expect(httpsImage("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
    expect(httpsImage("http://cdn.example/a.png")).toBeNull();
    expect(httpsImage("https://user:secret@cdn.example/a.png")).toBeNull();
    expect(httpsImage("not a url")).toBeNull();
  });

  it("builds a search link for each engine that is on", () => {
    const image = "https://cdn.example/cat.png";
    expect(enabledEngines({ lens: true, tineye: false, yandex: true })).toEqual(["lens", "yandex"]);
    expect(searchHref("lens", image)).toBe(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(image)}`);
    expect(searchHref("tineye", image)).toContain("tineye.com/search?url=");
    expect(searchHref("yandex", image)).toContain("yandex.com/images/search");
    expect(searchHref("lens", "http://cdn.example/a.png")).toBeNull();
  });

  it("declares the image search hook", () => {
    const plugin = describePlugin(readFileSync("plugins/reverse-image.js", "utf8"), "reverse-image");
    expect(plugin.hooks.imageSearch).toBe(true);
    expect(plugin.name).toBe("Reverse image search");
  });
});
