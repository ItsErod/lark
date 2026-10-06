/**
 * Mocked screenshots of the plugin pack. Requires `npm run dev`.
 *   node scripts/plugin-shots.mjs
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

const enabled = [
  "highlight-mentions",
  "code-badge",
  "message-translate",
  "inline-syntax",
  "quiet-media",
  "send-later",
  "quick-react",
  "keyword-ping",
  "auto-away",
  "now-playing",
  "bookmarks",
  "hide-muted",
  "relative-time",
  "silent-typing",
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:47321/?demo=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0);
await page.evaluate(() => localStorage.removeItem("lark.config.v1"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0 && document.querySelectorAll(".message").length > 2);
await page.click('[aria-label="Settings"]');
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".settings-nav button")].find((item) => item.textContent === "Plugins");
  button?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("Message translator") && document.body.innerText.includes("Off"));
await page.evaluate(() => document.querySelector("h3")?.scrollIntoView({ block: "start" }));
await page.screenshot({ path: join(out, "plugins_off.png") });
await page.evaluate(() => {
  const overlay = document.querySelector(".settings-card")?.parentElement;
  overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.evaluate((ids) => {
  localStorage.setItem("lark.config.v1", JSON.stringify({ plugins: { enabled: ids } }));
  localStorage.setItem("lark.pack.v1", JSON.stringify({
    translateLang: "es",
    keywordGlobal: ["compact"],
    playingTitle: "Apricot mark",
    playingArtist: "Northwind",
    playingReplace: true,
  }));
}, enabled);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0);
await page.waitForFunction(() => document.body.innerText.includes("design-crit") && document.querySelectorAll(".message").length > 4);

const checks = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    relative: /\d+m ago|just now/.test(text),
    embeds: document.querySelectorAll(".embed").length,
    compact: document.querySelectorAll(".message.is-compact-media").length,
    translate: document.querySelectorAll('[aria-label="Translate"]').length,
    later: document.querySelector('[aria-label="Send later"]') ? true : false,
    saved: document.querySelector('[aria-label="Bookmarks"]') ? true : false,
  };
});

await page.evaluate(() => {
  const row = [...document.querySelectorAll(".message")].find((item) => item.textContent?.includes("Shipping the compact density"));
  row?.querySelector('[aria-label="Translate"]')?.click();
  row?.querySelector('[aria-label="Save"]')?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("densidad compacta"));
await page.waitForFunction(() => [...document.querySelectorAll(".message")].some((item) => item.textContent?.includes("densidad compacta") && item.querySelector('[aria-label="Saved"]')));

const composer = await page.$("textarea");
await composer?.click();
await composer?.type("Gutter stays `const rail = 4` on both platforms.", { delay: 1 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".inline-code .tok-keyword")?.textContent === "const");

await page.screenshot({ path: join(out, "plugins_channel.png") });

await page.hover(".message");
await page.screenshot({ path: join(out, "plugins_actions.png") });

await page.click('[aria-label="Send later"]');
await page.waitForFunction(() => document.body.innerText.includes("Send at"));
await page.screenshot({ path: join(out, "plugins_send_later.png") });
await page.evaluate(() => {
  const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel" && button.closest(".composer-banner"));
  cancel?.click();
});

await page.click('[aria-label="Bookmarks"]');
await page.waitForFunction(() => document.body.innerText.includes("Bookmarks") && document.querySelector(".bookmark-row"));
await page.screenshot({ path: join(out, "plugins_bookmarks.png") });
await page.evaluate(() => {
  const close = [...document.querySelectorAll("button")].find((button) => button.textContent === "Close");
  close?.click();
});

await page.click('[aria-label="Settings"]');
await page.waitForFunction(() => document.body.innerText.includes("Appearance"));
await page.evaluate(() => {
  const button = [...document.querySelectorAll(".settings-nav button")].find((item) => item.textContent === "Plugins");
  button?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("Message translator") && document.body.innerText.includes("Silent typing"));
await page.evaluate(() => {
  document.querySelector("h3")?.scrollIntoView({ block: "start" });
});
await page.screenshot({ path: join(out, "plugins_settings.png") });

await page.evaluate(() => {
  const card = [...document.querySelectorAll(".plugin-card")].find((item) => item.textContent?.includes("Show on my status"));
  const inputs = card?.querySelectorAll("input") ?? [];
  if (inputs[0]) inputs[0].value = "Apricot mark";
  if (inputs[1]) inputs[1].value = "Northwind";
  const button = [...(card?.querySelectorAll("button") ?? [])].find((item) => item.textContent === "Show on my status");
  button?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("Listening to Apricot mark"));
await page.evaluate(() => {
  const overlay = document.querySelector(".settings-card")?.parentElement;
  overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForFunction(() => document.querySelector(".settings-card")?.closest(".overlay")?.hasAttribute("hidden"));
await page.screenshot({ path: join(out, "plugins_now_playing.png") });

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
const problems = [];
if (!checks.relative) problems.push("relative time");
if (checks.embeds !== 0) problems.push("embeds still visible");
if (!checks.compact) problems.push("compact media");
if (!checks.translate) problems.push("translate");
if (!checks.later) problems.push("send later");
if (!checks.saved) problems.push("bookmarks");
if (problems.length) {
  console.error(problems.join(", "));
  console.error(JSON.stringify(checks, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(checks, null, 2));
}
await browser.close();
