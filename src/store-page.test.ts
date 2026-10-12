import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("store page", () => {
  const html = readFileSync("docs/store/index.html", "utf8");

  it("lists plugins and themes with search, swatches, a zip, and an install link", () => {
    expect(html).toContain('id="search"');
    expect(html).toContain('id="tab-plugins"');
    expect(html).toContain('id="tab-themes"');
    expect(html).toContain(">Plugins<");
    expect(html).toContain(">Themes<");
    expect(html).toContain("lark://install/");
    expect(html).toContain("item.download");
    expect(html).toContain("swatches");
    expect(html).toContain('fetch("index.json"');
    expect(html).toContain("changelog");
  });
});
