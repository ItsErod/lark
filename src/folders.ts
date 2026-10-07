import { layoutRail, normalizeFolder, type GuildFolder } from "./shell";

/** Wait before PATCHing Discord so a burst of drags is one settings write. */
export const FOLDER_SYNC_DELAY_MS = 1_200;

/** One delayed retry after a rejected write. Further edits schedule themselves. */
export const FOLDER_SYNC_RETRY_MS = 8_000;

export const FOLDER_STORAGE_KEY = "lark.guild-folders.v1";

/** Swatches that round-trip through Discord's 24-bit folder color. */
export const FOLDER_COLORS: (string | null)[] = [
  null,
  "#747f8d",
  "#3ba55d",
  "#faa61a",
  "#ed4245",
  "#eb459e",
  "#5865f2",
  "#e2a15a",
];

export type RailDrag = { kind: "guild" | "folder"; id: string };

export type DropIntent =
  | { kind: "before-guild"; guildId: string }
  | { kind: "after-guild"; guildId: string }
  | { kind: "before-folder"; folderId: string }
  | { kind: "after-folder"; folderId: string }
  | { kind: "onto-guild"; guildId: string }
  | { kind: "into-folder"; folderId: string }
  | { kind: "end" };

export interface RailHit {
  role: "guild" | "folder";
  guildId: string | null;
  folderId: string | null;
  top: number;
  bottom: number;
}

export interface StoredGuildFolders {
  folders: GuildFolder[];
  dirty: boolean;
}

type Slot =
  | { kind: "guild"; guildId: string }
  | { kind: "folder"; id: string; name: string | null; color: string | null; guildIds: string[] };

export function foldersKey(folders: GuildFolder[]): string {
  return folders
    .map((folder) => `${folder.id ?? ""}|${folder.name ?? ""}|${folder.color ?? ""}|${folder.guildIds.join(",")}`)
    .join(";");
}

export function folderStructureKey(folders: GuildFolder[]): string {
  return folders.map((folder) => `${folder.id ?? ""}|${folder.guildIds.join(",")}`).join(";");
}

export function parseStoredFolders(raw: string | null): StoredGuildFolders | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { folders?: unknown; dirty?: unknown };
    if (!parsed || !Array.isArray(parsed.folders)) return null;
    const folders = parsed.folders
      .map((folder) => normalizeFolder(folder as Parameters<typeof normalizeFolder>[0]))
      .filter((folder): folder is GuildFolder => Boolean(folder));
    if (!folders.length) return null;
    return { folders, dirty: parsed.dirty === true };
  } catch {
    return null;
  }
}

/** Where a pointer lands. The center of a server combines; the center of a folder receives. */
export function intentFromHit(hits: RailHit[], y: number, drag: RailDrag): DropIntent | null {
  if (!hits.length) return { kind: "end" };
  const first = hits[0];
  const last = hits[hits.length - 1];
  if (y < first.top) return edgeIntent(first, true);
  if (y > last.bottom) return { kind: "end" };
  let best = first;
  let bestDist = Number.POSITIVE_INFINITY;
  let inside = false;
  for (const hit of hits) {
    if (y >= hit.top && y <= hit.bottom) {
      best = hit;
      inside = true;
      break;
    }
    const dist = y < hit.top ? hit.top - y : y - hit.bottom;
    if (dist < bestDist) {
      bestDist = dist;
      best = hit;
    }
  }
  if (!inside) return edgeIntent(best, y < best.top);
  const span = Math.max(1, best.bottom - best.top);
  const ratio = (y - best.top) / span;
  if (best.role === "folder" && best.folderId) {
    if (drag.kind === "folder" && drag.id === best.folderId) return edgeIntent(best, ratio < 0.5);
    if (ratio < 0.25) return edgeIntent(best, true);
    if (ratio > 0.75) return edgeIntent(best, false);
    if (drag.kind === "folder") return edgeIntent(best, ratio < 0.5);
    return { kind: "into-folder", folderId: best.folderId };
  }
  if (!best.guildId) return null;
  if (ratio < 0.25) return edgeIntent(best, true);
  if (ratio > 0.75) return edgeIntent(best, false);
  if (drag.kind === "folder") return edgeIntent(best, ratio < 0.5);
  return { kind: "onto-guild", guildId: best.guildId };
}

function edgeIntent(hit: RailHit, before: boolean): DropIntent {
  if (hit.role === "folder" && hit.folderId) {
    return before ? { kind: "before-folder", folderId: hit.folderId } : { kind: "after-folder", folderId: hit.folderId };
  }
  const guildId = hit.guildId ?? "";
  return before ? { kind: "before-guild", guildId } : { kind: "after-guild", guildId };
}

export function renameFolder(folders: GuildFolder[], folderId: string, name: string): GuildFolder[] {
  const clean = name.trim().slice(0, 80);
  return folders.map((folder) => (folder.id === folderId ? { ...folder, name: clean || null } : folder));
}

export function recolorFolder(folders: GuildFolder[], folderId: string, color: string | null): GuildFolder[] {
  const next = color && /^#[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== "#000000" ? color.toLowerCase() : null;
  return folders.map((folder) => (folder.id === folderId ? { ...folder, color: next } : folder));
}

/**
 * Apply one drop to the rail Discord already ordered.
 * A folder with fewer than two servers becomes loose servers, matching the official client.
 */
export function applyFolderDrop(
  guildIds: string[],
  folders: GuildFolder[],
  drag: RailDrag,
  intent: DropIntent,
  now = Date.now(),
): GuildFolder[] {
  const slots = toSlots(guildIds, folders);
  if (drag.kind === "folder") return fromSlots(moveFolder(slots, drag.id, intent));
  if (mentionsGuild(intent, drag.id)) return fromSlots(slots);
  const removed = removeGuild(slots, drag.id);
  return fromSlots(dissolve(placeGuild(removed, drag.id, intent, now)));
}

function mentionsGuild(intent: DropIntent, guildId: string): boolean {
  return (intent.kind === "before-guild" || intent.kind === "after-guild" || intent.kind === "onto-guild") && intent.guildId === guildId;
}

function toSlots(guildIds: string[], folders: GuildFolder[]): Slot[] {
  const meta = new Map(folders.filter((folder) => folder.id).map((folder) => [folder.id as string, folder]));
  return layoutRail(guildIds, folders).map((entry) => {
    if (entry.kind === "guild") return { kind: "guild", guildId: entry.guildId };
    const source = meta.get(entry.id);
    return {
      kind: "folder",
      id: entry.id,
      name: source?.name ?? (entry.name === "Folder" ? null : entry.name),
      color: source?.color ?? entry.color,
      guildIds: [...entry.guildIds],
    };
  });
}

function fromSlots(slots: Slot[]): GuildFolder[] {
  return slots.map((slot) =>
    slot.kind === "guild"
      ? { id: null, name: null, color: null, guildIds: [slot.guildId] }
      : { id: slot.id, name: slot.name, color: slot.color, guildIds: [...slot.guildIds] },
  );
}

function dissolve(slots: Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const slot of slots) {
    if (slot.kind === "guild") {
      out.push(slot);
      continue;
    }
    if (slot.guildIds.length >= 2) out.push(slot);
    else for (const guildId of slot.guildIds) out.push({ kind: "guild", guildId });
  }
  return out;
}

function removeGuild(slots: Slot[], guildId: string): Slot[] {
  const next: Slot[] = [];
  for (const slot of slots) {
    if (slot.kind === "guild") {
      if (slot.guildId !== guildId) next.push(slot);
      continue;
    }
    if (!slot.guildIds.includes(guildId)) {
      next.push(slot);
      continue;
    }
    next.push({ ...slot, guildIds: slot.guildIds.filter((id) => id !== guildId) });
  }
  return next;
}

function findGuild(slots: Slot[], guildId: string): { folderId: string | null; index: number } | null {
  for (const slot of slots) {
    if (slot.kind === "guild" && slot.guildId === guildId) return { folderId: null, index: 0 };
    if (slot.kind === "folder") {
      const index = slot.guildIds.indexOf(guildId);
      if (index >= 0) return { folderId: slot.id, index };
    }
  }
  return null;
}

function placeGuild(slots: Slot[], guildId: string, intent: DropIntent, now: number): Slot[] {
  if (intent.kind === "onto-guild") {
    const host = findGuild(slots, intent.guildId);
    if (!host) return insertLoose(slots, guildId, slots.length);
    if (host.folderId) return insertIntoFolder(slots, host.folderId, guildId, host.index);
    return createFolder(slots, intent.guildId, guildId, now);
  }
  if (intent.kind === "into-folder") return insertIntoFolder(slots, intent.folderId, guildId, Number.MAX_SAFE_INTEGER);
  if (intent.kind === "before-guild" || intent.kind === "after-guild") {
    const host = findGuild(slots, intent.guildId);
    if (!host) return insertLoose(slots, guildId, slots.length);
    if (host.folderId) {
      const index = intent.kind === "before-guild" ? host.index : host.index + 1;
      return insertIntoFolder(slots, host.folderId, guildId, index);
    }
    const slot = slots.findIndex((item) => item.kind === "guild" && item.guildId === intent.guildId);
    const index = slot < 0 ? slots.length : intent.kind === "before-guild" ? slot : slot + 1;
    return insertLoose(slots, guildId, index);
  }
  if (intent.kind === "before-folder" || intent.kind === "after-folder") {
    const slot = slots.findIndex((item) => item.kind === "folder" && item.id === intent.folderId);
    if (slot < 0) return insertLoose(slots, guildId, slots.length);
    return insertLoose(slots, guildId, intent.kind === "before-folder" ? slot : slot + 1);
  }
  return insertLoose(slots, guildId, slots.length);
}

function insertLoose(slots: Slot[], guildId: string, index: number): Slot[] {
  const next = slots.slice();
  next.splice(Math.max(0, Math.min(index, next.length)), 0, { kind: "guild", guildId });
  return next;
}

function insertIntoFolder(slots: Slot[], folderId: string, guildId: string, index: number): Slot[] {
  let placed = false;
  const next = slots.map((slot) => {
    if (slot.kind !== "folder" || slot.id !== folderId) return slot;
    placed = true;
    const guildIds = slot.guildIds.filter((id) => id !== guildId);
    guildIds.splice(Math.max(0, Math.min(index, guildIds.length)), 0, guildId);
    return { ...slot, guildIds };
  });
  return placed ? next : insertLoose(slots, guildId, slots.length);
}

function createFolder(slots: Slot[], anchorId: string, draggedId: string, now: number): Slot[] {
  const slot = slots.findIndex((item) => item.kind === "guild" && item.guildId === anchorId);
  if (slot < 0) return insertLoose(slots, draggedId, slots.length);
  const folder: Slot = {
    kind: "folder",
    id: freshId(slots, now),
    name: null,
    color: null,
    guildIds: [anchorId, draggedId],
  };
  const next = slots.slice();
  next.splice(slot, 1, folder);
  return next;
}

function freshId(slots: Slot[], now: number): string {
  const used = new Set(slots.filter((slot) => slot.kind === "folder").map((slot) => slot.id));
  let id = Math.max(1, Math.floor(now));
  while (used.has(String(id))) id += 1;
  return String(id);
}

function moveFolder(slots: Slot[], folderId: string, intent: DropIntent): Slot[] {
  const from = slots.findIndex((slot) => slot.kind === "folder" && slot.id === folderId);
  if (from < 0) return slots;
  if ((intent.kind === "before-folder" || intent.kind === "after-folder") && intent.folderId === folderId) return slots;
  const next = slots.slice();
  const [item] = next.splice(from, 1);
  let index = next.length;
  if (intent.kind === "before-folder" || intent.kind === "after-folder") {
    const at = next.findIndex((slot) => slot.kind === "folder" && slot.id === intent.folderId);
    if (at >= 0) index = intent.kind === "before-folder" ? at : at + 1;
  } else if (intent.kind === "before-guild" || intent.kind === "after-guild" || intent.kind === "onto-guild") {
    const at = topIndex(next, intent.guildId);
    if (at >= 0) index = intent.kind === "after-guild" ? at + 1 : at;
  } else if (intent.kind === "into-folder") {
    const at = next.findIndex((slot) => slot.kind === "folder" && slot.id === intent.folderId);
    if (at >= 0) index = at;
  }
  next.splice(index, 0, item);
  return next;
}

function topIndex(slots: Slot[], guildId: string): number {
  return slots.findIndex(
    (slot) =>
      (slot.kind === "guild" && slot.guildId === guildId) ||
      (slot.kind === "folder" && slot.guildIds.includes(guildId)),
  );
}

export interface FolderSyncIo {
  delayMs?: number;
  retryMs?: number;
  read: () => string | null;
  write: (raw: string) => void;
  send: (folders: GuildFolder[]) => Promise<void>;
  schedule: (ms: number, fn: () => void) => number;
  cancel: (id: number) => void;
  onError?: () => void;
}

/** Debounced Discord write. A failed PATCH stays in local storage and is not retried in a loop. */
export class FolderSync {
  folders: GuildFolder[] = [];
  dirty = false;
  private timer = 0;
  private inflight = false;
  private queued = false;
  private failures = 0;
  private readonly delayMs: number;
  private readonly retryMs: number;

  constructor(private readonly io: FolderSyncIo) {
    this.delayMs = io.delayMs ?? FOLDER_SYNC_DELAY_MS;
    this.retryMs = io.retryMs ?? FOLDER_SYNC_RETRY_MS;
  }

  load(): StoredGuildFolders | null {
    const stored = parseStoredFolders(this.io.read());
    if (!stored) return null;
    this.folders = stored.folders;
    this.dirty = stored.dirty;
    return stored;
  }

  edit(folders: GuildFolder[]) {
    this.folders = folders;
    this.dirty = true;
    this.failures = 0;
    this.persist();
    if (this.inflight) {
      this.queued = true;
      return;
    }
    this.schedule(this.delayMs);
  }

  retry() {
    if (!this.dirty || this.inflight) return;
    this.schedule(this.delayMs);
  }

  /** Remote settings win only when nothing local is waiting to upload. */
  acceptRemote(folders: GuildFolder[]): boolean {
    if (this.dirty || this.inflight || this.queued) return false;
    this.folders = folders;
    this.persist();
    return true;
  }

  private schedule(ms: number) {
    if (this.timer) this.io.cancel(this.timer);
    this.timer = this.io.schedule(ms, () => {
      this.timer = 0;
      void this.flush();
    });
  }

  private async flush() {
    if (this.inflight || !this.dirty) return;
    this.inflight = true;
    const snapshot = this.folders.map((folder) => ({ ...folder, guildIds: [...folder.guildIds] }));
    try {
      await this.io.send(snapshot);
      this.failures = 0;
      if (foldersKey(this.folders) === foldersKey(snapshot)) {
        this.dirty = false;
        this.persist();
      }
    } catch {
      this.failures += 1;
      this.dirty = true;
      this.persist();
      if (this.failures === 1 && !this.queued) {
        this.io.onError?.();
        this.schedule(this.retryMs);
      }
    } finally {
      this.inflight = false;
      if (this.queued) {
        this.queued = false;
        if (this.dirty) this.schedule(this.delayMs);
      }
    }
  }

  private persist() {
    this.io.write(JSON.stringify({ folders: this.folders, dirty: this.dirty }));
  }
}
