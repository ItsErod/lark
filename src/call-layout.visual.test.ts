import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 47323;

async function metrics(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, hidden: node.hidden };
    };
    const chat = document.querySelector(".chat");
    return {
      header: document.querySelector(".chat-head h2")?.textContent ?? "",
      call: chat instanceof HTMLElement ? chat.dataset.call ?? "" : "",
      stripFlag: chat instanceof HTMLElement ? chat.dataset.strip ?? "" : "",
      messages: box(".messages"),
      composer: box(".composer-wrap"),
      strip: box(".call-strip"),
      split: box(".call-split"),
      pip: box(".call-pip"),
      panel: document.querySelector(".voice-panel")?.textContent ?? "",
      speaking: document.querySelectorAll(".voice-roster .voice-user.is-speaking").length,
      sliders: document.querySelectorAll(".chat input[type=range]").length,
      chatText: document.querySelector(".chat")?.textContent ?? "",
      pipKind: document.querySelector(".call-pip .voice-tile")?.className ?? "",
    };
  });
}

describe("call layout", () => {
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

  it("keeps the text channel, then opens the strip, the grid, and picture-in-picture", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.removeItem("lark.call.strip");
      localStorage.removeItem("lark.call.pip");
      localStorage.removeItem("lark.call.split");
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1`);
    await page.waitForSelector(".message", { timeout: 15_000 });
    const before = await metrics(page);
    await page.getByRole("button", { name: "Studio booth" }).click();
    await page.waitForSelector(".voice-signal.is-3", { timeout: 5_000 });
    const collapsed = await metrics(page);

    expect(collapsed.header).toBe("# design-crit");
    expect(before.header).toBe(collapsed.header);
    expect(collapsed.call).toBe("chat");
    expect(collapsed.stripFlag).toBe("closed");
    expect(collapsed.strip?.hidden).toBe(true);
    expect(collapsed.strip?.height).toBe(0);
    expect(collapsed.split?.hidden).toBe(true);
    expect(collapsed.messages && before.messages).toBeTruthy();
    expect(Math.abs((collapsed.messages?.width ?? 0) - (before.messages?.width ?? 0))).toBeLessThan(8);
    expect(Math.abs((collapsed.messages?.height ?? 0) - (before.messages?.height ?? 0))).toBeLessThan(8);
    expect(collapsed.composer?.hidden).toBe(false);
    expect(collapsed.panel).toContain("Studio booth");
    expect(collapsed.panel).not.toContain("Voice Connected");
    expect(collapsed.panel).not.toContain("Connecting");
    expect(collapsed.speaking).toBeGreaterThan(0);
    expect(collapsed.sliders).toBe(0);
    expect(collapsed.chatText).not.toContain("Voice Connected");
    expect(collapsed.chatText).not.toContain("Connecting");

    await page.getByRole("button", { name: "Show call strip" }).click();
    await page.waitForSelector(".call-strip-person", { timeout: 5_000 });
    const expanded = await metrics(page);
    expect(expanded.header).toBe("# design-crit");
    expect(expanded.stripFlag).toBe("open");
    expect(expanded.strip?.hidden).toBe(false);
    expect(expanded.strip?.height).toBeGreaterThan(0);
    expect(expanded.strip?.height).toBeLessThan(56);
    expect(expanded.split?.hidden).toBe(true);
    expect((expanded.messages?.height ?? 0)).toBeGreaterThan(200);
    expect(expanded.chatText).not.toContain("Voice Connected");

    await page.getByRole("button", { name: /Open call view/ }).click();
    await page.waitForSelector(".call-split .voice-tile", { timeout: 5_000 });
    const grid = await metrics(page);
    expect(grid.header).toBe("# design-crit");
    expect(grid.call).toBe("split");
    expect(grid.split?.hidden).toBe(false);
    expect(grid.split?.height).toBeGreaterThan(120);
    expect(grid.messages?.height).toBeGreaterThan(120);
    expect(grid.composer?.hidden).toBe(false);
    expect(grid.pip?.hidden).toBe(true);
    expect(grid.sliders).toBe(0);

    await page.locator(".call-split").getByRole("button", { name: "Turn on camera" }).click();
    await page.keyboard.press("Escape");
    await page.locator(".call-strip-hide").click();
    await page.waitForSelector(".call-pip .voice-tile.is-video", { timeout: 5_000 });
    const pip = await metrics(page);
    expect(pip.header).toBe("# design-crit");
    expect(pip.call).toBe("chat");
    expect(pip.split?.hidden).toBe(true);
    expect(pip.pip?.hidden).toBe(false);
    expect(pip.pipKind).toContain("is-video");
    expect(pip.pip && pip.composer).toBeTruthy();
    expect((pip.pip?.bottom ?? 0)).toBeLessThanOrEqual((pip.composer?.top ?? 0) + 1);
    expect((pip.messages?.height ?? 0)).toBeGreaterThan(200);
    expect(pip.composer?.hidden).toBe(false);
    expect(pip.sliders).toBe(0);
    expect(pip.chatText).not.toContain("Voice Connected");
    await page.close();
  }, 60_000);
});