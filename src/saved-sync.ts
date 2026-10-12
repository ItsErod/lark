import type { Bookmark } from "./pack/bookmarks";
import type { Reminder } from "./reminders";

export type SavedRow = {
  channelId: string;
  messageId: string;
  authorName: string;
  excerpt: string;
  savedAt: number;
  dueAt: string | null;
};

export type SavedUpload = {
  channelId: string;
  messageId: string;
  dueAt: string | null;
};

const snowflake = (id: string) => /^\d{5,22}$/.test(id);

function key(channelId: string, messageId: string): string {
  return `${channelId}:${messageId}`;
}

function text(value: unknown, cap: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";
}

/** Discord's saved-message list, or a gateway row with the same fields. */
export function rowsFromPayload(value: unknown): SavedRow[] {
  if (!value || typeof value !== "object") return [];
  const root = value as Record<string, unknown>;
  const list = Array.isArray(root.results) ? root.results : Array.isArray(value) ? value : [value];
  const out: SavedRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const save = row.save_data && typeof row.save_data === "object"
      ? row.save_data as Record<string, unknown>
      : row.saveData && typeof row.saveData === "object"
        ? row.saveData as Record<string, unknown>
        : row;
    const message = row.message && typeof row.message === "object" ? row.message as Record<string, unknown> : {};
    const channelId = String(save.channel_id ?? save.channelId ?? message.channel_id ?? "");
    const messageId = String(save.message_id ?? save.messageId ?? message.id ?? "");
    if (!snowflake(channelId) || !snowflake(messageId)) continue;
    const author = message.author && typeof message.author === "object" ? message.author as Record<string, unknown> : {};
    const authorName = text(author.global_name ?? author.username ?? save.author_name ?? save.authorName, 80) || "Someone";
    const excerpt = text(message.content ?? save.excerpt, 140);
    const savedAt = Date.parse(String(save.saved_at ?? save.savedAt ?? ""));
    const dueRaw = save.due_at ?? save.dueAt;
    out.push({
      channelId,
      messageId,
      authorName,
      excerpt,
      savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
      dueAt: typeof dueRaw === "string" && dueRaw ? dueRaw : null,
    });
  }
  return out.slice(0, 200);
}

/**
 * Remote saved messages become the account copy. `keep` holds keys that are still
 * only on this device (a first sync, or a write Discord rejected).
 */
export function mergeSaved(
  bookmarks: readonly Bookmark[],
  reminders: readonly Reminder[],
  remote: readonly SavedRow[],
  keep: ReadonlySet<string>,
): { bookmarks: Bookmark[]; reminders: Reminder[]; upload: SavedUpload[] } {
  const remoteKeys = new Set(remote.map((row) => key(row.channelId, row.messageId)));
  const nextBookmarks: Bookmark[] = remote.map((row) => {
    const prev = bookmarks.find((item) => item.channelId === row.channelId && item.messageId === row.messageId);
    return {
      messageId: row.messageId,
      channelId: row.channelId,
      authorName: row.authorName || prev?.authorName || "Someone",
      excerpt: row.excerpt || prev?.excerpt || "",
      savedAt: row.savedAt,
    };
  });
  const nextReminders: Reminder[] = [];
  for (const row of remote) {
    if (!row.dueAt) continue;
    const at = Date.parse(row.dueAt);
    if (!Number.isFinite(at)) continue;
    const prev = reminders.find((item) => item.channelId === row.channelId && item.messageId === row.messageId);
    const bookmark = nextBookmarks.find((item) => item.channelId === row.channelId && item.messageId === row.messageId);
    nextReminders.push({
      id: prev?.id ?? `remind-${row.messageId}`,
      messageId: row.messageId,
      channelId: row.channelId,
      authorName: bookmark?.authorName ?? prev?.authorName ?? "Someone",
      excerpt: bookmark?.excerpt ?? prev?.excerpt ?? "",
      remindAt: at,
    });
  }
  const upload: SavedUpload[] = [];
  const seen = new Set(remoteKeys);
  const consider = [
    ...bookmarks.map((item) => ({ channelId: item.channelId, messageId: item.messageId, dueAt: reminderIso(reminders, item.channelId, item.messageId) })),
    ...reminders.map((item) => ({ channelId: item.channelId, messageId: item.messageId, dueAt: new Date(item.remindAt).toISOString() })),
  ];
  for (const item of consider) {
    const id = key(item.channelId, item.messageId);
    if (!snowflake(item.channelId) || !snowflake(item.messageId) || seen.has(id) || !keep.has(id)) continue;
    seen.add(id);
    const bookmark = bookmarks.find((entry) => entry.channelId === item.channelId && entry.messageId === item.messageId);
    const reminder = reminders.find((entry) => entry.channelId === item.channelId && entry.messageId === item.messageId);
    if (bookmark) nextBookmarks.push(bookmark);
    else if (reminder) {
      nextBookmarks.push({
        messageId: reminder.messageId,
        channelId: reminder.channelId,
        authorName: reminder.authorName,
        excerpt: reminder.excerpt,
        savedAt: Date.now(),
      });
    }
    if (reminder && !nextReminders.some((entry) => entry.channelId === item.channelId && entry.messageId === item.messageId)) {
      nextReminders.push(reminder);
    }
    upload.push({ channelId: item.channelId, messageId: item.messageId, dueAt: reminder ? new Date(reminder.remindAt).toISOString() : item.dueAt });
  }
  nextReminders.sort((a, b) => a.remindAt - b.remindAt);
  return { bookmarks: nextBookmarks.slice(0, 200), reminders: nextReminders.slice(0, 50), upload: upload.slice(0, 200) };
}

function reminderIso(reminders: readonly Reminder[], channelId: string, messageId: string): string | null {
  const found = reminders.find((item) => item.channelId === channelId && item.messageId === messageId);
  return found ? new Date(found.remindAt).toISOString() : null;
}
