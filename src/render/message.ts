import { keywordHits } from "../keywords";
import { applyPlugins, describePlugin, type PluginApplyContext, type PluginSource } from "../plugins";
import type { RawEmbed, RawMessage } from "../types";
import { attachmentKind, attachmentMediaUrl, parseContent, safeMediaUrl, type Block, type RenderContext } from "./content";

export interface ViewAttachment {
  id: string;
  name: string;
  url: string | null;
  kind: "image" | "video" | "audio" | "file";
  bytes: number;
  width?: number;
  height?: number;
}

export interface ViewEmbed {
  color: string | null;
  author: string | null;
  title: string | null;
  url: string | null;
  description: Block[];
  fields: { name: string; value: Block[]; inline: boolean }[];
  footer: string | null;
  image: string | null;
  thumbnail: string | null;
  video: string | null;
  provider: string | null;
  imageWidth?: number;
  imageHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
}

export interface ViewReaction {
  emoji: string;
  emojiId: string | null;
  animated: boolean;
  count: number;
  me: boolean;
}

export interface ViewMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorBot: boolean;
  authorAvatar: string | null;
  timestamp: string;
  edited: boolean;
  blocks: Block[];
  raw: string;
  reply: { id: string; authorName: string; preview: string } | null;
  attachments: ViewAttachment[];
  embeds: ViewEmbed[];
  reactions: ViewReaction[];
  mentionsMe: boolean;
  highlights: string[];
  badges: string[];
  kind: string;
  pending: boolean;
  failed: boolean;
  collapsed: boolean;
  stickers: { name: string; url: string | null }[];
  thread: { id: string; name: string; count: number } | null;
  effects: string[];
}

export function buildViewMessage(
  raw: RawMessage,
  ctx: RenderContext,
  plugins: PluginSource[],
  keywords: string[] = [],
  extra: PluginApplyContext & { displayContent?: string } = {},
): ViewMessage | null {
  const mentionsMe = Boolean(raw.mentionEveryone || raw.mentionIds?.includes(ctx.meId));
  const transformed = applyPlugins(
    {
      id: raw.id,
      content: raw.content,
      authorName: raw.authorName,
      authorId: raw.authorId,
      timestamp: raw.timestamp,
      mentionsMe,
      kind: raw.kind ?? "default",
      highlights: [],
      badges: [],
      effects: [],
      edited: Boolean(raw.edited),
      channelId: raw.channelId,
    },
    plugins,
    extra,
  );
  if (!transformed) return null;
  const shown = extra.displayContent ?? transformed.content;
  const parsed = parseContent(shown, ctx);
  return {
    id: raw.id,
    channelId: raw.channelId,
    authorId: raw.authorId,
    authorName: transformed.authorName,
    authorBot: Boolean(raw.authorBot),
    authorAvatar: raw.authorAvatar ? safeMediaUrl(raw.authorAvatar) : null,
    timestamp: raw.timestamp,
    edited: Boolean(raw.edited),
    blocks: parsed.blocks,
    raw: shown,
    reply: raw.reply ?? null,
    attachments: (raw.attachments ?? []).map(toAttachment),
    embeds: (raw.embeds ?? []).map((embed) => toEmbed(embed, ctx)),
    reactions: (raw.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      emojiId: reaction.emojiId ?? null,
      animated: Boolean(reaction.animated),
      count: reaction.count,
      me: reaction.me,
    })),
    mentionsMe: transformed.mentionsMe || parsed.mentionsMe,
    highlights: keywordHits(transformed.content, keywords).length ? [...transformed.highlights, "keyword"] : transformed.highlights,
    badges: extra.displayContent && !transformed.badges.includes("translated") ? [...transformed.badges, "translated"] : transformed.badges,
    kind: transformed.kind,
    pending: false,
    failed: false,
    collapsed: Boolean(transformed.collapsed),
    stickers: (raw.stickers ?? []).map((sticker) => ({ name: sticker.name, url: sticker.url ? safeMediaUrl(sticker.url) : null })),
    thread: raw.thread ?? null,
    effects: transformed.effects,
  };
}

function toAttachment(att: NonNullable<RawMessage["attachments"]>[number]): ViewAttachment {
  const kind = attachmentKind({ name: att.name, contentType: att.contentType });
  const url = attachmentMediaUrl(att.url, att.proxyUrl);
  return {
    id: att.id,
    name: att.name,
    url,
    kind: url ? kind : "file",
    bytes: att.size ?? 0,
    width: att.width,
    height: att.height,
  };
}

function toEmbed(embed: RawEmbed, ctx: RenderContext): ViewEmbed {
  const description = embed.description ? parseContent(embed.description, ctx).blocks : [];
  return {
    color: embed.color ?? null,
    author: embed.author ?? null,
    title: embed.title ?? null,
    url: embed.url && safeLink(embed.url) ? embed.url : null,
    description,
    fields: (embed.fields ?? []).map((field) => ({
      name: field.name,
      value: parseContent(field.value, ctx).blocks,
      inline: Boolean(field.inline),
    })),
    footer: embed.footer ?? null,
    image: embed.image ? safeMediaUrl(embed.image) : null,
    thumbnail: embed.thumbnail ? safeMediaUrl(embed.thumbnail) : null,
    video: embed.video ? safeMediaUrl(embed.video) : null,
    provider: embed.provider ?? null,
    imageWidth: positive(embed.imageWidth),
    imageHeight: positive(embed.imageHeight),
    videoWidth: positive(embed.videoWidth),
    videoHeight: positive(embed.videoHeight),
  };
}

function positive(value: number | null | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function safeLink(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

export { describePlugin };
