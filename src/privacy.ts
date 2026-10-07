import type { Block, Inline } from "./render/content";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN = /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,})\b/g;

export const EMAIL_HIDDEN = "[email hidden]";
export const TOKEN_HIDDEN = "[token hidden]";

/** Manual streamer mode, or the auto option while a share or clip buffer is recording. */
export function streamerActive(manual: boolean, auto: boolean, capturing: boolean): boolean {
  return manual || (auto && capturing);
}

export function redactSensitive(input: string): string {
  return input.replace(EMAIL, EMAIL_HIDDEN).replace(TOKEN, TOKEN_HIDDEN);
}

/** Last-line preview under a DM. Streamer mode drops it. */
export function dmPreview(content: string, streamer: boolean, limit = 80): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text || streamer) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1))}…`;
}

/** Account id and other fields that should disappear entirely while streaming. */
export function personalLine(value: string, streamer: boolean): string {
  if (!streamer || !value) return value;
  return "Hidden";
}

export function redactBlocks(blocks: readonly Block[]): Block[] {
  return blocks.map(redactBlock);
}

function redactBlock(block: Block): Block {
  switch (block.t) {
    case "p":
    case "h":
    case "sub":
      return { ...block, c: block.c.map(redactInline) };
    case "quote":
      return { ...block, c: redactBlocks(block.c) };
    case "pre":
      return { ...block, v: redactSensitive(block.v) };
    case "ul":
    case "ol":
      return { ...block, items: block.items.map((item) => item.map(redactInline)) };
    default:
      return block;
  }
}

function redactInline(node: Inline): Inline {
  switch (node.t) {
    case "text":
    case "code":
      return { ...node, v: redactSensitive(node.v) };
    case "link":
      return { ...node, label: redactSensitive(node.label) };
    case "strong":
    case "em":
    case "u":
    case "s":
    case "spoiler":
      return { ...node, c: node.c.map(redactInline) };
    default:
      return node;
  }
}
