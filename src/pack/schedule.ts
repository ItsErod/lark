export interface ScheduledSend {
  id: string;
  channelId: string;
  content: string;
  sendAt: number;
  attempts: number;
}

export const MAX_SCHEDULED = 20;
export const MIN_LEAD_MS = 15_000;
export const MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 30_000;
const MAX_ATTEMPTS = 3;

export function queueSend(
  list: readonly ScheduledSend[],
  draft: { channelId: string; content: string; sendAt: number },
  now: number,
): { ok: true; list: ScheduledSend[] } | { ok: false; error: string } {
  const content = draft.content.trim();
  if (!draft.channelId) return { ok: false, error: "Open a channel first." };
  if (!content) return { ok: false, error: "Write a message first." };
  if ([...content].length > 2000) return { ok: false, error: "Messages stop at 2,000 characters." };
  if (list.length >= MAX_SCHEDULED) return { ok: false, error: "Twenty scheduled messages is the cap." };
  const lead = draft.sendAt - now;
  if (!Number.isFinite(lead) || lead < MIN_LEAD_MS) return { ok: false, error: "Pick a time at least 15 seconds from now." };
  if (lead > MAX_LEAD_MS) return { ok: false, error: "Lark only holds a message for 7 days." };
  const item: ScheduledSend = {
    id: `later-${now.toString(36)}-${list.length}`,
    channelId: draft.channelId,
    content,
    sendAt: draft.sendAt,
    attempts: 0,
  };
  return { ok: true, list: [...list, item].sort((a, b) => a.sendAt - b.sendAt) };
}

/** One due message per call, so a timer cannot flush the queue in a burst. */
export function takeDue(list: readonly ScheduledSend[], now: number): { due: ScheduledSend | null; rest: ScheduledSend[] } {
  let index = -1;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].sendAt <= now && (index < 0 || list[i].sendAt < list[index].sendAt)) index = i;
  }
  if (index < 0) return { due: null, rest: [...list] };
  return { due: list[index], rest: list.filter((_, i) => i !== index) };
}

export function backoff(item: ScheduledSend, now: number): ScheduledSend | null {
  const attempts = item.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return null;
  return { ...item, attempts, sendAt: now + RETRY_MS };
}

export function cancelSend(list: readonly ScheduledSend[], id: string): ScheduledSend[] {
  return list.filter((item) => item.id !== id);
}
