import { el } from "./dom";
import { liveBadge } from "./voice-bits";

export { liveBadge };
import {
  SHARE_HEIGHTS,
  SHARE_RATES,
  formatBitrate,
  heightLabel,
  presetBitrate,
  qualityLabel,
  type ShareSource,
} from "../share";

export interface StreamTileModel {
  userId: string;
  name: string;
  self: boolean;
  paused: boolean;
  watching: boolean;
  label: string;
  note: string;
  qualityOpen: boolean;
}

export interface StreamTileHandlers {
  onWatch: (userId: string) => void;
  onStopWatch: () => void;
  onStop: () => void;
  onPause: () => void;
  onQuality: () => void;
  onResolution: (value: string) => void;
  onFps: (fps: number) => void;
  onPip: (userId: string) => void;
  resolution: string;
  fps: number;
}

export interface ShareDialogHandlers {
  sources: ShareSource[];
  selectedId: string;
  resolution: string;
  fps: number;
  appAudio: boolean;
  onSelect: (id: string) => void;
  onResolution: (value: string) => void;
  onFps: (fps: number) => void;
  onAppAudio: (on: boolean) => void;
  onGo: () => void;
  onClose: () => void;
}

const previews = new Map<string, H264Preview>();

export function shareDialog(handlers: ShareDialogHandlers): HTMLElement {
  const dialog = el("section", "share-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Share your screen");
  const head = el("header", "share-dialog-head");
  head.append(el("h2", "", "Share your screen"), closeButton(handlers.onClose));
  const grid = el("div", "share-sources");
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", "Windows and screens");
  const sources = handlers.sources.length ? handlers.sources : [];
  for (const source of sources) {
    const button = el("button", `share-source${source.id === handlers.selectedId ? " is-selected" : ""}`);
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", source.id === handlers.selectedId ? "true" : "false");
    button.append(sourceThumb(source), el("span", "share-source-name", source.name), el("span", "share-source-kind", source.kind === "screen" ? "Screen" : "Window"));
    button.addEventListener("click", () => handlers.onSelect(source.id));
    grid.append(button);
  }
  if (!sources.length) grid.append(el("p", "hint", "No windows were listed. You can still share once a screen is available."));
  const quality = el("div", "share-quality");
  quality.append(el("span", "share-quality-label", "Quality"));
  quality.append(choiceRow(SHARE_HEIGHTS.map(String), String(heightToken(handlers.resolution)), handlers.onResolution, heightChoiceLabel));
  quality.append(choiceRow(SHARE_RATES.map(String), String(handlers.fps), (value) => handlers.onFps(Number(value)), (value) => `${value} fps`));
  const selected = sources.find((source) => source.id === handlers.selectedId);
  const summary = qualityLabel(heightToken(handlers.resolution), handlers.fps, selected?.width ?? 0, selected?.height ?? 0);
  quality.append(el("p", "share-quality-summary", summary));
  const audio = el("label", "share-audio");
  const box = el("input");
  box.type = "checkbox";
  box.checked = handlers.appAudio;
  box.addEventListener("change", () => handlers.onAppAudio(box.checked));
  audio.append(box, el("span", "", "Share application audio"));
  const actions = el("div", "share-dialog-actions");
  const go = el("button", "primary", "Go Live");
  go.type = "button";
  go.disabled = !handlers.selectedId;
  go.addEventListener("click", handlers.onGo);
  const cancel = el("button", "text-button", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", handlers.onClose);
  actions.append(cancel, go);
  dialog.append(head, grid, quality, audio, actions);
  return dialog;
}

export function qualityPopover(resolution: string, fps: number, onResolution: (value: string) => void, onFps: (fps: number) => void): HTMLElement {
  const pop = el("div", "share-popover");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Stream quality");
  pop.append(el("strong", "", "Stream quality"));
  pop.append(choiceRow(SHARE_HEIGHTS.map(String), String(heightToken(resolution)), onResolution, heightChoiceLabel));
  pop.append(choiceRow(SHARE_RATES.map(String), String(fps), (value) => onFps(Number(value)), (value) => `${value} fps`));
  pop.append(el("p", "hint", qualityLabel(heightToken(resolution), fps)));
  return pop;
}

function tileSig(model: StreamTileModel, handlers: StreamTileHandlers, compact: boolean): string {
  return [model.userId, model.paused ? 1 : 0, model.watching ? 1 : 0, model.qualityOpen ? 1 : 0, model.label, model.note, compact ? 1 : 0, handlers.resolution, handlers.fps].join("|");
}

export function streamTile(model: StreamTileModel, handlers: StreamTileHandlers, compact = false): HTMLElement {
  const tile = el("article", `stream-tile${model.self ? " is-self" : ""}${compact ? " is-compact" : ""}`);
  tile.dataset.goliveTile = model.userId;
  tile.dataset.userId = model.userId;
  tile.dataset.tileSig = tileSig(model, handlers, compact);
  const canvas = el("canvas", "stream-preview");
  canvas.width = compact ? 320 : 640;
  canvas.height = compact ? 180 : 360;
  const preview = previewFor(model.userId);
  preview.attach(canvas, model.self ? "Your screen" : `${model.name}'s screen`);
  tile.append(canvas);
  const top = el("div", "stream-tile-top");
  top.append(liveBadge(model.paused));
  if (!compact) {
    const pip = el("button", "text-button", "PiP");
    pip.type = "button";
    pip.title = "Picture in picture";
    pip.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onPip(model.userId);
    });
    top.append(pip);
  }
  tile.append(top);
  const foot = el("div", "stream-tile-foot");
  foot.append(el("span", "stream-tile-name", model.self ? `${model.name} (you)` : model.name));
  if (model.label) foot.append(el("span", "stream-tile-quality", model.label));
  tile.append(foot);
  if (model.note) tile.append(el("p", "stream-note", model.note));
  else if (preview.note) tile.append(el("p", "stream-note", preview.note));
  const actions = el("div", "stream-tile-actions");
  if (model.self) {
    actions.append(textAction(model.paused ? "Resume" : "Pause", handlers.onPause));
    actions.append(textAction(model.qualityOpen ? "Close quality" : "Quality", handlers.onQuality));
    actions.append(textAction("Stop sharing", handlers.onStop));
    if (model.qualityOpen) tile.append(qualityPopover(handlers.resolution, handlers.fps, handlers.onResolution, handlers.onFps));
  } else if (model.watching) {
    actions.append(textAction("Stop watching", handlers.onStopWatch));
  } else {
    actions.append(textAction("Watch", () => handlers.onWatch(model.userId)));
  }
  if (actions.childElementCount) tile.append(actions);
  return tile;
}

/**
 * Fill stream slots the call layout already drew.
 * The grid and picture-in-picture containers stay owned by that layout:
 * this does not move them, hide them, or add a tile to the message list.
 */
export function mountStreamTiles(root: ParentNode, models: StreamTileModel[], handlers: StreamTileHandlers, pipUser: string): void {
  void pipUser;
  const used = new Set<string>();
  for (const host of root.querySelectorAll<HTMLElement>("[data-stream-host]")) {
    const id = host.dataset.streamHost ?? "";
    const slot = host.querySelector<HTMLElement>("[data-stream-slot]") ?? host;
    const model = models.find((item) => item.userId === id);
    const compact = Boolean(host.closest("[data-call-pip]"));
    if (!model) continue;
    const current = slot.querySelector<HTMLElement>("[data-golive-tile]");
    if (current?.dataset.goliveTile === model.userId && current.dataset.tileSig === tileSig(model, handlers, compact)) {
      used.add(id);
      continue;
    }
    slot.replaceChildren(streamTile(model, handlers, compact));
    used.add(id);
  }
  const grid = root.querySelector<HTMLElement>("[data-call-grid]");
  if (!grid) return;
  for (const old of grid.querySelectorAll<HTMLElement>(":scope > [data-golive-tile]")) {
    if (!models.some((model) => model.userId === old.dataset.goliveTile) || used.has(old.dataset.goliveTile ?? "")) old.remove();
  }
  for (const model of models) {
    if (used.has(model.userId)) continue;
    grid.prepend(streamTile(model, handlers));
  }
}

export function pushStreamFrame(userId: string, bytes: Uint8Array): void {
  previewFor(userId).push(bytes);
}

export function clearStreamFrames(): void {
  for (const preview of previews.values()) preview.close();
  previews.clear();
}

function previewFor(userId: string): H264Preview {
  let preview = previews.get(userId);
  if (!preview) {
    preview = new H264Preview();
    previews.set(userId, preview);
  }
  return preview;
}

class H264Preview {
  note = "";
  private canvas: HTMLCanvasElement | null = null;
  private title = "Screen";
  private decoder: VideoDecoder | null = null;
  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;
  private configured = false;
  private stamp = 0;
  private bitmap: ImageBitmap | null = null;

  attach(canvas: HTMLCanvasElement, title: string): void {
    this.canvas = canvas;
    this.title = title;
    if (typeof VideoDecoder === "undefined" && !this.note) {
      this.note = "This browser cannot decode H.264. The stream is still sent.";
    }
    this.paint();
  }

  push(bytes: Uint8Array): void {
    if (typeof VideoDecoder === "undefined") return;
    const nals = splitNals(bytes);
    let key = false;
    const sample: Uint8Array[] = [];
    for (const nal of nals) {
      if (!nal.length) continue;
      const kind = nal[0] & 0x1f;
      if (kind === 7) this.sps = nal;
      else if (kind === 8) this.pps = nal;
      else {
        sample.push(nal);
        if (kind === 5) key = true;
      }
    }
    if (!this.configured && this.sps && this.pps && key) this.configure();
    if (!this.decoder || !this.configured || !sample.length) return;
    const chunk = lengthPrefix(sample);
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: this.stamp, data: chunk }));
      this.stamp += 33_333;
    } catch {
      this.note = "Couldn't decode this stream. Sending still works.";
      this.paint();
    }
  }

  close(): void {
    try {
      this.decoder?.close();
    } catch {
      /* already closed */
    }
    this.decoder = null;
    this.bitmap?.close();
    this.bitmap = null;
  }

  private configure(): void {
    if (!this.sps || !this.pps || typeof VideoDecoder === "undefined") return;
    const sps = this.sps;
    const codec = `avc1.${hex(sps[1] ?? 0x42)}${hex(sps[2] ?? 0xe0)}${hex(sps[3] ?? 0x1f)}`;
    this.decoder?.close();
    this.decoder = new VideoDecoder({
      output: (frame) => {
        void createImageBitmap(frame).then((bitmap) => {
          frame.close();
          this.bitmap?.close();
          this.bitmap = bitmap;
          this.note = "";
          this.paint();
        }).catch(() => frame.close());
      },
      error: () => {
        this.note = "Couldn't decode this stream. Sending still works.";
        this.configured = false;
        this.paint();
      },
    });
    try {
      this.decoder.configure({ codec, description: avcC(this.sps, this.pps), optimizeForLatency: true });
      this.configured = true;
      this.note = "";
    } catch {
      this.note = "Couldn't decode this stream. Sending still works.";
      this.configured = false;
    }
  }

  private paint(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    if (this.bitmap) {
      ctx.drawImage(this.bitmap, 0, 0, width, height);
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1e1f22");
    gradient.addColorStop(1, "#3b4270");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f2f3f5";
    ctx.font = "600 22px sans-serif";
    ctx.fillText(this.title, 24, height / 2);
    if (this.note) {
      ctx.fillStyle = "#b5bac1";
      ctx.font = "13px sans-serif";
      ctx.fillText(this.note.slice(0, 72), 24, height / 2 + 28);
    }
  }
}

function splitNals(bytes: Uint8Array): Uint8Array[] {
  const annex = hasStartCode(bytes);
  if (!annex) return splitAvcc(bytes);
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
    if (to > from) out.push(bytes.slice(from, to));
  }
  return out;
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
    if (length <= 0 || offset + length > bytes.length) break;
    out.push(bytes.slice(offset, offset + length));
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
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function sourceThumb(source: ShareSource): HTMLElement {
  const frame = el("span", "share-thumb");
  if (source.thumbnail) {
    const image = el("img");
    image.alt = "";
    image.src = source.thumbnail.startsWith("data:") ? source.thumbnail : `data:image/jpeg;base64,${source.thumbnail}`;
    frame.append(image);
    return frame;
  }
  frame.append(el("span", "share-thumb-fallback", source.kind === "screen" ? "Screen" : source.name.slice(0, 1)));
  return frame;
}

function choiceRow(values: string[], current: string, onPick: (value: string) => void, label: (value: string) => string): HTMLElement {
  const row = el("div", "share-choices");
  row.setAttribute("role", "radiogroup");
  for (const value of values) {
    const button = el("button", value === current ? "is-on" : "", label(value));
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", value === current ? "true" : "false");
    button.addEventListener("click", () => onPick(value));
    row.append(button);
  }
  return row;
}

function heightChoiceLabel(value: string): string {
  return heightLabel(Number(value));
}

function heightToken(value: string): number {
  return value === "source" ? 0 : Number(value) || 1080;
}

function textAction(label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "text-button", label);
  button.type = "button";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function closeButton(onClose: () => void): HTMLButtonElement {
  const button = el("button", "icon-button", "×");
  button.type = "button";
  button.setAttribute("aria-label", "Close");
  button.addEventListener("click", onClose);
  return button;
}

export function bitrateHint(height: number, fps: number): string {
  return formatBitrate(presetBitrate(height, fps));
}
