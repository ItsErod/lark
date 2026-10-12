import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 47326;

describe("startup shell and crash screen", () => {
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

  async function open(path: string): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}${path}`);
    return page;
  }

  it("shows the channel after the splash instead of a blank window", async () => {
    const page = await open("/?splash=1");
    await page.waitForFunction(() => {
      const shell = document.querySelector(".shell");
      const splash = document.querySelector(".startup");
      const message = document.querySelector(".message");
      if (!(shell instanceof HTMLElement) || !(splash instanceof HTMLElement) || !(message instanceof HTMLElement)) return false;
      if (shell.hidden || !splash.hidden) return false;
      const box = message.getBoundingClientRect();
      return box.height > 0 && box.width > 0;
    }, undefined, { timeout: 15_000 });
    const visible = await page.evaluate(() => {
      const shell = document.querySelector(".shell");
      const splash = document.querySelector(".startup");
      return {
        shellHidden: shell instanceof HTMLElement ? shell.hidden : true,
        splashHidden: splash instanceof HTMLElement ? splash.hidden : false,
        messages: document.querySelectorAll(".message-wrap").length,
      };
    });
    expect(visible.shellHidden).toBe(false);
    expect(visible.splashHidden).toBe(true);
    expect(visible.messages).toBeGreaterThan(0);
    await page.close();
  }, 20_000);

  it("shows a reloadable error when rendering throws", async () => {
    const page = await open("/?demo=1");
    await page.waitForSelector(".message", { timeout: 8_000 });
    await page.evaluate(() => {
      window.setTimeout(() => {
        throw new Error("first render failed");
      }, 0);
    });
    await page.waitForSelector(".crash textarea", { timeout: 4_000 });
    const crash = await page.evaluate(() => {
      const box = document.querySelector(".crash textarea");
      const reload = [...document.querySelectorAll(".crash button")].find((node) => node.textContent === "Reload");
      const copy = [...document.querySelectorAll(".crash button")].find((node) => node.textContent === "Copy error" || node.textContent === "Copied");
      return {
        text: box instanceof HTMLTextAreaElement ? box.value : "",
        reload: reload instanceof HTMLButtonElement,
        copy: copy instanceof HTMLButtonElement,
      };
    });
    expect(crash.text).toContain("first render failed");
    expect(crash.text).toContain("window.onerror");
    expect(crash.reload).toBe(true);
    expect(crash.copy).toBe(true);
    await page.click(".crash button.ghost");
    await page.waitForFunction(() => document.querySelector(".crash button.ghost")?.textContent === "Copied");
    const copied = await page.evaluate(() => {
      const box = document.querySelector(".crash textarea");
      const copy = document.querySelector(".crash button.ghost");
      return {
        label: copy?.textContent ?? "",
        selected: box instanceof HTMLTextAreaElement && box.selectionEnd > box.selectionStart,
        value: box instanceof HTMLTextAreaElement ? box.value : "",
      };
    });
    expect(copied.label).toBe("Copied");
    expect(copied.selected).toBe(true);
    expect(copied.value).toContain("first render failed");
    await page.close();
  });

  it("shows the same screen for an unhandled rejection", async () => {
    const page = await open("/?demo=1");
    await page.waitForSelector(".message", { timeout: 8_000 });
    await page.evaluate(() => {
      window.setTimeout(() => {
        void Promise.reject(new Error("startup promise failed"));
      }, 0);
    });
    await page.waitForSelector(".crash textarea", { timeout: 4_000 });
    const text = await page.locator(".crash textarea").inputValue();
    const reload = await page.locator(".crash button.primary").textContent();
    expect(text).toContain("unhandledrejection");
    expect(text).toContain("startup promise failed");
    expect(reload).toBe("Reload");
    await page.close();
  });
});
