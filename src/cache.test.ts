import { describe, expect, it } from "vitest";
import { rememberPage } from "./cache";

describe("message cache", () => {
  it("keeps the newest messages for a channel", () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) }));
    const stored = rememberPage([], { channelId: "c", messages }, 2);
    expect(stored[0].messages.map((message) => message.id)).toEqual(["4", "5"]);
  });
});
