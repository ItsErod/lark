import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "./message";
import { buildViewMessage } from "./message";
import type { RenderContext } from "./content";
import type { RawMessage } from "../types";

const ctx: RenderContext = {
  users: { "42": "Ethan" },
  roles: {},
  channels: {},
  meId: "42",
};

function raw(partial: Partial<RawMessage>): RawMessage {
  return {
    id: "1",
    channelId: "c",
    authorId: "7",
    authorName: "Maya",
    content: "hello",
    timestamp: "2026-10-06T15:00:00.000Z",
    ...partial,
  };
}

describe("message view", () => {
  it("maps replies, embeds, reactions, and image attachments", () => {
    const view = buildViewMessage(
      raw({
        kind: "reply",
        reply: { id: "9", authorName: "Jonah", preview: "Earlier note" },
        attachments: [
          { id: "a", name: "frame.png", url: "https://cdn.discordapp.com/attachments/1/frame.png", contentType: "image/png", size: 2048, width: 800, height: 480 },
          { id: "b", name: "notes.pdf", url: "https://cdn.discordapp.com/attachments/1/notes.pdf", contentType: "application/pdf", size: 100 },
          { id: "c", name: "evil.png", url: "https://evil.example/x.png", contentType: "image/png" },
        ],
        embeds: [{ title: "Wordmark", description: "Apricot **on** ink", fields: [{ name: "Status", value: "Ready", inline: true }], image: "https://evil.example/p.png" }],
        reactions: [{ emoji: "🔥", count: 2, me: true }],
        mentionIds: ["42"],
        content: "hey <@42>",
      }),
      ctx,
      [],
    );
    expect(view?.reply?.authorName).toBe("Jonah");
    expect(view?.attachments.map((item) => item.kind)).toEqual(["image", "file", "file"]);
    const signed = buildViewMessage(
      raw({
        attachments: [{
          id: "img",
          name: "image.png",
          url: "https://cdn.discordapp.com/attachments/42/9/image.png",
          proxyUrl: "https://media.discordapp.net/attachments/42/9/image.png?ex=6610abcd&is=65feabcd&hm=deadbeef",
          contentType: "image/png",
          width: 640,
          height: 480,
        }],
      }),
      ctx,
      [],
    );
    expect(signed?.attachments[0].url).toContain("media.discordapp.net");
    expect(signed?.attachments[0].url).toContain("ex=6610abcd");
    expect(signed?.attachments[0].kind).toBe("image");
    expect(view?.attachments[2].url).toBeNull();
    expect(view?.embeds[0].fields[0]).toMatchObject({ name: "Status", inline: true });
    expect(view?.embeds[0].description[0]).toMatchObject({ t: "p" });
    expect(view?.embeds[0].image).toBeNull();
    expect(view?.reactions[0]).toMatchObject({ emoji: "🔥", me: true, count: 2 });
    expect(view?.mentionsMe).toBe(true);
  });

  it("runs the sample plugins", () => {
    const highlight = describePlugin(readFileSync("store/plugins/highlight-mentions/plugin.js", "utf8"), "highlight-mentions");
    const code = describePlugin(readFileSync("store/plugins/code-badge/plugin.js", "utf8"), "code-badge");
    const hide = describePlugin(readFileSync("store/plugins/hide-joins/plugin.js", "utf8"), "hide-joins");
    expect(highlight.name).toBe("Highlight mentions");
    const mentioned = buildViewMessage(raw({ mentionIds: ["42"], content: "hey" }), ctx, [highlight]);
    expect(mentioned?.highlights).toContain("mention");
    const fenced = buildViewMessage(raw({ content: "```ts\nconst x = 1;\n```" }), ctx, [code]);
    expect(fenced?.badges).toContain("code");
    expect(fenced?.blocks[0].t).toBe("pre");
    expect(buildViewMessage(raw({ kind: "join", content: "Maya joined" }), ctx, [hide])).toBeNull();
    const quiet = describePlugin(readFileSync("store/plugins/quiet-media/plugin.js", "utf8"), "quiet-media");
    const relative = describePlugin(readFileSync("store/plugins/relative-time/plugin.js", "utf8"), "relative-time");
    const preview = buildViewMessage(raw({ content: "https://example.com/a" }), ctx, [quiet, relative], [], {
      settings: { "quiet-media": { previews: "hide", compact: "off" } },
    });
    expect(preview?.effects).toEqual(["hide-previews", "relative-time"]);
    const translated = buildViewMessage(raw({ content: "hello" }), ctx, [], [], { displayContent: "hola" });
    expect(translated?.raw).toBe("hola");
    expect(translated?.badges).toContain("translated");
    const spoof = describePlugin(
      "function onMessage(message){ message.authorId = 'other'; return message }",
      "spoof",
    );
    const spoiler = buildViewMessage(raw({
      attachments: [{ id: "s", name: "SPOILER_secret.png", url: "https://cdn.discordapp.com/attachments/1/secret.png", contentType: "image/png", size: 10 }],
      messageType: 3,
      callEnded: "2026-10-06T12:05:00.000Z",
      forwarded: { id: "9", authorName: "Jonah", preview: "earlier" },
      pinned: true,
    }), ctx, []);
    expect(spoiler?.attachments[0]).toMatchObject({ name: "secret.png", spoiler: true });
    expect(spoiler?.messageType).toBe(3);
    expect(spoiler?.forwarded?.preview).toBe("earlier");
    expect(spoiler?.pinned).toBe(true);
    expect(buildViewMessage(raw({ authorId: "7" }), ctx, [spoof])?.authorId).toBe("7");
    const throwing = describePlugin("function onMessage() { throw new Error('nope'); }", "boom");
    expect(buildViewMessage(raw({ content: "still here" }), ctx, [throwing])?.raw).toBe("still here");
  });
});
