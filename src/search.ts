export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.toLowerCase().replace(/\s+/g, "");
  const hay = text.toLowerCase();
  if (!needle) return 1;
  let index = 0;
  let score = 0;
  let streak = 0;
  for (const char of needle) {
    const found = hay.indexOf(char, index);
    if (found < 0) return null;
    streak = found === index ? streak + 1 : 0;
    score += 8 + streak * 4 - (found - index);
    index = found + 1;
  }
  if (hay.startsWith(needle)) score += 40;
  return score;
}
