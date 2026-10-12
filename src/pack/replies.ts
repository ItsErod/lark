export interface ReplyTemplate {
  id: string;
  label: string;
  body: string;
}

const MAX = 30;

export function addTemplate(list: readonly ReplyTemplate[], label: string, body: string, now = Date.now()): ReplyTemplate[] {
  const name = label.trim().slice(0, 40);
  const text = body.trim().slice(0, 500);
  if (!name || !text) return list as ReplyTemplate[];
  const id = `r${now.toString(36)}`.slice(0, 20);
  return [...list.filter((item) => item.id !== id), { id, label: name, body: text }].slice(-MAX);
}

export function removeTemplate(list: readonly ReplyTemplate[], id: string): ReplyTemplate[] {
  return list.filter((item) => item.id !== id);
}

export function insertTemplate(draft: string, start: number, end: number, body: string): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, draft.length));
  const to = Math.max(from, Math.min(end, draft.length));
  const chunk = body.trim().slice(0, 500);
  const text = `${draft.slice(0, from)}${chunk}${draft.slice(to)}`.slice(0, 2000);
  return { text, caret: Math.min(text.length, from + chunk.length) };
}

export function sanitizeTemplates(value: unknown): ReplyTemplate[] {
  if (!Array.isArray(value)) return [];
  const out: ReplyTemplate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<ReplyTemplate>;
    if (typeof record.id !== "string" || typeof record.label !== "string" || typeof record.body !== "string") continue;
    const id = record.id.trim().slice(0, 20);
    const label = record.label.trim().slice(0, 40);
    const body = record.body.trim().slice(0, 500);
    if (!id || !label || !body || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, body });
    if (out.length >= MAX) break;
  }
  return out;
}
