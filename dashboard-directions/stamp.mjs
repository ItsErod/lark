import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const frame = readFileSync(join(root, "frame.html"), "utf8");
const pages = [
  ["a", "a.css", "a-roster.html", "Lark — A · Roster"],
  ["b", "b.css", "b-stage.html", "Lark — B · Stage"],
  ["c", "c.css", "c-feed.html", "Lark — C · Feed"],
  ["d", "d.css", "d-tiles.html", "Lark — D · Tiles"],
];

for (const [dir, css, file, title] of pages) {
  const html = frame
    .replaceAll("__DIR__", dir)
    .replaceAll("__CSS__", css)
    .replaceAll("__TITLE__", title);
  writeFileSync(join(root, file), html);
  console.log(file);
}
