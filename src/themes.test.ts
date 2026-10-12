import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import {
  applyRootOverrides,
  contrastRatio,
  filterThemes,
  galleryEntries,
  HEAVY_SHADOW_THEME_IDS,
  loadImportedThemes,
  parseThemeCss,
  shadowBlurPx,
  SHIPPED_THEMES,
  themeFromJson,
  themeIdFromFilename,
  themePack,
  themeToJson,
  validateThemeCss,
} from "./themes";

const heavyShadow = new Set<string>(HEAVY_SHADOW_THEME_IDS);

describe("theme pack", () => {
  const files = readdirSync("store/themes").sort();

  it("keeps the theme catalog in the store and discord as the built-in default", () => {
    expect(themePack().length).toBe(16);
    expect(themePack().map((theme) => theme.id)).toContain("discord");
    expect(themePack().map((theme) => theme.id)).toContain("modern-dark");
    expect(files).toEqual(SHIPPED_THEMES.map((theme) => theme.id).sort());
    for (const id of files) {
      expect(readdirSync(`store/themes/${id}`).sort()).toEqual(["manifest.json", "theme.css"]);
    }
    const doc = readFileSync("THEMES.md", "utf8");
    for (const theme of SHIPPED_THEMES) expect(doc, theme.id).toContain(theme.id);
    expect(defaultConfig().appearance.theme).toBe("discord");
    expect(defaultConfig().appearance.font_family).toBe("inter");
    expect(defaultConfig().appearance.font_size).toBe(16);
  });

  it("keeps every theme to variables, with a cheap shadow on the new pack", () => {
    for (const theme of SHIPPED_THEMES) {
      const css = readFileSync(`store/themes/${theme.id}/theme.css`, "utf8");
      expect(validateThemeCss(css), theme.id).toBeNull();
      const parsed = parseThemeCss(css);
      expect(parsed.vars["--bg-0"], theme.id).toBeTruthy();
      expect(parsed.vars["--text"], theme.id).toBeTruthy();
      expect(parsed.vars["--accent"], theme.id).toBeTruthy();
      if (!heavyShadow.has(theme.id)) {
        expect(shadowBlurPx(parsed.vars["--shadow"] ?? ""), theme.id).toBeLessThanOrEqual(12);
        expect(css.toLowerCase().includes("animation:") || css.toLowerCase().includes("@keyframes"), theme.id).toBe(false);
      }
    }
  });

  it("matches the discord dark palette and leaves the warm theme selectable", () => {
    const discord = parseThemeCss(readFileSync("store/themes/discord/theme.css", "utf8"));
    expect(discord.vars["--bg-0"]).toBe("#1e1f22");
    expect(discord.vars["--bg-1"]).toBe("#2b2d31");
    expect(discord.vars["--bg-2"]).toBe("#313338");
    expect(discord.vars["--bg-panel"]).toBe("#232428");
    expect(discord.vars["--accent"]).toBe("#5865f2");
    expect(discord.vars["--text"]).toBe("#dbdee1");
    expect(discord.vars["--muted"]).toBe("#949ba4");
    expect(discord.vars["--ok"]).toBe("#23a55a");
    expect(discord.vars["--danger"]).toBe("#f23f43");
    expect(discord.vars["--font"]).toContain("Inter");
    expect(shadowBlurPx(discord.vars["--shadow"] ?? "")).toBeLessThanOrEqual(12);
    const warm = parseThemeCss(readFileSync("store/themes/modern-dark/theme.css", "utf8"));
    expect(warm.vars["--bg-0"]).toBe("#12110f");
    expect(warm.vars["--accent"]).toBe("#e2a15a");
    const fallback = readFileSync("src/styles.css", "utf8");
    expect(fallback).toContain("--bg-0: #09090b");
    expect(fallback).toContain("--accent: #fafafa");
    expect(fallback).toContain("--shadow: none");
    expect(fallback).toContain("border-radius: 50%");
  });

  it("uses true black for OLED and a mono face for the terminal", () => {
    const oled = parseThemeCss(readFileSync("store/themes/oled/theme.css", "utf8"));
    expect(oled.vars["--bg-0"]).toBe("#000000");
    expect(oled.vars["--bg-1"]).toBe("#000000");
    expect(oled.vars["--bg-2"]).toBe("#000000");
    const phosphor = parseThemeCss(readFileSync("store/themes/phosphor/theme.css", "utf8"));
    expect(phosphor.vars["--font"]).toContain("monospace");
  });

  it("asks for native vibrancy without a CSS blur", () => {
    const css = readFileSync("store/themes/frosted/theme.css", "utf8");
    const parsed = parseThemeCss(css);
    expect(parsed.material).toBe("vibrancy");
    expect(css).toContain("html.is-vibrancy");
    expect(css.toLowerCase()).not.toContain("backdrop-filter");
    expect(parseThemeCss(css).vars["--bg-0"]).toBe("#1c212b");
  });

  it("keeps high contrast text at 7:1", () => {
    const parsed = parseThemeCss(readFileSync("store/themes/high-contrast/theme.css", "utf8"));
    const pairs: [string, string][] = [
      ["--text", "--bg-0"],
      ["--text", "--bg-2"],
      ["--muted", "--bg-0"],
      ["--muted", "--bg-2"],
      ["--faint", "--bg-0"],
      ["--faint", "--bg-2"],
      ["--accent-ink", "--accent"],
      ["--mention-fg", "--mention-bg"],
    ];
    for (const [fg, bg] of pairs) {
      const ratio = contrastRatio(parsed.vars[fg], parsed.vars[bg]);
      expect(ratio, `${fg} on ${bg}`).not.toBeNull();
      expect(ratio ?? 0, `${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("theme import and export", () => {
  const nord = readFileSync("store/themes/nord/theme.css", "utf8");

  it("round-trips a file through JSON", () => {
    const back = themeFromJson(themeToJson("nord", nord));
    expect(back.id).toBe("nord");
    expect(back.css).toBe(nord);
  });

  it("builds CSS from a vars object", () => {
    const back = themeFromJson(JSON.stringify({
      name: "custom-ink",
      colorScheme: "dark",
      vars: { "--bg-0": "#111111", "--text": "#f4f4f5", "--accent": "#5e6ad2" },
    }));
    expect(back.id).toBe("custom-ink");
    expect(parseThemeCss(back.css).vars["--accent"]).toBe("#5e6ad2");
    expect(validateThemeCss(back.css)).toBeNull();
  });

  it("rejects blur, remote urls, and layout rules", () => {
    expect(validateThemeCss(":root { --bg-0: #000; --text: #fff; --accent: #fff; } .shell { backdrop-filter: blur(12px); }")).toMatch(/backdrop-filter|variables/);
    expect(validateThemeCss(":root { --bg-0: url(https://example.test); --text: #fff; --accent: #fff; }")).toMatch(/url/);
    expect(validateThemeCss(":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; --shadow: 0 40px 200px #000; }")).toMatch(/blur/i);
    expect(themeIdFromFilename("My Theme.css")).toBe("my-theme");
    expect(themeIdFromFilename("../secret.css")).toBe("secret");
    expect(() => themeFromJson("{")).toThrow();
  });

  it("patches only the first root block", () => {
    const next = applyRootOverrides(nord, { "--accent": "#88c0d0" });
    expect(parseThemeCss(next).vars["--accent"]).toBe("#88c0d0");
    expect(validateThemeCss(next)).toBeNull();
  });

  it("drops unsafe imported themes from the browser cache", () => {
    const raw = JSON.stringify({
      nord,
      "bad-theme": ".message { display: none; backdrop-filter: blur(8px); }",
      "../nope": ":root { --bg-0: #000; --text: #fff; --accent: #fff; }",
    });
    const loaded = loadImportedThemes(raw);
    expect([...loaded.keys()]).toEqual(["nord"]);
    expect(loaded.get("nord")).toBe(nord);
  });

  it("lists installed themes and skips ones that are not on disk", () => {
    const entries = galleryEntries(["nord", "custom-ink", "catppuccin-latte", "Nope", "../x", "nord"]);
    expect(entries.map((theme) => theme.id)).toEqual(["nord", "custom-ink", "catppuccin-latte"]);
    expect(entries[0]?.title).toBe("Nord");
    expect(entries.some((theme) => theme.id === "discord")).toBe(false);
    expect(filterThemes(entries, "latte").map((theme) => theme.id)).toEqual(["catppuccin-latte"]);
  });
});
