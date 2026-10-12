import { describe, expect, it } from "vitest";
import { cameraFrameBytes, splitAnnexNals } from "./camera-view";

describe("remote camera frames", () => {
  it("splits an annex-b access unit into nal units", () => {
    const bytes = new Uint8Array([
      0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f,
      0, 0, 0, 1, 0x68, 0xce, 0x06, 0xe2,
      0, 0, 1, 0x65, 0x88, 0x84,
    ]);
    const nals = splitAnnexNals(bytes);
    expect(nals.map((nal) => nal[0] & 0x1f)).toEqual([7, 8, 5]);
    expect(splitAnnexNals(new Uint8Array())).toEqual([]);
  });

  it("reads a base64 access unit and rejects junk", () => {
    const encoded = btoa(String.fromCharCode(0, 0, 0, 1, 0x65, 1, 2));
    const bytes = cameraFrameBytes(encoded);
    expect(bytes).not.toBeNull();
    expect(splitAnnexNals(bytes ?? new Uint8Array()).map((nal) => nal[0] & 0x1f)).toEqual([5]);
    expect(cameraFrameBytes("%%%")).toBeNull();
    expect(cameraFrameBytes("")).toBeNull();
  });
});
