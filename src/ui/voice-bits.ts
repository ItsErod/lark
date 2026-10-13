import { signalBars, signalLabel, type RingMotion, type VoiceLinkStatus } from "../voice-stage";
import { el } from "./dom";

/** Speaking ring for a channel-list avatar. The call grid loads later. */
export function speakWrap(avatar: HTMLElement, motion: RingMotion, large = false): HTMLElement {
  const wrap = el("span", `speak-ring${large ? " is-lg" : ""} is-${motion}`);
  const spin = el("span", "speak-ring-spin");
  spin.setAttribute("aria-hidden", "true");
  wrap.append(spin, avatar);
  return wrap;
}

export function signalMeter(status: VoiceLinkStatus): HTMLElement {
  const bars = signalBars(status);
  const meter = el("span", `voice-signal is-${bars}`);
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-label", signalLabel(bars));
  for (let index = 0; index < 3; index += 1) meter.append(el("i"));
  return meter;
}

export function liveBadge(paused = false): HTMLElement {
  const badge = el("span", paused ? "live-badge is-paused" : "live-badge", paused ? "PAUSED" : "LIVE");
  badge.dataset.liveBadge = paused ? "paused" : "live";
  return badge;
}
