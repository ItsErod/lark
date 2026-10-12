import { describe, expect, it } from "vitest";
import { copyWithSinks } from "./clipboard";

describe("copy voice diagnostics", () => {
  it("uses the clipboard plugin when the browser clipboard rejects", async () => {
    const calls: string[] = [];
    const ok = await copyWithSinks("diag", {
      writeText: async () => {
        calls.push("browser");
        throw new Error("denied");
      },
      pluginWrite: async () => {
        calls.push("plugin");
      },
      execCopy: () => {
        calls.push("exec");
        return true;
      },
    });
    expect(ok).toBe(true);
    expect(calls).toEqual(["browser", "plugin"]);
  });

  it("falls back to a textarea copy when both clipboards fail", async () => {
    let copied = "";
    const ok = await copyWithSinks("diag", {
      writeText: async () => {
        throw new Error("denied");
      },
      pluginWrite: async () => {
        throw new Error("acl");
      },
      execCopy: (text) => {
        copied = text;
        return true;
      },
    });
    expect(ok).toBe(true);
    expect(copied).toBe("diag");
  });
});
