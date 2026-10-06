import { describe, expect, it } from "vitest";
import { keywordHits } from "./keywords";

describe("keyword highlights", () => {
  it("matches case-insensitively and ignores tiny words", () => {
    expect(keywordHits("Ship the Wordmark", ["wordmark", "a"])).toEqual(["wordmark"]);
  });
});
