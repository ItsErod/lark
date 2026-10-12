import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { cleanPinnedDms, orderDms, togglePinnedDm } from "./pin-dms";

describe("pin DMs", () => {
  it("pins to the front, unpins, and ignores a bad id", () => {
    const once = togglePinnedDm([], "dm-1");
    expect(once).toEqual(["dm-1"]);
    expect(togglePinnedDm(once, "dm-2")).toEqual(["dm-2", "dm-1"]);
    expect(togglePinnedDm(["dm-2", "dm-1"], "dm-2")).toEqual(["dm-1"]);
    expect(togglePinnedDm(["dm-1"], "bad id")).toEqual(["dm-1"]);
    expect(cleanPinnedDms(["dm-1", "bad id", "dm-1", 4])).toEqual(["dm-1"]);
  });

  it("splits the list into a pinned category and the rest, in pin order", () => {
    const dms = [
      { id: "a", position: 2 },
      { id: "b", position: 0 },
      { id: "c", position: 1 },
    ];
    const split = orderDms(dms, ["c", "missing", "a"]);
    expect(split.pinned.map((dm) => dm.id)).toEqual(["c", "a"]);
    expect(split.rest.map((dm) => dm.id)).toEqual(["b"]);
    expect(orderDms(dms, []).rest.map((dm) => dm.id)).toEqual(["b", "c", "a"]);
  });

  it("declares the pin hook", () => {
    const plugin = describePlugin(readFileSync("plugins/pin-dms.js", "utf8"), "pin-dms");
    expect(plugin.hooks.pinDms).toBe(true);
    expect(plugin.name).toBe("Pin DMs");
  });
});
