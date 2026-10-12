import { describe, expect, it } from "vitest";
import { formatCrash } from "./crash";

describe("crash screen", () => {
  it("keeps a copyable stack for an exception", () => {
    const error = new Error("first render failed");
    const text = formatCrash(error);
    expect(text).toContain("first render failed");
    expect(text).toContain("Error");
  });

  it("stringifies a rejected promise reason", () => {
    expect(formatCrash("startup promise failed")).toBe("startup promise failed");
    expect(formatCrash({ reason: "ack" })).toBe('{"reason":"ack"}');
    expect(formatCrash(null)).toBe("null");
  });
});
