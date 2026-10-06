/**
 * Latency and memory sample for the demo shell.
 * Requires `npm run dev` on http://127.0.0.1:47321 and puppeteer-core.
 *
 *   node scripts/perf.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

function loadPuppeteer() {
  const roots = [import.meta.url, "/tmp/pup/package.json"];
  for (const root of roots) {
    try {
      return createRequire(root)("puppeteer-core");
    } catch {
      /* try the next place puppeteer-core might be installed */
    }
  }
  throw new Error("Install puppeteer-core (npm install puppeteer-core) so this script can drive Chrome.");
}

const puppeteer = loadPuppeteer();

const URL = process.env.LARK_URL ?? "http://127.0.0.1:47321/?demo=1";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";

function pidsUnder(root) {
  const all = new Set([root]);
  const children = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try {
      stat = readFileSync(`/proc/${name}/stat`, "utf8");
    } catch {
      continue;
    }
    const ppid = Number(stat.split(" ")[3]);
    const list = children.get(ppid) ?? [];
    list.push(Number(name));
    children.set(ppid, list);
  }
  const stack = [root];
  while (stack.length) {
    const pid = stack.pop();
    for (const child of children.get(pid) ?? []) {
      if (!all.has(child)) {
        all.add(child);
        stack.push(child);
      }
    }
  }
  return [...all];
}

function rssKb(pids) {
  let total = 0;
  for (const pid of pids) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const match = status.match(/^VmRSS:\s+(\d+)/m);
      if (match) total += Number(match[1]);
    } catch {
      /* process exited */
    }
  }
  return total;
}

function cpuTicks(pids) {
  let ticks = 0;
  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const parts = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(parts[11]) + Number(parts[12]);
    } catch {
      /* process exited */
    }
  }
  return ticks;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const nav = performance.now();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__lark && window.__lark.ready > 0, { timeout: 15000 });
const startup = await page.evaluate(() => ({
  ready: window.__lark.ready,
  title: document.querySelector(".chat-head h2")?.textContent ?? "",
}));

const channel = await page.evaluate(async () => {
  const row = (name) => [...document.querySelectorAll(".channel-row")].find((item) => item.querySelector("span")?.textContent === name);
  const general = row("general");
  const crit = row("design-crit");
  if (!general || !crit) return { error: "channels missing" };
  const jump = async (button) => {
    const start = performance.now();
    button.click();
    const deadline = start + 1000;
    while (performance.now() < deadline) {
      const title = document.querySelector(".chat-head h2")?.textContent ?? "";
      const messages = document.querySelectorAll(".message").length;
      if (window.__lark.lastSwitch >= 0 && messages > 0) {
        return { ms: Math.round((performance.now() - start) * 10) / 10, mark: Math.round(window.__lark.lastSwitch * 10) / 10, title, messages };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { ms: Math.round((performance.now() - start) * 10) / 10, mark: window.__lark.lastSwitch, title: document.querySelector(".chat-head h2")?.textContent ?? "", messages: document.querySelectorAll(".message").length };
  };
  const first = await jump(general);
  const back = await jump(crit);
  const cached = await jump(general);
  const cachedBack = await jump(crit);
  return { first, back, cached, cachedBack };
});

const input = await page.evaluate(() => {
  const box = document.querySelector('textarea[aria-label="Message"]');
  const count = document.querySelector(".count");
  if (!box || !count) return { error: "composer missing" };
  box.focus();
  box.value = "";
  const samples = [];
  for (const word of ["h", "he", "hel", "hell", "hello"]) {
    const start = performance.now();
    box.value = word;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    samples.push(performance.now() - start);
  }
  return { samples, counter: count.textContent, worst: Math.max(...samples) };
});

const scroll = await page.evaluate(() => new Promise((resolve) => {
  const list = document.querySelector(".messages");
  if (!list) {
    resolve({ error: "messages missing" });
    return;
  }
  const crit = [...document.querySelectorAll(".channel-row")].find((item) => item.querySelector("span")?.textContent === "design-crit");
  crit?.click();
  const arm = performance.now() + 80;
  const waitReady = () => {
    if (performance.now() < arm || document.querySelectorAll(".message").length < 4) {
      requestAnimationFrame(waitReady);
      return;
    }
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    const start = last;
    const step = (now) => {
      frames += 1;
      worst = Math.max(worst, now - last);
      last = now;
      const span = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = span * (0.5 + 0.5 * Math.sin(frames / 3));
      list.dispatchEvent(new Event("scroll"));
      if (now - start < 500) requestAnimationFrame(step);
      else {
        const fps = frames / ((now - start) / 1000);
        resolve({
          frames,
          fps: Math.round(fps),
          worst: Math.round(worst * 10) / 10,
          elapsed: Math.round(now - start),
          domMessages: list.querySelectorAll(".message").length,
        });
      }
    };
    requestAnimationFrame(step);
  };
  requestAnimationFrame(waitReady);
}));

function classify(pid) {
  try {
    const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
    if (cmd.includes("--type=renderer")) return "renderer";
    if (cmd.includes("--type=gpu")) return "gpu";
    if (cmd.includes("--type=")) return "other";
    return "browser";
  } catch {
    return "other";
  }
}

const root = browser.process()?.pid;
const tree = root ? pidsUnder(root) : [];
const byKind = {};
for (const pid of tree) {
  const kind = classify(pid);
  byKind[kind] = (byKind[kind] ?? 0) + rssKb([pid]);
}
const beforeTicks = cpuTicks(tree);
const beforeRss = rssKb(tree);
await new Promise((resolve) => setTimeout(resolve, 1000));
const afterTicks = cpuTicks(pidsUnder(root));
const rss = rssKb(pidsUnder(root));
const hertz = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim() || 100);
const cpu = ((afterTicks - beforeTicks) / hertz) * 100;

const heap = await page.evaluate(() => {
  const memory = performance.memory;
  return memory ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize } : null;
});

const report = {
  url: URL,
  host: "linux-chrome",
  navigationMs: Math.round(performance.now() - nav),
  startupMs: Math.round(startup.ready),
  startupTitle: startup.title,
  channel,
  input,
  scroll,
  rssKb: rss,
  rssBeforeKb: beforeRss,
  rssByKindKb: byKind,
  idleCpuPercent: Math.round(cpu * 10) / 10,
  jsHeap: heap,
  processes: tree.length,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
