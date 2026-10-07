import { describe, expect, it } from "vitest";
import { outgoingError } from "./compose";

describe("outgoing messages", () => {
  it("rejects empty, huge, and oversized sends", () => {
    expect(outgoingError("hello", 0, 0)).toBeNull();
    expect(outgoingError("   ", 0, 0)).toMatch(/Write a message/);
    expect(outgoingError("a".repeat(2001), 0, 0)).toMatch(/2,000/);
    expect(outgoingError("hi", 5, 10)).toMatch(/4 files/);
    expect(outgoingError("hi", 1, 9 * 1024 * 1024)).toBeNull();
    expect(outgoingError("hi", 1, 11 * 1024 * 1024)).toMatch(/10 MB/);
    expect(outgoingError("hi", 1, 40 * 1024 * 1024, 500 * 1024 * 1024)).toBeNull();
  });
});
