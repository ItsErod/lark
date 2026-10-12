/**
 * Interface hot updates.
 *
 * The native app downloads and checks the bundle. This module decides when the
 * toast can appear: after a bundle is ready, and never while a voice call is
 * connected. The call ending shows it.
 */

export const INTERFACE_CHECK_MS = 30 * 60 * 1000;

export type InterfaceChannel = "stable" | "canary";

export interface InterfaceSnapshot {
  channel: InterfaceChannel;
  source: "builtin" | "bundle";
  build: number;
  version: string;
  pendingBuild: number;
  pendingVersion: string;
  reloadReady: boolean;
  bad: number[];
  nativeVersion: string;
}

export interface InterfaceReport {
  status: InterfaceSnapshot;
  outcome: string;
  message: string;
}

export interface InterfaceUi {
  snapshot: InterfaceSnapshot;
  inCall: boolean;
  checking: boolean;
  error: string;
  note: string;
}

export interface InterfaceToast {
  text: string;
  action: string;
}

export function emptyInterfaceSnapshot(): InterfaceSnapshot {
  return {
    channel: "stable",
    source: "builtin",
    build: 0,
    version: "",
    pendingBuild: 0,
    pendingVersion: "",
    reloadReady: false,
    bad: [],
    nativeVersion: "",
  };
}

export function initialInterfaceUi(): InterfaceUi {
  return {
    snapshot: emptyInterfaceSnapshot(),
    inCall: false,
    checking: false,
    error: "",
    note: "",
  };
}

export function normalizeInterfaceSnapshot(raw: Partial<InterfaceSnapshot> | null | undefined): InterfaceSnapshot {
  const channel = raw?.channel === "canary" ? "canary" : "stable";
  return {
    channel,
    source: raw?.source === "bundle" ? "bundle" : "builtin",
    build: numberOrZero(raw?.build),
    version: typeof raw?.version === "string" ? raw.version : "",
    pendingBuild: numberOrZero(raw?.pendingBuild),
    pendingVersion: typeof raw?.pendingVersion === "string" ? raw.pendingVersion : "",
    reloadReady: raw?.reloadReady === true,
    bad: Array.isArray(raw?.bad) ? raw.bad.filter((build) => Number.isInteger(build) && build > 0) : [],
    nativeVersion: typeof raw?.nativeVersion === "string" ? raw.nativeVersion : "",
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function interfaceBuildLabel(snapshot: InterfaceSnapshot): string {
  if (snapshot.source !== "bundle" || snapshot.build <= 0) return "Built-in";
  return snapshot.version ? `Build ${snapshot.build} · ${snapshot.version}` : `Build ${snapshot.build}`;
}

/** The toast stays hidden for the whole call, then returns with the pending bundle. */
export function interfaceToast(ui: InterfaceUi): InterfaceToast | null {
  if (!ui.snapshot.reloadReady || ui.inCall) return null;
  return { text: "Update ready, reload", action: "Reload" };
}

export function applyInterfaceSnapshot(ui: InterfaceUi, snapshot: InterfaceSnapshot): InterfaceUi {
  return { ...ui, snapshot: normalizeInterfaceSnapshot(snapshot), checking: false };
}

export function applyInterfaceReport(ui: InterfaceUi, report: InterfaceReport, manual: boolean): InterfaceUi {
  const snapshot = normalizeInterfaceSnapshot(report.status);
  const message = report.message?.trim() ?? "";
  const show = manual || report.outcome === "ready";
  return {
    ...ui,
    snapshot,
    checking: false,
    error: "",
    note: show ? message : "",
  };
}

export function applyInterfaceError(ui: InterfaceUi, message: string, manual: boolean): InterfaceUi {
  return {
    ...ui,
    checking: false,
    error: manual ? message : "",
    note: manual ? "" : ui.note,
  };
}

export function setInterfaceCall(ui: InterfaceUi, inCall: boolean): InterfaceUi {
  if (ui.inCall === inCall) return ui;
  return { ...ui, inCall };
}

export function notifyInterfaceBoot(): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("interface_boot_ready"))
    .catch(() => undefined);
}
