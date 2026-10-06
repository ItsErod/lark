export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export interface AwayClock {
  lastActivity: number;
  away: boolean;
  lastWrite: number;
  savedStatus: PresenceStatus;
}

export const AWAY_COOLDOWN_MS = 30_000;

export function noteActivity(state: AwayClock, now: number): AwayClock {
  if (state.lastActivity === now) return state;
  return { ...state, lastActivity: now };
}

/**
 * Emits at most one presence change per transition, and never inside the cooldown.
 * Only an online status is moved to idle. Do not disturb, invisible, and a manual idle stay put.
 */
export function stepAway(
  state: AwayClock,
  now: number,
  idleMs: number,
): { state: AwayClock; write: PresenceStatus | null } {
  if (state.savedStatus !== "online") {
    return state.away ? { state: { ...state, away: false }, write: null } : { state, write: null };
  }
  const idle = now - state.lastActivity >= idleMs;
  if (idle && !state.away) {
    if (now - state.lastWrite < AWAY_COOLDOWN_MS) return { state, write: null };
    return { state: { ...state, away: true, lastWrite: now }, write: "idle" };
  }
  if (!idle && state.away) {
    if (now - state.lastWrite < AWAY_COOLDOWN_MS) return { state, write: null };
    return { state: { ...state, away: false, lastWrite: now }, write: "online" };
  }
  return { state, write: null };
}
