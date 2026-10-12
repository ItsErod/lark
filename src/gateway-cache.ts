/** Last gateway snapshots kept in memory. Tokens and auth fields are dropped. */

const SECRET = /token|authorization|password|secret|cookie|session/i;

export interface GatewaySnapshot {
  kind: string;
  at: number;
  shape: string;
  payload: unknown;
}

const snapshots: GatewaySnapshot[] = [];

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^Bearer\s+/i.test(value)) return "";
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET.test(key)) continue;
    out[key] = redactValue(item);
  }
  return out;
}

/** Identity of a ready payload: guild, dm, and bundled channel ids. No secrets. */
export function readyShape(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const event = payload as {
    guilds?: { id?: string }[];
    dms?: { id?: string }[];
    guildChannels?: { guildId?: string; channels?: { id?: string }[] }[];
  };
  const guilds = (event.guilds ?? []).map((guild) => guild.id ?? "").join(",");
  const dms = (event.dms ?? []).map((dm) => dm.id ?? "").join(",");
  const channels = (event.guildChannels ?? [])
    .map((group) => `${group.guildId ?? ""}:${(group.channels ?? []).map((channel) => channel.id ?? "").join(".")}`)
    .join("|");
  return `${guilds}#${dms}#${channels}`;
}

export function rememberGateway(payload: unknown, now = Date.now(), max = 8): GatewaySnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const kind = String((payload as { kind?: unknown }).kind ?? "");
  if (!kind) return null;
  const snap: GatewaySnapshot = {
    kind,
    at: now,
    shape: kind === "ready" ? readyShape(payload) : "",
    payload: redactValue(payload),
  };
  snapshots.push(snap);
  if (snapshots.length > max) snapshots.splice(0, snapshots.length - max);
  return snap;
}

export function latestGateway(kind?: string): GatewaySnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (!kind || snapshots[index].kind === kind) return snapshots[index];
  }
  return null;
}

export function resetGatewayCache() {
  snapshots.length = 0;
}
