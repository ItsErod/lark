export type CallTimerStyle = "auto" | "clock";
export type CallTimerFrom = "connected" | "join";

export function callTimerStyle(value: unknown): CallTimerStyle {
  return value === "clock" ? "clock" : "auto";
}

export function callTimerFrom(value: unknown): CallTimerFrom {
  return value === "join" ? "join" : "connected";
}

/** Which timestamp the voice-panel clock should count from. 0 means it has not started. */
export function callTimerStart(from: CallTimerFrom, joinedAt: number, connectedAt: number): number {
  const start = from === "join" ? joinedAt : connectedAt;
  return Number.isFinite(start) && start > 0 ? start : 0;
}

/** `m:ss` until an hour has passed, or `h:mm:ss` when the style asks for it. */
export function formatCallElapsed(startedAt: number, now: number, style: CallTimerStyle): string {
  const elapsed = Number.isFinite(startedAt) && Number.isFinite(now) ? Math.max(0, now - startedAt) : 0;
  const total = Math.floor(elapsed / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (style === "clock" || hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

export function callTimerLabel(from: CallTimerFrom, style: CallTimerStyle, joinedAt: number, connectedAt: number, now: number): string {
  const start = callTimerStart(from, joinedAt, connectedAt);
  if (!start) return "";
  return formatCallElapsed(start, now, style);
}
