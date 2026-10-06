export interface WindowSlice {
  start: number;
  end: number;
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
