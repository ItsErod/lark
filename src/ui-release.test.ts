import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUNDLE_FILE,
  buildManifest,
  isFrontendPath,
  isNativePath,
  planRelease,
  promoteCanary,
  signBytes,
  writeChannel,
  zipFiles,
} from "../scripts/ui-release.mjs";

const temp: string[] = [];

afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lark-ui-"));
  temp.push(dir);
  return dir;
}

describe("interface pages deploy", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  it("merges interface bundles into the existing Pages site", () => {
    const pages = readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
    const ui = readFileSync(path.join(root, ".github/workflows/ui-updates.yml"), "utf8");
    const config = JSON.parse(readFileSync(path.join(root, "interface.json"), "utf8"));
    expect(pages).toContain("preserve-pages-ui.mjs");
    expect(pages).toContain("group: pages");
    expect(ui).toContain("group: pages");
    expect(ui).toContain("LARK_UI_SIGNING_PRIVATE_KEY");
    expect(ui).toContain("minNative");
    expect(ui).toContain("refs/tags/v");
    expect(config.minNative).toBe("3.0.0");
    expect(config.publicKey.length).toBeGreaterThan(40);
    expect(ui).not.toContain("PRIVATE KEY");
  });
});

describe("interface release plan", () => {
  it("publishes canary only for a frontend change that leaves native code alone", () => {
    expect(planRelease({ eventName: "push", ref: "refs/heads/main", files: ["src/ui/app.ts"], promote: false })).toBe("canary");
    expect(planRelease({ eventName: "push", ref: "refs/heads/main", files: ["src/ui/app.ts", "src-tauri/src/lib.rs"], promote: false })).toBe("skip");
    expect(planRelease({ eventName: "push", ref: "refs/heads/main", files: ["crates/lark-core/src/lib.rs"], promote: false })).toBe("skip");
    expect(planRelease({ eventName: "push", ref: "refs/heads/main", files: ["docs/progress/index.html"], promote: false })).toBe("skip");
    expect(planRelease({ eventName: "push", ref: "refs/tags/v3.0.1", files: [], promote: false })).toBe("promote");
    expect(planRelease({ eventName: "workflow_dispatch", ref: "refs/heads/main", files: [], promote: true })).toBe("promote");
  });

  it("treats the web sources as the interface and the Rust tree as native", () => {
    expect(isFrontendPath("src/styles.css")).toBe(true);
    expect(isFrontendPath("index.html")).toBe(true);
    expect(isFrontendPath("package-lock.json")).toBe(true);
    expect(isNativePath("src-tauri/Cargo.toml")).toBe(true);
    expect(isNativePath("src/ui/app.ts")).toBe(false);
  });
});

describe("interface bundle signing", () => {
  it("signs the zip the app can verify, and promotion keeps that zip", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const zip = zipFiles([{ name: "index.html", data: Buffer.from("<!doctype html><title>Lark</title>") }]);
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    const manifest = buildManifest({
      version: "3.0.0",
      build: 3,
      minNative: "3.0.0",
      zipBytes: zip,
      privateKeyPem: pem,
      created: "2026-10-12T00:00:00.000Z",
    });
    expect(manifest.file).toBe(BUNDLE_FILE);
    expect(manifest.sha256).toHaveLength(64);
    const { signature } = signBytes(zip, pem);
    expect(verify(null, zip, publicKey, Buffer.from(signature, "base64"))).toBe(true);

    const site = scratch();
    mkdirSync(path.join(site, "progress"), { recursive: true });
    mkdirSync(path.join(site, "store"), { recursive: true });
    writeFileSync(path.join(site, "progress", "index.html"), "progress");
    writeFileSync(path.join(site, "store", "index.json"), "{}");
    writeChannel(site, "canary", manifest, zip);
    promoteCanary(site);
    expect(readFileSync(path.join(site, "progress", "index.html"), "utf8")).toBe("progress");
    expect(existsSync(path.join(site, "store", "index.json"))).toBe(true);
    expect(readFileSync(path.join(site, "ui", "stable", "bundle.zip")).equals(zip)).toBe(true);
    expect(JSON.parse(readFileSync(path.join(site, "ui", "stable", "manifest.json"), "utf8")).build).toBe(3);
    expect(existsSync(path.join(site, "ui", "canary", "manifest.json"))).toBe(true);
  });
});
