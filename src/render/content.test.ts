import { describe, expect, it } from "vitest";
import { attachmentKind, attachmentMediaUrl, emojiCdnUrl, hasAttachmentExpiry, mediaBox, parseContent, safeMediaUrl, type RenderContext } from "./content";

const ctx: RenderContext = {
  users: { "42": "Ethan", "7": "Maya" },
  roles: { "3": "Design" },
  channels: { "8": "design-crit" },
  meId: "42",
};

function textOf(input: string): string {
  const { blocks } = parseContent(input, ctx);
  return blocks
    .map((block) => {
      if (block.t === "pre") return block.v;
      if (block.t === "quote") return "quote";
      if (block.t === "ul" || block.t === "ol") return block.items.map((item) => inlines(item)).join(",");
      return inlines(block.c);
    })
    .join("|");
}

function inlines(nodes: { t: string; v?: string; c?: { t: string; v?: string }[]; label?: string }[]): string {
  return nodes
    .map((node) => {
      if (node.t === "text" || node.t === "code") return node.v ?? "";
      if (node.t === "br") return "\n";
      if (node.t === "mention" || node.t === "link") return node.label ?? "";
      if (node.c) return inlines(node.c);
      return "";
    })
    .join("");
}

describe("message rendering", () => {
  it("keeps plain text and html as text", () => {
    expect(textOf("hello")).toBe("hello");
    const parsed = parseContent("<script>alert(1)</script>", ctx);
    expect(parsed.blocks[0].t).toBe("p");
    if (parsed.blocks[0].t === "p") {
      expect(parsed.blocks[0].c).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
    }
  });

  it("parses emphasis, code, spoilers, quotes, and fences", () => {
    const bold = parseContent("hello **world**", ctx);
    expect(bold.blocks[0]).toMatchObject({ t: "p", c: [{ t: "text", v: "hello " }, { t: "strong", c: [{ t: "text", v: "world" }] }] });
    expect(parseContent("a *b* c", ctx).blocks[0]).toMatchObject({
      c: [{ t: "text", v: "a " }, { t: "em" }, { t: "text", v: " c" }],
    });
    expect(parseContent("a __b__ c", ctx).blocks[0]).toMatchObject({ c: [{ t: "text", v: "a " }, { t: "u" }, { t: "text", v: " c" }] });
    expect(parseContent("a ~~b~~ c", ctx).blocks[0]).toMatchObject({ c: [{ t: "text", v: "a " }, { t: "s" }, { t: "text", v: " c" }] });
    const code = parseContent("use `**not bold**` please", ctx);
    if (code.blocks[0].t === "p") {
      expect(code.blocks[0].c[1]).toEqual({ t: "code", v: "**not bold**" });
    }
    const fence = parseContent("```ts\nconst x = 1;\n```", ctx);
    expect(fence.blocks[0]).toEqual({ t: "pre", lang: "ts", v: "const x = 1;" });
    const quote = parseContent("> quoted\n> still", ctx);
    expect(quote.blocks[0].t).toBe("quote");
    const spoiler = parseContent("||secret||", ctx);
    expect(spoiler.blocks[0]).toMatchObject({ c: [{ t: "spoiler" }] });
    expect(textOf("snake_case_name")).toBe("snake_case_name");
    expect(textOf("**hello")).toBe("**hello");
  });

  it("parses headers, lists, subtext, masked links, and multiline quotes", () => {
    const header = parseContent("# Title\n## Next", ctx);
    expect(header.blocks[0]).toMatchObject({ t: "h", level: 1 });
    expect(header.blocks[1]).toMatchObject({ t: "h", level: 2 });
    expect(textOf("#not a header")).toBe("#not a header");
    const list = parseContent("- one\n- **two**\n\n1. three", ctx);
    expect(list.blocks[0]).toMatchObject({ t: "ul" });
    expect(list.blocks[1]).toMatchObject({ t: "ol" });
    if (list.blocks[0].t === "ul") expect(list.blocks[0].items[1][0]).toMatchObject({ t: "strong" });
    expect(parseContent("-# aside", ctx).blocks[0]).toMatchObject({ t: "sub" });
    const masked = parseContent("see [docs](https://example.com/a).", ctx);
    if (masked.blocks[0].t === "p") {
      expect(masked.blocks[0].c[1]).toEqual({ t: "link", href: "https://example.com/a", label: "docs" });
    }
    expect(textOf("[click](javascript:alert(1))")).toContain("[click]");
    const block = parseContent(">>> one\ntwo", ctx);
    expect(block.blocks[0].t).toBe("quote");
    expect(textOf("*italic*")).toContain("italic");
  });

  it("resolves mentions, emoji, and links", () => {
    const me = parseContent("hey <@42>", ctx);
    expect(me.mentionsMe).toBe(true);
    if (me.blocks[0].t === "p") {
      expect(me.blocks[0].c[1]).toMatchObject({ t: "mention", label: "@Ethan", me: true });
    }
    const unknown = parseContent("<@99>", ctx);
    if (unknown.blocks[0].t === "p") expect(unknown.blocks[0].c[0]).toMatchObject({ label: "@someone" });
    const channel = parseContent("see <#8>", ctx);
    if (channel.blocks[0].t === "p") expect(channel.blocks[0].c[1]).toMatchObject({ label: "#design-crit" });
    const role = parseContent("<@&3>", ctx);
    if (role.blocks[0].t === "p") expect(role.blocks[0].c[0]).toMatchObject({ label: "@Design" });
    const emoji = parseContent("<:lark:100000000000000099>", ctx);
    if (emoji.blocks[0].t === "p") expect(emoji.blocks[0].c[0]).toMatchObject({ t: "emoji", name: "lark", animated: false });
    const animated = parseContent("<a:wave:100000000000000066>", ctx);
    if (animated.blocks[0].t === "p") expect(animated.blocks[0].c[0]).toMatchObject({ animated: true, name: "wave" });
    const link = parseContent("see https://example.com/a.", ctx);
    if (link.blocks[0].t === "p") {
      expect(link.blocks[0].c[1]).toEqual({ t: "link", href: "https://example.com/a", label: "https://example.com/a" });
    }
    expect(parseContent("@everyone", ctx).mentionsMe).toBe(true);
  });

  it("classifies attachments and refuses unexpected media hosts", () => {
    expect(attachmentKind({ name: "frame.png", contentType: "image/png" })).toBe("image");
    expect(attachmentKind({ name: "notes.pdf", contentType: "application/pdf" })).toBe("file");
    expect(safeMediaUrl("/media/frame.svg")).toBe("/media/frame.svg");
    expect(safeMediaUrl("/media/../secret.svg")).toBeNull();
    expect(safeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(safeMediaUrl("https://evil.example/a.png")).toBeNull();
    expect(safeMediaUrl("https://cdn.discordapp.com/attachments/1/2/a.png")).toContain("cdn.discordapp.com");
    expect(safeMediaUrl("https://media.tenor.com/clip.mp4")).toContain("media.tenor.com");
    expect(safeMediaUrl("https://images-ext-1.discordapp.net/external/x.gif")).toContain("images-ext-1.discordapp.net");
    const signedCdn = "https://cdn.discordapp.com/attachments/42/9/image.png?ex=6610abcd&is=65feabcd&hm=deadbeef";
    const signedProxy = "https://media.discordapp.net/attachments/42/9/image.png?ex=6610abcd&is=65feabcd&hm=deadbeef";
    expect(hasAttachmentExpiry(signedCdn)).toBe(true);
    expect(attachmentMediaUrl("https://cdn.discordapp.com/attachments/42/9/image.png", signedProxy)).toBe(signedProxy);
    expect(attachmentMediaUrl(signedCdn, signedProxy)).toContain("ex=6610abcd");
    expect(attachmentMediaUrl(signedCdn, signedProxy)).toContain("hm=deadbeef");
    expect(attachmentMediaUrl(signedCdn, "https://evil.example/image.png")).toBe(signedCdn);
    expect(attachmentMediaUrl("/media/frame.svg", null)).toBe("/media/frame.svg");
    expect(mediaBox(800, 480).height).toBe(252);
    expect(mediaBox(800, 480).width).toBe(420);
    expect(mediaBox(undefined, undefined)).toEqual({ reserved: false, width: 320, height: 180 });
    expect(attachmentKind({ name: "clip.mp4", contentType: "video/mp4" })).toBe("video");
    expect(attachmentKind({ name: "voice.ogg", contentType: "audio/ogg" })).toBe("audio");
    expect(emojiCdnUrl("100000000000000099", false)).toContain("/emojis/100000000000000099.webp");
    expect(emojiCdnUrl("../x", false)).toBeNull();
  });
});
