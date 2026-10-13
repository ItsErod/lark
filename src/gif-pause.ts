const GIF = /\.gif(?:$|[?#])/i;
const LOOP_HOST = /tenor|giphy/i;

export type MotionKind = "" | "gif" | "sticker" | "video";

/** Stickers, GIF images, and Tenor or Giphy loops. Other images and files play as usual. */
export function motionKind(url: string, kind: "image" | "sticker" | "video"): MotionKind {
  const clean = url.trim();
  if (!clean) return "";
  if (kind === "sticker") return "sticker";
  if (kind === "video" && LOOP_HOST.test(clean)) return "video";
  if (kind === "image" && GIF.test(clean)) return "gif";
  return "";
}

export interface MotionAttrs {
  src: string;
  lazy: string;
  paused: string;
}

/** While paused, the animated URL stays off src. A click puts it back. */
export function nextMotionAttrs(current: MotionAttrs & { motion: MotionKind }, hold: boolean): MotionAttrs {
  if (!current.motion) return { src: current.src, lazy: current.lazy, paused: current.paused };
  const url = current.paused || current.lazy || current.src;
  if (!url) return { src: "", lazy: "", paused: "" };
  if (hold) return { src: "", lazy: "", paused: url };
  return { src: url, lazy: "", paused: "" };
}
