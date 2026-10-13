import { describe, expect, it } from "vitest";
import { adaptCamera, cameraLadder, cameraProfile, snapCameraFps, snapCameraHeight } from "./camera-quality";

describe("camera quality", () => {
  it("defaults to 720p at 30 fps and 2.5 Mbps", () => {
    expect(cameraProfile(720, 30)).toEqual({ width: 1280, height: 720, fps: 30, bitrate: 2_500_000 });
    expect(cameraProfile(700, 24)).toEqual(cameraProfile(720, 30));
    expect(snapCameraHeight(1080)).toBe(1080);
    expect(snapCameraHeight(0)).toBe(360);
    expect(snapCameraFps(15)).toBe(15);
    expect(snapCameraFps(23)).toBe(15);
  });

  it("keeps the ladder at or below the chosen picture", () => {
    const want = cameraProfile(720, 30);
    const steps = cameraLadder(want);
    expect(steps[0]).toEqual(cameraProfile(360, 15));
    expect(steps.at(-1)).toEqual(want);
    expect(steps.at(-2)?.bitrate).toBe(Math.round(want.bitrate * 0.7));
    expect(steps.every((step) => step.height < 1080)).toBe(true);
    expect(steps.every((step) => step.height < want.height || step.fps <= want.fps)).toBe(true);
  });

  it("steps down on loss and back up when the link is clear", () => {
    const want = cameraProfile(720, 30);
    const top = cameraLadder(want).at(-1)!;
    const mild = adaptCamera(want, top, 10, 0);
    expect(mild.bitrate).toBe(Math.round(want.bitrate * 0.7));
    const hard = adaptCamera(want, top, 20, 0);
    expect(hard).toEqual(cameraProfile(720, 15));
    const held = adaptCamera(want, mild, 4, 0);
    expect(held).toEqual(mild);
    const recovered = adaptCamera(want, mild, 0, 0);
    expect(recovered).toEqual(top);
  });

  it("steps down when the bytes that got through are below the target", () => {
    const want = cameraProfile(720, 30);
    const top = cameraLadder(want).at(-1)!;
    const tight = adaptCamera(want, top, 0, 1_000_000);
    expect(tight.bitrate).toBeLessThan(top.bitrate);
    const floor = cameraProfile(360, 15);
    expect(adaptCamera(want, floor, 40, 100_000)).toEqual(floor);
  });
});
