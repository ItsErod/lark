/** List English UI sources passed to el() that are not in the French catalog yet. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const catalog = [
  readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/i18n-phrases.ts", import.meta.url), "utf8"),
].join("\n");
const known = new Set([...catalog.matchAll(/"((?:[^"\\]|\\.)+)":/g)].map((match) => match[1]));
const missing = new Set();
for (const file of walk(new URL("../src", import.meta.url).pathname)) {
  const source = readFileSync(file, "utf8");
  const re = /el\(\s*"[A-Za-z0-9]+"\s*,\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)+)"/g;
  let match;
  while ((match = re.exec(source))) {
    if (!known.has(match[1])) missing.add(match[1]);
  }
}
console.log([...missing].sort().join("\n"));
console.error(`${missing.size} el() strings are still English in every language`);
