import { describe, expect, it } from "vitest";
import { activeFriends, clampNote, friendGlance } from "./social";
import type { Person } from "./types";

const maya: Person = { id: "2", name: "Maya", status: "online", custom: "At the desk", activity: "Playing Lark" };
const jonah: Person = { id: "3", name: "Jonah", status: "idle", custom: "Walking", activity: "Listening to Noon" };
const priya: Person = { id: "4", name: "Priya", status: "dnd", custom: "Heads down" };
const leo: Person = { id: "5", name: "Leo", status: "offline", activity: "Playing something" };

describe("friend activity", () => {
  it("keeps the game visible next to a custom status", () => {
    expect(friendGlance(maya)).toEqual({
      activity: "Playing Lark",
      custom: "At the desk",
      line: "Playing Lark · At the desk",
    });
    expect(friendGlance(priya).line).toBe("Heads down");
  });

  it("lists only people who are around and in an activity", () => {
    expect(activeFriends([leo, priya, jonah, maya]).map((person) => person.name)).toEqual(["Maya", "Jonah"]);
    expect(activeFriends([maya], 0)).toEqual([]);
  });

  it("caps a note at 256 characters", () => {
    expect(clampNote("hello\0")).toBe("hello");
    expect([...clampNote("n".repeat(300))]).toHaveLength(256);
  });
});
