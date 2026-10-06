import { PHRASES, type Lang, type Phrase } from "./phrases";

export type { Lang } from "./phrases";

export interface GlossaryEntry {
  text: string;
  lang: Lang;
  translation: string;
}

export interface TranslateResult {
  text: string;
  matched: boolean;
}

const LANGS: Lang[] = ["en", "es", "fr", "de", "ja"];

const index = new Map<string, Phrase>();
for (const phrase of PHRASES) {
  for (const lang of LANGS) index.set(`${lang}:${normalize(phrase[lang])}`, phrase);
}

export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function translateText(text: string, target: Lang, extra: readonly GlossaryEntry[] = []): TranslateResult {
  const key = normalize(text);
  if (!key) return { text, matched: false };
  for (const entry of extra) {
    if (entry.lang !== target) continue;
    if (normalize(entry.text) === key && entry.translation.trim()) {
      return { text: entry.translation.trim().slice(0, 2000), matched: true };
    }
  }
  const phrase = index.get(`en:${key}`) ?? index.get(`${target}:${key}`) ?? findPhrase(key);
  if (!phrase) return { text, matched: false };
  return { text: phrase[target], matched: true };
}

function findPhrase(key: string): Phrase | undefined {
  for (const lang of LANGS) {
    const phrase = index.get(`${lang}:${key}`);
    if (phrase) return phrase;
  }
  return undefined;
}
