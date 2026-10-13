import { motionKind, nextMotionAttrs, type MotionKind } from "./gif-pause";

const BATCH = 8;

export function gifPauseOn(): boolean {
  return document.documentElement.dataset.gifPause === "on";
}

/** Park an animated url until click when autoplay is paused. Other media stays lazy. */
export function placeMotion(node: HTMLImageElement | HTMLVideoElement, url: string, kind: "image" | "sticker" | "video"): void {
  const motion = motionKind(url, kind);
  if (!motion || !gifPauseOn()) {
    node.dataset.lazySrc = url;
    delete node.dataset.pausedSrc;
    delete node.dataset.motion;
    return;
  }
  node.dataset.motion = motion;
  node.dataset.pausedSrc = url;
  delete node.dataset.lazySrc;
  node.removeAttribute("src");
  if (node.dataset.motionBound === "1") return;
  node.dataset.motionBound = "1";
  node.addEventListener("click", (event) => {
    if (!node.dataset.pausedSrc) return;
    event.stopPropagation();
    event.preventDefault();
    playHeld(node);
  });
}

function playHeld(node: HTMLImageElement | HTMLVideoElement): void {
  const url = node.dataset.pausedSrc;
  if (!url) return;
  delete node.dataset.pausedSrc;
  node.src = url;
  if (node instanceof HTMLVideoElement) {
    node.muted = true;
    node.loop = true;
    void node.play().catch(() => undefined);
  }
}

/** Apply a pause toggle in small frames so a long channel does not hitch. */
export function syncGifPause(root: ParentNode, paused: boolean): void {
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-motion], img[src], video[src], [data-lazy-src]")];
  let index = 0;
  const step = () => {
    const end = Math.min(nodes.length, index + BATCH);
    for (; index < end; index += 1) retarget(nodes[index], paused);
    if (index < nodes.length) requestAnimationFrame(step);
  };
  if (nodes.length) requestAnimationFrame(step);
}

function retarget(node: HTMLElement, paused: boolean): void {
  if (!(node instanceof HTMLImageElement || node instanceof HTMLVideoElement)) return;
  const url = node.dataset.pausedSrc || node.dataset.lazySrc || node.currentSrc || node.getAttribute("src") || "";
  const marked = (node.dataset.motion ?? "") as MotionKind;
  const motion = marked || motionKind(url, node instanceof HTMLVideoElement ? "video" : "image");
  if (!motion) return;
  node.dataset.motion = motion;
  const next = nextMotionAttrs({
    src: node.getAttribute("src") ?? "",
    lazy: node.dataset.lazySrc ?? "",
    paused: node.dataset.pausedSrc ?? "",
    motion,
  }, paused);
  if (next.paused) {
    node.dataset.pausedSrc = next.paused;
    delete node.dataset.lazySrc;
    node.removeAttribute("src");
    return;
  }
  delete node.dataset.pausedSrc;
  if (next.src) node.src = next.src;
  else if (next.lazy) node.dataset.lazySrc = next.lazy;
}
