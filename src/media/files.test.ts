import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { downloadName, nameFromUrl, offerDownload, originalImageUrl, originalLabel } from "./files";

const signed = "https://media.discordapp.net/attachments/42/9/frame.png?ex=6610abcd&is=65feabcd&hm=deadbeef&width=400&height=225";

describe("voice message download", () => {
  it("offers a download for voice messages, and for every file when asked", () => {
    expect(offerDownload("audio", "voice-message.ogg", "voice")).toBe(true);
    expect(offerDownload("file", "notes.pdf", "voice")).toBe(false);
    expect(offerDownload("file", "voice-message.ogg", "voice")).toBe(true);
    expect(offerDownload("image", "frame.png", "all")).toBe(true);
    expect(offerDownload("video", "clip.mp4", "all")).toBe(true);
    expect(offerDownload("file", "notes.pdf", "all")).toBe(true);
    expect(downloadName("  voice/message.ogg  ", "file")).toBe("voice message.ogg");
    expect(downloadName("   ", "file")).toBe("file");
  });

  it("declares the download hook and marks messages", () => {
    const source = readFileSync("plugins/voice-download.js", "utf8");
    const plugin = describePlugin(source, "voice-download");
    expect(plugin.hooks.voiceDownload).toBe(true);
    const view = plugin.run(
      {
        id: "1",
        content: "hello",
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
    expect(view?.effects).toEqual(["voice-download"]);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b/i);
  });
});

describe("view original image", () => {
  it("drops the preview size and keeps the signed query", () => {
    const original = originalImageUrl(signed);
    expect(original).toContain("media.discordapp.net/attachments/42/9/frame.png");
    expect(original).toContain("ex=6610abcd");
    expect(original).toContain("hm=deadbeef");
    expect(original).not.toContain("width=");
    expect(original).not.toContain("height=");
    expect(originalImageUrl("https://cdn.discordapp.com/attachments/1/a.jpg")).toBe("https://cdn.discordapp.com/attachments/1/a.jpg");
    expect(originalImageUrl("https://example.com/photo.webp?width=80")).toBe("https://example.com/photo.webp");
    expect(originalImageUrl("javascript:alert(1)")).toBeNull();
    expect(originalImageUrl("https://example.com/notes.pdf")).toBeNull();
    expect(nameFromUrl(signed, "image")).toBe("frame.png");
    expect(originalLabel("both")).toBe("Original");
    expect(originalLabel("open")).toBe("Full size");
    expect(originalLabel("download")).toBe("Download");
  });

  it("declares the original image hook", () => {
    const plugin = describePlugin(readFileSync("plugins/original-image.js", "utf8"), "original-image");
    expect(plugin.name).toBe("View Original Image");
    expect(plugin.hooks.originalImage).toBe(true);
  });
});
