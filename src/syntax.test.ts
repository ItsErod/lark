import { describe, expect, it } from "vitest";
import { highlightCode, highlightPlain } from "./syntax";

describe("syntax highlighting", () => {
  it("marks keywords and strings without dropping text", () => {
    const tokens = highlightCode("css", 'color: "ink"; // note');
    expect(tokens.some((token) => token.kind === "keyword" && token.text === "color")).toBe(true);
    expect(tokens.some((token) => token.kind === "string")).toBe(true);
    expect(tokens.some((token) => token.kind === "comment")).toBe(true);
    expect(highlightPlain('color: "ink"; // note')).toBe('color: "ink"; // note');
  });
});
