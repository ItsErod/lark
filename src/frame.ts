/** Hard ceiling for UI paints. Displays faster than this drop vsyncs. */
export const FRAME_CAP_MAX = 240;
/** Lowest numeric cap a config file can select. 0 means match the display. */
export const FRAME_CAP_MIN = 30;

/**
 * Hz the paint clock is willing to run at.
 * `0` matches the display by allowing every vsync up to 240.
 * A positive cap is clamped into 30–240 and never raises the display rate.
 */
export function scheduleHz(cap: number): number {
  if (!Number.isFinite(cap) || cap <= 0) return FRAME_CAP_MAX;
  return Math.min(FRAME_CAP_MAX, Math.max(FRAME_CAP_MIN, Math.round(cap)));
}

/** Keep stamps that still fall inside the FPS window, then record `now`. */
export function noteFpsMark(marks: readonly number[], now: number, windowMs = 1000): number[] {
  const cutoff = now - windowMs;
  const next = marks.filter((stamp) => stamp > cutoff && stamp <= now);
  next.push(now);
  return next;
}

/**
 * Paints per second across the stamps in the window.
 * Null until two stamps span at least a quarter of a second, so a fresh
 * counter does not flash a huge number.
 */
export function fpsFromMarks(marks: readonly number[], now: number, windowMs = 1000): number | null {
  const recent = marks.filter((stamp) => stamp <= now && now - stamp <= windowMs).sort((a, b) => a - b);
  if (recent.length < 2) return null;
  const span = recent[recent.length - 1] - recent[0];
  if (span < 250) return null;
  return Math.max(1, Math.round(((recent.length - 1) * 1000) / span));
}

/** Median refresh from vsync deltas, in Hz. 0 when the sample is empty. */
export function hzFromDeltas(deltas: number[]): number {
  const usable = deltas.filter((delta) => delta >= 1 && delta <= 100);
  if (!usable.length) return 0;
  const sorted = [...usable].sort((a, b) => a - b);
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  return Math.max(1, Math.round(1000 / mid));
}

type FrameCallback = (now: number) => void;

/**
 * Paints only after something asks for a frame, and never faster than the cap.
 * `requestFrame` is `requestAnimationFrame` in the app. Tests pass a queue.
 * Skipped vsyncs (a 360 Hz panel under a 240 cap) re-arm a single callback.
 * They do not spin.
 */
export class FrameClock {
  cap = FRAME_CAP_MAX;
  displayHz = 0;
  private queued: FrameCallback[] = [];
  private armed = false;
  private last = 0;
  private requestFrame: (cb: FrameCallback) => number;

  constructor(requestFrame: (cb: FrameCallback) => number = (cb) => requestAnimationFrame(cb)) {
    this.requestFrame = requestFrame;
  }

  setCap(cap: number) {
    this.cap = cap;
  }

  /** Schedule `work` on the next vsync that is still under the cap. */
  request(work: FrameCallback) {
    this.queued.push(work);
    this.arm();
  }

  /** Sample a handful of vsyncs once, then stop. */
  measureDisplay(): Promise<number> {
    return new Promise((resolve) => {
      const deltas: number[] = [];
      let prev = 0;
      const step = (now: number) => {
        if (prev > 0) deltas.push(now - prev);
        prev = now;
        if (deltas.length < 8) this.requestFrame(step);
        else {
          this.displayHz = hzFromDeltas(deltas);
          resolve(this.displayHz);
        }
      };
      this.requestFrame(step);
    });
  }

  /**
   * Keep asking for paints for `ms`, the way a scroll gesture does.
   * Resolves with how many paints actually ran.
   */
  bench(ms: number): Promise<{ paints: number; hz: number }> {
    return new Promise((resolve) => {
      const start = performance.now();
      let paints = 0;
      const step = () => {
        this.request(() => {
          paints += 1;
          if (performance.now() - start < ms) step();
          else {
            const elapsed = Math.max(1, performance.now() - start);
            resolve({ paints, hz: Math.round((paints * 1000) / elapsed) });
          }
        });
      };
      step();
    });
  }

  private arm() {
    if (this.armed) return;
    this.armed = true;
    this.requestFrame((now) => this.flush(now));
  }

  private flush(now: number) {
    const interval = 1000 / scheduleHz(this.cap);
    if (this.last > 0 && now - this.last < interval - 0.15) {
      this.requestFrame((next) => this.flush(next));
      return;
    }
    this.last = now;
    this.armed = false;
    const jobs = this.queued.splice(0);
    for (const job of jobs) job(now);
  }
}
