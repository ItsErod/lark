import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Windows Defender heuristics", () => {
  it("does not launch a hidden shell for hardware, login items, or clips", () => {
    const hardware = source("crates/lark-core/src/hardware.rs");
    const windows = source("crates/lark-core/src/hardware_win.rs");
    const host = source("crates/lark-core/src/host_win.rs");
    const shell = source("src-tauri/src/lib.rs");
    const clips = source("src-tauri/src/clip_rec.rs");
    for (const text of [hardware, windows, host, shell, clips]) {
      expect(text).not.toContain("powershell.exe");
      expect(text).not.toContain("ExecutionPolicy");
      expect(text).not.toContain("Get-CimInstance");
      expect(text).not.toContain("Add-Type");
      expect(text).not.toContain("0x0800_0000");
      expect(text).not.toContain("CREATE_NO_WINDOW");
      expect(text).not.toContain('Command::new("reg")');
      expect(text).not.toContain('Command::new("explorer")');
      expect(text).not.toContain('Command::new("cmd")');
      expect(text).not.toContain("wmic");
    }
    expect(windows).not.toContain("OpenProcess");
    expect(host).not.toContain("OpenProcess");
    expect(shell).toContain("set_run_at_login");
    expect(clips).toContain("reveal_file");
    expect(clips).toContain("open_folder");
  });

  it("does not grant the webview a shell or arbitrary process execution", () => {
    const main = JSON.parse(source("src-tauri/capabilities/default.json")) as {
      permissions: string[];
    };
    const overlay = JSON.parse(source("src-tauri/capabilities/overlay.json")) as {
      permissions: string[];
    };
    const manifest = source("src-tauri/Cargo.toml");
    for (const permissions of [main.permissions, overlay.permissions]) {
      expect(permissions).not.toContain("core:default");
      expect(permissions.some((item) => item.includes("shell"))).toBe(false);
      expect(permissions.some((item) => item.includes("allow-execute"))).toBe(false);
    }
    expect(main.permissions).toContain("core:window:allow-is-focused");
    expect(main.permissions).toContain("core:event:allow-listen");
    expect(overlay.permissions).toContain("core:window:allow-start-dragging");
    expect(manifest).not.toContain("tauri-plugin-shell");
  });
});
