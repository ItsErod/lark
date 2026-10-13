import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 47326;

describe("smarter notifications settings", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true } });
    await server.listen();
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/?demo`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("shows quiet hours, alerts, and an empty missed digest", async () => {
    expect(await page.getByRole("switch", { name: "Quiet hours" }).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "Start", exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "End", exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "Alert keywords" }).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "People", exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "Blocked" }).isVisible()).toBe(true);
    expect(await page.getByText("Nothing missed.").isVisible()).toBe(true);
  });

  it("saves the quiet window and alert list on this device", async () => {
    await page.getByRole("switch", { name: "Quiet hours" }).click();
    expect(await page.getByRole("switch", { name: "Quiet hours" }).getAttribute("aria-checked")).toBe("true");
    await page.getByRole("radio", { name: "Suppress" }).click();
    await page.getByRole("textbox", { name: "Alert keywords" }).fill("ship, a");
    await page.getByRole("textbox", { name: "Alert keywords" }).blur();
    await page.getByRole("textbox", { name: "People", exact: true }).fill("Maya Chen");
    await page.getByRole("textbox", { name: "People", exact: true }).blur();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lark.config.v1") ?? "{}"));
    expect(saved.notifications.quiet).toMatchObject({ enabled: true, start: "22:00", end: "07:00", mode: "suppress" });
    expect(saved.notifications.alert_keywords).toEqual(["ship"]);
    expect(saved.notifications.people).toEqual(["Maya Chen"]);
    expect(saved.notifications.blocked).toEqual([]);
  });
});
