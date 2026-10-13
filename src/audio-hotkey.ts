const GAP_MS = 250;

/**
 * A focused window delivers the same press twice: the global shortcut and keydown.
 * The first one within the gap wins. Button clicks do not call this.
 */
export function takeAudioHotkey(lastAt: number, now: number): { allow: boolean; at: number } {
  if (!Number.isFinite(now) || now - lastAt < GAP_MS) return { allow: false, at: lastAt };
  return { allow: true, at: now };
}
