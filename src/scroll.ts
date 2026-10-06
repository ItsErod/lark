/** Wheel targets. The document itself does not scroll. */
export const PANEL_SCROLL_SELECTOR = [
  ".rail-scroll",
  ".channel-scroll",
  ".messages",
  ".member-scroll",
  ".settings-body",
  ".switcher-results",
  ".bookmark-list",
  ".codeblock",
].join(", ");

/** `deltaMode` 0 is pixels, 1 is lines, 2 is pages. */
export function pixelDelta(delta: number, mode: number, page: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0;
  if (mode === 1) return delta * 16;
  if (mode === 2) return delta * Math.max(1, page);
  return delta;
}

export function nextScrollTop(scrollTop: number, scrollHeight: number, clientHeight: number, deltaY: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  return Math.min(max, Math.max(0, top + delta));
}
