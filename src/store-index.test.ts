import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface StoreItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  minLark: string;
  entry: string;
  sha256: string;
  file: string;
  download: string;
  swatches?: string[];
}

describe("store index", () => {
  const index = JSON.parse(readFileSync("store/index.json", "utf8")) as {
    version: number;
    plugins: StoreItem[];
    themes: StoreItem[];
  };

  it("lists every registry folder and no bundled copy", () => {
    expect(index.version).toBe(1);
    expect(index.plugins.map((item) => item.id).sort()).toEqual(readdirSync("store/plugins").sort());
    expect(index.themes.map((item) => item.id).sort()).toEqual(readdirSync("store/themes").sort());
    expect(index.plugins.length).toBeGreaterThan(0);
    expect(index.themes.length).toBeGreaterThan(0);
    const ids = [...index.plugins, ...index.themes].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("records a sha256 of the entry file", () => {
    for (const item of [...index.plugins, ...index.themes]) {
      const bytes = readFileSync(`store/${item.file}`);
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(item.sha256, item.id).toBe(hash);
      expect(item.file.endsWith(item.entry), item.id).toBe(true);
      expect(item.download).toBe(`downloads/${item.id}.zip`);
      expect(item.minLark).toMatch(/^\d+\.\d+\.\d+$/);
      const manifest = JSON.parse(readFileSync(`store/${item.file.replace(item.entry, "manifest.json")}`, "utf8")) as { id: string };
      expect(manifest.id).toBe(item.id);
    }
    for (const theme of index.themes) {
      expect(theme.swatches?.length ?? 0, theme.id).toBeGreaterThanOrEqual(3);
    }
  });
});
