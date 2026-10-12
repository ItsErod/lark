/** Words and small regular expressions for Keyword Highlights. */

const MAX_PATTERNS = 20;
const MAX_LINE = 80;

export function cleanPatterns(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split("\n")) {
    const line = part.trim().slice(0, MAX_LINE);
    if (line.length < 2 || seen.has(line.toLowerCase()) || !acceptedPattern(line)) continue;
    seen.add(line.toLowerCase());
    out.push(line);
    if (out.length >= MAX_PATTERNS) break;
  }
  return out;
}

export function patternsFor(
  global: readonly string[],
  guilds: Readonly<Record<string, readonly string[]>>,
  guildId: string,
): string[] {
  const extra = guildId ? guilds[guildId] ?? [] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...global, ...extra]) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_PATTERNS * 2) break;
  }
  return out;
}

/** The first pattern that matches. Words are case-insensitive substrings. `/pattern/flags` is a regex. */
export function patternHit(content: string, patterns: readonly string[]): string | null {
  const hay = content.slice(0, 2000);
  const lower = hay.toLowerCase();
  for (const pattern of patterns) {
    const parsed = parseRegex(pattern);
    if (parsed) {
      if (unsafeRegex(parsed.source)) continue;
      try {
        if (new RegExp(parsed.source, parsed.flags).test(hay)) return pattern;
      } catch {
        continue;
      }
      continue;
    }
    const word = pattern.trim().toLowerCase();
    if (word.length > 1 && lower.includes(word)) return pattern;
  }
  return null;
}

/**
 * Notify when a pattern matches and the normal desktop notification did not.
 * Mute still wins. Looking at the channel does not ping.
 */
export function shouldPatternNotify(input: {
  notify: boolean;
  muted: boolean;
  fromMe: boolean;
  windowFocused: boolean;
  sameChannel: boolean;
  hit: boolean;
  alreadyNotified: boolean;
}): boolean {
  if (!input.notify || !input.hit || input.muted || input.fromMe || input.alreadyNotified) return false;
  if (input.windowFocused && input.sameChannel) return false;
  return true;
}

export function acceptedPattern(line: string): boolean {
  const parsed = parseRegex(line);
  if (parsed) return !unsafeRegex(parsed.source);
  return line.length >= 2 && line.length <= 40 && !line.includes("/");
}

function parseRegex(line: string): { source: string; flags: string } | null {
  if (!line.startsWith("/") || line.lastIndexOf("/") <= 0) return null;
  const last = line.lastIndexOf("/");
  const flags = line.slice(last + 1);
  if (!/^[imu]{0,3}$/.test(flags) || new Set(flags).size !== flags.length) return null;
  const source = line.slice(1, last);
  if (!source || source.length > 60) return null;
  return { source, flags };
}

function unsafeRegex(source: string): boolean {
  if (source.length > 60) return true;
  if (/\\[1-9]/.test(source)) return true;
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(source)) return true;
  if ((source.match(/\(/g) ?? []).length > 4) return true;
  try {
    const re = new RegExp(source, "u");
    if (re.test("")) return true;
    return false;
  } catch {
    return true;
  }
}
