import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: string[] };
const overlay = JSON.parse(readFileSync("src-tauri/capabilities/overlay.json", "utf8")) as { permissions: string[] };
const perms = readFileSync("src-tauri/permissions/lark.toml", "utf8");

describe("window and clipboard permissions", () => {
  it("allows every window command the main window calls", () => {
    for (const id of [
      "core:window:allow-is-focused",
      "core:window:allow-is-minimized",
      "core:window:allow-is-maximized",
      "core:window:allow-show",
      "core:window:allow-hide",
      "core:window:allow-minimize",
      "core:window:allow-unminimize",
      "core:window:allow-set-focus",
      "clipboard-manager:allow-write-text",
      "allow-voice-diagnostics",
      "allow-list-audio-devices",
    ]) {
      expect(caps.permissions, id).toContain(id);
    }
  });

  it("allows the overlay window commands", () => {
    for (const id of [
      "core:window:allow-start-dragging",
      "core:window:allow-set-size",
      "core:window:allow-set-position",
      "core:window:allow-inner-size",
      "core:window:allow-outer-position",
      "core:window:allow-scale-factor",
    ]) {
      expect(overlay.permissions, id).toContain(id);
    }
  });

  it("registers the voice commands the buttons invoke", () => {
    expect(perms).toContain('commands.allow = ["voice_diagnostics"]');
    expect(perms).toContain('commands.allow = ["list_audio_devices"]');
  });
});
