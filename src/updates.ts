/**
 * Desktop update flow.
 *
 * A check runs on startup and every 30 minutes. With automatic install on,
 * the bytes download in the background. Restart installs and relaunches.
 * An active voice call holds that install until the call ends. Later skips
 * this version until a newer one is published or Check for updates is used.
 */

export const UPDATE_CHECK_MS = 30 * 60 * 1000;
export const AUTO_INSTALL_KEY = "lark.updates.auto.v1";

export interface UpdateOffer {
  version: string;
  notes: string;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "deferred"
  | "installing"
  | "error";

export interface UpdateState {
  currentVersion: string;
  autoInstall: boolean;
  inCall: boolean;
  phase: UpdatePhase;
  offer: UpdateOffer | null;
  received: number;
  total: number | null;
  error: string;
  /** Restart was chosen, or automatic install is waiting for the call to end. */
  installRequested: boolean;
  /** Later dismissed this version. */
  skippedVersion: string;
}

export type UpdateEffect = "none" | "download" | "install" | "defer";

export interface UpdateStep {
  state: UpdateState;
  effect: UpdateEffect;
}

export interface UpdateBanner {
  title: string;
  notes: string;
  status: string;
  /** 0 to 1 when the download size is known. */
  progress: number | null;
  showActions: boolean;
}

export function readAutoInstall(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return true;
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function writeAutoInstall(on: boolean): string {
  return on ? "1" : "0";
}

export function initialUpdateState(currentVersion: string, autoInstall = true): UpdateState {
  return {
    currentVersion,
    autoInstall,
    inCall: false,
    phase: "idle",
    offer: null,
    received: 0,
    total: null,
    error: "",
    installRequested: false,
    skippedVersion: "",
  };
}

export function beginCheck(state: UpdateState): UpdateState {
  if (
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "ready" ||
    state.phase === "deferred" ||
    state.phase === "installing"
  ) {
    return state;
  }
  return { ...state, phase: "checking", error: "" };
}

export function checkFinished(state: UpdateState, offer: UpdateOffer | null, manual: boolean): UpdateStep {
  if (state.phase !== "checking") return { state, effect: "none" };
  if (!offer) {
    return { state: { ...state, phase: "current", offer: null, error: "" }, effect: "none" };
  }
  const skipped = !manual && state.skippedVersion === offer.version;
  const next: UpdateState = {
    ...state,
    offer,
    received: 0,
    total: null,
    error: "",
    phase: "available",
    skippedVersion: manual || state.skippedVersion !== offer.version ? "" : state.skippedVersion,
  };
  if (!manual && !state.autoInstall) return { state: next, effect: "none" };
  if (skipped) return { state: next, effect: "none" };
  return { state: { ...next, phase: "downloading", skippedVersion: "" }, effect: "download" };
}

export function checkFailed(state: UpdateState, message: string, manual: boolean): UpdateState {
  if (state.phase !== "checking") return state;
  return {
    ...state,
    phase: manual ? "error" : "idle",
    error: manual ? message : "",
  };
}

export function downloadProgress(state: UpdateState, received: number, total: number | null): UpdateState {
  if (state.offer && state.skippedVersion === state.offer.version) return state;
  const bytes = Number.isFinite(received) ? Math.max(0, received) : state.received;
  const size = total == null ? state.total : total > 0 ? total : null;
  return { ...state, phase: "downloading", received: bytes, total: size };
}

export function downloadFinished(state: UpdateState): UpdateStep {
  const version = state.offer?.version ?? "";
  if (!version || state.skippedVersion === version) {
    return {
      state: { ...state, phase: state.offer ? "available" : "idle", installRequested: false },
      effect: "none",
    };
  }
  if (state.inCall && (state.autoInstall || state.installRequested)) {
    return { state: { ...state, phase: "deferred", installRequested: true }, effect: "defer" };
  }
  if (state.inCall) return { state: { ...state, phase: "ready" }, effect: "none" };
  if (state.autoInstall || state.installRequested) {
    return { state: { ...state, phase: "installing", installRequested: false }, effect: "install" };
  }
  return { state: { ...state, phase: "ready" }, effect: "none" };
}

export function requestRestart(state: UpdateState): UpdateStep {
  if (!state.offer) return { state, effect: "none" };
  const cleared: UpdateState = { ...state, skippedVersion: "" };
  if (cleared.phase === "installing") return { state: cleared, effect: "none" };
  if (cleared.phase === "downloading") {
    return { state: { ...cleared, installRequested: true }, effect: "none" };
  }
  if (cleared.phase === "ready" || cleared.phase === "deferred") {
    if (cleared.inCall) return { state: { ...cleared, phase: "deferred", installRequested: true }, effect: "defer" };
    return { state: { ...cleared, phase: "installing", installRequested: false }, effect: "install" };
  }
  return {
    state: { ...cleared, phase: "downloading", installRequested: true, received: 0, total: null, error: "" },
    effect: "download",
  };
}

export function dismissUpdate(state: UpdateState): UpdateState {
  if (!state.offer) return { ...state, installRequested: false, phase: "idle" };
  return {
    ...state,
    installRequested: false,
    skippedVersion: state.offer.version,
    // Stay in downloading until the bytes finish so a second check cannot start.
    phase: state.phase === "downloading" ? "downloading" : "available",
    error: "",
  };
}

export function setAutoInstall(state: UpdateState, autoInstall: boolean): UpdateStep {
  const next: UpdateState = { ...state, autoInstall };
  if (!autoInstall || !next.offer) return { state: next, effect: "none" };
  if (next.phase === "downloading" || next.phase === "installing") {
    return { state: { ...next, skippedVersion: "", installRequested: true }, effect: "none" };
  }
  if (next.phase === "deferred") {
    return { state: { ...next, skippedVersion: "", installRequested: true }, effect: "defer" };
  }
  if (next.phase === "ready") {
    if (next.inCall) return { state: { ...next, phase: "deferred", installRequested: true, skippedVersion: "" }, effect: "defer" };
    return { state: { ...next, phase: "installing", installRequested: false, skippedVersion: "" }, effect: "install" };
  }
  if (next.skippedVersion === next.offer.version || next.phase === "available" || next.phase === "idle" || next.phase === "current" || next.phase === "error") {
    return {
      state: { ...next, phase: "downloading", skippedVersion: "", installRequested: false, received: 0, total: null, error: "" },
      effect: "download",
    };
  }
  return { state: next, effect: "none" };
}

export function setInCall(state: UpdateState, inCall: boolean): UpdateStep {
  if (state.inCall === inCall) return { state, effect: "none" };
  const next: UpdateState = { ...state, inCall };
  if (inCall) {
    if (next.phase === "installing") return { state: next, effect: "none" };
    const wantsInstall = (next.autoInstall || next.installRequested) && next.offer && next.skippedVersion !== next.offer.version;
    if (wantsInstall && next.phase === "ready") {
      return { state: { ...next, phase: "deferred", installRequested: true }, effect: "defer" };
    }
    if (wantsInstall && next.phase === "downloading") {
      return { state: { ...next, installRequested: true }, effect: "none" };
    }
    return { state: next, effect: "none" };
  }
  if (next.phase === "deferred" && next.installRequested && next.offer && next.skippedVersion !== next.offer.version) {
    return { state: { ...next, phase: "installing", installRequested: false }, effect: "install" };
  }
  if (next.phase === "deferred") return { state: { ...next, phase: "ready" }, effect: "none" };
  return { state: next, effect: "none" };
}

export function notesExcerpt(notes: string, max = 320): string {
  const clean = notes.replace(/\s+/g, " ").trim();
  if (!clean || max < 2) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function progressFraction(received: number, total: number | null): number | null {
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(received) || received <= 0) return 0;
  return Math.max(0, Math.min(1, received / total));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function progressLabel(received: number, total: number | null): string {
  const fraction = progressFraction(received, total);
  if (fraction == null) return formatBytes(received);
  return `${Math.round(fraction * 100)}% · ${formatBytes(received)} of ${formatBytes(total ?? 0)}`;
}

export function updateBanner(state: UpdateState): UpdateBanner | null {
  const version = state.offer?.version;
  if (!version) return null;
  if (state.skippedVersion === version) return null;
  if (state.phase !== "downloading" && state.phase !== "ready" && state.phase !== "deferred" && state.phase !== "installing") {
    return null;
  }
  const title = `Lark ${version} is ready`;
  let status = "";
  if (state.phase === "downloading") status = progressLabel(state.received, state.total);
  else if (state.phase === "ready") status = "Restart to finish the update.";
  else if (state.phase === "deferred") status = "The update installs when the call ends.";
  else if (state.phase === "installing") status = "Restarting…";
  return {
    title,
    notes: notesExcerpt(state.offer?.notes ?? ""),
    status,
    progress: state.phase === "downloading" ? progressFraction(state.received, state.total) : null,
    showActions: state.phase !== "installing",
  };
}

export function updatesStatus(state: UpdateState): string {
  const version = state.offer?.version;
  if (version && state.skippedVersion === version && state.phase !== "installing") {
    return `Lark ${version} was skipped. Check for updates to install it.`;
  }
  switch (state.phase) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return version ? `Downloading Lark ${version}. ${progressLabel(state.received, state.total)}` : "Downloading the update.";
    case "ready":
      return version ? `Lark ${version} is ready.` : "An update is ready.";
    case "deferred":
      return version ? `Lark ${version} installs when the call ends.` : "The update installs when the call ends.";
    case "installing":
      return "Restarting to finish the update.";
    case "current":
      return "Lark is up to date.";
    case "available":
      return version ? `Lark ${version} is available.` : "An update is available.";
    case "error":
      return state.error || "Couldn't check for updates.";
    default:
      return state.autoInstall ? "Updates download in the background." : "Automatic install is off.";
  }
}

export function updateErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : "";
  if (!raw) return "Couldn't check for updates.";
  if (/fetch|network|404|endpoint|release|json|timed out|timeout|connect/i.test(raw)) {
    return "Couldn't reach the update server.";
  }
  return raw.length > 160 ? "Couldn't check for updates." : raw;
}
