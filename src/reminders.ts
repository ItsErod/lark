export interface Reminder {
  id: string;
  messageId: string;
  channelId: string;
  authorName: string;
  excerpt: string;
  remindAt: number;
}

export const MAX_REMINDERS = 50;
export const MIN_LEAD_MS = 60_000;
export const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

export function addReminder(
  list: readonly Reminder[],
  draft: { messageId: string; channelId: string; authorName: string; excerpt: string; remindAt: number },
  now: number,
): { ok: true; list: Reminder[] } | { ok: false; error: string } {
  if (!draft.channelId || !draft.messageId) return { ok: false, error: "That message can't take a reminder." };
  if (list.some((item) => item.messageId === draft.messageId && item.channelId === draft.channelId)) {
    return { ok: false, error: "That message already has a reminder." };
  }
  if (list.length >= MAX_REMINDERS) return { ok: false, error: "Fifty reminders is the cap." };
  const lead = draft.remindAt - now;
  if (!Number.isFinite(lead) || lead < MIN_LEAD_MS) return { ok: false, error: "Pick a time at least a minute from now." };
  if (lead > MAX_LEAD_MS) return { ok: false, error: "Lark only holds a reminder for 30 days." };
  const excerpt = draft.excerpt.replace(/\s+/g, " ").trim().slice(0, 140);
  const item: Reminder = {
    id: `remind-${now.toString(36)}-${list.length}`,
    messageId: draft.messageId,
    channelId: draft.channelId,
    authorName: draft.authorName.trim().slice(0, 80) || "Someone",
    excerpt,
    remindAt: draft.remindAt,
  };
  return { ok: true, list: [...list, item].sort((a, b) => a.remindAt - b.remindAt) };
}

export function cancelReminder(list: readonly Reminder[], id: string): Reminder[] {
  return list.filter((item) => item.id !== id);
}

export function reminderFor(list: readonly Reminder[], channelId: string, messageId: string): Reminder | undefined {
  return list.find((item) => item.channelId === channelId && item.messageId === messageId);
}

/** Label for the message menu. The reminder list itself stays local. */
export function reminderMenuLabel(reminded: boolean): string {
  return reminded ? "Remove Reminder" : "Create Reminder";
}

/** Every reminder that is due, so a closed app can catch up without dropping one. */
export function takeDueReminders(list: readonly Reminder[], now: number): { due: Reminder[]; pending: Reminder[] } {
  const due = list.filter((item) => item.remindAt <= now).sort((a, b) => a.remindAt - b.remindAt);
  const pending = list.filter((item) => item.remindAt > now);
  return { due, pending };
}

export function reminderPresets(now: number): { label: string; at: number }[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return [
    { label: "15 minutes", at: now + 15 * 60_000 },
    { label: "1 hour", at: now + 60 * 60_000 },
    { label: "3 hours", at: now + 3 * 60 * 60_000 },
    { label: "Tomorrow 9:00", at: tomorrow.getTime() },
  ];
}

export function sanitizeReminders(input: unknown): Reminder[] {
  if (!Array.isArray(input)) return [];
  const out: Reminder[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Reminder>;
    if (typeof raw.id !== "string" || typeof raw.messageId !== "string" || typeof raw.channelId !== "string") continue;
    if (!/^\d{5,22}$/.test(raw.messageId) || !/^\d{5,22}$/.test(raw.channelId)) continue;
    if (typeof raw.remindAt !== "number" || !Number.isFinite(raw.remindAt)) continue;
    const authorName = typeof raw.authorName === "string" ? raw.authorName.trim().slice(0, 80) : "Someone";
    const excerpt = typeof raw.excerpt === "string" ? raw.excerpt.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    out.push({
      id: raw.id.slice(0, 80),
      messageId: raw.messageId,
      channelId: raw.channelId,
      authorName: authorName || "Someone",
      excerpt,
      remindAt: raw.remindAt,
    });
    if (out.length >= MAX_REMINDERS) break;
  }
  return out.sort((a, b) => a.remindAt - b.remindAt);
}
