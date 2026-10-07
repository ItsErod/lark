import { sortPeople } from "./members";
import type { Person } from "./types";

export const NOTE_LIMIT = 256;

const ACTIVE = new Set(["online", "idle", "dnd"]);

/** Discord notes are short and private to this account. */
export function clampNote(text: string): string {
  return [...text.replaceAll("\0", "")].slice(0, NOTE_LIMIT).join("");
}

export interface FriendGlance {
  activity: string;
  custom: string;
  line: string;
}

/** Activity stays visible when a custom status is also set. */
export function friendGlance(person: Pick<Person, "activity" | "custom">): FriendGlance {
  const activity = person.activity?.trim() ?? "";
  const custom = person.custom?.trim() ?? "";
  const line = activity && custom ? `${activity} · ${custom}` : activity || custom;
  return { activity, custom, line };
}

/** Friends who are online, idle, or in do not disturb and have a game or listen line. */
export function activeFriends(people: Person[], limit = 6): Person[] {
  return sortPeople(people)
    .filter((person) => ACTIVE.has(person.status ?? "offline") && friendGlance(person).activity.length > 0)
    .slice(0, Math.max(0, limit));
}
