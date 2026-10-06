export interface MentionQuery {
  kind: "@" | "#";
  query: string;
  start: number;
}

export interface MentionHit {
  token: string;
  label: string;
  hint: string;
}

export interface MentionContext {
  users: Record<string, string>;
  roles: Record<string, string>;
  channels: Record<string, string>;
}

export function mentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, Math.max(0, caret));
  const match = /(^|[\s\n])([@#])([a-zA-Z0-9_.-]{0,32})$/.exec(before);
  if (!match) return null;
  return { kind: match[2] as "@" | "#", query: match[3], start: caret - match[3].length - 1 };
}

export function mentionHits(query: MentionQuery, ctx: MentionContext, limit = 8): MentionHit[] {
  const needle = query.query.toLowerCase();
  const hits: MentionHit[] = [];
  const take = (name: string) => !needle || name.toLowerCase().includes(needle);
  if (query.kind === "#") {
    for (const [id, name] of Object.entries(ctx.channels)) {
      if (!take(name)) continue;
      hits.push({ token: `<#${id}>`, label: `#${name}`, hint: "Channel" });
      if (hits.length >= limit) break;
    }
    return hits;
  }
  for (const [id, name] of Object.entries(ctx.users)) {
    if (!take(name)) continue;
    hits.push({ token: `<@${id}>`, label: `@${name}`, hint: "User" });
    if (hits.length >= limit) return hits;
  }
  for (const [id, name] of Object.entries(ctx.roles)) {
    if (!take(name)) continue;
    hits.push({ token: `<@&${id}>`, label: `@${name}`, hint: "Role" });
    if (hits.length >= limit) return hits;
  }
  if (hits.length < limit && (!needle || "everyone".startsWith(needle))) {
    hits.push({ token: "@everyone", label: "@everyone", hint: "Notify everyone" });
  }
  if (hits.length < limit && (!needle || "here".startsWith(needle))) {
    hits.push({ token: "@here", label: "@here", hint: "Notify online" });
  }
  return hits.slice(0, limit);
}

export function applyMention(text: string, start: number, caret: number, token: string): { text: string; caret: number } {
  const next = `${text.slice(0, start)}${token} ${text.slice(caret)}`;
  const pos = start + token.length + 1;
  return { text: next, caret: pos };
}

/** Notification and reply text with names instead of raw mention tokens. */
export function plainPreview(content: string, ctx: MentionContext, limit = 140): string {
  const text = content
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${ctx.users[id] ?? "someone"}`)
    .replace(/<@&(\d+)>/g, (_, id: string) => `@${ctx.roles[id] ?? "role"}`)
    .replace(/<#(\d+)>/g, (_, id: string) => `#${ctx.channels[id] ?? "channel"}`)
    .replace(/<a?:([a-zA-Z0-9_]{2,32}):\d+>/g, (_, name: string) => `:${name}:`)
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  if (chars.length <= limit) return text;
  return `${chars.slice(0, limit).join("")}…`;
}
