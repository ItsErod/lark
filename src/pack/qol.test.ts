import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { messageMarkdown } from "./markdown";
import { addTemplate, insertTemplate, removeTemplate, sanitizeTemplates } from "./replies";
import { sanitizePack } from "./state";
import { nextZoom } from "./zoom";

describe("composer and message quality of life", () => {
  it("saves a reply and inserts it at the caret", () => {
    const saved = addTemplate([], "  Thanks  ", "  On it.  ", 36);
    expect(saved).toEqual([{ id: "r10", label: "Thanks", body: "On it." }]);
    expect(removeTemplate(saved, "r10")).toEqual([]);
    expect(insertTemplate("hello ", 6, 6, "On it.")).toEqual({ text: "hello On it.", caret: 12 });
    expect(sanitizeTemplates([{ id: "a", label: "Hi", body: "there" }, { id: "a", label: "x", body: "y" }])).toHaveLength(1);
  });

  it("copies markdown with or without the author line", () => {
    expect(messageMarkdown({ authorName: "Maya", timestamp: "2026-10-06T15:00:00.000Z", content: "hello" }, false)).toBe("hello");
    expect(messageMarkdown({ authorName: "Maya", timestamp: "2026-10-06T15:00:00.000Z", content: "hello" }, true)).toBe("**Maya** (2026-10-06T15:00:00.000Z)\n\nhello");
  });

  it("steps the image zoom and stops at the chosen max", () => {
    expect(nextZoom(1, 1, 2)).toBe(1.5);
    expect(nextZoom(1.5, 1, 2)).toBe(2);
    expect(nextZoom(2, 1, 2)).toBe(2);
    expect(nextZoom(2, -1, 3)).toBe(1.5);
    expect(nextZoom(1, -1, 4)).toBe(1);
  });

  it("declares the three hooks and their options", () => {
    expect(describePlugin(readFileSync("store/plugins/quick-replies/plugin.js", "utf8"), "quick-replies").hooks.quickReply).toBe(true);
    expect(describePlugin(readFileSync("store/plugins/copy-markdown/plugin.js", "utf8"), "copy-markdown").hooks.copyMarkdown).toBe(true);
    expect(describePlugin(readFileSync("store/plugins/image-zoom/plugin.js", "utf8"), "image-zoom").hooks.imageZoom).toBe(true);
    const pack = sanitizePack({ copyMeta: true, zoomMax: 4, templates: [{ id: "a", label: "Hi", body: "there" }] });
    expect(pack.copyMeta).toBe(true);
    expect(pack.zoomMax).toBe(4);
    expect(pack.templates).toEqual([{ id: "a", label: "Hi", body: "there" }]);
    expect(sanitizePack({ zoomMax: 9 }).zoomMax).toBe(3);
  });
});
