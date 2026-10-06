import { describe, expect, it } from "vitest";
// The release script is plain JavaScript used by GitHub Actions.
// @ts-expect-error no declaration file for the workflow script.
import { replaceLockText, versionFromTag } from "../.github/scripts/set-release-version.mjs";

describe("release installer version", () => {
  it("turns the git tag into the version Tauri puts in installer names", () => {
    expect(versionFromTag("v2.2")).toBe("2.2.0");
    expect(versionFromTag("v2.2.1")).toBe("2.2.1");
    expect(versionFromTag("v2.2.0")).toBe("2.2.0");
    expect(() => versionFromTag("2.2.1")).toThrow(/v2\.2/);
    expect(() => versionFromTag("v2")).toThrow(/v2\.2/);
    expect(() => versionFromTag("")).toThrow(/v2\.2/);
  });

  it("updates Cargo.lock when Windows checks the file out with CRLF", () => {
    const block = '[[package]]\r\nname = "lark"\r\nversion = "0.1.0"\r\n';
    expect(replaceLockText(block, "lark", "2.2.1")).toBe(
      '[[package]]\r\nname = "lark"\r\nversion = "2.2.1"\r\n',
    );
    const lf = '[[package]]\nname = "lark-core"\nversion = "0.1.0"\n';
    expect(replaceLockText(lf, "lark-core", "2.2.1")).toBe(
      '[[package]]\nname = "lark-core"\nversion = "2.2.1"\n',
    );
    expect(replaceLockText(`${block}\r\nname = "lark-core"\r\n`, "lark", "2.2.1")).toContain(
      'name = "lark"\r\nversion = "2.2.1"',
    );
  });
});
