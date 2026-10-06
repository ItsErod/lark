export interface HiddenAuthor {
  id: string;
  name: string;
}

export function toggleHidden(list: readonly HiddenAuthor[], author: HiddenAuthor): HiddenAuthor[] {
  const id = author.id.trim();
  if (!id || id.length > 40 || /\s/.test(id)) return [...list];
  if (list.some((entry) => entry.id === id)) return list.filter((entry) => entry.id !== id);
  const name = author.name.trim().slice(0, 80) || id;
  return [...list, { id, name }].slice(0, 200);
}

export function hiddenIds(list: readonly HiddenAuthor[]): Set<string> {
  return new Set(list.map((entry) => entry.id));
}
