export interface PluginMessage {
  id: string;
  content: string;
  authorName: string;
  mentionsMe: boolean;
  kind: string;
  highlights: string[];
  badges: string[];
  hidden?: boolean;
}

export interface PluginSource {
  id: string;
  source: string;
  name: string;
  description: string;
}

export function pluginMeta(source: string, fallbackId: string): { name: string; description: string } {
  const name = /@lark\s+name:\s*(.+)/.exec(source)?.[1]?.trim();
  const description = /@lark\s+description:\s*(.+)/.exec(source)?.[1]?.trim();
  return { name: name || fallbackId, description: description || "" };
}

export function applyPlugins(message: PluginMessage, plugins: PluginSource[]): PluginMessage | null {
  let current: PluginMessage | null = {
    ...message,
    highlights: [...message.highlights],
    badges: [...message.badges],
  };
  for (const plugin of plugins) {
    if (!current) return null;
    current = runPlugin(plugin.source, current);
  }
  return current;
}

export function runPlugin(source: string, message: PluginMessage): PluginMessage | null {
  try {
    const fn = new Function(
      "message",
      "api",
      `"use strict";
       ${source}
       if (typeof onMessage !== "function") return message;
       return onMessage(message, api);`,
    ) as (message: PluginMessage, api: PluginApi) => unknown;
    const draft: PluginMessage = {
      ...message,
      highlights: [...message.highlights],
      badges: [...message.badges],
    };
    const api: PluginApi = {
      highlight(target, kind) {
        pushTag(target.highlights, kind);
      },
      badge(target, kind) {
        pushTag(target.badges, kind);
      },
    };
    return sanitizeResult(draft, fn(draft, api));
  } catch {
    return message;
  }
}

interface PluginApi {
  highlight(message: PluginMessage, kind: string): void;
  badge(message: PluginMessage, kind: string): void;
}

function pushTag(list: string[], kind: string) {
  if (typeof kind !== "string") return;
  const clean = kind.trim().slice(0, 32);
  if (!clean || list.includes(clean) || list.length >= 8) return;
  list.push(clean);
}

function sanitizeResult(original: PluginMessage, result: unknown): PluginMessage | null {
  if (result === null) return null;
  if (!result || typeof result !== "object") return original;
  const record = result as Partial<PluginMessage>;
  if (record.hidden) return null;
  return {
    id: original.id,
    content: typeof record.content === "string" ? record.content : original.content,
    authorName: typeof record.authorName === "string" ? record.authorName : original.authorName,
    mentionsMe: typeof record.mentionsMe === "boolean" ? record.mentionsMe : original.mentionsMe,
    kind: typeof record.kind === "string" ? record.kind : original.kind,
    highlights: stringList(record.highlights, original.highlights),
    badges: stringList(record.badges, original.badges),
  };
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string").slice(0, 8);
}
