import { afterEach, describe, expect, it } from "vitest";
import { clearSettingsExtensions, searchSettings } from "./ui/settings";
import { installShareSettings, resetShareSettingsInstall } from "./share-settings";
import {
  formatBitrate,
  presetBitrate,
  qualityLabel,
  shareBitrate,
  snapShareFps,
  snapShareHeight,
  streamKeyFor,
} from "./share";

afterEach(() => {
  clearSettingsExtensions();
  resetShareSettingsInstall();
});

describe("go live quality", () => {
  it("uses the same bitrate table as the stream encoder", () => {
    const heights = [720, 1080, 1440, 2160];
    const rates = [15, 30, 60];
    for (const height of heights) {
      let previous = 0;
      for (const fps of rates) {
        const bitrate = presetBitrate(height, fps);
        expect(bitrate).toBeGreaterThan(previous);
        previous = bitrate;
      }
    }
    expect(shareBitrate(1920, 1080, 60)).toBe(6_000_000);
    expect(shareBitrate(1280, 720, 30)).toBe(2_500_000);
    expect(shareBitrate(3840, 2160, 60)).toBe(20_000_000);
    expect(shareBitrate(1280, 720, 15)).toBe(1_500_000);
    expect(shareBitrate(2560, 1440, 30)).toBe(8_000_000);
    expect(shareBitrate(2560, 1600, 30)).toBeGreaterThan(shareBitrate(1920, 1080, 30));
    expect(snapShareHeight("source")).toBe(0);
    expect(snapShareHeight("4k")).toBe(2160);
    expect(snapShareFps(45)).toBe(30);
    expect(formatBitrate(presetBitrate(1080, 30))).toBe("4.5 Mbps");
    expect(qualityLabel(720, 60)).toBe("720p · 60 fps · 4.5 Mbps");
  });

  it("registers screen share settings on Voice & Video", async () => {
    await installShareSettings();
    const hit = searchSettings("screen share quality");
    expect(hit[0]?.section).toBe("voice");
    expect(hit[0]?.id).toBe("voice.share.quality");
    expect(searchSettings("application audio")[0]?.id).toBe("voice.share.audio");
  });

  it("builds guild and call stream keys", () => {
    expect(streamKeyFor("10", "20", "30")).toBe("guild:10:20:30");
    expect(streamKeyFor("", "20", "30")).toBe("call:20:30");
  });
});
