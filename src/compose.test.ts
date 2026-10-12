import { describe, expect, it } from "vitest";
import { composedError, outgoingError, spoilerUploadName } from "./compose";

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

  it("allows an empty body for stickers and prefixes spoiler files", () => {
    expect(composedError("", 0, 0, 1)).toBeNull();
    expect(composedError("hi", 0, 0, 4)).toMatch(/3 stickers/);
    expect(spoilerUploadName("clip.mp4", true)).toBe("SPOILER_clip.mp4");
    expect(spoilerUploadName("clip.mp4", false)).toBe("clip.mp4");
  });
});
