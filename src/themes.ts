/** Theme files, gallery metadata, and import/export. Layout stays in the app. */

export const THEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const LEGACY_THEME_IDS = ["daylight", "ink-contrast"] as const;

/** Original files that still use a large overlay shadow. Warm ink is in the pack, with that shadow kept. */
export const HEAVY_SHADOW_THEME_IDS = ["modern-dark", "daylight", "ink-contrast"] as const;

export interface ThemeMeta {
  id: string;
  title: string;
  blurb: string;
}

/** Shipped themes, in gallery order. Discord is the default. Warm ink stays in the pack. */
export const SHIPPED_THEMES: ThemeMeta[] = [
  { id: "discord", title: "Discord", blurb: "Blurple on charcoal" },
  { id: "modern-dark", title: "Warm ink", blurb: "The original apricot theme" },
  { id: "linear-dark", title: "Linear dark", blurb: "Zinc surfaces, indigo accent" },
  { id: "linear-light", title: "Linear light", blurb: "White, quiet, indigo" },
  { id: "oled", title: "OLED", blurb: "True black, no shadow blur" },
  { id: "nord", title: "Nord", blurb: "Arctic frost" },
  { id: "tokyo-night", title: "Tokyo Night", blurb: "Periwinkle on blue-black" },
  { id: "catppuccin-mocha", title: "Catppuccin Mocha", blurb: "Mauve on crust" },
  { id: "catppuccin-latte", title: "Catppuccin Latte", blurb: "Soft daylight mauve" },
  { id: "dracula", title: "Dracula", blurb: "Purple and pink" },
  { id: "gruvbox", title: "Gruvbox", blurb: "Warm retro contrast" },
  { id: "synthwave", title: "Synthwave", blurb: "Neon pink, no glow blur" },
  { id: "rgb", title: "RGB", blurb: "Cyan, magenta, and lime, held still" },
  { id: "frosted", title: "Frosted", blurb: "Native vibrancy on macOS and Windows" },
  { id: "phosphor", title: "Phosphor", blurb: "Retro green terminal" },
  { id: "high-contrast", title: "High contrast", blurb: "Large text contrast" },
  { id: "mono-oled", title: "Mono OLED", blurb: "True black, white accent" },
  { id: "mono-graphite", title: "Mono graphite", blurb: "Warm graphite, warm-white accent" },
  { id: "mono-light", title: "Mono light", blurb: "White surfaces, black type" },
  { id: "mono-contrast", title: "Mono contrast", blurb: "White on black, 7:1" },
  { id: "mono-blue", title: "Mono blue", blurb: "Zinc with a muted steel accent" },
  { id: "mono-sage", title: "Mono sage", blurb: "Zinc with a muted sage accent" },
  { id: "daylight", title: "Daylight", blurb: "Warm paper" },
  { id: "ink-contrast", title: "Ink contrast", blurb: "Bright-room black" },
];

export const PREVIEW_VARS = [
  "--bg-0",
  "--bg-1",
  "--bg-2",
  "--bg-3",
  "--bg-4",
  "--line",
  "--text",
  "--muted",
  "--faint",
  "--accent",
  "--accent-ink",
  "--ok",
  "--idle",
  "--busy",
  "--font",
] as const;

const BANNED = [
  "@import",
  "url(",
  "expression(",
  "backdrop-filter",
  "@keyframes",
  "animation:",
  "will-change",
  "javascript:",
  "-moz-binding",
  "behavior:",
  "blur(",
  "drop-shadow",
];

export interface ParsedTheme {
  colorScheme: "dark" | "light";
  material: "none" | "vibrancy";
  vars: Record<string, string>;
}

export function themePack(): ThemeMeta[] {
  const legacy = new Set<string>(LEGACY_THEME_IDS);
  return SHIPPED_THEMES.filter((theme) => !legacy.has(theme.id));
}

export function themeTitle(id: string): string {
  return SHIPPED_THEMES.find((theme) => theme.id === id)?.title ?? titleFromId(id);
}

export function titleFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Installed themes only. Known ids keep their titles. Nothing is bundled with the app. */
export function galleryEntries(extraIds: string[]): ThemeMeta[] {
  const out: ThemeMeta[] = [];
  const seen = new Set<string>();
  for (const id of extraIds) {
    if (!THEME_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const known = SHIPPED_THEMES.find((theme) => theme.id === id);
    out.push(known ?? { id, title: titleFromId(id), blurb: "Installed theme" });
  }
  return out;
}

export function filterThemes(themes: ThemeMeta[], query: string): ThemeMeta[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return themes;
  return themes.filter((theme) => `${theme.id} ${theme.title} ${theme.blurb}`.toLowerCase().includes(needle));
}

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface Block {
  selector: string;
  decls: { name: string; value: string }[];
}

function parseBlocks(css: string): Block[] | null {
  const blocks: Block[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (i >= css.length) break;
    const open = css.indexOf("{", i);
    if (open < 0) return null;
    const selector = css.slice(i, open).trim();
    if (!selector) return null;
    const close = css.indexOf("}", open + 1);
    if (close < 0) return null;
    const decls: { name: string; value: string }[] = [];
    for (const part of css.slice(open + 1, close).split(";")) {
      const item = part.trim();
      if (!item) continue;
      const colon = item.indexOf(":");
      if (colon <= 0) return null;
      decls.push({ name: item.slice(0, colon).trim(), value: item.slice(colon + 1).trim() });
    }
    blocks.push({ selector, decls });
    i = close + 1;
  }
  return blocks;
}

/** First problem, or null when the file is safe to inject. */
export function validateThemeCss(css: string): string | null {
  if (!css.trim()) return "Theme file is empty.";
  if (css.length > 16 * 1024) return "Theme file is too large.";
  if (css.includes("\0")) return "Theme file is not valid text.";
  const stripped = stripCssComments(css);
  const lower = stripped.toLowerCase();
  for (const token of BANNED) {
    if (lower.includes(token)) return `Theme CSS cannot include ${token}.`;
  }
  const blocks = parseBlocks(stripped);
  if (!blocks) return "Theme CSS can only set variables on :root and html.is-vibrancy.";
  let sawRoot = false;
  let sawBg = false;
  let sawText = false;
  let sawAccent = false;
  for (const block of blocks) {
    if (block.selector !== ":root" && block.selector !== "html.is-vibrancy") {
      return "Theme CSS can only set variables on :root and html.is-vibrancy.";
    }
    if (block.selector === ":root") sawRoot = true;
    for (const decl of block.decls) {
      const name = decl.name.toLowerCase();
      const value = decl.value.trim();
      if (value.length > 300 || /[{}<>]/.test(value)) return `Unsupported value for ${name}.`;
      if (name === "color-scheme") {
        if (value !== "dark" && value !== "light") return "color-scheme must be dark or light.";
        continue;
      }
      if (!/^--[a-z0-9-]+$/.test(name)) return `Unsupported property ${decl.name}.`;
      if (name === "--window-material" && value !== "none" && value !== "vibrancy") {
        return "Window material must be none or vibrancy.";
      }
      if (name === "--shadow" && shadowBlurPx(value) > 64) return "Shadow blur is too large.";
      if (name === "--bg-0") sawBg = true;
      if (name === "--text") sawText = true;
      if (name === "--accent") sawAccent = true;
    }
  }
  if (!sawRoot || !sawBg || !sawText || !sawAccent) return "A theme needs :root with --bg-0, --text, and --accent.";
  return null;
}

export function parseThemeCss(css: string): ParsedTheme {
  const blocks = parseBlocks(stripCssComments(css)) ?? [];
  const root = blocks.find((block) => block.selector === ":root");
  const vars: Record<string, string> = {};
  let colorScheme: "dark" | "light" = "dark";
  for (const decl of root?.decls ?? []) {
    const name = decl.name.toLowerCase();
    if (name === "color-scheme") {
      if (decl.value === "light" || decl.value === "dark") colorScheme = decl.value;
      continue;
    }
    if (name.startsWith("--")) vars[name] = decl.value.trim();
  }
  const material = vars["--window-material"] === "vibrancy" ? "vibrancy" : "none";
  return { colorScheme, material, vars };
}

export function previewVars(css: string): Record<string, string> {
  const parsed = parseThemeCss(css);
  const out: Record<string, string> = {};
  for (const key of PREVIEW_VARS) {
    if (parsed.vars[key]) out[key] = parsed.vars[key];
  }
  return out;
}

export function shadowBlurPx(shadow: string): number {
  let max = 0;
  for (const layer of splitCommas(shadow)) {
    const stripped = layer.replace(/(rgba?|hsla?|color-mix)\([^)]*\)/gi, " ");
    const tokens = stripped.match(/-?\d+(?:\.\d+)?px\b|\b0\b/g) ?? [];
    if (tokens.length >= 3) max = Math.max(max, Math.abs(parseFloat(tokens[2])));
  }
  return max;
}

function splitCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function themeIdFromFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const stem = base.replace(/\.(css|json)$/i, "");
  const slug = stem
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return THEME_ID.test(slug) ? slug : null;
}

export function themeToJson(id: string, css: string): string {
  const parsed = parseThemeCss(css);
  return JSON.stringify(
    {
      name: id,
      colorScheme: parsed.colorScheme,
      material: parsed.material,
      vars: parsed.vars,
      css,
    },
    null,
    2,
  );
}

export function themeFromJson(text: string, fallbackId?: string): { id: string; css: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Theme JSON could not be parsed.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Theme JSON must be an object.");
  const record = raw as Record<string, unknown>;
  const named = typeof record.name === "string" ? record.name.trim() : "";
  const id = THEME_ID.test(named) ? named : fallbackId && THEME_ID.test(fallbackId) ? fallbackId : "";
  if (!id) throw new Error("Theme name must be a lowercase slug.");
  if (typeof record.css === "string" && record.css.trim()) {
    const problem = validateThemeCss(record.css);
    if (problem) throw new Error(problem);
    return { id, css: record.css.endsWith("\n") ? record.css : `${record.css}\n` };
  }
  const css = cssFromVars(id, record);
  const problem = validateThemeCss(css);
  if (problem) throw new Error(problem);
  return { id, css };
}

const VAR_ORDER = [
  "--bg-0",
  "--bg-1",
  "--bg-2",
  "--bg-3",
  "--bg-4",
  "--line",
  "--text",
  "--muted",
  "--faint",
  "--accent",
  "--accent-ink",
  "--accent-soft",
  "--ok",
  "--idle",
  "--busy",
  "--danger",
  "--mention-bg",
  "--mention-fg",
  "--highlight",
  "--highlight-bar",
  "--link",
  "--bg-panel",
  "--hover",
  "--selected",
  "--message-hover",
  "--heading",
  "--pill",
  "--scrollbar",
  "--scrollbar-hover",
  "--shadow",
  "--font",
  "--mono",
  "--emoji",
  "--window-material",
];

function cssFromVars(id: string, record: Record<string, unknown>): string {
  const scheme = record.colorScheme === "light" ? "light" : "dark";
  const material = record.material === "vibrancy" ? "vibrancy" : "none";
  const source = record.vars;
  if (!source || typeof source !== "object") throw new Error("Theme JSON needs a vars object or a css string.");
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const name = key.startsWith("--") ? key.toLowerCase() : `--${key.toLowerCase()}`;
    if (!/^--[a-z0-9-]+$/.test(name) || typeof value !== "string") continue;
    vars[name] = value.trim();
  }
  if (material === "vibrancy") vars["--window-material"] = "vibrancy";
  for (const key of ["--bg-0", "--text", "--accent"]) {
    if (!vars[key]) throw new Error(`Theme JSON is missing ${key}.`);
  }
  const lines = [`/* Lark theme: ${id}. */`, ":root {", `  color-scheme: ${scheme};`];
  const seen = new Set<string>();
  for (const key of VAR_ORDER) {
    if (!vars[key]) continue;
    lines.push(`  ${key}: ${vars[key]};`);
    seen.add(key);
  }
  for (const [key, value] of Object.entries(vars)) {
    if (seen.has(key)) continue;
    lines.push(`  ${key}: ${value};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

/** Patch the first :root block. Later blocks, including vibrancy overrides, stay put. */
export function applyRootOverrides(css: string, overrides: Record<string, string>): string {
  const entries = Object.entries(overrides).filter(([key, value]) => /^--[a-z0-9-]+$/i.test(key) && value.trim());
  if (!entries.length) return css;
  const openAt = css.search(/:root\s*\{/i);
  if (openAt < 0) return css;
  const open = css.indexOf("{", openAt);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) return css;
  let body = css.slice(open + 1, close);
  for (const [key, value] of entries) {
    const safe = value.replace(/[;{}]/g, "").trim();
    const re = new RegExp(`(${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*)([^;]+)(;)`, "i");
    if (re.test(body)) body = body.replace(re, `$1${safe}$3`);
    else body += `\n  ${key}: ${safe};`;
  }
  return css.slice(0, open + 1) + body + css.slice(close);
}

export function loadImportedThemes(raw: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return map;
    for (const [id, css] of Object.entries(parsed as Record<string, unknown>)) {
      if (!THEME_ID.test(id) || typeof css !== "string" || css.length > 16 * 1024) continue;
      if (validateThemeCss(css)) continue;
      map.set(id, css);
    }
  } catch {
    /* Ignore a damaged local cache. */
  }
  return map;
}

export function serializeImportedThemes(themes: Map<string, string>): string {
  const entries = [...themes.entries()].slice(-24);
  return JSON.stringify(Object.fromEntries(entries));
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const top = fg.a >= 0.999 ? fg : composite(fg, bg);
  const lighter = Math.max(relativeLuminance(top), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(top), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(fg: Rgb, bg: Rgb): Rgb {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function relativeLuminance(color: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function parseColor(input: string): Rgb | null {
  const value = input.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const raw = hex[1];
    const expand = (pair: string) => parseInt(pair.length === 1 ? pair + pair : pair, 16);
    if (raw.length === 3 || raw.length === 4) {
      return { r: expand(raw[0]), g: expand(raw[1]), b: expand(raw[2]), a: raw.length === 4 ? expand(raw[3]) / 255 : 1 };
    }
    if (raw.length === 6 || raw.length === 8) {
      return {
        r: expand(raw.slice(0, 2)),
        g: expand(raw.slice(2, 4)),
        b: expand(raw.slice(4, 6)),
        a: raw.length === 8 ? expand(raw.slice(6, 8)) / 255 : 1,
      };
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
}
