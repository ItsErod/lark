import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? "/opt/cursor/artifacts/dashboard-directions";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const name of ["a-roster", "b-stage", "c-feed", "d-tiles"]) {
  const file = join(root, `${name}.html`);
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`${name}.png`);
}

await browser.close();
