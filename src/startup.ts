import { CHANNEL_GATEWAY_GRACE_MS } from "./guilds";

/**
 * How long a live shell can sit in connecting/reconnecting before the splash
 * covers it. Shorter gaps keep the current UI.
 */
export const SLOW_CONNECT_MS = 1_500;

/**
 * Channel lists share the gateway grace. The splash does not add another REST
 * pass; one fallback for the guild on screen still lives in the app.
 */
export const STARTUP_CHANNEL_WAIT_MS = CHANNEL_GATEWAY_GRACE_MS;

/** Give up on the first history fetch and reveal with whatever is cached. */
export const CACHE_WARM_MS = 900;

/**
 * A cached connect can finish in one frame. Hold the splash just long enough
 * to crossfade instead of flashing.
 */
export const MIN_SPLASH_MS = 400;

export const PLACE_KEY = "lark.place.v1";

export type StartupMilestone = "connect" | "ready" | "channels" | "cache" | "ui";

/** Progress floor once this milestone is reached. The next floor is the cap. */
export const STARTUP_FLOOR: Record<StartupMilestone, number> = {
  connect: 0.08,
  ready: 0.38,
  channels: 0.68,
  cache: 0.9,
  ui: 1,
};

const ORDER: StartupMilestone[] = ["connect", "ready", "channels", "cache", "ui"];

export interface SavedPlace {
  guildId: string | null;
  channelId: string | null;
}

export function parsePlace(raw: unknown): SavedPlace {
  if (!raw || typeof raw !== "object") return { guildId: null, channelId: null };
  const guildId = (raw as { guildId?: unknown }).guildId;
  const channelId = (raw as { channelId?: unknown }).channelId;
  return {
    guildId: typeof guildId === "string" && guildId ? guildId : null,
    channelId: typeof channelId === "string" && channelId ? channelId : null,
  };
}

export function startupLabel(milestone: StartupMilestone, cold: boolean): string {
  switch (milestone) {
    case "connect":
      return cold ? "Connecting to Discord" : "Reconnecting";
    case "ready":
      return "Loading servers and channels";
    case "channels":
      return "Opening a channel";
    case "cache":
    case "ui":
      return "Ready";
  }
}

/**
 * Creep toward the next milestone while work is in flight.
 * The value never reaches that next floor until the milestone actually completes.
 */
export function startupProgress(milestone: StartupMilestone, elapsedMs: number): number {
  const floor = STARTUP_FLOOR[milestone];
  if (milestone === "ui") return 1;
  const next = ORDER[ORDER.indexOf(milestone) + 1];
  const cap = STARTUP_FLOOR[next];
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const creep = (cap - floor) * (1 - Math.exp(-elapsed / 1100)) * 0.62;
  return Math.min(cap - 0.012, floor + creep);
}

/** Full splash when the shell has never been shown. On a live shell, only after a slow connect. */
export function shouldShowSplash(shellShown: boolean, disconnectedForMs: number, slowMs = SLOW_CONNECT_MS): boolean {
  if (!shellShown) return true;
  return Number.isFinite(disconnectedForMs) && disconnectedForMs >= slowMs;
}

export function splashReleaseDelay(shownForMs: number, minMs = MIN_SPLASH_MS): number {
  if (!Number.isFinite(shownForMs) || shownForMs <= 0) return minMs;
  return Math.max(0, minMs - shownForMs);
}

export function preferredGuild(guildIds: readonly string[], savedGuildId: string | null): string | null {
  if (savedGuildId && guildIds.includes(savedGuildId)) return savedGuildId;
  return guildIds[0] ?? null;
}

export function channelsReady(input: {
  ready: boolean;
  guildIds: readonly string[];
  channeled: ReadonlySet<string>;
  landingGuildId: string | null;
  readyAt: number;
  now: number;
  waitMs?: number;
}): boolean {
  if (!input.ready) return false;
  if (!input.guildIds.length) return true;
  if (input.landingGuildId && input.channeled.has(input.landingGuildId)) return true;
  if (input.guildIds.every((id) => input.channeled.has(id))) return true;
  const wait = input.waitMs ?? STARTUP_CHANNEL_WAIT_MS;
  return input.readyAt > 0 && input.now - input.readyAt >= wait;
}

export interface LandingChannel {
  id: string;
  kind: string;
}

const OPEN_KINDS = ["text", "announcement", "forum"] as const;

export function landingTarget(input: {
  place: SavedPlace;
  guildIds: readonly string[];
  channelsByGuild: Readonly<Record<string, readonly LandingChannel[]>>;
  dms: readonly LandingChannel[];
}): { guildId: string | null; channelId: string | null } {
  const guilds = new Set(input.guildIds);
  const has = (guildId: string, channelId: string) =>
    (input.channelsByGuild[guildId] ?? []).some((channel) => channel.id === channelId);

  if (input.place.channelId) {
    const channelId = input.place.channelId;
    if (input.place.guildId && guilds.has(input.place.guildId) && has(input.place.guildId, channelId)) {
      return { guildId: input.place.guildId, channelId };
    }
    if (input.dms.some((channel) => channel.id === channelId)) return { guildId: null, channelId };
    for (const guildId of input.guildIds) {
      if (has(guildId, channelId)) return { guildId, channelId };
    }
  }

  const preferred = preferredGuild(input.guildIds, input.place.guildId);
  const ordered = preferred ? [preferred, ...input.guildIds.filter((id) => id !== preferred)] : [...input.guildIds];
  for (const guildId of ordered) {
    const list = input.channelsByGuild[guildId] ?? [];
    for (const kind of OPEN_KINDS) {
      const hit = list.find((channel) => channel.kind === kind);
      if (hit) return { guildId, channelId: hit.id };
    }
  }
  const dm = input.dms.find((channel) => channel.kind === "dm" || channel.kind === "group");
  if (dm) return { guildId: null, channelId: dm.id };
  return { guildId: preferred, channelId: null };
}

export function cacheWarmDone(input: { channelId: string | null; hasPage: boolean; elapsedMs: number; warmMs?: number }): boolean {
  if (!input.channelId || input.hasPage) return true;
  const warm = input.warmMs ?? CACHE_WARM_MS;
  return input.elapsedMs >= warm;
}
