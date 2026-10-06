/** Discord custom status text limit. The shell trims before this too. */
export const DISCORD_CUSTOM_STATUS_MAX = 128;

/** Sample and presence writes stay on this cadence, not the frame clock. */
export const HARDWARE_STATUS_INTERVAL_MS = 60_000;

export const HARDWARE_STORAGE_KEY = "lark.hardware-status.v1";

export interface HardwareState {
  enabled: boolean;
  /** The next sample may replace a custom status the user already had. */
  takeover: boolean;
  /** The user wrote their own custom status while this was on. */
  paused: boolean;
  /** Last line Lark published. Empty when Lark does not own the status. */
  owned: string;
  /** Custom status to put back when the toggle is turned off. */
  savedCustom: string;
}

export interface HardwareSample {
  ok: boolean;
  line: string | null;
}

export interface HardwareStep {
  state: HardwareState;
  /** Set when Discord's custom status should change. Empty string clears it. */
  custom?: string;
}

export function emptyHardwareState(): HardwareState {
  return { enabled: false, takeover: false, paused: false, owned: "", savedCustom: "" };
}

export function loadHardwareState(enabled: boolean, raw: string | null): HardwareState {
  if (!enabled) return emptyHardwareState();
  if (!raw) return { ...emptyHardwareState(), enabled: true, takeover: true };
  try {
    const parsed = JSON.parse(raw) as { owned?: unknown; savedCustom?: unknown };
    const owned = typeof parsed.owned === "string" ? clampStatus(parsed.owned) : "";
    const savedCustom = typeof parsed.savedCustom === "string" ? clampStatus(parsed.savedCustom) : "";
    return {
      enabled: true,
      takeover: owned.length === 0,
      paused: false,
      owned,
      savedCustom,
    };
  } catch {
    return { ...emptyHardwareState(), enabled: true, takeover: true };
  }
}

export function serializeHardwareState(state: HardwareState): string | null {
  if (!state.enabled) return null;
  return JSON.stringify({ owned: state.owned, savedCustom: state.savedCustom });
}

export function setHardwareEnabled(state: HardwareState, enabled: boolean, currentCustom: string): HardwareState {
  if (!enabled) return { ...state, enabled: false };
  const current = currentCustom.trim();
  const keepSaved = state.owned.length > 0 && current === state.owned;
  return {
    enabled: true,
    takeover: true,
    paused: false,
    owned: state.owned,
    savedCustom: keepSaved ? state.savedCustom : current,
  };
}

/** A manual custom status pauses hardware until the field is cleared. */
export function noteHardwareEdit(state: HardwareState, custom: string): HardwareState {
  if (!state.enabled) return state;
  const next = custom.trim();
  if (!next) return { ...state, paused: false, owned: "", takeover: true };
  if (next !== state.owned) return { ...state, paused: true, takeover: false };
  return state;
}

export function hardwareSampleDue(lastSample: number, now: number, intervalMs = HARDWARE_STATUS_INTERVAL_MS): boolean {
  if (lastSample <= 0) return true;
  return now - lastSample >= intervalMs;
}

/**
 * Decide the next custom status. `sample` is null when no read happened
 * (a disable, or a tick that is still waiting). A failed read leaves the
 * current line alone.
 */
export function stepHardware(state: HardwareState, currentCustom: string, sample: HardwareSample | null): HardwareStep {
  const current = currentCustom.trim();
  if (!state.enabled) {
    const next = emptyHardwareState();
    if (state.owned && current === state.owned) {
      const restore = state.savedCustom === state.owned ? "" : state.savedCustom;
      if (restore !== current) return { state: next, custom: restore };
    }
    return { state: next };
  }
  if (state.paused || !sample || !sample.ok) return { state };
  const line = clampStatus(sample.line ?? "");
  if (!line) {
    if (state.owned && current === state.owned) {
      const restore = state.savedCustom === current ? "" : state.savedCustom;
      const next = { ...state, owned: "", takeover: false };
      if (restore !== current) return { state: next, custom: restore };
      return { state: next };
    }
    return { state };
  }
  const owns = state.owned.length > 0 && current === state.owned;
  if (current && !owns && !state.takeover) {
    return { state: { ...state, paused: true, takeover: false } };
  }
  if (current === line) {
    return { state: { ...state, owned: line, takeover: false, paused: false } };
  }
  return {
    state: { ...state, owned: line, takeover: false, paused: false },
    custom: line,
  };
}

export function clampStatus(line: string): string {
  const chars = Array.from(line.replace(/\s+/g, " ").trim());
  if (chars.length <= DISCORD_CUSTOM_STATUS_MAX) return chars.join("");
  return `${chars.slice(0, DISCORD_CUSTOM_STATUS_MAX - 1).join("")}…`;
}
