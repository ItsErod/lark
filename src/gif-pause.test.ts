import { describe, expect, it } from "vitest";
import { motionKind, nextMotionAttrs } from "./gif-pause";

describe("gif pause", () => {
  it("holds stickers, gif images, and tenor loops", () => {
    expect(motionKind("https://cdn.discordapp.com/stickers/1.png", "sticker")).toBe("sticker");
    expect(motionKind("https://media.tenor.com/a.gif", "video")).toBe("video");
    expect(motionKind("https://cdn.example/cat.gif?size=128", "image")).toBe("gif");
    expect(motionKind("https://cdn.example/cat.png", "image")).toBe("");
    expect(motionKind("https://cdn.example/clip.mp4", "video")).toBe("");
  });

  it("keeps the url off the element until autoplay is allowed", () => {
    const held = nextMotionAttrs({ src: "cat.gif", lazy: "", paused: "", motion: "gif" }, true);
    expect(held).toEqual({ src: "", lazy: "", paused: "cat.gif" });
    expect(nextMotionAttrs({ ...held, motion: "gif" }, false)).toEqual({ src: "cat.gif", lazy: "", paused: "" });
    expect(nextMotionAttrs({ src: "cat.png", lazy: "", paused: "", motion: "" }, true).src).toBe("cat.png");
  });
});
