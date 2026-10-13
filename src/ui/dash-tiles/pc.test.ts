import { describe, expect, it } from "vitest";
import { emptyPc, formatCpu, formatGpu, formatNet, formatRam, netRate, resolvePc } from "./pc";

describe("pc stats formatting", () => {
  it("formats cpu, memory, the gpu name, and the network line", () => {
    expect(formatCpu(18.2)).toBe("18%");
    expect(formatCpu(null)).toBe("—");
    expect(formatRam(6400, 16384)).toBe("6.3 GB / 16 GB");
    expect(formatGpu("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)")).toBe("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Di…");
    expect(formatNet(8, 24)).toBe("8 Mb/s · 24 ms");
    expect(formatNet(null, null)).toBe("—");
  });

  it("turns a byte counter into megabits per second", () => {
    expect(netRate(0, 1_000_000, 1000)).toBe(8);
    expect(netRate(50, 40, 1000)).toBe(null);
    expect(netRate(null, 10, 1000)).toBe(null);
  });

  it("does not invent a reading the machine did not provide", () => {
    const live = emptyPc();
    live.gpu = "llvmpipe";
    expect(resolvePc(live)).toEqual({ reading: live, sample: false });
    expect(resolvePc(live).reading.cpu).toBe(null);
  });
});