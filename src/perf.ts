export interface PerfSample {
  cpu: number | null;
  ramUsedMb: number | null;
  ramTotalMb: number | null;
  fps: number | null;
}

export interface PerfRow {
  label: string;
  value: string;
}

export function emptyPerfSample(): PerfSample {
  return { cpu: null, ramUsedMb: null, ramTotalMb: null, fps: null };
}

function formatGb(mb: number): string {
  const gb = mb / 1024;
  if (gb >= 10) return String(Math.round(gb));
  const tenths = Math.round(gb * 10) / 10;
  return tenths.toFixed(1);
}

export function formatRam(usedMb: number | null, totalMb: number | null): string {
  if (usedMb == null || totalMb == null || !Number.isFinite(usedMb) || !Number.isFinite(totalMb) || totalMb <= 0) {
    return "—";
  }
  const used = Math.max(0, Math.min(usedMb, totalMb));
  return `${formatGb(used)} / ${formatGb(totalMb)} GB`;
}

/**
 * How the overlay should watch frames.
 * Live while the strip is on. Game Mode takes a one-second burst so the
 * frame loop does not stay armed for the whole session.
 */
export function fpsWatch(perfOn: boolean, gameMode: boolean): "off" | "live" | "burst" {
  if (!perfOn) return "off";
  return gameMode ? "burst" : "live";
}

/** CPU, RAM, and FPS rows for the overlay strip. Missing reads stay a dash. */
export function perfRows(sample: PerfSample): PerfRow[] {
  const cpu = sample.cpu == null || !Number.isFinite(sample.cpu)
    ? "—"
    : `${Math.max(0, Math.min(100, Math.round(sample.cpu)))}%`;
  const fps = sample.fps == null || !Number.isFinite(sample.fps)
    ? "—"
    : String(Math.max(0, Math.round(sample.fps)));
  return [
    { label: "CPU", value: cpu },
    { label: "RAM", value: formatRam(sample.ramUsedMb, sample.ramTotalMb) },
    { label: "FPS", value: fps },
  ];
}
