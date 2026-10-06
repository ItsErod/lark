import { describe, expect, it } from "vitest";
import { FrameClock, FRAME_CAP_MAX, hzFromDeltas, scheduleHz } from "./frame";

describe("frame cap", () => {
  it("matches the display up to 240 and clamps a numeric cap", () => {
    expect(scheduleHz(0)).toBe(FRAME_CAP_MAX);
    expect(scheduleHz(-1)).toBe(FRAME_CAP_MAX);
    expect(scheduleHz(360)).toBe(240);
    expect(scheduleHz(144)).toBe(144);
    expect(scheduleHz(10)).toBe(30);
  });

  it("reads the display from vsync spacing", () => {
    expect(hzFromDeltas([6.94, 6.95, 6.93, 6.94])).toBe(144);
    expect(hzFromDeltas([4.17, 4.16, 4.18])).toBe(240);
    expect(hzFromDeltas([])).toBe(0);
  });

  it("does not schedule while nothing is changing", () => {
    const pending: Array<(now: number) => void> = [];
    const clock = new FrameClock((cb) => {
      pending.push(cb);
      return pending.length;
    });
    expect(pending).toHaveLength(0);
    clock.request(() => undefined);
    expect(pending).toHaveLength(1);
    pending.shift()?.(10);
    expect(pending).toHaveLength(0);
  });

  it("paints every vsync on a 144 Hz display under the default cap", () => {
    const { paints, callbacks } = drive(240, 1000 / 144, 500);
    expect(paints).toBeGreaterThanOrEqual(70);
    expect(paints).toBeLessThanOrEqual(74);
    expect(callbacks).toBe(paints);
  });

  it("stays under 240 paints per second when vsync is 360 Hz", () => {
    const { paints, callbacks, gaps } = drive(240, 1000 / 360, 1000);
    expect(paints).toBeLessThanOrEqual(240);
    expect(paints).toBeGreaterThan(150);
    expect(callbacks).toBeGreaterThan(paints);
    expect(Math.min(...gaps)).toBeGreaterThan(3.9);
  });

  it("holds a 120 cap on a 240 Hz display", () => {
    const { paints, gaps } = drive(120, 1000 / 240, 1000);
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    expect(paints).toBeGreaterThan(90);
    expect(1000 / average).toBeLessThanOrEqual(120.5);
    expect(Math.min(...gaps)).toBeGreaterThan(8);
  });
});

function drive(cap: number, step: number, duration: number) {
  const pending: Array<(now: number) => void> = [];
  const clock = new FrameClock((cb) => {
    pending.push(cb);
    return pending.length;
  });
  clock.setCap(cap);
  const gaps: number[] = [];
  let paints = 0;
  let callbacks = 0;
  let now = 0;
  let previous = 0;
  const kick = () => {
    clock.request(() => {
      paints += 1;
      if (previous) gaps.push(now - previous);
      previous = now;
      if (now < duration) kick();
    });
  };
  kick();
  let guard = 0;
  while (pending.length && guard < 20_000) {
    guard += 1;
    const cb = pending.shift();
    if (!cb) break;
    now += step;
    callbacks += 1;
    cb(now);
    if (now > duration + step * 4 && paints > 0 && pending.length === 0) break;
  }
  return { paints, callbacks, gaps };
}
