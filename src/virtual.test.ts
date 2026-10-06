import { describe, expect, it } from "vitest";
import { sliceWindow } from "./virtual";

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