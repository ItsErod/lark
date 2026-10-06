/** How long to wait for READY / GUILD_CREATE channels before one REST fallback. */
export const CHANNEL_GATEWAY_GRACE_MS = 2_500;

/**
 * Delay before a channel-list REST call.
 * Gateway guild payloads are the source of truth. A guild the user is not
 * looking at never fetches. A guild that already has channels never fetches.
 * The viewed guild waits out the rest of the connect grace so GUILD_CREATE
 * can land, then one request is allowed.
 */
export function channelRestDelay(now: number, readyAt: number, graceMs = CHANNEL_GATEWAY_GRACE_MS): number {
  if (!Number.isFinite(graceMs) || graceMs <= 0) return 0;
  if (!Number.isFinite(readyAt) || readyAt <= 0) return graceMs;
  const elapsed = now - readyAt;
  if (!Number.isFinite(elapsed) || elapsed >= graceMs) return 0;
  return graceMs - elapsed;
}
