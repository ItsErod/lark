import type { Person, RawMessage } from "../types";
import { people } from "../demo/data";

/** Rows the bench keeps on one channel so virtualization and history cost show up. */
export const BENCH_HISTORY = 80;

/** Member rows past the virtualization floor. */
export const BENCH_MEMBERS = 160;

const STATUSES: Person["status"][] = ["online", "idle", "dnd", "offline"];

export function benchHistory(channelId: string, count = BENCH_HISTORY): RawMessage[] {
  const total = Math.max(0, Math.floor(count));
  const rows: RawMessage[] = [];
  for (let index = 0; index < total; index += 1) {
    const person = people[index % people.length];
    rows.push({
      id: `${channelId}${String(index + 1).padStart(4, "0")}`,
      channelId,
      authorId: person.id,
      authorName: person.name,
      content: `bench ${channelId} ${index} ${person.name} checked the rail, the composer, and the member list.`,
      timestamp: new Date(Date.now() - (total - index) * 60_000).toISOString(),
    });
  }
  return rows;
}

export function benchPeople(count = BENCH_MEMBERS): Person[] {
  const total = Math.max(people.length, Math.floor(count));
  const rows: Person[] = [];
  for (let index = 0; index < total; index += 1) {
    const person = people[index % people.length];
    rows.push({
      ...person,
      id: index < people.length ? person.id : `20000000000000${String(index).padStart(4, "0")}`,
      name: index < people.length ? person.name : `${person.name} ${index}`,
      status: STATUSES[index % STATUSES.length],
    });
  }
  return rows;
}
