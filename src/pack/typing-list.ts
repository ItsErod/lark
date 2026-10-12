export interface TypingPerson {
  channelId: string;
  name: string;
  until: number;
}

export interface TypingLabel {
  label: string;
  title: string;
}

/** Short label for a channel or DM row, plus the names for a hover title. */
export function typingLabel(people: readonly TypingPerson[], channelId: string, now: number): TypingLabel | null {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    if (person.channelId !== channelId || person.until <= now) continue;
    const name = person.name.trim().slice(0, 80);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= 8) break;
  }
  if (!names.length) return null;
  const title = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names.slice(0, 3).join(", ")} are typing`;
  return { label: names.length === 1 ? "typing" : `${names.length} typing`, title };
}
