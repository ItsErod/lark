/** Favorites, DM pins, and pin-to-top. Discord stores favorites in settings proto field 15. */

export type GuildPins = { guildId: string; channelIds: string[] };

export type ListPayload = {
  favorites: string[];
  favoritesMuted: boolean;
  favoriteExtras: string[];
  pinnedDms: string[];
  channelPins: GuildPins[];
};

export type RemoteLists = {
  favorites?: string[];
  favoritesMuted?: boolean;
  favoriteExtras?: string[];
  pinnedDms?: string[];
  channelPins?: GuildPins[];
  fromReady?: boolean;
};

export type LocalLists = {
  favorites: string[];
  favoritesMuted: boolean;
  favoriteExtras: string[];
  pinnedDms: string[];
  channelPins: Record<string, string[]>;
  favoritesMigrated: boolean;
  pinsMigrated: boolean;
};

const FAVORITE_CAP = 200;
const PIN_CAP = 40;
const GUILD_CAP = 200;

export function snowflakeOk(id: string): boolean {
  return /^[0-9]{5,22}$/.test(id);
}

export function uniqueSnowflakes(ids: readonly string[], cap: number): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!snowflakeOk(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

export function flattenFavoriteIds(map: Record<string, string[]>): string[] {
  return uniqueSnowflakes(Object.values(map).flat(), FAVORITE_CAP);
}

export function readIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueSnowflakes(parsed.filter((id): id is string => typeof id === "string"), FAVORITE_CAP);
  } catch {
    return [];
  }
}

export function refileFavorites(
  ids: readonly string[],
  channelsByGuild: Record<string, readonly { id: string }[]>,
): Record<string, string[]> {
  const wanted = new Set(ids);
  const out: Record<string, string[]> = {};
  for (const [guildId, channels] of Object.entries(channelsByGuild)) {
    const hit = channels.map((channel) => channel.id).filter((id) => wanted.has(id));
    if (hit.length) out[guildId] = hit;
  }
  return out;
}

export function pinsToMap(pins: readonly GuildPins[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of pins) {
    if (!snowflakeOk(row.guildId) || out[row.guildId]) continue;
    const ids = uniqueSnowflakes(row.channelIds ?? [], PIN_CAP);
    if (ids.length) out[row.guildId] = ids;
    if (Object.keys(out).length >= GUILD_CAP) break;
  }
  return out;
}

export function mapToPins(map: Record<string, string[]>): GuildPins[] {
  const out: GuildPins[] = [];
  for (const [guildId, channelIds] of Object.entries(map)) {
    if (!snowflakeOk(guildId)) continue;
    const ids = uniqueSnowflakes(channelIds, PIN_CAP);
    if (!ids.length) continue;
    out.push({ guildId, channelIds: ids });
    if (out.length >= GUILD_CAP) break;
  }
  return out;
}

export function toggleListed(ids: readonly string[], id: string): string[] {
  if (!snowflakeOk(id)) return [...ids];
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** Remote fields win when present. A missing field leaves the local list alone. */
export function applyRemoteLists(local: LocalLists, remote: RemoteLists, dirty: boolean): { next: LocalLists; push: boolean } {
  if (dirty) return { next: local, push: false };
  const next: LocalLists = {
    favorites: [...local.favorites],
    favoritesMuted: local.favoritesMuted,
    favoriteExtras: [...local.favoriteExtras],
    pinnedDms: [...local.pinnedDms],
    channelPins: { ...local.channelPins },
    favoritesMigrated: local.favoritesMigrated,
    pinsMigrated: local.pinsMigrated,
  };
  let push = false;
  if (Array.isArray(remote.favorites)) {
    next.favorites = uniqueSnowflakes(remote.favorites, FAVORITE_CAP);
    if (typeof remote.favoritesMuted === "boolean") next.favoritesMuted = remote.favoritesMuted;
    next.favoriteExtras = Array.isArray(remote.favoriteExtras) ? remote.favoriteExtras.filter((item) => typeof item === "string").slice(0, 50) : [];
    next.favoritesMigrated = true;
  } else if (remote.fromReady && !next.favoritesMigrated && next.favorites.length) {
    next.favoritesMigrated = true;
    push = true;
  }
  const pinsPresent = Array.isArray(remote.pinnedDms) || Array.isArray(remote.channelPins);
  if (pinsPresent) {
    if (Array.isArray(remote.pinnedDms)) next.pinnedDms = uniqueSnowflakes(remote.pinnedDms, PIN_CAP);
    if (Array.isArray(remote.channelPins)) next.channelPins = pinsToMap(remote.channelPins);
    next.pinsMigrated = true;
  } else if (remote.fromReady && !next.pinsMigrated && (next.pinnedDms.length || Object.keys(next.channelPins).length > 0)) {
    next.pinsMigrated = true;
    push = true;
  }
  return { next, push };
}

type ListSyncIo = {
  send: (payload: ListPayload) => Promise<void>;
  schedule: (ms: number, fn: () => void) => number;
  cancel: (id: number) => void;
  onError?: () => void;
  delayMs?: number;
  retryMs?: number;
};

/** Debounced Discord write. A failed PATCH stays local and is not retried in a loop. */
export class ListSync {
  dirty = false;
  private timer = 0;
  private inflight = false;
  private queued = false;
  private failures = 0;
  private snapshot: ListPayload = { favorites: [], favoritesMuted: false, favoriteExtras: [], pinnedDms: [], channelPins: [] };
  private readonly delayMs: number;
  private readonly retryMs: number;

  constructor(private readonly io: ListSyncIo) {
    this.delayMs = io.delayMs ?? 400;
    this.retryMs = io.retryMs ?? 4_000;
  }

  edit(payload: ListPayload) {
    this.snapshot = {
      favorites: [...payload.favorites],
      favoritesMuted: payload.favoritesMuted,
      favoriteExtras: [...payload.favoriteExtras],
      pinnedDms: [...payload.pinnedDms],
      channelPins: payload.channelPins.map((row) => ({ guildId: row.guildId, channelIds: [...row.channelIds] })),
    };
    this.dirty = true;
    this.failures = 0;
    if (this.inflight) {
      this.queued = true;
      return;
    }
    this.schedule(this.delayMs);
  }

  /** Remote settings win only when nothing local is waiting to upload. */
  acceptRemote(): boolean {
    return !this.dirty && !this.inflight && !this.queued;
  }

  private schedule(ms: number) {
    if (this.timer) this.io.cancel(this.timer);
    this.timer = this.io.schedule(ms, () => {
      this.timer = 0;
      void this.flush();
    });
  }

  private async flush() {
    if (this.inflight || !this.dirty) return;
    this.inflight = true;
    const snapshot = this.snapshot;
    try {
      await this.io.send(snapshot);
      this.failures = 0;
      if (samePayload(this.snapshot, snapshot)) this.dirty = false;
    } catch {
      this.failures += 1;
      this.dirty = true;
      if (this.failures === 1 && !this.queued) {
        this.io.onError?.();
        this.schedule(this.retryMs);
      }
    } finally {
      this.inflight = false;
      if (this.queued) {
        this.queued = false;
        if (this.dirty) this.schedule(this.delayMs);
      }
    }
  }
}

function samePayload(left: ListPayload, right: ListPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
