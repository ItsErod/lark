export interface RenderContext {
  users: Record<string, string>;
  roles: Record<string, string>;
  channels: Record<string, string>;
  meId: string;
}

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "u"; c: Inline[] }
  | { t: "s"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "spoiler"; c: Inline[] }
  | { t: "br" }
  | { t: "mention"; kind: "user" | "role" | "channel" | "everyone"; id: string; label: string; me: boolean }
  | { t: "emoji"; name: string; id: string | null; animated: boolean }
  | { t: "link"; href: string; label: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "quote"; c: Block[] }
  | { t: "pre"; lang: string | null; v: string };

export interface ParseResult {
  blocks: Block[];
  mentionsMe: boolean;
}

export function parseContent(input: string, ctx: RenderContext): ParseResult {
  const flag = { me: false };
  const blocks: Block[] = [];
  const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  for (const match of input.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) blocks.push(...parseTextBlocks(input.slice(last, index), ctx, flag));
    const lang = match[1].trim();
    blocks.push({ t: "pre", lang: lang || null, v: match[2].replace(/\n$/, "") });
    last = index + match[0].length;
  }
  if (last < input.length) blocks.push(...parseTextBlocks(input.slice(last), ctx, flag));
  if (!blocks.length) blocks.push({ t: "p", c: [] });
  return { blocks, mentionsMe: flag.me };
}

function parseTextBlocks(text: string, ctx: RenderContext, flag: { me: boolean }): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const body = para.join("\n");
    para = [];
    if (!body) return;
    blocks.push({ t: "p", c: parseInlines(body, ctx, flag) });
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const inner = quote.map((line) => line.replace(/^>\s?/, "")).join("\n");
    quote = [];
    blocks.push({ t: "quote", c: parseTextBlocks(inner, ctx, flag) });
  };
  for (const line of lines) {
    if (line.startsWith(">")) {
      flushPara();
      quote.push(line);
    } else if (line === "") {
      flushQuote();
      flushPara();
    } else {
      flushQuote();
      para.push(line);
    }
  }
  flushQuote();
  flushPara();
  return blocks;
}

function parseInlines(text: string, ctx: RenderContext, flag: { me: boolean }): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  let i = 0;
  const flush = () => {
    if (!plain) return;
    out.push({ t: "text", v: plain });
    plain = "";
  };
  while (i < text.length) {
    if (text[i] === "\n") {
      flush();
      out.push({ t: "br" });
      i += 1;
      continue;
    }
    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const wrapped = tryWrap(text, i, ctx, flag);
    if (wrapped) {
      flush();
      out.push(wrapped.node);
      i = wrapped.next;
      continue;
    }
    const token = tryToken(text, i, ctx, flag);
    if (token) {
      flush();
      out.push(token.node);
      i = token.next;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

function tryWrap(
  text: string,
  i: number,
  ctx: RenderContext,
  flag: { me: boolean },
): { node: Inline; next: number } | null {
  const markers: { m: string; make: (children: Inline[]) => Inline; boundary: boolean }[] = [
    { m: "**", make: (c) => ({ t: "strong", c }), boundary: false },
    { m: "__", make: (c) => ({ t: "u", c }), boundary: false },
    { m: "~~", make: (c) => ({ t: "s", c }), boundary: false },
    { m: "||", make: (c) => ({ t: "spoiler", c }), boundary: false },
    { m: "*", make: (c) => ({ t: "em", c }), boundary: false },
    { m: "_", make: (c) => ({ t: "em", c }), boundary: true },
  ];
  for (const marker of markers) {
    if (!text.startsWith(marker.m, i)) continue;
    if (marker.m === "*" && text.startsWith("**", i)) continue;
    if (marker.m === "_" && text.startsWith("__", i)) continue;
    if (marker.boundary && i > 0 && /[\w]/.test(text[i - 1] ?? "")) continue;
    const start = i + marker.m.length;
    const end = marker.m === "*" ? findSingleStar(text, start) : findCloser(text, start, marker.m);
    if (end < 0) continue;
    const after = end + marker.m.length;
    if (marker.boundary && after < text.length && /[\w]/.test(text[after] ?? "")) continue;
    const inner = text.slice(start, end);
    if (!inner) continue;
    return { node: marker.make(parseInlines(inner, ctx, flag)), next: after };
  }
  return null;
}

function findCloser(text: string, from: number, marker: string): number {
  let i = from;
  while (i < text.length) {
    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (text.startsWith(marker, i)) return i;
    i += 1;
  }
  return -1;
}

function findSingleStar(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (text[i] === "*" && text[i + 1] !== "*") return i;
    i += 1;
  }
  return -1;
}

function tryToken(
  text: string,
  i: number,
  ctx: RenderContext,
  flag: { me: boolean },
): { node: Inline; next: number } | null {
  const rest = text.slice(i);
  let match = /^<@!?(\d+)>/.exec(rest);
  if (match) {
    const id = match[1];
    const me = id === ctx.meId;
    if (me) flag.me = true;
    const name = ctx.users[id];
    return {
      node: { t: "mention", kind: "user", id, label: name ? `@${name}` : "@someone", me },
      next: i + match[0].length,
    };
  }
  match = /^<@&(\d+)>/.exec(rest);
  if (match) {
    const id = match[1];
    return {
      node: { t: "mention", kind: "role", id, label: `@${ctx.roles[id] ?? "role"}`, me: false },
      next: i + match[0].length,
    };
  }
  match = /^<#(\d+)>/.exec(rest);
  if (match) {
    const id = match[1];
    return {
      node: { t: "mention", kind: "channel", id, label: `#${ctx.channels[id] ?? "channel"}`, me: false },
      next: i + match[0].length,
    };
  }
  match = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d+)>/.exec(rest);
  if (match) {
    return {
      node: { t: "emoji", name: match[2], id: match[3], animated: match[1] === "a" },
      next: i + match[0].length,
    };
  }
  match = /^<(https?:\/\/[^>\s]+)>/.exec(rest);
  if (match && isHttp(match[1])) {
    return { node: { t: "link", href: match[1], label: match[1] }, next: i + match[0].length };
  }
  match = /^https?:\/\/[^\s<]+/.exec(rest);
  if (match) {
    const href = trimUrl(match[0]);
    if (isHttp(href)) return { node: { t: "link", href, label: href }, next: i + href.length };
  }
  match = /^@(everyone|here)\b/.exec(rest);
  if (match) {
    flag.me = true;
    return {
      node: { t: "mention", kind: "everyone", id: match[1], label: `@${match[1]}`, me: true },
      next: i + match[0].length,
    };
  }
  return null;
}

function trimUrl(raw: string): string {
  return raw.replace(/[),.;!?]+$/g, "");
}

function isHttp(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

export function emojiCdnUrl(id: string, animated: boolean): string | null {
  if (!/^\d{5,22}$/.test(id)) return null;
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=48`;
}

export function safeMediaUrl(url: string): string | null {
  if (url.startsWith("blob:")) return url;
  if (url.startsWith("/media/") && !url.includes("..") && !url.includes("\\")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "cdn.discordapp.com" || parsed.hostname === "media.discordapp.net") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function attachmentKind(att: { contentType?: string; name: string }): "image" | "file" {
  const type = att.contentType ?? "";
  if (type.startsWith("image/")) return "image";
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(att.name)) return "image";
  return "file";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
