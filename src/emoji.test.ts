import { describe, expect, it } from "vitest";
import { frecency, rememberEmoji } from "./emoji";

describe("emoji frecency", () => {
  it("ranks a repeated emoji above a stale one", () => {
    const now = 10_000_000;
    const ranked = frecency(
      [
        { emoji: "🔥", count: 1, last: now - 40 * 3_600_000 },
        { emoji: "👍", count: 4, last: now },
      ],
      now,
    );
    expect(ranked[0].emoji).toBe("👍");
    const next = rememberEmoji(ranked, "🔥", now);
    expect(next.find((item) => item.emoji === "🔥")?.count).toBe(2);
  });
});
