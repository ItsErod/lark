/** Nicknames that exist only on this device. Discord is not updated. */

const ID = /^\d{1,20}$/;

export const MAX_NICKS = 100;

export function sanitizeNicks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, nick] of Object.entries(value as Record<string, unknown>)) {
    if (!ID.test(id) || typeof nick !== "string") continue;
    const clean = nick.trim().slice(0, 32);
    if (!clean) continue;
    out[id] = clean;
    if (Object.keys(out).length >= MAX_NICKS) break;
  }
  return out;
}

export function displayName(nicks: Readonly<Record<string, string>>, id: string, fallback: string): string {
  const nick = nicks[id]?.trim();
  return nick || fallback;
}

export function setLocalNick(nicks: Readonly<Record<string, string>>, id: string, nick: string): Record<string, string> {
  if (!ID.test(id)) return { ...nicks };
  const clean = nick.trim().slice(0, 32);
  const next = { ...nicks };
  if (!clean) delete next[id];
  else next[id] = clean;
  return sanitizeNicks(next);
}
