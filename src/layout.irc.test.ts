import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 47322;

describe("irc message layout", () => {
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

  it("gives IRC message text the full column instead of the avatar track", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.setItem("lark.config.v1", JSON.stringify({ appearance: { density: "irc" } }));
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1`);
    await page.waitForSelector(".message.is-irc .compact-text", { timeout: 15_000 });
    const box = await page.evaluate(() => {
      const scroller = document.querySelector(".messages");
      const body = document.querySelector(".message.is-irc .message-body");
      const text = document.querySelector(".message.is-irc .compact-text");
      const paragraph = document.querySelector(".message.is-irc .paragraph");
      const rect = (node: Element | null) => {
        const item = node?.getBoundingClientRect();
        return { width: item?.width ?? 0, height: item?.height ?? 0 };
      };
      return {
        column: scroller?.clientWidth ?? 0,
        body: rect(body),
        text: rect(text),
        paragraph: rect(paragraph),
      };
    });
    await page.close();
    expect(box.column).toBeGreaterThan(500);
    expect(box.body.width).toBeGreaterThan(box.column * 0.8);
    expect(box.text.width).toBeGreaterThan(box.column * 0.5);
    expect(box.paragraph.width).toBeGreaterThan(200);
    expect(box.paragraph.height).toBeGreaterThan(0);
    expect(box.paragraph.height).toBeLessThan(80);
  }, 60_000);
});
