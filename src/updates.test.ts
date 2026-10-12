import { describe, expect, it } from "vitest";
import {
  AUTO_INSTALL_KEY,
  UPDATE_CHECK_MS,
  beginCheck,
  checkFailed,
  checkFinished,
  dismissUpdate,
  downloadFinished,
  downloadProgress,
  initialUpdateState,
  notesExcerpt,
  progressLabel,
  readAutoInstall,
  requestRestart,
  setAutoInstall,
  setInCall,
  updateBanner,
  updatesStatus,
  writeAutoInstall,
} from "./updates";

const notes = "Voice calls stay up while Lark downloads.\n\nRestart when you are ready.";

function readyToDownload() {
  const checking = beginCheck(initialUpdateState("3.0.0", true));
  return checkFinished(checking, { version: "3.0.1", notes }, false);
}

describe("update checks", () => {
  it("checks on a 30 minute timer and installs automatically by default", () => {
    expect(UPDATE_CHECK_MS).toBe(30 * 60 * 1000);
    expect(AUTO_INSTALL_KEY).toBe("lark.updates.auto.v1");
    expect(readAutoInstall(null)).toBe(true);
    expect(readAutoInstall("")).toBe(true);
    expect(readAutoInstall("1")).toBe(true);
    expect(readAutoInstall("0")).toBe(false);
    expect(readAutoInstall("false")).toBe(false);
    expect(writeAutoInstall(false)).toBe("0");
  });

  it("downloads on startup when a newer build is published", () => {
    const step = readyToDownload();
    expect(step.effect).toBe("download");
    expect(step.state.phase).toBe("downloading");
    expect(step.state.offer?.version).toBe("3.0.1");
  });

  it("stays quiet when the running build is current", () => {
    const checking = beginCheck(initialUpdateState("3.0.0", true));
    const step = checkFinished(checking, null, false);
    expect(step.effect).toBe("none");
    expect(step.state.phase).toBe("current");
    expect(updatesStatus(step.state)).toBe("Lark is up to date.");
  });

  it("does not download on the timer when automatic install is off", () => {
    const checking = beginCheck(initialUpdateState("3.0.0", false));
    const step = checkFinished(checking, { version: "3.0.1", notes }, false);
    expect(step.effect).toBe("none");
    expect(step.state.phase).toBe("available");
    const manual = checkFinished(beginCheck(step.state), { version: "3.0.1", notes }, true);
    expect(manual.effect).toBe("download");
  });

  it("shows the ready banner with notes, then installs outside a call", () => {
    let state = readyToDownload().state;
    state = downloadProgress(state, 400, 1000);
    const loading = updateBanner(state);
    expect(loading?.title).toBe("Lark 3.0.1 is ready");
    expect(loading?.progress).toBe(0.4);
    expect(loading?.status).toBe(progressLabel(400, 1000));
    expect(loading?.showActions).toBe(true);

    const done = downloadFinished(state);
    expect(done.effect).toBe("install");
    const banner = updateBanner({ ...done.state, phase: "ready" });
    expect(banner?.title).toBe("Lark 3.0.1 is ready");
    expect(banner?.notes).toContain("Voice calls stay up");
    expect(banner?.showActions).toBe(true);
  });

  it("defers the install until the voice call ends", () => {
    const joined = setInCall(readyToDownload().state, true);
    expect(joined.state.inCall).toBe(true);
    expect(joined.effect).toBe("none");

    const done = downloadFinished(joined.state);
    expect(done.effect).toBe("defer");
    expect(done.state.phase).toBe("deferred");
    expect(updateBanner(done.state)?.status).toBe("The update installs when the call ends.");

    const restart = requestRestart(done.state);
    expect(restart.effect).toBe("defer");
    expect(restart.state.phase).toBe("deferred");

    const ended = setInCall(restart.state, false);
    expect(ended.effect).toBe("install");
    expect(ended.state.phase).toBe("installing");
    expect(ended.state.inCall).toBe(false);
  });

  it("lets Later cancel an install that was waiting on a call", () => {
    const deferred = downloadFinished(setInCall(readyToDownload().state, true).state).state;
    const skipped = dismissUpdate(deferred);
    expect(skipped.skippedVersion).toBe("3.0.1");
    expect(updateBanner(skipped)).toBeNull();
    const ended = setInCall(skipped, false);
    expect(ended.effect).toBe("none");
    expect(ended.state.phase).not.toBe("installing");
  });

  it("restarts immediately when the call is already over", () => {
    const ready = downloadFinished({ ...readyToDownload().state, autoInstall: false, installRequested: true });
    expect(ready.effect).toBe("install");
    const asked = requestRestart({
      ...initialUpdateState("3.0.0", false),
      phase: "ready",
      offer: { version: "3.0.1", notes },
    });
    expect(asked.effect).toBe("install");
  });

  it("keeps a background failure off the banner", () => {
    const checking = beginCheck(initialUpdateState("3.0.0", true));
    const quiet = checkFailed(checking, "Couldn't reach the update server.", false);
    expect(quiet.phase).toBe("idle");
    expect(quiet.error).toBe("");
    const manual = checkFailed(checking, "Couldn't reach the update server.", true);
    expect(manual.phase).toBe("error");
    expect(updatesStatus(manual)).toBe("Couldn't reach the update server.");
  });

  it("turns automatic install back on and downloads a skipped build", () => {
    const available = checkFinished(beginCheck(initialUpdateState("3.0.0", false)), { version: "3.0.1", notes }, false).state;
    const skipped = dismissUpdate({ ...available, phase: "ready" });
    const again = setAutoInstall(skipped, true);
    expect(again.effect).toBe("download");
    expect(again.state.skippedVersion).toBe("");
  });

  it("shortens release notes for the banner", () => {
    expect(notesExcerpt("  one\n\ntwo  ")).toBe("one two");
    expect(notesExcerpt("x".repeat(40), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
