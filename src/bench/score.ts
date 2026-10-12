export interface PerfSample {
  coldStartMs: number;
  channelSwitchMs: number;
  messageLoadMs: number;
  scrollFps: number;
  inputLatencyMs: number;
  idleMemoryMb: number;
  idleCpuPct: number;
}

export interface PerfSummary {
  runs: number;
  coldStartMs: number;
  channelSwitchMs: number;
  messageLoadMs: number;
  scrollFps: number;
  inputLatencyMs: number;
  idleMemoryMb: number;
  idleCpuPct: number;
}

const KEYS: (keyof PerfSample)[] = [
  "coldStartMs",
  "channelSwitchMs",
  "messageLoadMs",
  "scrollFps",
  "inputLatencyMs",
  "idleMemoryMb",
  "idleCpuPct",
];

/** Median of a numeric list. Even counts use the upper middle, so a slow outlier stays visible. */
export function median(values: readonly number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function summarize(samples: readonly PerfSample[]): PerfSummary {
  const summary = { runs: samples.length } as PerfSummary;
  for (const key of KEYS) summary[key] = roundMetric(median(samples.map((sample) => sample[key])));
  return summary;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}
