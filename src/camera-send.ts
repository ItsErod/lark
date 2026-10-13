/**
 * Camera capture for a voice call.
 *
 * The GPU encoder (WebCodecs `prefer-hardware`) runs first. If this window
 * cannot use it, the same encoder runs in software. The Rust encoder is the
 * last resort, and it only receives a frame when the previous one has been
 * handed off. One in-flight frame keeps a 720p picture from piling up in RAM.
 */

import { adaptCamera, cameraProfile, type CameraProfile } from "./camera-quality";

export interface CameraSendInput {
  deviceId: string;
  height: number;
  fps: number;
  send: boolean;
  lossPct: () => number;
  invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  onFrame: (stream: MediaStream) => void;
}

export interface CameraSendHandle {
  stream: MediaStream;
  stop: () => void;
}

type Acceleration = "prefer-hardware" | "prefer-software";

export async function openCameraSend(input: CameraSendInput): Promise<CameraSendHandle> {
  const want = cameraProfile(input.height, input.fps);
  let active = want;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(input.deviceId ? { deviceId: { exact: input.deviceId } } : {}),
      width: { ideal: want.width },
      height: { ideal: want.height },
      frameRate: { ideal: want.fps },
    },
  });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  video.srcObject = stream;
  document.body.append(video);
  await video.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) {
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
    throw new Error("Couldn't open the camera.");
  }

  let stopped = false;
  let encoder: VideoEncoder | null = null;
  let acceleration: Acceleration = "prefer-hardware";
  let rust = false;
  let rawBusy = false;
  let retargeting = false;
  let forceKey = true;
  let encoded = 0;
  let stamp = 0;
  let sentBytes = 0;
  let windowStart = performance.now();
  let pending: { bytes: Uint8Array; key: boolean } | null = null;
  let sending = false;
  let timer = 0;

  const coded = (profile: CameraProfile): CameraProfile => (rust && profile.height === 1080 ? { ...profile, height: 1088 } : profile);

  const publish = async (profile: CameraProfile) => {
    if (!input.send) return;
    const picture = coded(profile);
    await input.invoke("set_camera_profile", {
      width: picture.width,
      height: picture.height,
      fps: picture.fps,
      bitrate: picture.bitrate,
    });
  };

  const flush = async () => {
    if (sending || !pending || stopped || !input.send) return;
    const next = pending;
    pending = null;
    sending = true;
    try {
      await input.invoke("push_camera_access", { annexB: bytesToBase64(next.bytes) });
    } catch {
      /* the next frame tries again */
    }
    sending = false;
    if (pending) void flush();
  };

  const queueAccess = (bytes: Uint8Array, key: boolean) => {
    sentBytes += bytes.byteLength;
    if (!input.send || stopped) return;
    if (pending?.key && !key) return;
    pending = { bytes, key };
    void flush();
  };

  const handleChunk = (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
    const sample = new Uint8Array(chunk.byteLength);
    chunk.copyTo(sample);
    const description = meta?.decoderConfig?.description;
    const bytes = accessUnit(sample, description ? copyBuffer(description) : null, chunk.type === "key");
    if (bytes.length) queueAccess(bytes, chunk.type === "key");
  };

  const openEncoder = async (profile: CameraProfile, mode: Acceleration): Promise<VideoEncoder | null> => {
    if (typeof VideoEncoder === "undefined") return null;
    const config = encoderConfig(profile, mode);
    try {
      if (VideoEncoder.isConfigSupported) {
        const support = await VideoEncoder.isConfigSupported(config);
        if (!support.supported) return null;
      }
    } catch {
      /* configure reports a config this window cannot use */
    }
    let failed = false;
    const created = new VideoEncoder({
      output: handleChunk,
      error: () => {
        failed = true;
      },
    });
    try {
      created.configure(config);
    } catch {
      try {
        created.close();
      } catch {
        /* already closed */
      }
      return null;
    }
    if (failed) {
      try {
        created.close();
      } catch {
        /* already closed */
      }
      return null;
    }
    return created;
  };

  const sizeCanvas = (profile: CameraProfile) => {
    const picture = coded(profile);
    if (canvas.width !== picture.width) canvas.width = picture.width;
    if (canvas.height !== picture.height) canvas.height = picture.height;
  };

  encoder = await openEncoder(active, "prefer-hardware");
  if (!encoder) {
    acceleration = "prefer-software";
    encoder = await openEncoder(active, "prefer-software");
  }
  rust = !encoder;
  sizeCanvas(active);
  await publish(active);

  const retarget = async (next: CameraProfile) => {
    if (retargeting || stopped) return;
    retargeting = true;
    active = next;
    sizeCanvas(active);
    const track = stream.getVideoTracks()[0];
    try {
      await track?.applyConstraints({
        width: { ideal: next.width },
        height: { ideal: next.height },
        frameRate: { ideal: next.fps },
      });
    } catch {
      /* the canvas still scales the picture */
    }
    if (encoder) {
      try {
        encoder.configure(encoderConfig(active, acceleration));
        forceKey = true;
      } catch {
        try {
          encoder.close();
        } catch {
          /* already closed */
        }
        encoder = null;
        rust = true;
        sizeCanvas(active);
      }
    }
    await publish(active);
    retargeting = false;
  };

  const capture = () => {
    if (stopped || video.readyState < 2) return;
    input.onFrame(stream);
    const now = performance.now();
    if (input.send && now - windowStart >= 2000) {
      const elapsed = (now - windowStart) / 1000;
      const sentBps = elapsed >= 1.5 ? Math.round((sentBytes * 8) / elapsed) : 0;
      const next = adaptCamera(want, active, input.lossPct(), sentBps);
      windowStart = now;
      sentBytes = 0;
      if (!sameProfile(next, active)) void retarget(next);
    }
    const picture = coded(active);
    const drawn = picture.height === 1088 ? 1080 : picture.height;
    if (drawn !== picture.height) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, picture.width, picture.height);
    }
    drawCover(ctx, video, picture.width, drawn);
    if (encoder && encoder.state === "configured") {
      if (encoder.encodeQueueSize > 2) return;
      const timestamp = Math.round(now * 1000);
      stamp = timestamp > stamp ? timestamp : stamp + 1;
      const frame = new VideoFrame(canvas, { timestamp: stamp });
      const key = forceKey || encoded % (active.fps * 2) === 0;
      forceKey = false;
      try {
        encoder.encode(frame, { keyFrame: key });
        encoded += 1;
      } catch {
        rust = true;
        try {
          encoder.close();
        } catch {
          /* already closed */
        }
        encoder = null;
        sizeCanvas(active);
        void publish(active);
      }
      frame.close();
      return;
    }
    if (!input.send || rawBusy) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    rawBusy = true;
    void input.invoke("push_camera_rgba", {
      width: canvas.width,
      height: canvas.height,
      rgba: bytesToBase64(image.data),
    }).catch(() => undefined).finally(() => {
      rawBusy = false;
    });
  };

  const tick = () => {
    if (stopped) return;
    capture();
    timer = window.setTimeout(tick, Math.round(1000 / active.fps));
  };
  tick();

  return {
    stream,
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      pending = null;
      try {
        encoder?.close();
      } catch {
        /* already closed */
      }
      encoder = null;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      video.remove();
    },
  };
}

export function accessUnit(sample: Uint8Array, description: Uint8Array | null, key: boolean): Uint8Array {
  const body = isAnnex(sample) ? splitAnnex(sample) : splitLengthPrefixed(sample);
  const sets = key && description ? parameterSets(description) : [];
  return concatAnnex([...sets, ...body]);
}

function encoderConfig(profile: CameraProfile, acceleration: Acceleration): VideoEncoderConfig {
  return {
    codec: profile.height >= 1080 ? "avc1.42E028" : "avc1.42E01F",
    width: profile.width,
    height: profile.height,
    bitrate: profile.bitrate,
    framerate: profile.fps,
    latencyMode: "realtime",
    hardwareAcceleration: acceleration,
    avc: { format: "avc" },
  };
}

function sameProfile(a: CameraProfile, b: CameraProfile): boolean {
  return a.width === b.width && a.height === b.height && a.fps === b.fps && a.bitrate === b.bitrate;
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number): void {
  const sourceW = video.videoWidth || width;
  const sourceH = video.videoHeight || height;
  const scale = Math.max(width / sourceW, height / sourceH);
  const cropW = width / scale;
  const cropH = height / scale;
  ctx.drawImage(video, (sourceW - cropW) / 2, (sourceH - cropH) / 2, cropW, cropH, 0, 0, width, height);
}

function isAnnex(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || (bytes[2] === 0 && bytes[3] === 1));
}

function splitAnnex(bytes: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let index = 0; index + 3 < bytes.length; index += 1) {
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) starts.push(index + 3);
    else if (index + 4 < bytes.length && bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 0 && bytes[index + 3] === 1) {
      starts.push(index + 4);
      index += 3;
    }
  }
  const out: Uint8Array[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    let to = index + 1 < starts.length ? starts[index + 1] : bytes.length;
    if (to >= 3 && bytes[to - 3] === 0 && bytes[to - 2] === 0 && bytes[to - 1] === 1) to -= bytes[to - 4] === 0 ? 4 : 3;
    if (to > from) out.push(bytes.subarray(from, to));
  }
  return out;
}

function splitLengthPrefixed(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;
    if (!length || offset + length > bytes.length) break;
    out.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return out;
}

function parameterSets(description: Uint8Array): Uint8Array[] {
  if (description.length < 7 || description[0] !== 1) return [];
  const out: Uint8Array[] = [];
  let offset = 5;
  const spsCount = description[offset] & 0x1f;
  offset += 1;
  for (let index = 0; index < spsCount && offset + 2 <= description.length; index += 1) {
    const length = (description[offset] << 8) | description[offset + 1];
    offset += 2;
    if (offset + length > description.length) return out;
    out.push(description.subarray(offset, offset + length));
    offset += length;
  }
  if (offset >= description.length) return out;
  const ppsCount = description[offset];
  offset += 1;
  for (let index = 0; index < ppsCount && offset + 2 <= description.length; index += 1) {
    const length = (description[offset] << 8) | description[offset + 1];
    offset += 2;
    if (offset + length > description.length) return out;
    out.push(description.subarray(offset, offset + length));
    offset += length;
  }
  return out;
}

function concatAnnex(nals: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const nal of nals) size += 4 + nal.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const nal of nals) {
    out[offset + 3] = 1;
    out.set(nal, offset + 4);
    offset += 4 + nal.length;
  }
  return out;
}

function copyBuffer(source: BufferSource): Uint8Array {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

export function bytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let binary = "";
  const step = 0x2000;
  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.subarray(index, index + step);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
