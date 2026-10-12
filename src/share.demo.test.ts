import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 47324;

describe("go live share surfaces", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({
      server: { host: "127.0.0.1", port, strictPort: true },
    });
    await server.listen();
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("opens the share dialog outside the message list", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/?demo=1&share=dialog`);
    await page.waitForSelector(".share-dialog", { timeout: 15_000 });
    const placed = await page.evaluate(() => ({
      dialog: Boolean(document.querySelector(".share-dialog")),
      inMessages: Boolean(document.querySelector(".messages .share-dialog, .messages .stream-tile")),
      sources: document.querySelectorAll(".share-source").length,
    }));
    await page.close();
    expect(placed.dialog).toBe(true);
    expect(placed.inMessages).toBe(false);
    expect(placed.sources).toBeGreaterThan(0);
  }, 60_000);

  it("drops a live tile into the call grid and a badge into the voice panel", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/?demo=1&share=live`);
    await page.waitForSelector("[data-call-grid] .stream-tile .live-badge", { timeout: 15_000 });
    const placed = await page.evaluate(() => ({
      tile: Boolean(document.querySelector("[data-call-grid] .stream-tile")),
      badge: document.querySelector("[data-call-grid] .live-badge")?.textContent ?? "",
      panel: Boolean(document.querySelector(".voice-panel .live-badge")),
      inMessages: Boolean(document.querySelector(".messages .stream-tile, .messages .live-badge, .messages .share-dialog")),
      pipHost: Boolean(document.querySelector("[data-call-pip]")),
      pipInChat: Boolean(document.querySelector(".messages [data-call-pip], .composer-wrap [data-call-pip]")),
      watch: Boolean([...document.querySelectorAll(".stream-tile-actions button")].some((button) => button.textContent === "Watch")),
    }));
    await page.close();
    expect(placed.tile).toBe(true);
    expect(placed.badge).toBe("LIVE");
    expect(placed.panel).toBe(true);
    expect(placed.inMessages).toBe(false);
    expect(placed.pipHost).toBe(true);
    expect(placed.pipInChat).toBe(false);
    expect(placed.watch).toBe(true);
  }, 60_000);
});