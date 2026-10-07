import { describe, expect, it } from "vitest";
import { addReminder, cancelReminder, reminderFor, reminderPresets, sanitizeReminders, takeDueReminders } from "./reminders";

const now = Date.parse("2026-10-07T15:00:00.000Z");

describe("reminders", () => {
  it("keeps one future reminder per message and releases every one that is due", () => {
    const first = addReminder([], {
      messageId: "100000000000000230",
      channelId: "100000000000000023",
      authorName: "Priya",
      excerpt: "Crit is at four",
      remindAt: now + 15 * 60_000,
    }, now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = addReminder(first.list, {
      messageId: "100000000000000230",
      channelId: "100000000000000023",
      authorName: "Priya",
      excerpt: "Crit is at four",
      remindAt: now + 60 * 60_000,
    }, now);
    expect(again.ok).toBe(false);
    const early = addReminder(first.list, {
      messageId: "100000000000000231",
      channelId: "100000000000000023",
      authorName: "Maya",
      excerpt: "soon",
      remindAt: now + 1000,
    }, now);
    expect(early.ok).toBe(false);
    const second = addReminder(first.list, {
      messageId: "100000000000000231",
      channelId: "100000000000000023",
      authorName: "Maya",
      excerpt: "frames   are up",
      remindAt: now + 5 * 60_000,
    }, now);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.list[0].excerpt).toBe("frames are up");
    expect(reminderFor(second.list, "100000000000000023", "100000000000000231")?.authorName).toBe("Maya");
    const due = takeDueReminders(second.list, now + 16 * 60_000);
    expect(due.due.map((item) => item.excerpt)).toEqual(["frames are up", "Crit is at four"]);
    expect(due.pending).toEqual([]);
    expect(cancelReminder(second.list, second.list[0].id)).toHaveLength(1);
  });

  it("offers presets from now and drops broken stored reminders", () => {
    const presets = reminderPresets(now);
    expect(presets[0]).toEqual({ label: "15 minutes", at: now + 15 * 60_000 });
    expect(presets[3].at).toBeGreaterThan(now);
    const clean = sanitizeReminders([
      {
        id: "r1",
        messageId: "100000000000000230",
        channelId: "100000000000000023",
        authorName: "Priya",
        excerpt: "  hello   there  ",
        remindAt: now,
      },
      { id: "bad", messageId: "nope", channelId: "100000000000000023", remindAt: now },
    ]);
    expect(clean).toEqual([{
      id: "r1",
      messageId: "100000000000000230",
      channelId: "100000000000000023",
      authorName: "Priya",
      excerpt: "hello there",
      remindAt: now,
    }]);
  });
});
