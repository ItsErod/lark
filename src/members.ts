import { personFromMember, type RawMember } from "./roster";
import type { Channel, Person } from "./types";

export interface RoleInfo {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  hoist: boolean;
}

export interface MemberSection {
  id: string;
  label: string;
  color: string | null;
  count: number;
  people: Person[];
}

export type ListRow =
  | { kind: "group"; id: string; count: number }
  | { kind: "member"; person: Person };

export interface MemberListState {
  listId: string;
  memberCount: number;
  onlineCount: number;
  groups: { id: string; count: number }[];
  rows: Map<number, ListRow>;
}

export type WireItem =
  | { kind: "group"; id?: string; count?: number }
  | { kind: "member"; member?: RawMember }
  | { kind: "empty" }
  | { kind?: string };

export type WireOp =
  | { op: "SYNC"; range: [number, number]; items?: WireItem[] }
  | { op: "INSERT"; index: number; item: WireItem }
  | { op: "UPDATE"; index: number; item: WireItem }
  | { op: "DELETE"; index: number }
  | { op: "INVALIDATE"; range: [number, number] };

export interface MemberListWire {
  listId?: string;
  memberCount?: number;
  onlineCount?: number;
  groups?: { id: string; count: number }[];
  ops?: WireOp[];
}

export type PaintedRow =
  | { type: "group"; id: string; label: string; count: number; color: string | null }
  | { type: "member"; person: Person; color: string | null };

const MAX_INDEX = 20_000;
const LIVE = new Set(["online", "idle", "dnd"]);

export function emptyMemberList(listId: string): MemberListState {
  return { listId, memberCount: 0, onlineCount: 0, groups: [], rows: new Map() };
}

export function roleColor(roleIds: string[] | undefined, roles: RoleInfo[]): string | null {
  let best: RoleInfo | null = null;
  const ids = new Set(roleIds ?? []);
  for (const role of roles) {
    if (!ids.has(role.id) || !role.color) continue;
    if (!best || role.position > best.position) best = role;
  }
  return best?.color ?? null;
}

export function groupLabel(id: string, role?: RoleInfo): string {
  if (id === "online") return "Online";
  if (id === "offline") return "Offline";
  return role?.name || "Role";
}

/** Hoisted roles, then everyone else who is not offline, then offline. */
export function groupMembers(people: Person[], roles: RoleInfo[]): MemberSection[] {
  const hoisted = roles.filter((role) => role.hoist).sort((a, b) => b.position - a.position);
  const buckets = new Map<string, Person[]>();
  const order: string[] = [];
  const ensure = (id: string) => {
    if (buckets.has(id)) return;
    buckets.set(id, []);
    order.push(id);
  };
  for (const role of hoisted) ensure(role.id);
  ensure("online");
  ensure("offline");
  for (const person of people) {
    const offline = !person.status || !LIVE.has(person.status);
    if (offline) {
      buckets.get("offline")!.push(person);
      continue;
    }
    const ids = new Set(person.roleIds ?? []);
    const role = hoisted.find((item) => ids.has(item.id));
    buckets.get(role?.id ?? "online")!.push(person);
  }
  const sections: MemberSection[] = [];
  for (const id of order) {
    const group = buckets.get(id) ?? [];
    if (!group.length) continue;
    group.sort((a, b) => a.name.localeCompare(b.name));
    const role = roles.find((item) => item.id === id);
    sections.push({
      id,
      label: groupLabel(id, role),
      color: role?.color ?? null,
      count: group.length,
      people: group,
    });
  }
  return sections;
}

function toRow(item: WireItem | undefined): ListRow | null {
  if (!item || item.kind === "empty") return null;
  if (item.kind === "group") {
    const id = "id" in item ? item.id?.trim() ?? "" : "";
    if (!id) return null;
    const count = "count" in item && typeof item.count === "number" ? item.count : 0;
    return { kind: "group", id, count };
  }
  if (item.kind === "member" && "member" in item && item.member) {
    const person = personFromMember(item.member);
    return person ? { kind: "member", person } : null;
  }
  return null;
}

function rangeOccupied(state: MemberListState, start: number, end: number): boolean {
  for (let index = start; index <= end; index += 1) {
    if (state.rows.has(index)) return true;
  }
  return false;
}

function shiftFrom(state: MemberListState, index: number, delta: number) {
  const keys = [...state.rows.keys()].filter((key) => key >= index).sort((a, b) => (delta > 0 ? b - a : a - b));
  for (const key of keys) {
    const row = state.rows.get(key);
    state.rows.delete(key);
    const next = key + delta;
    if (row && next >= 0 && next <= MAX_INDEX) state.rows.set(next, row);
  }
}

/** Apply SYNC / INSERT / UPDATE / DELETE / INVALIDATE in order. Indices stay aligned with Discord. */
export function applyMemberOps(state: MemberListState, event: MemberListWire): MemberListState {
  if (event.listId) state.listId = event.listId;
  if (typeof event.memberCount === "number") state.memberCount = event.memberCount;
  if (typeof event.onlineCount === "number") state.onlineCount = event.onlineCount;
  if (event.groups?.length) state.groups = event.groups;
  for (const op of event.ops ?? []) {
    if (op.op === "SYNC") {
      const [start, end] = op.range;
      if (start > MAX_INDEX || end < start) continue;
      const items = op.items ?? [];
      if (!items.length && rangeOccupied(state, start, end)) continue;
      for (let index = start; index <= end; index += 1) state.rows.delete(index);
      items.forEach((item, offset) => {
        const index = start + offset;
        if (index > MAX_INDEX) return;
        const row = toRow(item);
        if (row) state.rows.set(index, row);
      });
    } else if (op.op === "INSERT") {
      if (op.index > MAX_INDEX) continue;
      shiftFrom(state, op.index, 1);
      const row = toRow(op.item);
      if (row) state.rows.set(op.index, row);
    } else if (op.op === "UPDATE") {
      if (op.index > MAX_INDEX) continue;
      const row = toRow(op.item);
      if (row) state.rows.set(op.index, row);
      else state.rows.delete(op.index);
    } else if (op.op === "DELETE") {
      state.rows.delete(op.index);
      shiftFrom(state, op.index + 1, -1);
    } else if (op.op === "INVALIDATE") {
      const [start, end] = op.range;
      for (let index = start; index <= end && index <= MAX_INDEX; index += 1) state.rows.delete(index);
    }
  }
  return state;
}

export function visibleRows(state: MemberListState, roles: RoleInfo[], limit = 800): PaintedRow[] {
  const indexes = [...state.rows.keys()].sort((a, b) => a - b).slice(0, limit);
  const out: PaintedRow[] = [];
  for (const index of indexes) {
    const row = state.rows.get(index);
    if (!row) continue;
    if (row.kind === "group") {
      const role = roles.find((item) => item.id === row.id);
      const summary = state.groups.find((item) => item.id === row.id);
      out.push({
        type: "group",
        id: row.id,
        label: groupLabel(row.id, role),
        count: summary?.count || row.count,
        color: role?.color ?? null,
      });
    } else {
      out.push({ type: "member", person: row.person, color: roleColor(row.person.roleIds, roles) });
    }
  }
  return out;
}

/** Fixed slot for a virtualized member row. Matches the gateway scroll window. */
export const MEMBER_ROW = 42;

/** Ranges are the 100-wide windows the official client subscribes to, at most three. */
export function rangesForScroll(scrollTop: number, viewHeight: number, totalHint: number): [number, number][] {
  const row = MEMBER_ROW;
  const viewEnd = Math.floor((Math.max(0, scrollTop) + Math.max(row, viewHeight)) / row) + 8;
  const block = Math.floor(viewEnd / 100) * 100;
  const first = Math.max(0, block - 100);
  const ranges: [number, number][] = [];
  for (let cursor = first; cursor <= block && ranges.length < 3; cursor += 100) {
    if (totalHint > 0 && cursor > totalHint + 50) break;
    ranges.push([cursor, cursor + 99]);
  }
  return ranges.length ? ranges : [[0, 99]];
}

export function highestIndex(state: MemberListState | null): number {
  if (!state || !state.rows.size) return -1;
  let highest = -1;
  for (const index of state.rows.keys()) if (index > highest) highest = index;
  return highest;
}

function snowflakeDesc(a?: string | null, b?: string | null): number {
  const left = a ?? "";
  const right = b ?? "";
  if (left.length !== right.length) return right.length - left.length;
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

export function sortDms(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => snowflakeDesc(a.lastMessageId, b.lastMessageId) || a.position - b.position || a.name.localeCompare(b.name));
}

const STATUS_RANK: Record<string, number> = { online: 0, idle: 1, dnd: 2, invisible: 3, offline: 4 };

export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => (STATUS_RANK[a.status ?? "offline"] ?? 4) - (STATUS_RANK[b.status ?? "offline"] ?? 4) || a.name.localeCompare(b.name));
}

export type MemberListSort = "status" | "name" | "activity";

export const MEMBER_LIST_SORTS: { id: MemberListSort; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "name", label: "Name" },
  { id: "activity", label: "Activity" },
];

/** Status keeps role groups. Name and activity flatten the list. */
export function applyMemberListSort(rows: PaintedRow[], sort: MemberListSort): PaintedRow[] {
  if (sort === "status") return rows.slice();
  const members = rows.filter((row): row is Extract<PaintedRow, { type: "member" }> => row.type === "member");
  return [...members].sort((a, b) => {
    if (sort === "activity") {
      const left = a.person.activity || a.person.custom || "\uffff";
      const right = b.person.activity || b.person.custom || "\uffff";
      const byActivity = left.localeCompare(right);
      if (byActivity) return byActivity;
    }
    return a.person.name.localeCompare(b.person.name);
  });
}

export function memberSubtitle(person: Person): string {
  if (person.custom) return person.custom;
  if (person.activity) return person.activity;
  if (person.bot) return "Bot";
  return "";
}
