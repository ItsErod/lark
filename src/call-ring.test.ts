import { describe, expect, it } from "vitest";
import {
  applyCall,
  callerName,
  createRingtone,
  incomingNotice,
  ringAudible,
  ringInBackground,
  ringTargets,
  type RingState,
} from "./call-ring";

const self = "100000000000000001";
const channel = "100000000000000041";

describe("incoming call", () => {
  it("names the other person, not you", () => {
    expect(callerName(self, [
      { id: self, name: "Ethan" },
      { id: "100000000000000002", name: "Maya" },
    ])).toBe("Maya");
    expect(callerName(self, [
      { id: "100000000000000002", name: "Maya" },
      { id: "100000000000000003", name: "Jonah" },
    ])).toBe("Maya and 1 more");
    expect(callerName(self, [])).toBe("Someone");
  });

  it("rings everyone except the caller", () => {
    expect(ringTargets(self, [self, "100000000000000002", "nope", "100000000000000002", "100000000000000003"])).toEqual([
      "100000000000000002",
      "100000000000000003",
    ]);
  });

  it("shows a ring only while this user is in the ringing list", () => {
    const wire = { channelId: channel, ringing: [self], ended: false, video: false };
    const next = applyCall(null, wire, self, "Maya", false);
    expect(next).toEqual({ channelId: channel, callerName: "Maya", video: false });
    expect(applyCall(next, { ...wire, video: true }, self, "Maya", false)?.video).toBe(true);
    expect(applyCall(next, wire, self, "Maya", true)).toBeNull();
    expect(applyCall(next, { ...wire, ended: true }, self, "Maya", false)).toBeNull();
    expect(applyCall(next, { ...wire, ringing: ["100000000000000002"] }, self, "Maya", false)).toBeNull();
  });

  it("leaves a different channel's ring alone", () => {
    const current: RingState = { channelId: channel, callerName: "Maya", video: false };
    const other = { channelId: "100000000000000042", ringing: [] as string[], ended: true, video: false };
    expect(applyCall(current, other, self, "Jonah", false)).toBe(current);
    expect(applyCall(current, { ...other, channelId: "bad" }, self, "Jonah", false)).toBe(current);
  });

  it("notifies when the window is hidden or unfocused, and plays when call sound is on", () => {
    expect(ringInBackground(true, true)).toBe(true);
    expect(ringInBackground(false, false)).toBe(true);
    expect(ringInBackground(false, true)).toBe(false);
    expect(ringAudible(true, true)).toBe(true);
    expect(ringAudible(false, true)).toBe(false);
    expect(incomingNotice("Maya", true)).toEqual({
      title: "Incoming video call",
      body: "Maya is calling. Answer or decline.",
    });
  });

  it("does not stack the ringtone", () => {
    const plays: number[] = [];
    const timers = new Map<number, () => void>();
    let next = 1;
    const clock = {
      setInterval(fn: () => void) {
        const id = next++;
        timers.set(id, fn);
        return id;
      },
      clearInterval(id: number) {
        timers.delete(id);
      },
    };
    const ring = createRingtone(() => plays.push(1), 2000, clock);
    ring.start();
    ring.start();
    expect(plays).toEqual([1]);
    expect(timers.size).toBe(1);
    timers.get(1)?.();
    expect(plays).toEqual([1, 1]);
    ring.stop();
    ring.stop();
    expect(timers.size).toBe(0);
  });
});
