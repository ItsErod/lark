import { describe, expect, it } from "vitest";
import { fpsFromMarks, noteFpsMark } from "./frame";
import { formatRam, fpsWatch, perfRows } from "./perf";

describe("performance overlay", () => {
  it("formats cpu, ram, and fps and leaves a missing read blank", () => {
    expect(perfRows({ cpu: 18.2, ramUsedMb: 6400, ramTotalMb: 16384, fps: 59.6 })).toEqual([
      { label: "CPU", value: "18%" },
      { label: "RAM", value: "6.3 / 16 GB" },
      { label: "FPS", value: "60" },
    ]);
    expect(perfRows({ cpu: null, ramUsedMb: null, ramTotalMb: null, fps: null })).toEqual([
      { label: "CPU", value: "—" },
      { label: "RAM", value: "—" },
      { label: "FPS", value: "—" },
    ]);
    expect(formatRam(800, 1024)).toBe("0.8 / 1.0 GB");
    expect(formatRam(20_000, 32_768)).toBe("20 / 32 GB");
    expect(perfRows({ cpu: 140, ramUsedMb: 99_999, ramTotalMb: 1024, fps: -4 })[0].value).toBe("100%");
    expect(perfRows({ cpu: 140, ramUsedMb: 99_999, ramTotalMb: 1024, fps: -4 })[2].value).toBe("0");
  });

  it("samples fps live, and only in a short burst during game mode", () => {
    expect(fpsWatch(false, false)).toBe("off");
    expect(fpsWatch(false, true)).toBe("off");
    expect(fpsWatch(true, false)).toBe("live");
    expect(fpsWatch(true, true)).toBe("burst");
  });

  it("counts frames in the last second", () => {
    let marks = noteFpsMark([], 0);
    for (let stamp = 16; stamp <= 1000; stamp += 16) marks = noteFpsMark(marks, stamp);
    const fps = fpsFromMarks(marks, 1000);
    expect(fps).toBeGreaterThanOrEqual(58);
    expect(fps).toBeLessThanOrEqual(63);
    expect(fpsFromMarks([1000], 1000)).toBeNull();
    expect(fpsFromMarks(noteFpsMark(noteFpsMark([], 0), 100), 100)).toBeNull();
  });
});
