/** Heights the picker offers. 0 is the capture's own size. */
export const SHARE_HEIGHTS = [720, 1080, 1440, 2160, 0] as const;
export const SHARE_RATES = [15, 30, 60] as const;

const TABLE: Record<string, number> = {
  "720:15": 1_500_000,
  "720:30": 2_500_000,
  "720:60": 4_500_000,
  "1080:15": 2_500_000,
  "1080:30": 4_500_000,
  "1080:60": 6_000_000,
  "1440:15": 4_500_000,
  "1440:30": 8_000_000,
  "1440:60": 10_000_000,
  "2160:15": 8_000_000,
  "2160:30": 15_000_000,
  "2160:60": 20_000_000,
};

export function snapShareHeight(value: string): number {
  switch (value.trim().toLowerCase()) {
    case "720":
    case "720p":
      return 720;
    case "1080":
    case "1080p":
      return 1080;
    case "1440":
    case "1440p":
      return 1440;
    case "2160":
    case "2160p":
    case "4k":
      return 2160;
    case "source":
      return 0;
    default:
      return 1080;
  }
}

export function snapShareFps(value: number): 15 | 30 | 60 {
  if (value === 15) return 15;
  if (value === 60) return 60;
  return 30;
}

export function presetSize(height: number): { width: number; height: number } {
  if (height === 720) return { width: 1280, height: 720 };
  if (height === 1440) return { width: 2560, height: 1440 };
  if (height === 2160) return { width: 3840, height: 2160 };
  return { width: 1920, height: 1080 };
}

/** Same table the stream encoder uses. Source scales from 1080p30 by pixel count. */
export function shareBitrate(width: number, height: number, fps: number): number {
  const rate = snapShareFps(fps);
  const listed = TABLE[`${height}:${rate}`];
  if (listed) return listed;
  const reference = Math.floor((4_500_000 * Math.max(2, width) * Math.max(2, height)) / (1920 * 1080));
  const scaled = Math.floor((reference * rate) / 30);
  return Math.min(25_000_000, Math.max(800_000, scaled));
}

export function presetBitrate(height: number, fps: number, sourceWidth = 0, sourceHeight = 0): number {
  if (height === 0) {
    const width = sourceWidth > 0 ? sourceWidth : 1920;
    const frame = sourceHeight > 0 ? sourceHeight : 1080;
    return shareBitrate(width, frame, fps);
  }
  const size = presetSize(height);
  return shareBitrate(size.width, size.height, fps);
}

export function heightLabel(height: number): string {
  return height === 0 ? "Source" : `${height}p`;
}

export function formatBitrate(bps: number): string {
  const mbps = bps / 1_000_000;
  const text = Number.isInteger(mbps) ? String(mbps) : mbps.toFixed(1);
  return `${text} Mbps`;
}

export function qualityLabel(height: number, fps: number, sourceWidth = 0, sourceHeight = 0): string {
  const rate = snapShareFps(fps);
  return `${heightLabel(height)} · ${rate} fps · ${formatBitrate(presetBitrate(height, rate, sourceWidth, sourceHeight))}`;
}

export function streamKeyFor(guildId: string, channelId: string, userId: string): string {
  if (!guildId) return `call:${channelId}:${userId}`;
  return `guild:${guildId}:${channelId}:${userId}`;
}

export interface ShareSource {
  id: string;
  kind: string;
  name: string;
  width: number;
  height: number;
  thumbnail: string;
}

export function demoShareSources(): ShareSource[] {
  return [
    { id: "screen:0", kind: "screen", name: "Entire screen", width: 1920, height: 1080, thumbnail: "" },
    { id: "window:demo", kind: "window", name: "Northwind", width: 1280, height: 720, thumbnail: "" },
  ];
}
