export const DRAFTS_SEALED_KEY = "lark.drafts.v2";
export const DRAFTS_PLAIN_KEY = "lark.drafts.v1";

const MAX_DRAFTS = 40;
const MAX_CHARS = 2000;

export type DraftMap = Record<string, string>;

export type DraftPlan =
  | { kind: "sealed"; sealed: string }
  | { kind: "migrate"; plain: DraftMap }
  | { kind: "empty" };

export function parseDraftMap(input: unknown): DraftMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: DraftMap = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d{5,22}$/.test(id) || typeof value !== "string") continue;
    const text = value.slice(0, MAX_CHARS);
    if (!text) continue;
    out[id] = text;
    if (Object.keys(out).length >= MAX_DRAFTS) break;
  }
  return out;
}

/** Sealed storage wins. A leftover plaintext map is migrated once, then deleted. */
export function planDraftLoad(sealed: string | null, legacy: string | null): DraftPlan {
  const trimmed = sealed?.trim() ?? "";
  if (trimmed.startsWith("lark1.")) return { kind: "sealed", sealed: trimmed };
  if (!legacy) return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(legacy);
  } catch {
    return { kind: "empty" };
  }
  const plain = parseDraftMap(parsed);
  if (!Object.keys(plain).length) return { kind: "empty" };
  return { kind: "migrate", plain };
}
