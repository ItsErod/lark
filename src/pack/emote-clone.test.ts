import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { canCloneTo, cloneTargets, discordMedia, emojiCloneBody, emojiName, stickerCloneRequest } from "./emote-clone";

describe("emote cloner", () => {
  it("only offers servers where the user can manage expressions", () => {
    expect(canCloneTo(null)).toBe(false);
    expect(canCloneTo({ owner: true, permissions: "0" })).toBe(true);
    expect(canCloneTo({ owner: false, permissions: String(1n << 30n) })).toBe(true);
    expect(canCloneTo({ owner: false, permissions: String(1n << 43n) })).toBe(true);
    expect(canCloneTo({ owner: false, permissions: "1024" })).toBe(false);
    expect(cloneTargets(
      [{ id: "1", name: "Northwind" }, { id: "2", name: "Booth" }],
      { "1": { owner: false, permissions: "1024" }, "2": { owner: true, permissions: "0" } },
    )).toEqual([{ id: "2", name: "Booth" }]);
  });

  it("accepts Discord CDN emoji and stickers, and builds a real create body", () => {
    expect(discordMedia("https://cdn.discordapp.com/emojis/12345678901234567.webp?size=48")).toEqual({
      kind: "emoji",
      id: "12345678901234567",
      animated: false,
    });
    expect(discordMedia("https://cdn.discordapp.com/stickers/12345678901234567.gif")).toEqual({
      kind: "sticker",
      id: "12345678901234567",
      animated: true,
    });
    expect(discordMedia("https://example.com/emojis/12345678901234567.png")).toBeNull();
    expect(emojiName("Wave!")).toBe("wave");
    const body = emojiCloneBody("Wave", new Uint8Array([1, 2, 3]), false);
    expect(body).toEqual({ name: "wave", image: "data:image/png;base64,AQID" });
    expect(emojiCloneBody("x", new Uint8Array([1]), false)).toEqual({ error: "That emoji needs a name of 2 to 32 letters." });
    const sticker = stickerCloneRequest("12345678901234567", "wave", new Uint8Array([1]), true);
    expect("request" in sticker && sticker.request.op).toBe("create_sticker");
  });

  it("declares the clone hook and does not call the network itself", () => {
    const source = readFileSync("plugins/emote-cloner.js", "utf8");
    expect(source).not.toMatch(/fetch\s*\(|discord\.com\/api|Authorization|\btoken\b/i);
    const plugin = describePlugin(source, "emote-cloner");
    expect(plugin.hooks.emoteClone).toBe(true);
  });
});
