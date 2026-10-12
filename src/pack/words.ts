/** Local counts for the composer and long messages. */

export const WORD_MINS = [0, 40, 100, 280] as const;
export type WordMin = (typeof WORD_MINS)[number];

export function wordMin(value: unknown): WordMin {
  const number = typeof value === "number" ? value : Number(value);
  return (WORD_MINS as readonly number[]).includes(number) ? (number as WordMin) : 0;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function wordBadge(text: string, min: number): string | null {
  if (!Number.isFinite(min) || min < 1) return null;
  const words = countWords(text);
  if (words < min) return null;
  return words === 1 ? "1 word" : `${words} words`;
}

export function composerCount(text: string, wordsOn: boolean): string {
  const chars = [...text].length;
  if (!wordsOn) return `${chars} / 2000`;
  const words = countWords(text);
  const label = words === 1 ? "word" : "words";
  return `${words} ${label} · ${chars} / 2000`;
}
