import { readFileSync, readdirSync } from "node:fs";

/** The LarkApp source: app.ts plus the src/ui/app-*.ts modules split out of it. */
export function appSource(): string {
  const parts = readdirSync("src/ui")
    .filter((name) => /^app-[\w-]+\.ts$/.test(name) && !name.endsWith(".test.ts"))
    .sort()
    .map((name) => readFileSync(`src/ui/${name}`, "utf8"));
  return [readFileSync("src/ui/app.ts", "utf8"), ...parts].join("\n");
}
