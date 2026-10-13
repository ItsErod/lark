/**
 * Remote camera pictures on the voice socket.
 *
 * The desktop shell decrypts H.264 and hands over an Annex-B access unit.
 * WebCodecs decodes it. `prefer-hardware` asks the browser for the platform
 * decoder (VideoToolbox, Media Foundation, or VA-API) when one is available.
 */

const previews = new Map<string, CameraPreview>();

export function cameraFrameBytes(annexB: string): Uint8Array | null {
  if (!annexB || annexB.length > 2_000_000) return null;
  try {
    const raw = atob(annexB);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index) & 0xff;
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

export function pushCameraFrame(userId: string, bytes: Uint8Array): void {
  if (!userId || !bytes.length) return;
  previewFor(userId).push(bytes);
}

export function attachCameraTiles(root: ParentNode): void {
  const canvases = root.querySelectorAll<HTMLCanvasElement>("canvas[data-camera-user]");
  const seen = new Set<string>();
  for (const canvas of canvases) {
    const userId = canvas.dataset.cameraUser ?? "";
    if (!userId) continue;
    seen.add(userId);
    previewFor(userId).attach(canvas);
  }
  for (const [userId, preview] of previews) {
    if (!seen.has(userId)) preview.detach(root);
  }
}

export function clearCameraFrames(): void {
  for (const preview of previews.values()) preview.close();
  previews.clear();
}

/** Annex-B NAL units, without start codes. AVCC length prefixes are accepted too. */
export function splitAnnexNals(bytes: Uint8Array): Uint8Array[] {
  if (!bytes.length) return [];
  if (!hasStartCode(bytes)) return splitAvcc(bytes);
  const out: Uint8Array[] = [];
  const starts: number[] = [];
  for (let index = 0; index + 3 < bytes.length; index += 1) {
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) starts.push(index + 3);
    else if (index + 4 < bytes.length && bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 0 && bytes[index + 3] === 1) {
      starts.push(index + 4);
      index += 3;
    }
  }
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    const to = index + 1 < starts.length ? startOfCode(bytes, starts[index + 1]) : bytes.length;
    if (to > from) out.push(bytes.subarray(from, to));
  }
  return out;
}

function previewFor(userId: string): CameraPreview {
  let preview = previews.get(userId);
  if (!preview) {
    preview = new CameraPreview();
    previews.set(userId, preview);
  }
  return preview;
}

class CameraPreview {
  private canvases: HTMLCanvasElement[] = [];
  private decoder: VideoDecoder | null = null;
  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;
  private configured = false;
  private stamp = 0;
  private acceleration: HardwareAcceleration = "prefer-hardware";

  attach(canvas: HTMLCanvasElement): void {
    if (!this.canvases.includes(canvas)) this.canvases.push(canvas);
  }

  detach(root: ParentNode): void {
    this.canvases = this.canvases.filter((canvas) => canvas.isConnected && root.contains(canvas));
  }

  push(bytes: Uint8Array): void {
    if (typeof VideoDecoder === "undefined") return;
    const nals = splitAnnexNals(bytes);
    let key = false;
    const sample: Uint8Array[] = [];
    for (const nal of nals) {
      if (!nal.length) continue;
      const kind = nal[0] & 0x1f;
      if (kind === 7) {
        if (!sameBytes(this.sps, nal)) {
          this.sps = nal.slice();
          this.configured = false;
        }
      } else if (kind === 8) {
        if (!sameBytes(this.pps, nal)) {
          this.pps = nal.slice();
          this.configured = false;
        }
      } else {
        sample.push(nal);
        if (kind === 5) key = true;
      }
    }
    if (!this.configured && this.sps && this.pps && key) this.configure();
    if (!this.decoder || !this.configured || !sample.length) return;
    if (!key && this.decoder.decodeQueueSize > 3) return;
    const chunk = lengthPrefix(sample);
    const now = Math.round(performance.now() * 1000);
    this.stamp = now > this.stamp ? now : this.stamp + 1;
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: this.stamp, data: chunk }));
    } catch {
      this.configured = false;
    }
  }

  close(): void {
    try {
      this.decoder?.close();
    } catch {
      /* already closed */
    }
    this.decoder = null;
    this.canvases = [];
  }

  private configure(): void {
    if (!this.sps || !this.pps || typeof VideoDecoder === "undefined") return;
    const sps = this.sps;
    const codec = `avc1.${hex(sps[1] ?? 0x42)}${hex(sps[2] ?? 0xe0)}${hex(sps[3] ?? 0x1f)}`;
    try {
      this.decoder?.close();
    } catch {
      /* already closed */
    }
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.paint(frame);
        frame.close();
      },
      error: () => {
        this.configured = false;
        if (this.acceleration === "prefer-hardware") this.acceleration = "prefer-software";
      },
    });
    const options = {
      codec,
      description: avcC(this.sps, this.pps),
      optimizeForLatency: true,
      hardwareAcceleration: this.acceleration,
    };
    try {
      this.decoder.configure(options);
      this.configured = true;
    } catch {
      if (this.acceleration === "prefer-hardware") {
        this.acceleration = "prefer-software";
        try {
          this.decoder.configure({ ...options, hardwareAcceleration: "prefer-software" });
          this.configured = true;
          return;
        } catch {
          /* this window cannot decode the picture */
        }
      }
      this.configured = false;
    }
  }

  private paint(frame: VideoFrame): void {
    for (const canvas of this.canvases) {
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(frame, 0, 0);
      canvas.classList.add("is-live");
    }
  }
}

function sameBytes(left: Uint8Array | null, right: Uint8Array): boolean {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasStartCode(bytes: Uint8Array): boolean {
  for (let index = 0; index + 3 < bytes.length; index += 1) {
    if (bytes[index] === 0 && bytes[index + 1] === 0 && (bytes[index + 2] === 1 || (bytes[index + 2] === 0 && bytes[index + 3] === 1))) return true;
  }
  return false;
}

function startOfCode(bytes: Uint8Array, nalStart: number): number {
  let index = nalStart - 3;
  if (index > 0 && bytes[index - 1] === 0) index -= 1;
  return Math.max(0, index);
}

function splitAvcc(bytes: Uint8Array): Uint8Array[] {
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

function lengthPrefix(nals: Uint8Array[]): Uint8Array {
  const size = nals.reduce((sum, nal) => sum + 4 + nal.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const nal of nals) {
    out[offset] = (nal.length >>> 24) & 0xff;
    out[offset + 1] = (nal.length >>> 16) & 0xff;
    out[offset + 2] = (nal.length >>> 8) & 0xff;
    out[offset + 3] = nal.length & 0xff;
    out.set(nal, offset + 4);
    offset += 4 + nal.length;
  }
  return out;
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.length + pps.length);
  out[0] = 1;
  out[1] = sps[1] ?? 0x42;
  out[2] = sps[2] ?? 0xe0;
  out[3] = sps[3] ?? 0x1f;
  out[4] = 0xff;
  out[5] = 0xe1;
  out[6] = (sps.length >> 8) & 0xff;
  out[7] = sps.length & 0xff;
  out.set(sps, 8);
  const ppsAt = 8 + sps.length;
  out[ppsAt] = 1;
  out[ppsAt + 1] = (pps.length >> 8) & 0xff;
  out[ppsAt + 2] = pps.length & 0xff;
  out.set(pps, ppsAt + 3);
  return out;
}

function hex(value: number): string {
  return (value & 0xff).toString(16).padStart(2, "0");
}
