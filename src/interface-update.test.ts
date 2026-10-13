import { describe, expect, it } from "vitest";
import {
  applyInterfaceError,
  applyInterfaceReport,
  emptyInterfaceSnapshot,
  initialInterfaceUi,
  interfaceBuildLabel,
  interfaceToast,
  setInterfaceCall,
  type InterfaceReport,
} from "./interface-update";

function readyReport(build = 4): InterfaceReport {
  return {
    outcome: "ready",
    message: `Interface build ${build} is ready.`,
    status: {
      ...emptyInterfaceSnapshot(),
      pendingBuild: build,
      pendingVersion: "3.0.0",
      reloadReady: true,
    },
  };
}

describe("interface update toast", () => {
  it("shows a reload toast only when a bundle is ready and no call is up", () => {
    const ui = applyInterfaceReport(initialInterfaceUi(), readyReport(), false);
    expect(interfaceToast(ui)).toEqual({ text: "Update ready, reload", action: "Reload" });
    expect(interfaceToast(setInterfaceCall(ui, true))).toBeNull();
    expect(interfaceToast(setInterfaceCall(setInterfaceCall(ui, true), false))?.text).toBe("Update ready, reload");
  });

  it("keeps background failures quiet and shows a manual check", () => {
    const quiet = applyInterfaceError(initialInterfaceUi(), "offline", false);
    expect(quiet.error).toBe("");
    const manual = applyInterfaceError(initialInterfaceUi(), "offline", true);
    expect(manual.error).toBe("offline");
    expect(interfaceToast(manual)).toBeNull();
  });

  it("labels the packaged interface as built-in", () => {
    expect(interfaceBuildLabel(emptyInterfaceSnapshot())).toBe("Built-in");
    expect(interfaceBuildLabel({ ...emptyInterfaceSnapshot(), source: "bundle", build: 12, version: "3.0.0" })).toBe("Build 12 · 3.0.0");
  });

  it("records an incompatible bundle without replacing the running interface", () => {
    const ui = applyInterfaceReport(initialInterfaceUi(), {
      outcome: "incompatible",
      message: "This interface needs Lark 3.1.0. The app update installs that version.",
      status: emptyInterfaceSnapshot(),
    }, true);
    expect(ui.snapshot.source).toBe("builtin");
    expect(ui.note).toContain("3.1.0");
    expect(interfaceToast(ui)).toBeNull();
  });
});
