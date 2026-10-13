import { describe, expect, it } from "vitest";
import { accessUnit } from "./camera-send";

describe("camera access units", () => {
  it("turns a length-prefixed keyframe and its parameter sets into annex-b", () => {
    const description = new Uint8Array([
      0x01, 0x42, 0xe0, 0x1f, 0xff, 0xe1, 0x00, 0x03, 0x67, 0x42, 0xe0, 0x01, 0x00, 0x02, 0x68, 0xce,
    ]);
    const sample = new Uint8Array([0x00, 0x00, 0x00, 0x02, 0x65, 0x11]);
    const unit = accessUnit(sample, description, true);
    expect(Array.from(unit)).toEqual([
      0, 0, 0, 1, 0x67, 0x42, 0xe0,
      0, 0, 0, 1, 0x68, 0xce,
      0, 0, 0, 1, 0x65, 0x11,
    ]);
    const delta = accessUnit(sample, description, false);
    expect(Array.from(delta)).toEqual([0, 0, 0, 1, 0x65, 0x11]);
  });

  it("keeps an annex-b sample and skips a description that is not avcC", () => {
    const sample = new Uint8Array([0, 0, 0, 1, 0x65, 0x22]);
    expect(Array.from(accessUnit(sample, new Uint8Array([0, 1, 2]), true))).toEqual(Array.from(sample));
  });
});
