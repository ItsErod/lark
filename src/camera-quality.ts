/**
 * Camera picture sent on the voice socket.
 *
 * 720p at 30 fps is the default, which is the picture Discord shows for a
 * camera. The ladder below that profile is what a lossy link steps through.
 * One layer is sent. The shell does not encode a second simulcast rid.
 */

export interface CameraProfile {
  width: number;
  height: number;
  fps: 15 | 30;
  bitrate: number;
}

const HEIGHTS = [360, 480, 720, 1080] as const;
type CameraHeight = (typeof HEIGHTS)[number];

const WIDTH: Record<CameraHeight, number> = {
  360: 640,
  480: 848,
  720: 1280,
  1080: 1920,
};

export function snapCameraHeight(value: number): CameraHeight {
  if (!Number.isFinite(value) || value <= 360) return 360;
  if (value <= 480) return 480;
  if (value <= 720) return 720;
  return 1080;
}

export function snapCameraFps(value: number): 15 | 30 {
  return Number.isFinite(value) && value >= 24 ? 30 : 15;
}

/** Full-quality bitrate. 720p30 is 2.5 Mbps, the opcode 12 maximum for that picture. */
export function cameraBitrate(height: number, fps: number): number {
  const key = `${snapCameraHeight(height)}:${snapCameraFps(fps)}`;
  const table: Record<string, number> = {
    "360:15": 450_000,
    "360:30": 700_000,
    "480:15": 700_000,
    "480:30": 1_200_000,
    "720:15": 1_200_000,
    "720:30": 2_500_000,
    "1080:15": 2_500_000,
    "1080:30": 4_500_000,
  };
  return table[key] ?? 2_500_000;
}

export function cameraProfile(height: number, fps: number): CameraProfile {
  const snapped = snapCameraHeight(height);
  const rate = snapCameraFps(fps);
  return {
    width: WIDTH[snapped],
    height: snapped,
    fps: rate,
    bitrate: cameraBitrate(snapped, rate),
  };
}

const LADDER: ReadonlyArray<readonly [CameraHeight, 15 | 30]> = [
  [360, 15],
  [480, 15],
  [480, 30],
  [720, 15],
  [720, 30],
  [1080, 15],
  [1080, 30],
];

/**
 * Pictures at or below `want`, plus a 70% bitrate step of the chosen picture
 * so mild loss sheds bits before the resolution changes.
 */
export function cameraLadder(want: CameraProfile): CameraProfile[] {
  const chosen = cameraProfile(want.height, want.fps);
  const below = LADDER.filter(([height, fps]) => height < chosen.height || (height === chosen.height && fps < chosen.fps)).map(
    ([height, fps]) => cameraProfile(height, fps),
  );
  const reduced: CameraProfile = {
    ...chosen,
    bitrate: Math.round(chosen.bitrate * 0.7),
  };
  return [...below, reduced, chosen];
}

function closestStep(steps: readonly CameraProfile[], active: CameraProfile): number {
  let best = 0;
  let score = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const distance = Math.abs(step.width * step.height * step.fps - active.width * active.height * active.fps) + Math.abs(step.bitrate - active.bitrate);
    if (distance < score) {
      score = distance;
      best = index;
    }
  });
  return best;
}

/**
 * Move one or two rungs from `active` toward what the link can hold.
 * `sentBps` is bytes already on the wire over the last window, or 0 when
 * that window is not full yet. Loss is the percent Discord's voice socket
 * reported. The result is never above `want`.
 */
export function adaptCamera(want: CameraProfile, active: CameraProfile, lossPct: number, sentBps: number): CameraProfile {
  const steps = cameraLadder(want);
  let index = closestStep(steps, active);
  const loss = Number.isFinite(lossPct) ? Math.min(100, Math.max(0, lossPct)) : 0;
  const available = sentBps > 0 ? sentBps * (1 - loss / 100) : 0;
  const here = steps[index] ?? steps[steps.length - 1];
  const severe = loss >= 15 || (available > 0 && available < here.bitrate * 0.45);
  const congested = loss >= 8 || (available > 0 && available < here.bitrate * 0.7);
  const next = steps[Math.min(steps.length - 1, index + 1)] ?? here;
  const clear = loss < 2 && (sentBps <= 0 || available >= next.bitrate * 0.85);
  if (severe) index = Math.max(0, index - 2);
  else if (congested) index = Math.max(0, index - 1);
  else if (clear) index = Math.min(steps.length - 1, index + 1);
  return steps[index] ?? steps[0];
}
