import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { callTimerLabel, callTimerStart, formatCallElapsed } from "./call-timer";
import { boostedPlayback, volumeCapChoice, volumeCeiling } from "./volume";

describe("call timer", () => {
  it("counts from join or from connected and formats the clock", () => {
    const joined = 1_000;
    const connected = 5_000;
    expect(callTimerStart("join", joined, connected)).toBe(joined);
    expect(callTimerStart("connected", joined, 0)).toBe(0);
    expect(callTimerStart("connected", joined, connected)).toBe(connected);
    expect(formatCallElapsed(joined, joined + 3_200, "auto")).toBe("0:03");
    expect(formatCallElapsed(joined, joined + 65_000, "auto")).toBe("1:05");
    expect(formatCallElapsed(joined, joined + 3_661_000, "auto")).toBe("1:01:01");
    expect(formatCallElapsed(joined, joined + 3_200, "clock")).toBe("0:00:03");
    expect(callTimerLabel("connected", "auto", joined, connected, connected + 90_000)).toBe("1:30");
    expect(callTimerLabel("join", "clock", joined, 0, joined + 2_000)).toBe("0:00:02");
    expect(callTimerLabel("connected", "auto", joined, 0, joined + 2_000)).toBe("");
  });

  it("declares the call timer hook and stays off the network", () => {
    const source = readFileSync("store/plugins/call-timer/plugin.js", "utf8");
    const plugin = describePlugin(source, "call-timer");
    expect(plugin.name).toBe("Call Timer");
    expect(plugin.hooks.callTimer).toBe(true);
    expect(plugin.hooks.volumeBoost).toBe(false);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});

describe("volume booster", () => {
  it("raises the per-user ceiling only while the plugin is on", () => {
    expect(volumeCeiling(false, 400)).toBe(200);
    expect(volumeCeiling(true, 400)).toBe(400);
    expect(volumeCeiling(true, 300)).toBe(300);
    expect(volumeCeiling(true, 200)).toBe(200);
    expect(volumeCeiling(true, 900)).toBe(400);
    expect(volumeCapChoice("300")).toBe(300);
    expect(volumeCapChoice("nope")).toBe(400);
    expect(boostedPlayback(350, false, 400)).toBe(350);
    expect(boostedPlayback(350, false, 200)).toBe(200);
    expect(boostedPlayback(350, true, 400)).toBe(0);
    expect(boostedPlayback(80, false, 200)).toBe(80);
  });

  it("declares the volume booster hook", () => {
    const plugin = describePlugin(readFileSync("store/plugins/volume-booster/plugin.js", "utf8"), "volume-booster");
    expect(plugin.name).toBe("Volume Booster");
    expect(plugin.hooks.volumeBoost).toBe(true);
    expect(plugin.hooks.callTimer).toBe(false);
  });
});
