import type { ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listenDevServer } from "./dev-listen";

describe("compact channel open", () => {
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

  it("aligns compact rows, shows the image, and anchors older history", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.setItem("lark.config.v1", JSON.stringify({ appearance: { density: "compact", show_member_list: false } }));
      const start = performance.now();
      const mark = () => {
        const slot = window as unknown as { __larkFirstPaint?: number };
        if (slot.__larkFirstPaint || !document.querySelector(".message")) return false;
        slot.__larkFirstPaint = performance.now() - start;
        return true;
      };
      const watch = () => {
        if (mark()) return;
        requestAnimationFrame(watch);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(watch), { once: true });
      else requestAnimationFrame(watch);
    });
    await page.goto(`http://127.0.0.1:${port}/?demo=1`);
    await page.waitForSelector("#app[data-density='compact'] .compact-text", { timeout: 15_000 });
    const preview = page.locator(".image-preview").first();
    await preview.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector(".image-preview");
      return img instanceof HTMLImageElement && Boolean(img.getAttribute("src")) && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 15_000 });

    const layout = await page.evaluate(() => {
      const texts = [...document.querySelectorAll(".compact-line > .compact-text")].map((node) => node.getBoundingClientRect().left);
      const authors = [...document.querySelectorAll(".compact-line > .author")].map((node) => {
        const rect = node.getBoundingClientRect();
        const text = node.parentElement?.querySelector(".compact-text")?.getBoundingClientRect();
        return { name: node.textContent ?? "", top: rect.top, textTop: text?.top ?? rect.top };
      });
      const img = document.querySelector(".image-preview");
      const image = img instanceof HTMLImageElement
        ? { src: img.currentSrc || img.src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt, box: img.getBoundingClientRect().height }
        : null;
      const rows = document.querySelectorAll(".message-wrap").length;
      const firstPaint = (window as unknown as { __larkFirstPaint?: number }).__larkFirstPaint ?? null;
      return { texts, authors, image, rows, firstPaint };
    });

    expect(layout.rows).toBe(20);
    expect(layout.texts.length).toBeGreaterThan(5);
    expect(Math.max(...layout.texts) - Math.min(...layout.texts)).toBeLessThan(2);
    expect(layout.authors.length).toBeGreaterThan(3);
    for (const author of layout.authors) {
      expect(Math.abs(author.top - author.textTop)).toBeLessThan(3);
    }
    expect(layout.image?.alt).toBe("");
    expect(layout.image?.src).toContain("/media/frame.svg");
    expect(layout.image?.width).toBeGreaterThan(0);
    expect(layout.image?.box).toBeGreaterThan(40);

    await page.waitForTimeout(400);
    const anchored = await page.evaluate(() => {
      const scroller = document.querySelector(".messages");
      const first = scroller?.querySelector(".message-wrap");
      if (!(scroller instanceof HTMLElement) || !(first instanceof HTMLElement)) return null;
      const id = first.dataset.mid ?? "";
      const lineOf = (wrap: Element | null) => wrap?.querySelector(".message, .system-line") ?? wrap;
      scroller.scrollTop = 0;
      const beforeLine = lineOf(first);
      if (!(beforeLine instanceof HTMLElement)) return null;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const beforeTop = beforeLine.getBoundingClientRect().top - scrollerTop;
      scroller.dispatchEvent(new Event("scroll"));
      const again = scroller.querySelector(`[data-mid="${id}"]`);
      const afterLine = lineOf(again);
      if (!(again instanceof HTMLElement) || !(afterLine instanceof HTMLElement)) return null;
      const afterTop = afterLine.getBoundingClientRect().top - scrollerTop;
      return {
        rows: scroller.querySelectorAll(".message-wrap").length,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        beforeTop,
        afterTop,
        shift: afterTop - beforeTop,
      };
    });
    console.log(`[lark-layout] ${JSON.stringify(anchored)}`);
    expect(anchored).not.toBeNull();
    expect(anchored!.rows).toBeGreaterThan(20);
    expect(anchored!.scrollTop).toBeGreaterThan(20);
    expect(Math.abs(anchored!.shift)).toBeLessThan(8);

    const loaded = page.locator(".image-preview").first();
    await loaded.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector(".image-preview");
      return img instanceof HTMLImageElement && img.getAttribute("src")?.includes("/media/frame.svg") && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 15_000 });
    await page.close();
    expect(layout.firstPaint).not.toBeNull();
    console.log(`[lark-perf] demo first message paint ${layout.firstPaint}ms`);
  }, 60_000);
});
