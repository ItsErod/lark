import { describe, expect, it } from "vitest";
import { dirtyRatio, planShare } from "./share";

describe("screen share scheduler", () => {
  it("sends nothing when the thumbnail is unchanged", () => {
    const frame = new Uint8Array(32 * 18);
    const diff = dirtyRatio(frame, frame, 32);
    const plan = planShare(diff.ratio, diff.regions);
    expect(plan.send).toBe(false);
    expect(plan.fps).toBe(0);
    expect(plan.bitrate).toBe(0);
  });

  it("keeps a one-tile edit at a low rate", () => {
    const prev = new Uint8Array(64 * 96);
    const next = new Uint8Array(prev);
    next[0] = 255;
    const diff = dirtyRatio(prev, next, 32);
    const plan = planShare(diff.ratio, diff.regions);
    expect(diff.regions).toBe(1);
    expect(plan.fps).toBe(5);
    expect(plan.bitrate).toBe(200_000);
  });

  it("ramps when most of the frame changes", () => {
    const prev = new Uint8Array(32 * 32);
    const next = new Uint8Array(32 * 32).fill(255);
    const diff = dirtyRatio(prev, next, 32);
    const plan = planShare(diff.ratio, diff.regions);
    expect(plan.fps).toBe(30);
    expect(plan.bitrate).toBe(2_500_000);
  });
});
