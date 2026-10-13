import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const master = readFileSync(join(root, "_master.html"), "utf8");
const names = { a: "Dock", b: "Focus", c: "Grid", d: "Side" };

for (const id of Object.keys(names)) {
  for (const screen of ["stage", "side"]) {
    const title = `Lark — ${id.toUpperCase()} · ${names[id]} · ${screen}`;
    const html = master
      .replaceAll("__TITLE__", title)
      .replaceAll("__DIR__", id)
      .replaceAll("__SCREEN__", screen)
      .replaceAll("__CSS__", `${id}.css`);
    writeFileSync(join(root, `${id}-${screen}.html`), html);
  }
}
