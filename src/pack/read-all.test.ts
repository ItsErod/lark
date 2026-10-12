import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { queueAcks, readAllIds, takeAck, type ReadTarget } from "./read-all";

const targets: ReadTarget[] = [
  { id: "c1", kind: "text", direct: false, muted: false, pending: 2 },
  { id: "c2", kind: "text", direct: false, muted: true, pending: 1 },
  { id: "voice", kind: "voice", direct: false, muted: false, pending: 4 },
  { id: "cat", kind: "category", direct: false, muted: false, pending: 1 },
  { id: "dm", kind: "dm", direct: true, muted: false, pending: 1 },
  { id: "quiet", kind: "announcement", direct: false, muted: false, pending: 0 },
  { id: "thread", kind: "thread", direct: false, muted: false, pending: 3 },
];

describe("read all", () => {
  it("marks unread text across servers, skips voice, and honours mute and DM options", () => {
    expect(readAllIds(targets, { includeMuted: false, includeDms: true })).toEqual(["c1", "dm", "thread"]);
    expect(readAllIds(targets, { includeMuted: true, includeDms: false })).toEqual(["c1", "c2", "thread"]);
  });

  it("queues one Discord ack at a time and skips local ids", () => {
    const queued = queueAcks([], [
      { channelId: "c1", messageId: "m1" },
      { channelId: "c1", messageId: "m2" },
      { channelId: "c2", messageId: "local-1" },
    ]);
    expect(queued).toEqual([{ channelId: "c1", messageId: "m1" }]);
    const step = takeAck(queued);
    expect(step.next?.channelId).toBe("c1");
    expect(takeAck(step.rest).next).toBeNull();
  });

  it("declares the read-all hook", () => {
    const plugin = describePlugin(readFileSync("store/plugins/read-all/plugin.js", "utf8"), "read-all");
    expect(plugin.hooks.readAll).toBe(true);
    expect(plugin.name).toBe("Read all");
  });
});
