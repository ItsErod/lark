import { describe, expect, it } from "vitest";
// The release script is plain JavaScript used by GitHub Actions.
// @ts-expect-error no declaration file for the workflow script.
import { versionFromTag } from "../.github/scripts/set-release-version.mjs";

describe("release installer version", () => {
  it("turns the git tag into the version Tauri puts in installer names", () => {
    expect(versionFromTag("v2.2")).toBe("2.2.0");
    expect(versionFromTag("v2.2.1")).toBe("2.2.1");
    expect(versionFromTag("v2.2.0")).toBe("2.2.0");
    expect(() => versionFromTag("2.2.1")).toThrow(/v2\.2/);
    expect(() => versionFromTag("v2")).toThrow(/v2\.2/);
    expect(() => versionFromTag("")).toThrow(/v2\.2/);
  });
});
