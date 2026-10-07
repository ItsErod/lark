/** Wheel targets. The document itself does not scroll. */
export const PANEL_SCROLL_SELECTOR = [
  ".rail-scroll",
  ".channel-scroll",
  ".messages",
  ".member-scroll",
  ".settings-body",
  ".settings-nav-scroll",
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

/** How close to the bottom still counts as "following" the channel. */
export const STICK_PX = 96;

/**
 * Soft cap for one open channel. Past this, while the reader is pinned to the
 * bottom, older messages drop so a busy channel cannot grow without bound.
 */
export const MESSAGE_WINDOW = 280;
export const MESSAGE_SLACK = 40;
/** Hard cap even when the reader has scrolled up. */
export const MESSAGE_HARD_CAP = 800;

export type ScrollIntent = "none" | "bottom" | "preserve";

export function distanceFromBottom(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  const height = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  const client = Number.isFinite(clientHeight) ? clientHeight : 0;
  return height - top - client;
}

export function isNearBottom(scrollTop: number, scrollHeight: number, clientHeight: number, threshold = STICK_PX): boolean {
  return distanceFromBottom(scrollTop, scrollHeight, clientHeight) <= threshold;
}

/**
 * Scroll offset after the message column changes size.
 * `bottom` and a near-bottom reading position pin to the new bottom.
 * `preserve` keeps the same messages on screen when older history is prepended.
 * Otherwise the previous offset is kept so reading back does not jump.
 */
export function anchoredScrollTop(input: {
  intent: ScrollIntent;
  prevTop: number;
  prevHeight: number;
  nextHeight: number;
  clientHeight: number;
  nearBottom: boolean;
}): number {
  const client = Math.max(0, Number.isFinite(input.clientHeight) ? input.clientHeight : 0);
  const nextHeight = Math.max(0, Number.isFinite(input.nextHeight) ? input.nextHeight : 0);
  const max = Math.max(0, nextHeight - client);
  const prevTop = Number.isFinite(input.prevTop) ? input.prevTop : 0;
  if (input.intent === "bottom" || (input.intent !== "preserve" && input.nearBottom)) return max;
  if (input.intent === "preserve") {
    const prevHeight = Number.isFinite(input.prevHeight) ? input.prevHeight : nextHeight;
    return Math.min(max, Math.max(0, prevTop + (nextHeight - prevHeight)));
  }
  return Math.min(max, Math.max(0, prevTop));
}

/**
 * Adjust after an image or embed changes height without rebuilding the list.
 * Growth above the viewport shifts the offset so the line you were reading stays put.
 * A pinned reader stays on the newest message.
 */
export function anchorAfterGrowth(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  delta: number;
  pinned: boolean;
  aboveViewport: boolean;
}): number {
  const client = Math.max(0, Number.isFinite(input.clientHeight) ? input.clientHeight : 0);
  const height = Math.max(0, Number.isFinite(input.scrollHeight) ? input.scrollHeight : 0);
  const max = Math.max(0, height - client);
  const top = Number.isFinite(input.scrollTop) ? input.scrollTop : 0;
  const delta = Number.isFinite(input.delta) ? input.delta : 0;
  if (input.pinned) return max;
  if (input.aboveViewport) return Math.min(max, Math.max(0, top + delta));
  return Math.min(max, Math.max(0, top));
}

/**
 * A rebuild clamps scrollTop to 0 and would look like the reader hit the top.
 * Ignore that while the list is locked, or history pagination fetches in a loop.
 */
export function shouldLoadOlder(input: {
  scrollTop: number;
  locked: boolean;
  loading: boolean;
  hasMore: boolean;
  sinceOpenMs: number;
  threshold?: number;
}): boolean {
  if (input.locked || input.loading || !input.hasMore) return false;
  if (!Number.isFinite(input.sinceOpenMs) || input.sinceOpenMs < 300) return false;
  const top = Number.isFinite(input.scrollTop) ? input.scrollTop : 0;
  return top < (input.threshold ?? 80);
}

/**
 * Append a single new tail message when the rows already on screen are unchanged.
 * Anything else replaces the column once. Scroll position never invalidates the list.
 */
export function messageListPlan(previousSig: string, structural: string, previousBody: string, hasColumn: boolean): "append" | "replace" {
  if (!hasColumn || !previousSig) return "replace";
  if (previousSig === `${structural}|${previousBody}`) return "append";
  return "replace";
}

/** Drop the oldest messages once a channel crosses its cap. */
export function capMessages<T>(items: T[], pinned: boolean): { items: T[]; trimmed: boolean } {
  const limit = pinned ? MESSAGE_WINDOW + MESSAGE_SLACK : MESSAGE_HARD_CAP;
  if (items.length <= limit) return { items, trimmed: false };
  return { items: items.slice(items.length - MESSAGE_WINDOW), trimmed: true };
}
