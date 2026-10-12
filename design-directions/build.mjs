import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const master = readFileSync(join(root, "_master.html"), "utf8");
const names = {
  a: "Refined Discord",
  b: "Glass",
  c: "Minimal Mono",
  d: "Bold Rounded",
};

for (const id of Object.keys(names)) {
  for (const screen of ["chat", "voice"]) {
    const title = `Lark — ${id.toUpperCase()} · ${names[id]}${screen === "voice" ? " · Voice" : ""}`;
    const html = master
      .replaceAll("__TITLE__", title)
      .replaceAll("__THEME__", `theme-${id}`)
      .replaceAll("__SCREEN__", `screen-${screen}`)
      .replaceAll("__CSS__", `${id}.css`);
    writeFileSync(join(root, `${id}-${screen}.html`), html);
  }
}
