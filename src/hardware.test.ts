import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import {
  HARDWARE_STATUS_INTERVAL_MS,
  clampStatus,
  hardwareSampleDue,
  loadHardwareState,
  noteHardwareEdit,
  serializeHardwareState,
  setHardwareEnabled,
  stepHardware,
  type HardwareState,
} from "./hardware";

const off = (): HardwareState => ({
  enabled: false,
  takeover: false,
  paused: false,
  owned: "",
  savedCustom: "",
});

describe("hardware status", () => {
  it("stays off unless settings turned it on", () => {
    expect(sanitizeConfig({}).desktop.hardware_status).toBe(false);
    expect(sanitizeConfig({ desktop: { frame_cap: 60 } }).desktop.hardware_status).toBe(false);
    expect(sanitizeConfig({ desktop: { hardware_status: "yes" } }).desktop.hardware_status).toBe(false);
    expect(sanitizeConfig({ desktop: { hardware_status: true } }).desktop.hardware_status).toBe(true);
    expect(loadHardwareState(false, JSON.stringify({ owned: "Hades" })).enabled).toBe(false);
  });

  it("samples on a minute cadence, not every tick", () => {
    expect(HARDWARE_STATUS_INTERVAL_MS).toBe(60_000);
    expect(hardwareSampleDue(0, 5_000)).toBe(true);
    expect(hardwareSampleDue(10_000, 50_000)).toBe(false);
    expect(hardwareSampleDue(10_000, 70_000)).toBe(true);
  });

  it("publishes a line only while the setting is on and Lark owns the status", () => {
    const enabled = setHardwareEnabled(off(), true, "In the booth");
    expect(enabled.savedCustom).toBe("In the booth");
    expect(enabled.takeover).toBe(true);
    const posted = stepHardware(enabled, "In the booth", { ok: true, line: "RTX 4070 · 61°C · Hades" });
    expect(posted.custom).toBe("RTX 4070 · 61°C · Hades");
    expect(posted.state.owned).toBe(posted.custom);
    const same = stepHardware(posted.state, posted.custom!, { ok: true, line: posted.custom! });
    expect(same.custom).toBeUndefined();
    const changed = stepHardware(posted.state, posted.custom!, { ok: true, line: "RTX 4070 · 61°C · Celeste" });
    expect(changed.custom).toBe("RTX 4070 · 61°C · Celeste");
  });

  it("leaves a custom status the user typed, and a failed read", () => {
    const owned: HardwareState = {
      enabled: true,
      takeover: false,
      paused: false,
      owned: "RTX 4070 · Hades",
      savedCustom: "",
    };
    const paused = stepHardware(owned, "back later", { ok: true, line: "RTX 4070 · Celeste" });
    expect(paused.custom).toBeUndefined();
    expect(paused.state.paused).toBe(true);
    const edited = noteHardwareEdit(owned, "back later");
    expect(edited.paused).toBe(true);
    const cleared = noteHardwareEdit(edited, "");
    expect(cleared.paused).toBe(false);
    expect(cleared.takeover).toBe(true);
    const failed = stepHardware(owned, owned.owned, { ok: false, line: null });
    expect(failed.custom).toBeUndefined();
    expect(failed.state.owned).toBe(owned.owned);
  });

  it("restores the previous custom status when the setting is turned off", () => {
    const showing: HardwareState = {
      enabled: true,
      takeover: false,
      paused: false,
      owned: "Apple M2 · Celeste",
      savedCustom: "In the booth",
    };
    const disabled = setHardwareEnabled(showing, false, showing.owned);
    const restored = stepHardware(disabled, showing.owned, null);
    expect(restored.custom).toBe("In the booth");
    expect(restored.state.enabled).toBe(false);
    expect(serializeHardwareState(restored.state)).toBeNull();
  });

  it("drops a closed game when a successful read has nothing to show", () => {
    const showing: HardwareState = {
      enabled: true,
      takeover: false,
      paused: false,
      owned: "Celeste",
      savedCustom: "",
    };
    const gone = stepHardware(showing, "Celeste", { ok: true, line: "" });
    expect(gone.custom).toBe("");
    expect(gone.state.owned).toBe("");
  });

  it("keeps the status line inside Discord's limit", () => {
    expect(clampStatus(` ${"g".repeat(200)} `).length).toBe(128);
    expect(clampStatus("Apple M2 · 54°C · Hades")).toBe("Apple M2 · 54°C · Hades");
  });
});
