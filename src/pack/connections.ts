/** Connection lines from a profile that was already loaded, or from one click. */

export interface ConnectionLine {
  kind: string;
  name: string;
  verified: boolean;
}

export function connectionLines(widgets: readonly { kind?: string; name?: string; verified?: boolean }[] | null | undefined): ConnectionLine[] {
  const out: ConnectionLine[] = [];
  const seen = new Set<string>();
  for (const widget of widgets ?? []) {
    if (!widget) continue;
    const kind = typeof widget.kind === "string" ? widget.kind.trim().slice(0, 32) : "";
    const name = typeof widget.name === "string" ? widget.name.trim().slice(0, 80) : "";
    if (!kind && !name) continue;
    const key = `${kind}\n${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: kind || "account", name: name || kind, verified: widget.verified === true });
    if (out.length >= 12) break;
  }
  return out;
}

export function connectionLabel(line: ConnectionLine): string {
  const name = line.name || line.kind;
  return line.verified ? `${name} · ${line.kind} · verified` : `${name} · ${line.kind}`;
}
