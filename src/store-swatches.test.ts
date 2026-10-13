import { describe, expect, it } from "vitest";
import { themeSwatches } from "./ui/store-swatches";

describe("store theme swatches", () => {
  it("keeps up to six hex colours", () => {
    expect(themeSwatches(["#09090b", " red ", "#FAFAFA", "#09090b", "#111", "#222", "#333", "#444", "#555"])).toEqual([
      "#09090b",
      "#FAFAFA",
      "#111",
      "#222",
      "#333",
      "#444",
    ]);
    expect(themeSwatches([])).toEqual([]);
  });
});
