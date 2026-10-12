import { translateText, type GlossaryEntry, type Lang } from "./translate";

export type TranslatePrefer = "remote" | "local";
export type TranslateVia = "remote" | "local" | "original";

export interface TranslateFetch {
  (url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}

const ENDPOINT = "https://api.mymemory.translated.net/get";

export function memoryUrl(text: string, source: Lang, target: Lang): string {
  const query = text.trim().slice(0, 500);
  return `${ENDPOINT}?q=${encodeURIComponent(query)}&langpair=${source}|${target}`;
}

/** Read a MyMemory payload. A quota warning or an unchanged line is a miss. */
export function readMemory(payload: unknown, sourceText: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { responseStatus?: unknown; responseData?: { translatedText?: unknown } };
  if (record.responseStatus !== 200 && record.responseStatus !== "200") return null;
  const raw = record.responseData?.translatedText;
  if (typeof raw !== "string") return null;
  const text = raw.trim().slice(0, 2000);
  if (!text || /MYMEMORY WARNING/i.test(text)) return null;
  if (text.toLowerCase() === sourceText.trim().toLowerCase()) return null;
  return text;
}

export async function translateInline(input: {
  text: string;
  source: Lang;
  target: Lang;
  glossary: readonly GlossaryEntry[];
  prefer: TranslatePrefer;
  fetchImpl?: TranslateFetch;
}): Promise<{ text: string; via: TranslateVia }> {
  const original = input.text.trim();
  if (!original) return { text: input.text, via: "original" };
  const local = () => translateText(input.text, input.target, input.glossary);
  if (input.prefer === "local") {
    const known = local();
    if (known.matched) return { text: known.text, via: "local" };
  }
  if (input.source !== input.target) {
    const remote = await fetchMemory(input.text, input.source, input.target, input.fetchImpl ?? fetch);
    if (remote) return { text: remote, via: "remote" };
  }
  const fallback = local();
  if (fallback.matched) return { text: fallback.text, via: "local" };
  return { text: input.text, via: "original" };
}

async function fetchMemory(text: string, source: Lang, target: Lang, fetchImpl: TranslateFetch): Promise<string | null> {
  try {
    const response = await fetchImpl(memoryUrl(text, source, target));
    if (!response.ok) return null;
    return readMemory(await response.json(), text);
  } catch {
    return null;
  }
}
