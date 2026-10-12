import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { formatFull, formatStamp } from "./time";

const iso = "2026-10-06T15:05:09.000Z";
const now = Date.parse("2026-10-06T15:08:09.000Z");
const utc = { locale: "en-US", timeZone: "UTC" };

describe("better timestamps", () => {
  it("switches between relative and absolute, and between 12 and 24 hour clocks", () => {
    expect(formatStamp(new Date(now - 3 * 60_000).toISOString(), now, "relative", "24")).toBe("3m ago");
    expect(formatStamp(iso, now, "absolute", "24", utc)).toBe("15:05");
    expect(formatStamp(iso, now, "absolute", "12", utc)).toBe("3:05 PM");
    const full = formatFull(iso, "24", utc);
    expect(full).toContain("2026");
    expect(full).toContain("15:05:09");
    expect(formatFull(iso, "12", utc)).toContain("3:05:09 PM");
  });

  it("keeps a broken clock setting out of the pack and declares the hook", () => {
    const pack = sanitizePack({ timeMode: "absolute", timeHours: "24" });
    expect(pack.timeMode).toBe("absolute");
    expect(pack.timeHours).toBe("24");
    expect(sanitizePack({ timeMode: "soon", timeHours: "13" }).timeMode).toBe("relative");
    expect(sanitizePack({ timeHours: "13" }).timeHours).toBe("12");
    const plugin = describePlugin(readFileSync("plugins/better-timestamps.js", "utf8"), "better-timestamps");
    expect(plugin.hooks.betterTime).toBe(true);
    expect(plugin.name).toBe("Better timestamps");
  });
});
