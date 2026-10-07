import type { OsName } from "./types";
import { configDirHint } from "./platform";

/** Default global clip hotkey. `mod` is Command on macOS and Ctrl on Windows. */
export const CLIP_HOTKEY = "mod+shift+c";

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
    ? "macOS records with Core Graphics and asks for Screen Recording permission the first time the buffer starts."
    : os === "windows"
      ? "Windows records with GDI. A game in exclusive fullscreen can come out black; borderless and windowed games are captured. A per-frame Windows Graphics Capture session would flash the system border, so this buffer does not use one."
      : "The macOS and Windows apps record the display. This system does not.";
  return `Lark keeps about 30 seconds of the main display, and only while screen share or Game Mode capture is on. Turning both off discards the buffer. The clip hotkey writes an MJPEG AVI into the clips folder on this computer, at about 5 frames per second, scaled to fit a 960 pixel edge, and kept under 8 MB so it can be attached. Nothing is uploaded until you attach the file and send the message. ${platform} There is no system replay API for the previous 30 seconds, so the buffer has to be running before you press the hotkey.`;
}

export function bytesFromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
