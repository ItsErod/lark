import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// The release script is plain JavaScript used by GitHub Actions.
// @ts-expect-error no declaration file for the workflow script.
import { latestManifest, selectUpdaterAssets } from "../.github/scripts/publish-latest-json.mjs";

const assets = [
  { name: "Lark_3.0.1_x64_en-US.msi", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark_3.0.1_x64_en-US.msi" },
  { name: "Lark_3.0.1_x64_en-US.msi.sig", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark_3.0.1_x64_en-US.msi.sig" },
  { name: "Lark_3.0.1_x64-setup.exe", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark_3.0.1_x64-setup.exe" },
  { name: "Lark_3.0.1_x64-setup.exe.sig", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark_3.0.1_x64-setup.exe.sig" },
  { name: "Lark.app.tar.gz", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark.app.tar.gz" },
  { name: "Lark.app.tar.gz.sig", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark.app.tar.gz.sig" },
  { name: "Lark_3.0.1_universal.dmg", url: "https://github.com/ItsErod/lark/releases/download/v3.0.1/Lark.dmg" },
];

describe("updater manifest", () => {
  it("picks the NSIS installer and the universal macOS archive", () => {
    const picked = selectUpdaterAssets(assets);
    expect(picked.nsis.name).toBe("Lark_3.0.1_x64-setup.exe");
    expect(picked.nsisSig.name).toBe("Lark_3.0.1_x64-setup.exe.sig");
    expect(picked.mac.name).toBe("Lark.app.tar.gz");
    expect(picked.macSig.name).toBe("Lark.app.tar.gz.sig");
    expect(() => selectUpdaterAssets(assets.filter((asset) => !asset.name.endsWith(".exe")))).toThrow(/NSIS/);
  });

  it("covers windows-x86_64 and both darwin architectures with one universal build", () => {
    const manifest = latestManifest({
      version: "3.0.1",
      notes: "Notes",
      pubDate: "2026-10-12T00:00:00.000Z",
      windows: { signature: "win-sig\n", url: assets[2].url },
      darwin: { signature: "mac-sig\n", url: assets[4].url },
    });
    expect(manifest.version).toBe("3.0.1");
    expect(manifest.platforms["windows-x86_64"]).toEqual({ signature: "win-sig", url: assets[2].url });
    expect(manifest.platforms["windows-x86_64-nsis"]).toEqual(manifest.platforms["windows-x86_64"]);
    expect(manifest.platforms["darwin-aarch64"].url).toBe(assets[4].url);
    expect(manifest.platforms["darwin-x86_64"]).toEqual(manifest.platforms["darwin-aarch64"]);
    expect(manifest.platforms["darwin-aarch64-app"]).toEqual(manifest.platforms["darwin-aarch64"]);
    expect(manifest.platforms["darwin-x86_64-app"]).toEqual(manifest.platforms["darwin-aarch64"]);
    expect(manifest.platforms["windows-x86_64"].url).not.toContain(".msi");
  });

  it("keeps the release workflow's notes job and publishes updater artifacts", () => {
    const workflow = readFileSync(".github/workflows/build.yml", "utf8");
    const config = readFileSync("src-tauri/tauri.conf.json", "utf8");
    expect(workflow).toContain("release-notes:");
    expect(workflow).toContain("needs: [test, release-notes]");
    expect(workflow).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(workflow).toContain("TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
    expect(workflow).toContain("updaterJsonPreferNsis: true");
    expect(workflow).toContain("includeUpdaterJson: true");
    expect(workflow).toContain("publish-latest-json.mjs");
    expect(workflow).toContain("--bundles nsis,msi");
    expect(workflow).toContain("--bundles app,dmg");
    expect(config).toContain('"createUpdaterArtifacts": true');
    expect(config).toContain("https://github.com/ItsErod/lark/releases/latest/download/latest.json");
    expect(config).not.toContain("rsign encrypted");
  });
});