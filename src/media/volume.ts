import { playbackVolume, VOLUME_BOOST_MAX, VOLUME_SLIDER_MAX } from "../voice";

export { VOLUME_BOOST_MAX, VOLUME_SLIDER_MAX };

/** Slider ceiling. The booster is the only way past the built-in 200%. */
export function volumeCeiling(enabled: boolean, choice: number): number {
  if (!enabled) return VOLUME_SLIDER_MAX;
  const picked = Math.round(choice);
  if (picked === VOLUME_SLIDER_MAX || picked === 300 || picked === VOLUME_BOOST_MAX) return picked;
  return VOLUME_BOOST_MAX;
}

export function volumeCapChoice(value: unknown): 200 | 300 | 400 {
  const picked = typeof value === "number" ? value : Number(value);
  if (picked === 200 || picked === 300) return picked;
  return 400;
}

/** Gain sent to playback. Mute still forces silence. */
export function boostedPlayback(volume: number, muted: boolean, ceiling: number): number {
  return playbackVolume(volume, muted, ceiling);
}
