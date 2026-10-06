export function playingLine(title: string, artist: string): string {
  const track = title.trim().replace(/\s+/g, " ").slice(0, 80);
  const name = artist.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!track) return "";
  const line = name ? `Listening to ${track} — ${name}` : `Listening to ${track}`;
  return line.slice(0, 128);
}

export function shouldWritePlaying(prev: string, next: string, lastWrite: number, now: number, cooldownMs = 30_000): boolean {
  if (!next || next === prev) return false;
  if (lastWrite > 0 && now - lastWrite < cooldownMs) return false;
  return true;
}

export function canReplaceCustom(current: string, replace: boolean): boolean {
  if (replace) return true;
  const custom = current.trim();
  return !custom || custom.startsWith("Listening to");
}
