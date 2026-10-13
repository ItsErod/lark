import { describe, expect, it } from "vitest";
import { statusEmojiCells, statusEmojiPayload } from "./status-emoji";

const unicode = ["👍", "🔥", "✅", "👀"];
const server = [
  { id: "100000000000000099", name: "lark", animated: false },
  { id: "nope", name: "bad", animated: false },
  { id: "100000000000000088", name: "wave", animated: true },
];

describe("status emoji grid", () => {
  it("lists unicode and, when allowed, server emoji", () => {
    const locked = statusEmojiCells({ unicode, recent: ["🔥"], server, allowServer: false, query: "" });
    expect(locked.map((cell) => cell.name)).toEqual(["🔥", "👍", "✅", "👀"]);
    expect(locked.every((cell) => cell.id === null)).toBe(true);

    const open = statusEmojiCells({ unicode, recent: [], server, allowServer: true, query: "" });
    expect(open.map((cell) => cell.name)).toEqual(["👍", "🔥", "✅", "👀", "lark", "wave"]);
    expect(open.find((cell) => cell.name === "lark")).toMatchObject({ id: "100000000000000099", animated: false });
    expect(open.find((cell) => cell.name === "wave")?.animated).toBe(true);
    expect(open.some((cell) => cell.name === "bad")).toBe(false);
  });

  it("filters the grid by the search box", () => {
    const cells = statusEmojiCells({ unicode, recent: [], server, allowServer: true, query: "wa" });
    expect(cells.map((cell) => cell.name)).toEqual(["wave"]);
  });

  it("sends a unicode glyph without an id, and a server emoji with one", () => {
    expect(statusEmojiPayload({ name: "👍", id: null, animated: false })).toEqual({
      name: "👍",
      id: null,
      animated: false,
    });
    expect(statusEmojiPayload({ name: "lark", id: "100000000000000099", animated: false })).toEqual({
      name: "lark",
      id: "100000000000000099",
      animated: false,
    });
    expect(statusEmojiPayload({ name: "wave", id: "100000000000000088", animated: true }).animated).toBe(true);
    expect(statusEmojiPayload({ name: "x", id: "nope", animated: true })).toEqual({
      name: "x",
      id: null,
      animated: false,
    });
  });
});
