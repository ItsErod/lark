/** Read the colour tokens already on the page. Nothing is written back. */

export const THEME_ATTRS = [
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

export interface ThemeAttr {
  name: string;
  value: string;
}

export function themeAttributeLines(style: { getPropertyValue(name: string): string }): ThemeAttr[] {
  const out: ThemeAttr[] = [];
  for (const name of THEME_ATTRS) {
    const value = style.getPropertyValue(name).trim().replace(/\s+/g, " ").slice(0, 80);
    if (!value) continue;
    out.push({ name, value });
  }
  return out;
}

export function themeAttributeText(lines: readonly ThemeAttr[]): string {
  return lines.map((line) => `${line.name}: ${line.value}`).join("\n");
}
