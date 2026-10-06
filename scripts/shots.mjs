/**
 * Mocked demo screenshots. Requires `npm run dev` and puppeteer-core.
 *   node scripts/shots.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:47321/?demo=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0);

async function clickLabel(label) {
  const handle = await page.$(`[aria-label="${label}"]`);
  if (!handle) throw new Error(`missing ${label}`);
  await handle.click();
}

async function clickChannel(name) {
  const clicked = await page.evaluate((name) => {
    const row = [...document.querySelectorAll(".channel-row, .dm-row")].find((item) => item.querySelector("span")?.textContent === name);
    row?.click();
    return Boolean(row);
  }, name);
  if (!clicked) throw new Error(`missing channel ${name}`);
}

await clickChannel("Studio booth");
await page.waitForFunction(() => document.body.innerText.includes("Jonah Adler") && document.body.innerText.includes("Speaking"));
await clickLabel("Share screen");
await page.waitForFunction(() => document.body.innerText.includes("0 packets"));
await page.screenshot({ path: join(out, "voice_dock.png") });

await clickChannel("design-crit");
await page.waitForFunction(() => (document.querySelector(".chat-head h2")?.textContent ?? "").includes("design-crit") && document.querySelectorAll(".message").length > 4);
await clickLabel("Split view");
await page.waitForFunction(() => document.querySelector(".stage.is-split") && document.querySelectorAll(".chat-head h2").length >= 2);
await page.screenshot({ path: join(out, "split_view.png") });

await clickLabel("Command palette");
await page.waitForFunction(() => document.body.innerText.includes("Open settings") && document.body.innerText.includes("Toggle split view"));
await page.screenshot({ path: join(out, "command_palette.png") });
const palette = await page.$(".switcher-card input");
await palette?.type("theme", { delay: 10 });
await page.waitForFunction(() => document.body.innerText.includes("Theme editor") && !document.body.innerText.includes("Open settings"));
await page.keyboard.press("Escape");

await clickLabel("Theme editor");
await page.waitForFunction(() => document.body.innerText.includes("The mark sits on ink"));
await page.evaluate(() => {
  const input = [...document.querySelectorAll(".theme-field")].find((row) => row.textContent?.includes("--accent"))?.querySelector("input");
  if (!input) return;
  input.value = "#7dcaa0";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForFunction(() => getComputedStyle(document.querySelector("#app")).getPropertyValue("--accent").toLowerCase().includes("7dcaa0"));
await page.screenshot({ path: join(out, "theme_editor.png") });

const composer = await page.evaluate(() => {
  const box = document.querySelector('textarea[aria-label="Message"]');
  if (!box) return "missing";
  box.focus();
  box.value = "hello";
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return document.querySelector(".count")?.textContent ?? "";
});

console.log(JSON.stringify({ out, composer, accent: await page.evaluate(() => getComputedStyle(document.querySelector("#app")).getPropertyValue("--accent").trim()) }));
await browser.close();
