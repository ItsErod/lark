/**
 * Mocked sign-in screenshots. Requires `npm run dev`.
 *   node scripts/signin-shots.mjs
 */
import { mkdirSync } from "node:fs";
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

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1100,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });

await page.goto("http://127.0.0.1:47321/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0);
await page.waitForFunction(() => document.body.innerText.includes("Sign in with Discord") && document.querySelector(".qr-slot svg"));
await page.screenshot({ path: join(out, "signin.png") });

await page.click("summary");
await page.waitForFunction(() => document.querySelector(".token-input"));
await page.screenshot({ path: join(out, "signin_advanced.png") });

await page.goto("http://127.0.0.1:47321/?notice=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("HTTP 401"));
await page.screenshot({ path: join(out, "signin_error.png") });

await browser.close();
