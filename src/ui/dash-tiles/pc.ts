import { el } from "../dom";
import type { BoardHandlers, BoardSnapshot, TileHandle } from "../dashboard-view";

/** Local machine readings for the dashboard tile. Nothing here is uploaded. */

export interface PcReading {
  cpu: number | null;
  gpu: string | null;
  ramUsedMb: number | null;
  ramTotalMb: number | null;
  downMbps: number | null;
  rttMs: number | null;
  rxBytes: number | null;
  txBytes: number | null;
}

const EMPTY: PcReading = {
  cpu: null,
  gpu: null,
  ramUsedMb: null,
  ramTotalMb: null,
  downMbps: null,
  rttMs: null,
  rxBytes: null,
  txBytes: null,
};

export function emptyPc(): PcReading {
  return { ...EMPTY };
}

export function formatMb(mb: number): string {
  if (!Number.isFinite(mb) || mb < 0) return "—";
  if (mb >= 1024) {
    const gb = mb / 1024;
    const text = gb >= 10 ? String(Math.round(gb)) : String(Math.round(gb * 10) / 10);
    return `${text} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function formatCpu(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

export function formatRam(used: number | null, total: number | null): string {
  if (used == null && total == null) return "—";
  if (used != null && total != null) return `${formatMb(used)} / ${formatMb(total)}`;
  if (total != null) return formatMb(total);
  return formatMb(used ?? 0);
}

export function formatGpu(name: string | null): string {
  if (!name) return "—";
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  return clean.length > 42 ? `${clean.slice(0, 41)}…` : clean;
}

export function formatNet(down: number | null, rtt: number | null): string {
  const parts: string[] = [];
  if (down != null && Number.isFinite(down) && down >= 0) {
    const text = down >= 10 ? String(Math.round(down)) : String(Math.round(down * 10) / 10);
    parts.push(`${text} Mb/s`);
  }
  if (rtt != null && Number.isFinite(rtt) && rtt >= 0) parts.push(`${Math.round(rtt)} ms`);
  return parts.join(" · ") || "—";
}

/** Megabits per second from a byte counter. Null when the window is nonsense. */
export function netRate(prev: number | null, next: number | null, elapsedMs: number): number | null {
  if (prev == null || next == null || !(elapsedMs > 0) || next < prev) return null;
  const mbps = ((next - prev) * 8) / (elapsedMs / 1000) / 1_000_000;
  if (!Number.isFinite(mbps) || mbps > 100_000) return null;
  return Math.round(mbps * 10) / 10;
}

/** A missing sensor stays blank. Demo mode does not invent CPU or RAM. */
export function resolvePc(live: PcReading): { reading: PcReading; sample: false } {
  return { reading: live, sample: false };
}

function browserGpu(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const text = typeof raw === "string" ? raw.trim() : "";
    return text || null;
  } catch {
    return null;
  }
}

function browserRam(): { used: number | null; total: number | null } {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  if (memory?.usedJSHeapSize && memory.jsHeapSizeLimit) {
    return {
      used: Math.round(memory.usedJSHeapSize / (1024 * 1024)),
      total: Math.round(memory.jsHeapSizeLimit / (1024 * 1024)),
    };
  }
  const device = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof device === "number" && device > 0) return { used: null, total: Math.round(device * 1024) };
  return { used: null, total: null };
}

function browserNet(): { down: number | null; rtt: number | null } {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  return {
    down: typeof conn?.downlink === "number" ? conn.downlink : null,
    rtt: typeof conn?.rtt === "number" ? conn.rtt : null,
  };
}

interface MachineSnap {
  cpuPercent?: number | null;
  gpu?: string | null;
  ramUsedMb?: number | null;
  ramTotalMb?: number | null;
  netRxBytes?: number | null;
  netTxBytes?: number | null;
}

async function readMachine(): Promise<Partial<PcReading> | null> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const snap = await invoke<MachineSnap>("hardware_snapshot", { full: false, game: false, local: true });
    return {
      cpu: typeof snap.cpuPercent === "number" ? snap.cpuPercent : null,
      gpu: snap.gpu?.trim() || null,
      ramUsedMb: typeof snap.ramUsedMb === "number" ? snap.ramUsedMb : null,
      ramTotalMb: typeof snap.ramTotalMb === "number" ? snap.ramTotalMb : null,
      rxBytes: typeof snap.netRxBytes === "number" ? snap.netRxBytes : null,
      txBytes: typeof snap.netTxBytes === "number" ? snap.netTxBytes : null,
    };
  } catch {
    return null;
  }
}

export async function readPc(previous: { at: number; bytes: number | null } | null, now = Date.now()): Promise<{ reading: PcReading; mark: { at: number; bytes: number | null } }> {
  const ram = browserRam();
  const net = browserNet();
  const machine = await readMachine();
  let cpu = machine?.cpu ?? null;
  if (machine && cpu == null && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const again = await readMachine();
    if (again?.cpu != null) cpu = again.cpu;
    if (again) Object.assign(machine, { rxBytes: again.rxBytes ?? machine.rxBytes, txBytes: again.txBytes ?? machine.txBytes });
  }
  const bytes = machine?.rxBytes != null || machine?.txBytes != null
    ? (machine?.rxBytes ?? 0) + (machine?.txBytes ?? 0)
    : null;
  const rate = previous ? netRate(previous.bytes, bytes, now - previous.at) : null;
  const live: PcReading = {
    cpu,
    gpu: machine?.gpu || browserGpu(),
    ramUsedMb: machine?.ramUsedMb ?? ram.used,
    ramTotalMb: machine?.ramTotalMb ?? ram.total,
    downMbps: rate ?? net.down,
    rttMs: net.rtt,
    rxBytes: machine?.rxBytes ?? null,
    txBytes: machine?.txBytes ?? null,
  };
  return { reading: live, mark: { at: now, bytes } };
}

function row(label: string, value: string): HTMLElement {
  const line = el("div", "dash-stat");
  line.append(el("span", "", label), el("b", "", value));
  return line;
}

export function mount(_host: HTMLElement, _handlers: BoardHandlers): TileHandle {
  const host = _host;
  let timer = 0;
  let mark: { at: number; bytes: number | null } | null = null;
  let reading = emptyPc();

  const stop = () => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
  };

  const paint = () => {
    const shown = resolvePc(reading);
    host.replaceChildren();
    const list = el("div", "dash-stats");
    list.append(
      row("CPU", formatCpu(shown.reading.cpu)),
      row("GPU", formatGpu(shown.reading.gpu)),
      row("RAM", formatRam(shown.reading.ramUsedMb, shown.reading.ramTotalMb)),
      row("Network", formatNet(shown.reading.downMbps, shown.reading.rttMs)),
    );
    host.append(list);
    host.append(el("p", "dash-sample", "On this device. Nothing is uploaded."));
  };

  const sample = () => {
    stop();
    void readPc(mark).then((next) => {
      reading = next.reading;
      mark = next.mark;
      if (document.hidden) return;
      paint();
      timer = window.setTimeout(sample, 3000);
    }).catch(() => {
      paint();
    });
  };

  return {
    update(snapshot: BoardSnapshot) {
      void snapshot;
      if (!timer && host.childElementCount === 0) sample();
      else paint();
    },
    pause() { stop(); },
    resume() { sample(); },
    destroy() { stop(); host.replaceChildren(); },
  };
}
