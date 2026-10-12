import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { describe, expect, it } from "vitest";
import { summarize, type PerfSample } from "./score";

const port = 47331;
const runs = 5;

interface Marks {
  ready: number;
  lastSwitch: number;
  lastInput: number;
  lastLoad: number;
  switchAt: number;
}

describe("lark perf harness", () => {
  it("measures cold start, channel switch, history, scroll, input, memory, and cpu", async () => {
    await build({ logLevel: "warn" });
    const server = await preview({
      preview: { host: "127.0.0.1", port, strictPort: true },
      server: { host: "127.0.0.1", port, strictPort: true },
    });
    const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const samples: PerfSample[] = [];
    try {
      for (let index = 0; index < runs; index += 1) samples.push(await measure(browser, server));
    } finally {
      await browser.close();
      await server.close();
    }
    const summary = summarize(samples);
    const bundle = bundleBytes(path.resolve("dist/assets"));
    const report = { summary, samples, bundle };
    console.log(`LARK_PERF ${JSON.stringify(report)}`);
    expect(summary.coldStartMs).toBeGreaterThan(0);
    expect(summary.scrollFps).toBeGreaterThan(0);
    expect(summary.channelSwitchMs).toBeGreaterThanOrEqual(0);
    expect(bundle.js).toBeGreaterThan(0);
  }, 180_000);
});

async function measure(browser: Browser, server: PreviewServer): Promise<PerfSample> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Performance.enable");
  const origin = localOrigin(server);
  await page.goto(`${origin}/?demo=1&bench=1`, { waitUntil: "commit" });
  await page.waitForFunction(interactive, undefined, { timeout: 20_000 });
  const coldStartMs = await page.evaluate(() => performance.now());
  const landingLoad = await page.evaluate(() => {
    const perf = (window as unknown as { __lark?: Marks }).__lark;
    return perf?.lastLoad ?? 0;
  });
  const channel = await page.evaluate(switchToWelcome);
  const scrollFps = await page.evaluate(scrollForASecond);
  const inputLatencyMs = await page.evaluate(typeOnce);
  await session.send("Performance.getMetrics");
  const before = await session.send("Performance.getMetrics");
  await page.waitForTimeout(1000);
  const after = await session.send("Performance.getMetrics");
  await context.close();
  const task = metric(after, "TaskDuration") - metric(before, "TaskDuration");
  return {
    coldStartMs,
    channelSwitchMs: channel.switchMs,
    messageLoadMs: landingLoad > 0 ? landingLoad : channel.loadMs,
    scrollFps,
    inputLatencyMs,
    idleMemoryMb: metric(after, "JSHeapUsedSize") / (1024 * 1024),
    idleCpuPct: Math.max(0, task * 100),
  };
}

function switchToWelcome(): { switchMs: number; loadMs: number } {
  const row = document.querySelector('[data-channel="100000000000000021"]');
  if (!(row instanceof HTMLElement)) return { switchMs: 0, loadMs: 0 };
  const start = performance.now();
  row.click();
  const perf = (window as unknown as { __lark?: Marks }).__lark;
  const text = document.querySelector(".message")?.textContent ?? "";
  const shown = text.includes("bench 100000000000000021");
  return {
    switchMs: shown ? performance.now() - start : 0,
    loadMs: perf?.lastLoad ?? 0,
  };
}

function interactive(): boolean {
  const shell = document.querySelector(".shell");
  const splash = document.querySelector(".startup");
  const composer = document.querySelector(".composer textarea");
  const message = document.querySelector(".message");
  if (!(shell instanceof HTMLElement) || shell.hidden) return false;
  if (splash instanceof HTMLElement && !splash.hidden) return false;
  if (!(composer instanceof HTMLTextAreaElement) || composer.disabled) return false;
  if (!(message instanceof HTMLElement)) return false;
  const box = message.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function scrollForASecond(): Promise<number> {
  const scroller = document.querySelector(".messages");
  if (!(scroller instanceof HTMLElement)) return Promise.resolve(0);
  return new Promise((resolve) => {
    const start = performance.now();
    let frames = 0;
    const height = Math.max(1, scroller.scrollHeight);
    const step = (now: number) => {
      frames += 1;
      const span = now - start;
      scroller.scrollTop = (span * 1.4) % height;
      if (span < 1000) requestAnimationFrame(step);
      else resolve(Math.round((frames * 1000) / Math.max(1, now - start)));
    };
    requestAnimationFrame(step);
  });
}

function typeOnce(): number {
  const field = document.querySelector(".composer textarea");
  if (!(field instanceof HTMLTextAreaElement)) return 0;
  field.focus();
  const start = performance.now();
  field.value = `${field.value}a`;
  field.dispatchEvent(new InputEvent("input", { bubbles: true, data: "a", inputType: "insertText" }));
  return performance.now() - start;
}

function metric(payload: { metrics: { name: string; value: number }[] }, name: string): number {
  return payload.metrics.find((item) => item.name === name)?.value ?? 0;
}

function localOrigin(server: PreviewServer): string {
  const urls = server.resolvedUrls?.local ?? [];
  if (urls[0]) return urls[0].replace(/\/$/, "");
  return `http://127.0.0.1:${port}`;
}

function bundleBytes(dir: string): { js: number; css: number } {
  let js = 0;
  let css = 0;
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (!statSync(file).isFile()) continue;
    const size = statSync(file).size;
    if (name.endsWith(".js")) js += size;
    if (name.endsWith(".css")) css += size;
  }
  return { js, css };
}
