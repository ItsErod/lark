import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = dirname(fileURLToPath(import.meta.url));
const out = "/opt/cursor/artifacts";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

for (const id of ["a", "b", "c", "d"]) {
  for (const screen of ["chat", "voice"]) {
    const file = join(root, `${id}-${screen}.html`);
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const target = join(out, `${id}-${screen}.png`);
    await page.screenshot({ path: target });
    console.log(target);
  }
}

await browser.close();
