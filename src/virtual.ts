export interface WindowSlice {
  start: number;
  end: number;
  total: number;
}

/** Below this, mounting every row is cheaper than spacers. */
export const VIRTUAL_MIN = 32;

export interface SpanWindow {
  start: number;
  end: number;
  top: number;
  bottom: number;
  total: number;
}

/** Index window for a virtual list. `row` is the estimated row height in pixels. */
export function sliceWindow(count: number, scrollTop: number, view: number, row: number, overscan = 8): WindowSlice {
  if (count <= 0) return { start: 0, end: 0, total: 0 };
  const rowH = Math.max(1, row);
  const top = Math.max(0, scrollTop);
  const height = Math.max(rowH, view);
  const start = Math.max(0, Math.floor(top / rowH) - overscan);
  const end = Math.min(count, Math.ceil((top + height) / rowH) + overscan);
  return { start, end, total: count * rowH };
}

export function rowEstimate(density: string): number {
  if (density === "irc") return 28;
  if (density === "compact") return 36;
  return 78;
}

function rowAt(heights: ArrayLike<number> | undefined, index: number, fallback: number): number {
  const known = heights ? Number(heights[index]) : 0;
  return known > 0 ? known : fallback;
}

/**
 * Variable-height window. A `0` height means "not measured yet" and uses `fallback`.
 * `pinned` keeps the tail on screen. `focus` forces that index into the window
 * so a jump target is mounted.
 */
export function spanWindow(
  count: number,
  heights: ArrayLike<number> | undefined,
  scrollTop: number,
  view: number,
  fallback: number,
  overscan = 6,
  pinned = false,
  focus = -1,
): SpanWindow {
  const row = Math.max(1, fallback);
  if (count <= 0) return { start: 0, end: 0, top: 0, bottom: 0, total: 0 };
  const prefix = new Array<number>(count + 1);
  prefix[0] = 0;
  for (let index = 0; index < count; index += 1) prefix[index + 1] = prefix[index] + rowAt(heights, index, row);
  const total = prefix[count];
  if (count <= VIRTUAL_MIN) return { start: 0, end: count, top: 0, bottom: 0, total };
  const pad = Math.max(0, overscan) * row;
  const viewHeight = Math.max(row, view);
  const anchor = pinned ? Math.max(0, total - viewHeight) : Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const viewTop = Math.max(0, anchor - pad);
  const viewBottom = anchor + viewHeight + pad;
  let start = 0;
  while (start < count && prefix[start + 1] <= viewTop) start += 1;
  let end = start;
  while (end < count && prefix[end] < viewBottom) end += 1;
  if (focus >= 0 && focus < count) {
    start = Math.min(start, Math.max(0, focus - overscan));
    end = Math.max(end, Math.min(count, focus + overscan + 1));
  }
  return { start, end, top: prefix[start], bottom: total - prefix[end], total };
}
