export interface SharePlan {
  send: boolean;
  fps: number;
  bitrate: number;
  dirtyRatio: number;
  regions: number;
}

/** Same thresholds as the Rust scheduler. A still screen sends nothing. */
export function planShare(dirtyRatio: number, regions: number): SharePlan {
  const ratio = Math.max(0, Math.min(1, dirtyRatio));
  if (ratio <= 0.001 || regions <= 0) {
    return { send: false, fps: 0, bitrate: 0, dirtyRatio: 0, regions: 0 };
  }
  if (ratio < 0.05) return { send: true, fps: 5, bitrate: 200_000, dirtyRatio: ratio, regions };
  if (ratio < 0.25) return { send: true, fps: 15, bitrate: 1_200_000, dirtyRatio: ratio, regions };
  return { send: true, fps: 30, bitrate: 2_500_000, dirtyRatio: ratio, regions };
}

export function dirtyRatio(prev: Uint8Array, next: Uint8Array, width: number, tile = 16): { ratio: number; regions: number } {
  if (width <= 0 || tile <= 0 || next.length === 0 || prev.length !== next.length || next.length % width !== 0) {
    return next.length === 0 ? { ratio: 0, regions: 0 } : { ratio: 1, regions: 1 };
  }
  const height = next.length / width;
  let tiles = 0;
  let dirty = 0;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      tiles += 1;
      const tw = Math.min(tile, width - x);
      const th = Math.min(tile, height - y);
      let changed = false;
      for (let row = 0; row < th && !changed; row += 1) {
        const start = (y + row) * width + x;
        for (let col = 0; col < tw; col += 1) {
          if (prev[start + col] !== next[start + col]) {
            changed = true;
            break;
          }
        }
      }
      if (changed) dirty += 1;
    }
  }
  return { ratio: tiles ? dirty / tiles : 0, regions: dirty };
}

export function captureBackend(os: string): string {
  if (os === "macos") return "ScreenCaptureKit";
  if (os === "windows") return "Windows Graphics Capture";
  return "Unavailable on this OS";
}

export function encoderName(os: string): string {
  if (os === "macos") return "VideoToolbox";
  if (os === "windows") return "NVENC, Quick Sync, AMF, or Media Foundation";
  return "Software";
}

export function formatBitrate(bps: number): string {
  if (bps <= 0) return "0 kbps";
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mb/s`;
}
