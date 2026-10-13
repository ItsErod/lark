import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptBytes,
  APP_VERSION,
  availableStoreItems,
  entryUrl,
  findStoreItem,
  hashMatches,
  larkVersionOk,
  newerVersion,
  parseInstallUrl,
  parseStoreIndex,
  readLocalStore,
  sha256Hex,
  type StoreItem,
} from "./store";

const plugin = (over: Partial<StoreItem> = {}): StoreItem => ({
  id: "quiet-media",
  name: "Quiet media",
  description: "Hide link previews.",
  author: "Lark",
  version: "1.0.0",
  category: "messages",
  minLark: "2.4.0",
  entry: "plugin.js",
  icon: "image",
  changelog: "First release.",
  sha256: "a".repeat(64),
  bytes: 12,
  file: "plugins/quiet-media/plugin.js",
  download: "downloads/quiet-media.zip",
  swatches: [],
  ...over,
});

describe("store index", () => {
  it("keeps a well-formed catalog and drops a bad hash or path", () => {
    const index = parseStoreIndex({
      version: 1,
      plugins: [plugin()],
      themes: [{
        ...plugin({
          id: "nord",
          entry: "theme.css",
          file: "themes/nord/theme.css",
          download: "downloads/nord.zip",
          swatches: ["#2e3440", "#88c0d0"],
        }),
      }],
    });
    expect(index?.plugins.map((item) => item.id)).toEqual(["quiet-media"]);
    expect(findStoreItem(index!, "nord")?.kind).toBe("theme");
    expect(entryUrl(index!.plugins[0])).toBe("https://itserod.github.io/lark/store/plugins/quiet-media/plugin.js");
    expect(parseStoreIndex({ version: 1, plugins: [plugin({ sha256: "nope" })], themes: [] })).toBeNull();
    expect(parseStoreIndex({ version: 1, plugins: [plugin({ file: "../plugins/quiet-media/plugin.js" })], themes: [] })).toBeNull();
    expect(parseStoreIndex({ version: 2, plugins: [], themes: [] })).toBeNull();
    expect(parseStoreIndex({
      version: 1,
      plugins: [plugin()],
      themes: [plugin({ id: "quiet-media", entry: "theme.css", file: "themes/quiet-media/theme.css", download: "downloads/quiet-media.zip" })],
    })).toBeNull();
  });

  it("compares versions against this Lark build", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    expect(larkVersionOk("2.4.0", APP_VERSION)).toBe(true);
    expect(larkVersionOk(APP_VERSION, APP_VERSION)).toBe(true);
    expect(larkVersionOk("99.0.0", APP_VERSION)).toBe(false);
    expect(larkVersionOk("9.0.0", "2.4.5")).toBe(false);
    expect(newerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(newerVersion("1.2.0", "1.2.0")).toBe(false);
    expect(newerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("accepts bytes only when the hash and size match", async () => {
    const bytes = new TextEncoder().encode("hello store");
    const hash = await sha256Hex(bytes);
    const item = plugin({ sha256: hash, bytes: bytes.byteLength });
    expect(acceptBytes(item, bytes, hash)).toBeNull();
    expect(acceptBytes(item, bytes, "b".repeat(64))).toMatch(/hash/i);
    expect(acceptBytes(item, new Uint8Array([1, 0, 2]), hash)).toMatch(/size|text/i);
    expect(hashMatches(hash, hash.toUpperCase())).toBe(false);
  });

  it("lists store items that are not installed yet", () => {
    const index = parseStoreIndex({
      version: 1,
      plugins: [plugin(), plugin({ id: "bookmarks", name: "Bookmarks", file: "plugins/bookmarks/plugin.js", download: "downloads/bookmarks.zip" })],
      themes: [plugin({ id: "nord", name: "Nord", entry: "theme.css", file: "themes/nord/theme.css", download: "downloads/nord.zip" })],
    });
    expect(index).not.toBeNull();
    if (!index) return;
    expect(availableStoreItems(index, [{ id: "quiet-media", kind: "plugin" }], "plugin").map((item) => item.id)).toEqual(["bookmarks"]);
    expect(availableStoreItems(index, [], "theme").map((item) => item.id)).toEqual(["nord"]);
  });

  it("reads only lark://install/<id>", () => {
    expect(parseInstallUrl("lark://install/nord")).toBe("nord");
    expect(parseInstallUrl("lark://install/quiet-media")).toBe("quiet-media");
    expect(parseInstallUrl("lark://install/../token")).toBeNull();
    expect(parseInstallUrl("lark://open/nord")).toBeNull();
    expect(parseInstallUrl("https://itserod.github.io/lark/store/")).toBeNull();
    const saved = readLocalStore(JSON.stringify({
      plugins: { "quiet-media": { version: "1.0.0", sha256: "a".repeat(64), source: "function onMessage(m){return m}", name: "Quiet", description: "" }, "../x": { source: "no" } },
      themes: { nord: { version: "1.0.0", sha256: "b".repeat(64), css: ":root{}", name: "Nord", description: "" } },
    }));
    expect(Object.keys(saved.plugins)).toEqual(["quiet-media"]);
    expect(Object.keys(saved.themes)).toEqual(["nord"]);
  });
});
