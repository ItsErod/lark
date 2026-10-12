import { describe, expect, it } from "vitest";
import { median, summarize, type PerfSample } from "./score";

function sample(patch: Partial<PerfSample> = {}): PerfSample {
  return {
    coldStartMs: 100,
    channelSwitchMs: 10,
    messageLoadMs: 12,
    scrollFps: 60,
    inputLatencyMs: 1,
    idleMemoryMb: 20,
    idleCpuPct: 2,
    ...patch,
  };
}

describe("perf summary", () => {
  it("picks the middle of an odd run", () => {
    expect(median([8, 1, 5])).toBe(5);
    expect(median([4, 1])).toBe(1);
    expect(median([])).toBe(0);
    expect(median([Number.NaN, 3])).toBe(3);
  });

  it("summarizes each metric from the samples", () => {
    const summary = summarize([
      sample({ coldStartMs: 300, scrollFps: 40 }),
      sample({ coldStartMs: 100, scrollFps: 60 }),
      sample({ coldStartMs: 200, scrollFps: 55 }),
    ]);
    expect(summary.runs).toBe(3);
    expect(summary.coldStartMs).toBe(200);
    expect(summary.scrollFps).toBe(55);
    expect(summary.channelSwitchMs).toBe(10);
  });
});
