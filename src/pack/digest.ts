/** Mentions already counted on this device. Nothing is fetched. */

export interface DigestSource {
  channelId: string;
  name: string;
  where: string;
  mentions: number;
  kind: string;
}

export interface DigestRow {
  channelId: string;
  name: string;
  where: string;
  mentions: number;
}

export function digestRows(sources: readonly DigestSource[], includeDms: boolean): DigestRow[] {
  const out: DigestRow[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source.channelId !== "string" || !source.channelId || seen.has(source.channelId)) continue;
    if (!Number.isInteger(source.mentions) || source.mentions < 1) continue;
    const dm = source.kind === "dm" || source.kind === "group";
    if (dm && !includeDms) continue;
    seen.add(source.channelId);
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 80) : "";
    const where = typeof source.where === "string" ? source.where.trim().slice(0, 80) : "";
    out.push({
      channelId: source.channelId.slice(0, 32),
      name: name || "Channel",
      where,
      mentions: Math.min(999, source.mentions),
    });
  }
  out.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  return out.slice(0, 40);
}

export function digestTotal(rows: readonly DigestRow[]): number {
  return rows.reduce((sum, row) => sum + row.mentions, 0);
}
