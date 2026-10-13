import { describe, expect, it } from "vitest";
import { motionChoice, prefersReduced } from "./motion-pref";

describe("in-app motion", () => {
  it("follows the OS until the user picks", () => {
    expect(motionChoice("")).toBe("system");
    expect(motionChoice("nope")).toBe("system");
    expect(prefersReduced("system", true)).toBe(true);
    expect(prefersReduced("system", false)).toBe(false);
  });

  it("overrides the OS in either direction", () => {
    expect(prefersReduced("reduce", false)).toBe(true);
    expect(prefersReduced("allow", true)).toBe(false);
  });
});
