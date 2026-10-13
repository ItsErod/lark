import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildViewMessage } from "./render/message";
import type { RenderContext } from "./render/content";
import { HISTORY_PAGE, AFTER_MESSAGE_PAINT, droppedMessageIds, historyPath, initialHistory, reconcileHistory } from "./history";
import { anchoredScrollTop } from "./scroll";
import { spanWindow } from "./virtual";

function snowflake(n: number): string {
  return String(1_000_000_000_000_000_000n + BigInt(n));
}

function row(n: number, nonce?: string) {
  return { id: snowflake(n), nonce: nonce ?? null };
}

describe("channel history", () => {
  it("asks for the newest 20, then older pages with before set to the oldest id", () => {
    expect(HISTORY_PAGE).toBe(20);
    expect(historyPath("42")).toBe("/channels/42/messages?limit=20");
    expect(historyPath("42", snowflake(3))).toBe(`/channels/42/messages?limit=20&before=${snowflake(3)}`);
    expect(AFTER_MESSAGE_PAINT).toEqual(["images", "embeds", "members", "threads", "prefetch"]);
  });

  it("paints at most one page from cache and reconciles it with the fetch", () => {
    const cached = Array.from({ length: 80 }, (_, index) => row(index));
    const visible = initialHistory(cached);
    expect(visible).toHaveLength(20);
    expect(visible[0].id).toBe(snowflake(60));
    expect(visible.at(-1)?.id).toBe(snowflake(79));

    const fresh = Array.from({ length: 20 }, (_, index) => row(70 + index));
    const merged = reconcileHistory(visible, fresh);
    expect(merged.map((item) => item.id)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => snowflake(60 + index)),
      ...fresh.map((item) => item.id),
    ]);

    const stale = [row(1), row(2)];
    expect(reconcileHistory(stale, fresh).map((item) => item.id)).toEqual(fresh.map((item) => item.id));

    const pending = { id: "local-abc", nonce: "local-abc" };
    const echoed = { ...row(90), nonce: "local-abc" };
    expect(reconcileHistory([pending], [echoed]).map((item) => item.id)).toEqual([echoed.id]);
    expect(reconcileHistory([{ id: "local-new", nonce: "local-new" }], fresh).at(-1)?.id).toBe("local-new");
  });

  it("names the ids dropped when a channel is shrunk to its newest page", () => {
    const cached = Array.from({ length: 80 }, (_, index) => row(index));
    const visible = initialHistory(cached, 20);
    expect(droppedMessageIds(cached, visible)).toEqual(cached.slice(0, 60).map((item) => item.id));
    expect(droppedMessageIds(visible, visible)).toEqual([]);
  });

  it("keeps the viewport when a page of older messages is prepended", () => {
    const next = anchoredScrollTop({
      intent: "preserve",
      prevTop: 12,
      prevHeight: 900,
      nextHeight: 900 + 20 * 36,
      clientHeight: 640,
      nearBottom: false,
    });
    expect(next).toBe(12 + 20 * 36);
  });

  it("does not walk an unmeasured backlog to find the first window", () => {
    const span = spanWindow(400, undefined, 0, 640, 36, 4, true);
    expect(span.end).toBe(400);
    expect(span.end - span.start).toBeLessThan(40);
    expect(span.total).toBe(400 * 36);
  });

  it("parses the newest page instead of the whole channel before first paint", () => {
    const ctx: RenderContext = { users: { "1": "Erod" }, roles: {}, channels: { "9": "main" }, meId: "1" };
    const all = Array.from({ length: 400 }, (_, index) => ({
      id: snowflake(index),
      channelId: "9",
      authorId: "1",
      authorName: "Erod",
      content: `update ${index} **ready** in <#9> see https://example.com/${index}`,
      timestamp: new Date(Date.now() - (400 - index) * 1000).toISOString(),
      attachments: index % 9 === 0
        ? [{
          id: `a${index}`,
          name: "image.png",
          url: "https://cdn.discordapp.com/attachments/9/1/image.png",
          proxyUrl: "https://media.discordapp.net/attachments/9/1/image.png?ex=aa&is=bb&hm=cc",
          contentType: "image/png",
          width: 800,
          height: 480,
        }]
        : [],
    }));
    const time = (count: number) => {
      const list = count === all.length ? all : initialHistory(all, count);
      const started = performance.now();
      for (const message of list) buildViewMessage(message, ctx, []);
      return performance.now() - started;
    };
    time(20);
    const before = time(400);
    const after = time(20);
    const report = {
      beforeMs: Number(before.toFixed(2)),
      afterMs: Number(after.toFixed(2)),
      beforeMessages: 400,
      afterMessages: HISTORY_PAGE,
    };
    writeFileSync("/tmp/lark-perf.json", JSON.stringify(report));
    console.log(`[lark-perf] first paint parse before ${report.beforeMs}ms for 400 messages, after ${report.afterMs}ms for ${HISTORY_PAGE}`);
    expect(after).toBeLessThan(before / 4);
    expect(initialHistory(all)).toHaveLength(HISTORY_PAGE);
  });

  it("paints messages before the history fetch, and defers members and prefetch", () => {
    const source = readFileSync("src/ui/app.ts", "utf8");
    const open = source.slice(source.indexOf("private async openChannel"), source.indexOf("private finishChannelChrome"));
    const paintAt = open.indexOf("this.paintMessages()");
    const awaitAt = open.indexOf("await this.reconcileChannel");
    expect(paintAt).toBeGreaterThan(0);
    expect(awaitAt).toBeGreaterThan(paintAt);
    expect(open).not.toContain("await delay");
    expect(open).not.toContain("this.paintMembers()");
    expect(open).not.toContain("this.prefetchAround");
    expect(open).not.toContain("this.loadThreads");
    expect(open).toContain("initialHistory");
    const chrome = source.slice(source.indexOf("private finishChannelChrome"), source.indexOf("private async reconcileChannel"));
    expect(chrome.indexOf("this.paintMembers()")).toBeGreaterThan(0);
    expect(chrome).toContain("this.prefetchAround");
    expect(chrome).toContain("this.loadThreads");
    expect(source).toContain("batch.length >= HISTORY_PAGE");
    expect(source).not.toContain("batch.length >= 50");
    const rest = readFileSync("crates/lark-core/src/discord/rest.rs", "utf8");
    expect(rest).toContain("/channels/{channel_id}/messages?limit=20");
    expect(rest).not.toContain("messages?limit=50");
  });
});
