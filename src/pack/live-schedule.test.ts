import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { dropDue, presetLead, queueDraft } from "./live-schedule";
import { takeDue } from "./schedule";

describe("message scheduler", () => {
  it("queues only a message the user wrote, and only while the queue is still in memory", () => {
    const now = 1_000_000;
    const empty = queueDraft([], { channelId: "c", content: "   ", sendAt: now + 60_000 }, now);
    expect(empty.ok).toBe(false);
    const queued = queueDraft([], { channelId: "c", content: "see you at the booth", sendAt: now + presetLead(15) }, now);
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(takeDue(queued.list, now + 16 * 60_000).due?.content).toBe("see you at the booth");
    expect(dropDue(queued.list, now + 16 * 60_000)).toEqual([]);
    expect(dropDue(queued.list, now)).toEqual(queued.list);
    expect("liveQueue" in sanitizePack({ liveQueue: queued.list })).toBe(false);
  });

  it("declares the live schedule hook", () => {
    const plugin = describePlugin(readFileSync("plugins/message-scheduler.js", "utf8"), "message-scheduler");
    expect(plugin.hooks.liveSchedule).toBe(true);
    expect(plugin.name).toBe("Message scheduler");
  });
});
