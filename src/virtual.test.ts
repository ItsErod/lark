import { describe, expect, it } from "vitest";
import { spanWindow, sliceWindow, VIRTUAL_MIN } from "./virtual";

describe("virtual window", () => {
  it("keeps a short list fully mounted", () => {
    const slice = sliceWindow(10, 0, 800, 40, 2);
    expect(slice.start).toBe(0);
    expect(slice.end).toBe(10);
  });

  it("windows a long list around the scroll offset", () => {
    const slice = sliceWindow(500, 2000, 400, 40, 2);
    expect(slice.start).toBe(48);
    expect(slice.end).toBe(62);
    expect(slice.total).toBe(20_000);
  });
});

describe("variable message window", () => {
  it("mounts a short history in full", () => {
    const span = spanWindow(VIRTUAL_MIN, undefined, 0, 600, 80);
    expect(span).toEqual({ start: 0, end: VIRTUAL_MIN, top: 0, bottom: 0, total: VIRTUAL_MIN * 80 });
  });

  it("keeps only the rows around the viewport", () => {
    const span = spanWindow(400, undefined, 0, 400, 80, 2);
    expect(span.end - span.start).toBeLessThan(20);
    expect(span.start).toBe(0);
    expect(span.total).toBe(32_000);
  });

  it("pins the tail and honors measured heights", () => {
    const heights = Array.from({ length: 80 }, () => 0);
    heights[78] = 200;
    heights[79] = 40;
    const span = spanWindow(80, heights, 0, 400, 80, 1, true);
    expect(span.end).toBe(80);
    expect(span.start).toBeGreaterThan(70);
    expect(span.bottom).toBe(0);
    expect(span.top + 200 + 40).toBeLessThanOrEqual(span.total);
  });

  it("mounts a jump target that is outside the viewport", () => {
    const span = spanWindow(200, undefined, 0, 320, 80, 2, false, 100);
    expect(span.start).toBeLessThanOrEqual(100);
    expect(span.end).toBeGreaterThan(100);
  });
});