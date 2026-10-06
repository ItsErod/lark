export function keywordHits(content: string, keywords: string[]): string[] {
  const hay = content.toLowerCase();
  return keywords
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && hay.includes(word.toLowerCase()));
}
