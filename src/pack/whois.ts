/** Account age from a Discord snowflake, plus mutual servers and a join date. */

export const DISCORD_EPOCH = 1_420_070_400_000;

export function snowflakeTime(id: string, now = Date.now()): number | null {
  if (!/^\d{17,20}$/.test(id)) return null;
  try {
    const ms = Number((BigInt(id) >> 22n) + BigInt(DISCORD_EPOCH));
    if (!Number.isFinite(ms) || ms < DISCORD_EPOCH || ms > now + 86_400_000) return null;
    return ms;
  } catch {
    return null;
  }
}

export function accountAgeLabel(createdAt: number, now: number): string {
  const days = Math.floor(Math.max(0, now - createdAt) / 86_400_000);
  if (days < 1) return "Account created today";
  if (days < 30) return `Account is ${days} day${days === 1 ? "" : "s"} old`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days - years * 365) / 30);
  if (years < 1) {
    const whole = Math.max(1, Math.floor(days / 30));
    return `Account is ${whole} month${whole === 1 ? "" : "s"} old`;
  }
  if (months <= 0) return `Account is ${years} year${years === 1 ? "" : "s"} old`;
  return `Account is ${years}y ${months}mo old`;
}

export function joinLabel(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  return formatted ? `Joined ${formatted}` : "";
}

export function mutualNames(
  userId: string,
  guilds: readonly { name: string; memberIds: readonly string[] }[],
  profileNames: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    const clean = name.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const guild of guilds) {
    if (guild.memberIds.includes(userId)) push(guild.name);
  }
  for (const name of profileNames) push(name);
  return out.slice(0, 8);
}

export function whoisLines(input: {
  userId: string;
  now: number;
  joinedAt?: string;
  mutuals: readonly string[];
  showAge: boolean;
  showMutuals: boolean;
  showJoin: boolean;
}): string[] {
  const lines: string[] = [];
  if (input.showAge) {
    const created = snowflakeTime(input.userId, input.now);
    if (created) lines.push(accountAgeLabel(created, input.now));
  }
  if (input.showMutuals) {
    lines.push(input.mutuals.length ? `Mutual servers: ${input.mutuals.join(", ")}` : "No mutual servers loaded");
  }
  if (input.showJoin) lines.push(joinLabel(input.joinedAt) || "Join date not loaded");
  return lines;
}
