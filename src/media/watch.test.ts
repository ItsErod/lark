import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { clipShareKey, newestClip, pipBox, pipStart, youtubeFromEmbed, youtubeId, youtubePlayerUrl } from "./watch";

describe("youtube picture in picture", () => {
  it("reads a video id from watch, short, and embed links", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeFromEmbed({ url: "https://youtu.be/dQw4w9WgXcQ", video: null })).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("javascript:alert(1)")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });

  it("builds the player address only from a checked id", () => {
    expect(youtubePlayerUrl("dQw4w9WgXcQ", true)).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1");
    expect(youtubePlayerUrl("dQw4w9WgXcQ", false)).toContain("mute=0");
    expect(youtubePlayerUrl("not an id", true)).toBeNull();
    expect(pipBox("medium")).toEqual({ width: 480, height: 270 });
    expect(pipBox("small").width).toBe(320);
    expect(pipStart("sound")).toBe("sound");
    expect(pipStart("loud")).toBe("muted");
  });

  it("declares the picture-in-picture hook", () => {
    const source = readFileSync("plugins/youtube-pip.js", "utf8");
    const plugin = describePlugin(source, "youtube-pip");
    expect(plugin.name).toBe("YouTube Picture-in-Picture");
    expect(plugin.hooks.youtubePip).toBe(true);
    const view = plugin.run(
      {
        id: "1",
        content: "https://youtu.be/dQw4w9WgXcQ",
        authorName: "Maya",
        authorId: "7",
        timestamp: "2026-10-06T15:00:00.000Z",
        mentionsMe: false,
        kind: "default",
        highlights: [],
        badges: [],
        effects: [],
      },
      { settings: {}, hiddenAuthors: new Set() },
    );
    expect(view?.effects).toEqual(["youtube-pip"]);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});

describe("quick clip share", () => {
  it("picks the newest saved clip and keeps a known hotkey", () => {
    const latest = newestClip([
      { name: "lark-clip-old.mp4", modifiedMs: 10 },
      { name: "lark-clip-new.mp4", modifiedMs: 40 },
      { name: "lark-clip-mid.mp4", modifiedMs: 20 },
    ]);
    expect(latest?.name).toBe("lark-clip-new.mp4");
    expect(newestClip([])).toBeNull();
    expect(clipShareKey("mod+shift+k")).toBe("mod+shift+k");
    expect(clipShareKey("mod+shift+c")).toBe("mod+shift+x");
  });

  it("declares the clip share hook", () => {
    const source = readFileSync("plugins/clip-share.js", "utf8");
    const plugin = describePlugin(source, "clip-share");
    expect(plugin.hooks.clipShare).toBe(true);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});
