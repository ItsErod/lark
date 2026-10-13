/**
 * Signed interface bundles for GitHub Pages.
 *
 * Canary is published from a main push that changes the frontend and does not
 * change native code. Stable receives that same bundle only when it is
 * promoted, by hand or by a v* tag. minNative in interface.json is the oldest
 * app that may load a bundle. Bump it when the interface needs new native
 * code so older apps keep the packaged UI and take the full app update.
 */

import { createHash, createPrivateKey, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

export const UI_CHANNELS = ["stable", "canary"];
export const PAGES_ORIGIN = "https://itserod.github.io/lark";
export const BUNDLE_FILE = "bundle.zip";

const FRONTEND = [
  /^src\//,
  /^public\//,
  /^index\.html$/,
  /^overlay\.html$/,
  /^vite\.config\.ts$/,
  /^tsconfig.*\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^interface\.json$/,
];

export function isFrontendPath(file) {
  const name = String(file).replaceAll("\\", "/");
  return FRONTEND.some((pattern) => pattern.test(name));
}

export function isNativePath(file) {
  const name = String(file).replaceAll("\\", "/");
  return name.startsWith("src-tauri/") || name.startsWith("crates/");
}

/**
 * @returns {"canary" | "promote" | "skip"}
 */
export function planRelease({ eventName, ref, files, promote }) {
  if (promote || (eventName === "push" && String(ref).startsWith("refs/tags/v"))) return "promote";
  if (eventName === "push" && ref === "refs/heads/main") {
    const list = Array.isArray(files) ? files : [];
    const frontend = list.some(isFrontendPath);
    const native = list.some(isNativePath);
    if (frontend && !native) return "canary";
  }
  return "skip";
}

export function signBytes(bytes, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, bytes, key).toString("base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { sha256, signature };
}

export function buildManifest({ version, build, minNative, zipBytes, privateKeyPem, created }) {
  if (!Number.isInteger(build) || build < 1) throw new Error("The interface build number has to be a positive integer.");
  if (!version || !minNative) throw new Error("The interface manifest needs a version and a minimum native version.");
  const { sha256, signature } = signBytes(zipBytes, privateKeyPem);
  return {
    version: String(version),
    build,
    minNative: String(minNative),
    sha256,
    signature,
    created: created ?? new Date().toISOString(),
    file: BUNDLE_FILE,
  };
}

function dosStamp(date) {
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

export function zipFiles(files, date = new Date("2026-01-01T00:00:00Z")) {
  const { time, day } = dosStamp(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = String(file.name).replaceAll("\\", "/");
    if (!name || name.startsWith("/") || name.split("/").includes("..")) throw new Error(`Unsafe bundle path: ${name}`);
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(file.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    locals.push(Buffer.concat([local, compressed]));
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, end]);
}

export function zipDirectory(dir) {
  const files = [];
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) files.push({ name: rel, data: readFileSync(full) });
    }
  };
  walk(dir, "");
  if (!files.some((file) => file.name === "index.html")) throw new Error("The interface build is missing index.html.");
  return zipFiles(files);
}

export function copyTreeContents(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    cpSync(path.join(src, entry.name), path.join(dest, entry.name), { recursive: true });
  }
}

export function assemblePages(siteDir, repoRoot) {
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });
  copyTreeContents(path.join(repoRoot, "docs"), siteDir);
  const result = spawnSync(process.execPath, ["scripts/build-store.mjs", "--publish", siteDir], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("The store page failed to publish into the site.");
}

export function writeChannel(siteDir, channel, manifest, zipBytes) {
  if (!UI_CHANNELS.includes(channel)) throw new Error(`Unknown interface channel: ${channel}`);
  if (manifest.file !== BUNDLE_FILE) throw new Error("The interface bundle file has to be bundle.zip.");
  const dir = path.join(siteDir, "ui", channel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(dir, BUNDLE_FILE), zipBytes);
}

export function promoteCanary(siteDir) {
  const from = path.join(siteDir, "ui", "canary");
  if (!existsSync(path.join(from, "manifest.json")) || !existsSync(path.join(from, BUNDLE_FILE))) {
    throw new Error("No canary interface bundle is published, so there is nothing to promote.");
  }
  const to = path.join(siteDir, "ui", "stable");
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

async function readChannel(fetchImpl, origin, channel) {
  const manifestUrl = `${origin}/ui/${channel}/manifest.json`;
  const response = await fetchImpl(manifestUrl, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read the live ${channel} interface manifest (${response.status}).`);
  const manifest = await response.json();
  if (!manifest || manifest.file !== BUNDLE_FILE) throw new Error(`The live ${channel} interface manifest is not a bundle.zip.`);
  const bundle = await fetchImpl(`${origin}/ui/${channel}/${BUNDLE_FILE}`, { cache: "no-store" });
  if (!bundle.ok) throw new Error(`Could not read the live ${channel} interface bundle (${bundle.status}).`);
  const bytes = Buffer.from(await bundle.arrayBuffer());
  return { manifest, bytes };
}

/**
 * Copy the live /ui tree into a freshly assembled site.
 * A missing channel is fine. Any other failure aborts so a deploy cannot wipe it.
 */
export async function preserveLiveUi(siteDir, fetchImpl = globalThis.fetch, origin = PAGES_ORIGIN) {
  for (const channel of UI_CHANNELS) {
    const live = await readChannel(fetchImpl, origin, channel);
    if (!live) continue;
    writeChannel(siteDir, channel, live.manifest, live.bytes);
  }
}

export function readInterfaceConfig(repoRoot) {
  const config = JSON.parse(readFileSync(path.join(repoRoot, "interface.json"), "utf8"));
  if (!config.minNative || !config.publicKey) throw new Error("interface.json needs minNative and publicKey.");
  return config;
}

export function readPackageVersion(repoRoot) {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  if (!pkg.version) throw new Error("package.json has no version.");
  return String(pkg.version);
}
