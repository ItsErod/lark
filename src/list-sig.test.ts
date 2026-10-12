import { describe, expect, it } from "vitest";
import { messageSignature } from "./list-sig";

describe("message signature", () => {
  it("matches a prefix hash so an append can be detected", () => {
    const older = [
      { id: "1", content: "a" },
      { id: "2", content: "b", reactions: [{ emoji: "👍", count: 1, me: true }] },
    ];
    const next = [...older, { id: "3", content: "c", edited: true, embeds: [{}] }];
    expect(messageSignature(next.slice(0, -1))).toBe(messageSignature(older));
    expect(messageSignature(next)).not.toBe(messageSignature(older));
  });

  it("changes when a reaction count changes", () => {
    const base = [{ id: "1", content: "a", reactions: [{ emoji: "👍", count: 1 }] }];
    const bumped = [{ id: "1", content: "a", reactions: [{ emoji: "👍", count: 2 }] }];
    expect(messageSignature(base)).not.toBe(messageSignature(bumped));
  });
});
