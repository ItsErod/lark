/** Discover screen states. The request paths live in Rust. This module only describes what the screen shows. */

export interface DiscoverCategory {
  id: number;
  name: string;
}

export interface DiscoverCard {
  id: string;
  name: string;
  description: string;
  bannerUrl: string;
  iconUrl: string;
  members: number;
  online: number;
  vanity: string;
}

export type DiscoverMode = "loading" | "error" | "browse" | "preview";

export function discoverMode(input: { loading: boolean; error: string; preview: boolean }): DiscoverMode {
  if (input.preview) return "preview";
  if (input.loading && !input.error) return "loading";
  if (input.error) return "error";
  return "browse";
}

export function countLine(members: number, online: number): string {
  return `${formatCount(online)} online · ${formatCount(members)} members`;
}

export function emptyNote(query: string, category: string | null): string {
  const where = category ? category : "Discovery";
  if (query.trim()) return `No servers in ${where} match that search.`;
  return `No servers in ${where} right now.`;
}

export function moreGuilds(shown: number, total: number, lastPage: number, pageSize: number): boolean {
  if (shown <= 0) return false;
  if (total > shown) return true;
  return total === 0 && lastPage >= pageSize;
}

export function captchaNote(): string {
  return "Discord asked for a captcha. Lark does not solve captchas. Continue on Discord to join.";
}

export function cdnImage(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    if (parsed.hostname !== "cdn.discordapp.com") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function dedupeCards(cards: readonly DiscoverCard[]): DiscoverCard[] {
  const seen = new Set<string>();
  const out: DiscoverCard[] = [];
  for (const card of cards) {
    if (!card.id || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const count = Math.trunc(value);
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const scaled = count / 1000;
    const text = scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1);
    return `${text.replace(/\.0$/, "")}K`;
  }
  const scaled = count / 1_000_000;
  return `${scaled.toFixed(1).replace(/\.0$/, "")}M`;
}
