/**
 * Mocked screenshots of every shipped theme, plus the gallery.
 * Requires `npm run dev` and puppeteer-core.
 *   node scripts/theme-shots.mjs
 */
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

function loadPuppeteer() {
  for (const root of [import.meta.url, "/tmp/pup/package.json"]) {
    try {
      return createRequire(root)("puppeteer-core");
    } catch {
      /* next */
    }
  }
  throw new Error("Install puppeteer-core so this script can drive Chrome.");
}

const puppeteer = loadPuppeteer();
const out = process.env.LARK_SHOTS ?? "/opt/cursor/artifacts/screenshots";
mkdirSync(out, { recursive: true });

const themes = readdirSync(new URL("../themes", import.meta.url))
  .filter((name) => name.endsWith(".css"))
  .map((name) => name.replace(/\.css$/, ""))
  .sort();

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

async function openDemo(theme) {
  await page.goto("http://127.0.0.1:47321/?demo=1", { waitUntil: "domcontentloaded" });
  await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem("lark.config.v1") || "{}");
    const appearance = saved.appearance && typeof saved.appearance === "object" ? saved.appearance : {};
    saved.appearance = { ...appearance, theme: id, font_family: "inter" };
    localStorage.setItem("lark.config.v1", JSON.stringify(saved));
  }, theme);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (id) => document.documentElement.dataset.theme === id && document.querySelectorAll(".message").length > 2,
    { timeout: 15000 },
    theme,
  );
  await page.evaluate(() => {
    document.querySelector("#app")?.style.removeProperty("--accent");
  });
}

for (const theme of themes) {
  await openDemo(theme);
  await page.screenshot({ path: join(out, `theme-${theme}.png`) });
}

await page.click('[aria-label="Settings"]');
await page.waitForFunction(() => {
  const cards = document.querySelectorAll(".theme-card");
  const pending = document.querySelectorAll(".theme-live.is-pending");
  return cards.length >= 14 && pending.length === 0;
});
await page.evaluate(() => {
  const card = document.querySelector(".settings-card");
  const body = document.querySelector(".settings-body");
  if (card instanceof HTMLElement) {
    card.style.height = "auto";
    card.style.maxHeight = "none";
    card.style.overflow = "visible";
  }
  if (body instanceof HTMLElement) body.style.overflow = "visible";
  const overlay = card?.parentElement;
  if (overlay instanceof HTMLElement) overlay.style.overflow = "visible";
});
const gallery = await page.$(".theme-gallery");
await gallery.screenshot({ path: join(out, "theme-gallery.png") });
await page.screenshot({ path: join(out, "theme-gallery-window.png") });

await browser.close();
console.log(`wrote ${themes.length} theme shots to ${out}`);
