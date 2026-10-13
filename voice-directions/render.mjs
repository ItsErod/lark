import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? "/opt/cursor/artifacts/voice-directions";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const id of ["a", "b", "c", "d"]) {
  for (const screen of ["stage", "side"]) {
    const file = join(root, `${id}-${screen}.html`);
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.waitForTimeout(80);
    await page.screenshot({ path: join(out, `${id}-${screen}.png`) });
    console.log(`${id}-${screen}.png`);
  }
}

await browser.close();
