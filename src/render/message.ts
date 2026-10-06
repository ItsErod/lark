import { applyPlugins, pluginMeta, type PluginSource } from "../plugins";
import type { RawEmbed, RawMessage } from "../types";
import { attachmentKind, parseContent, safeMediaUrl, type Block, type RenderContext } from "./content";

export interface ViewAttachment {
  id: string;
  name: string;
  url: string | null;
  kind: "image" | "file";
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
  fields: { name: string; value: string; inline: boolean }[];
  footer: string | null;
  image: string | null;
  thumbnail: string | null;
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
}

export function buildViewMessage(
  raw: RawMessage,
  ctx: RenderContext,
  plugins: PluginSource[],
): ViewMessage | null {
  const mentionsMe = Boolean(raw.mentionEveryone || raw.mentionIds?.includes(ctx.meId));
  const transformed = applyPlugins(
    {
      id: raw.id,
      content: raw.content,
      authorName: raw.authorName,
      mentionsMe,
      kind: raw.kind ?? "default",
      highlights: [],
      badges: [],
    },
    plugins,
  );
  if (!transformed) return null;
  const parsed = parseContent(transformed.content, ctx);
  return {
    id: raw.id,
    channelId: raw.channelId,
    authorId: raw.authorId,
    authorName: transformed.authorName,
    authorBot: Boolean(raw.authorBot),
    timestamp: raw.timestamp,
    edited: Boolean(raw.edited),
    blocks: parsed.blocks,
    raw: transformed.content,
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
    highlights: transformed.highlights,
    badges: transformed.badges,
    kind: transformed.kind,
    pending: false,
    failed: false,
  };
}

function toAttachment(att: NonNullable<RawMessage["attachments"]>[number]): ViewAttachment {
  const kind = attachmentKind({ name: att.name, contentType: att.contentType });
  const url = safeMediaUrl(att.url);
  return {
    id: att.id,
    name: att.name,
    url,
    kind: url && kind === "image" ? "image" : "file",
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
      value: field.value,
      inline: Boolean(field.inline),
    })),
    footer: embed.footer ?? null,
    image: embed.image ? safeMediaUrl(embed.image) : null,
    thumbnail: embed.thumbnail ? safeMediaUrl(embed.thumbnail) : null,
  };
}

function safeLink(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

export function describePlugin(source: string, id: string): PluginSource {
  const meta = pluginMeta(source, id);
  return { id, source, name: meta.name, description: meta.description };
}
