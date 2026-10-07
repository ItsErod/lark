import type { OsName } from "./types";
import { configDirHint } from "./platform";

/** Default global clip hotkey. `mod` is Command on macOS and Ctrl on Windows. */
export const CLIP_HOTKEY = "mod+shift+c";

export const CLIP_FPS_OPTIONS = [60, 120, 240] as const;
export const CLIP_RESOLUTION_OPTIONS = [720, 1080, 1440, 2160] as const;
export const DEFAULT_CLIP_FPS = 60;
export const DEFAULT_CLIP_RESOLUTION = 1440;

export function sanitizeClipFps(value: unknown): number {
  return value === 120 || value === 240 ? value : DEFAULT_CLIP_FPS;
}

export function sanitizeClipResolution(value: unknown): number {
  return value === 720 || value === 1080 || value === 2160 ? value : DEFAULT_CLIP_RESOLUTION;
}

export function clipsDirHint(os: OsName): string {
  const base = configDirHint(os);
  if (os === "windows") return `${base}\\clips`;
  if (os === "macos") return `${base}/clips`;
  return `${base}/clips`;
}

/**
 * What the rolling buffer does. Kept here so Settings and the tests describe the same behavior.
 * The desktop shell samples the main display only while screen share or Game Mode capture is on.
 */
export function clipBehaviorNote(os: OsName): string {
  const platform = os === "macos"
    ? "macOS captures with ScreenCaptureKit and encodes with VideoToolbox, using HEVC when the rate needs it. The first start asks for Screen Recording permission."
    : os === "windows"
      ? "Windows captures with DXGI Desktop Duplication, or Windows Graphics Capture when duplication is unavailable, and encodes with a hardware Media Foundation encoder (NVENC, AMF, or Quick Sync), using HEVC when the rate needs it."
      : "The macOS and Windows apps capture the display on the GPU. This system does not.";
  return `Lark keeps about 30 seconds of the main display, and only while screen share or Game Mode capture is on. Turning both off discards the buffer. The default is 1440p at 60 fps. Settings can pick 720p, 1080p, 1440p, or 2160p, each with 60, 120, or 240 fps. A hardware encoder keeps an encoded H.264 or HEVC packet ring, and the clip hotkey remuxes that ring into an MP4 (video and AAC audio, with the moov atom at the front). If the display or encoder cannot hold the combination, Lark caps it and says so here. If hardware capture isn't available, Lark falls back to about 5 frames per second, scaled to fit a 960 pixel edge. Game Mode drops frames instead of queuing them and keeps the capture thread below the game. The saved file is the full recording in the clips folder. If it is over this account's upload limit, Lark follows the compress setting (always, ask, or never) and the detected tier: 10 MB, 50 MB, or 500 MB. Nothing is uploaded until you attach the file and send the message. ${platform} There is no system replay API for the previous 30 seconds, so the buffer has to be running before you press the hotkey.`;
}

export function bytesFromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
