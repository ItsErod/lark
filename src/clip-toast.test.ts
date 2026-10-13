import { describe, expect, it } from "vitest";
import { toastText } from "./clip-toast";

describe("clip toast", () => {
  it("names the game or the failure", () => {
    expect(toastText(true, "lark-clip-valorant-20260101-120000Z.mp4")).toBe("Clip saved · Valorant");
    expect(toastText(true, "lark-clip-20260101-120000Z.mp4")).toBe("Clip saved");
    expect(toastText(false, "Nothing is being captured.")).toBe("Clip not saved · Nothing is being captured.");
  });
});
