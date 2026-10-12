/** Walk reply parents that are already loaded. Nothing is fetched. */

export interface ChainMessage {
  id: string;
  authorName: string;
  content: string;
  replyId?: string | null;
}

export interface ChainStep {
  id: string;
  authorName: string;
  preview: string;
}

export function replyChain(
  messages: readonly ChainMessage[],
  startId: string,
  limit = 12,
): { steps: ChainStep[]; stopped: "end" | "missing" | "loop" | "cap" } {
  const byId = new Map<string, ChainMessage>();
  for (const message of messages) {
    if (message?.id && !byId.has(message.id)) byId.set(message.id, message);
  }
  const steps: ChainStep[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = startId;
  const cap = Math.min(12, Math.max(1, limit));
  while (id) {
    if (seen.has(id)) return { steps, stopped: "loop" };
    if (steps.length >= cap) return { steps, stopped: "cap" };
    seen.add(id);
    const message = byId.get(id);
    if (!message) return { steps, stopped: "missing" };
    const preview = message.content.replace(/\s+/g, " ").trim().slice(0, 140);
    const author = message.authorName.trim().slice(0, 80);
    steps.push({ id: message.id, authorName: author || "Someone", preview: preview || "Empty message" });
    id = message.replyId || null;
  }
  return { steps, stopped: "end" };
}
