import { queueSend, type ScheduledSend } from "./schedule";

/** In-memory sends. Nothing here is written to disk, so closing Lark drops the queue. */

export function dropDue(list: readonly ScheduledSend[], now: number): ScheduledSend[] {
  return list.filter((item) => item.sendAt > now);
}

export function presetLead(preset: number): number {
  if (preset === 60) return 60 * 60_000;
  if (preset === 1440) return 24 * 60 * 60_000;
  return 15 * 60_000;
}

/** Only a draft the user just wrote can be queued. */
export function queueDraft(
  list: readonly ScheduledSend[],
  draft: { channelId: string; content: string; sendAt: number },
  now: number,
) {
  return queueSend(list, draft, now);
}
