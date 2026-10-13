import type { ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listenDevServer } from "./dev-listen.dev";

async function chromeBox(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, hidden: node.hidden };
    };
    const root = document.querySelector("#app");
    const messages = box(".messages");
    const composer = box(".composer-wrap");
    const split = box(".call-split");
    return {
      gameChrome: root instanceof HTMLElement ? root.dataset.gameChrome ?? "" : "",
      rail: box(".rail"),
      channels: box(".channels"),
      members: box(".members"),
      messages,
      composer,
      split,
      staticRings: document.querySelectorAll(".voice-roster .speak-ring.is-static").length,
      focus: Boolean(document.querySelector(".call-split.is-focus")),
    };
  });
}

describe("game mode chrome", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let port = 0;

  beforeAll(async () => {
    const dev = await listenDevServer();
    server = dev.server;
    port = dev.port;
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("keeps the usual columns until a call, then tucks them without covering chat", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.setItem("lark.config.v1", JSON.stringify({ desktop: { game_mode: true } }));
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1`);
    await page.waitForSelector(".message", { timeout: 15_000 });
    const idle = await chromeBox(page);
    expect(idle.gameChrome).toBe("off");
    expect(idle.members?.hidden).toBe(false);
    expect(idle.members?.width).toBeGreaterThan(100);
    expect(idle.messages?.hidden).toBe(false);
    expect(idle.composer?.hidden).toBe(false);

    await page.getByRole("button", { name: "Studio booth" }).click();
    await page.waitForSelector("#app[data-game-chrome='on'] .voice-roster .speak-ring.is-static", { timeout: 5_000 });
    const tucked = await chromeBox(page);
    expect(tucked.members?.hidden).toBe(true);
    expect(tucked.rail && idle.rail).toBeTruthy();
    expect(tucked.rail!.width).toBeGreaterThan(0);
    expect(tucked.rail!.width).toBeLessThan(idle.rail!.width);
    expect(tucked.channels!.width).toBeGreaterThan(120);
    expect(tucked.channels!.width).toBeLessThan(idle.channels!.width);
    expect(tucked.messages!.width).toBeGreaterThan(idle.messages!.width + 40);
    expect(tucked.messages!.height).toBeGreaterThan(200);
    expect(tucked.composer?.hidden).toBe(false);
    expect(tucked.staticRings).toBeGreaterThan(0);
    const mute = page.locator(".voice-panel").getByRole("button", { name: "Mute" });
    const muteBox = await mute.boundingBox();
    expect(muteBox?.width).toBeGreaterThan(20);
    expect(muteBox!.y).toBeGreaterThan(0);
    expect(muteBox!.y + muteBox!.height).toBeLessThanOrEqual(800);

    await page.getByRole("button", { name: "Show call strip" }).click();
    await page.getByRole("button", { name: /Open call view/ }).click();
    await page.waitForSelector(".call-split.is-focus", { timeout: 5_000 });
    const focus = await chromeBox(page);
    expect(focus.focus).toBe(true);
    expect(focus.split?.hidden).toBe(false);
    expect(focus.split!.height).toBeGreaterThan(160);
    expect(focus.split!.height).toBeLessThan(320);
    expect(focus.messages!.height).toBeGreaterThan(120);
    expect(focus.split!.bottom).toBeLessThanOrEqual(focus.messages!.top + 8);
    expect(focus.composer?.hidden).toBe(false);

    await page.locator(".voice-panel").getByRole("button", { name: "Disconnect" }).click();
    await page.waitForSelector("#app[data-game-chrome='off']", { timeout: 5_000 });
    const restored = await chromeBox(page);
    expect(restored.members?.hidden).toBe(false);
    expect(restored.members!.width).toBeGreaterThan(100);
    expect(restored.composer?.hidden).toBe(false);
    await page.close();
  }, 60_000);

  it("leaves the columns alone in a call when Game Mode is off", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.removeItem("lark.config.v1");
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1`);
    await page.waitForSelector(".message", { timeout: 15_000 });
    const before = await chromeBox(page);
    await page.getByRole("button", { name: "Studio booth" }).click();
    await page.waitForSelector(".voice-signal.is-3", { timeout: 5_000 });
    const joined = await chromeBox(page);
    expect(joined.gameChrome).toBe("off");
    expect(joined.members?.hidden).toBe(false);
    expect(Math.abs(joined.messages!.width - before.messages!.width)).toBeLessThan(8);
    expect(joined.composer?.hidden).toBe(false);
    await page.close();
  }, 60_000);
});
