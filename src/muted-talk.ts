/**
 * "You're talking while muted."
 *
 * The gate matches the voice-activity threshold in lark-core (voice_active).
 * This module only decides when to show the banner. It does not open a
 * transport, send audio, or touch DAVE.
 */

export interface MutedTalkState {
  show: boolean;
  heldMs: number;
}

const HOLD_MS = 280;

/** 0–100 meter reading that counts as speech at this sensitivity. */
export function speechGate(sensitivity: number): number {
  const raw = Number.isFinite(sensitivity) ? sensitivity : 45;
  const s = Math.min(100, Math.max(0, Math.round(raw)));
  const rms = 0.04 * (1 - s / 100) + 0.0004;
  return Math.max(1, Math.round(rms * 100));
}

export function nextMutedTalk(
  state: MutedTalkState,
  sample: { selfMuted: boolean; level: number; sensitivity: number },
  stepMs: number,
): MutedTalkState {
  const hot = sample.selfMuted && sample.level >= speechGate(sample.sensitivity);
  if (!hot) return { show: false, heldMs: 0 };
  const heldMs = state.heldMs + Math.max(0, stepMs);
  return { show: state.show || heldMs >= HOLD_MS, heldMs };
}
