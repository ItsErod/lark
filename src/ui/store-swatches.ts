import { el } from "./dom";

const STYLE_ID = "lark-store-swatch-style";
const HEX = /^#[0-9a-fA-F]{3,8}$/;

const CSS = `
.store-swatches { display: flex; gap: 4px; margin-top: 6px; }
.store-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #3f3f46;
  box-shadow: none;
}
`;

/** Up to six theme colours for a store install row. Invalid values are dropped. */
export function themeSwatches(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const color of colors) {
    const hex = color.trim();
    if (!HEX.test(hex)) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
    if (out.length >= 6) break;
  }
  return out;
}

export function storeSwatches(colors: readonly string[]): HTMLElement | null {
  const hex = themeSwatches(colors);
  if (!hex.length) return null;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const row = el("span", "store-swatches");
  row.setAttribute("aria-hidden", "true");
  for (const color of hex) {
    const chip = el("span", "store-swatch");
    chip.style.backgroundColor = color;
    row.append(chip);
  }
  return row;
}
