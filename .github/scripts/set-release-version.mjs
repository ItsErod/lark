import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function versionFromTag(tag) {
  const match = /^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag);
  if (!match) {
    throw new Error(`Release tag must look like v2.2 or v2.2.1, got ${tag}`);
  }
  return `${match[1]}.${match[2]}.${match[3] ?? "0"}`;
}

function replaceJsonVersions(path, times, version) {
  let text = readFileSync(path, "utf8");
  let count = 0;
  text = text.replace(/"version"\s*:\s*"[^"]+"/g, (hit) => {
    if (count >= times) return hit;
    count += 1;
    return hit.replace(/"[^"]+"$/, `"${version}"`);
  });
  if (count !== times) {
    throw new Error(`${path}: replaced ${count} version fields, expected ${times}`);
  }
  writeFileSync(path, text);
}

function replaceCargoVersion(path, version) {
  const text = readFileSync(path, "utf8");
  if (!/^version = "[^"]+"/m.test(text)) {
    throw new Error(`${path}: cargo version was not found`);
  }
  const next = text.replace(/^version = "[^"]+"/m, `version = "${version}"`);
  if (next !== text) writeFileSync(path, next);
}

export function replaceLockText(text, name, version) {
  const crlf = text.includes("\r\n");
  const normalized = text.replace(/\r\n/g, "\n");
  const pattern = new RegExp(`(\\[\\[package\\]\\]\\nname = "${name}"\\nversion = ")[^"]+"`, "g");
  let count = 0;
  const next = normalized.replace(pattern, (_match, prefix) => {
    count += 1;
    return `${prefix}${version}"`;
  });
  if (count !== 1) throw new Error(`Cargo.lock is missing package ${name}`);
  return crlf ? next.replace(/\n/g, "\r\n") : next;
}

function replaceLockPackage(name, version) {
  const path = "Cargo.lock";
  const text = readFileSync(path, "utf8");
  const next = replaceLockText(text, name, version);
  if (next !== text) writeFileSync(path, next);
}

export function applyReleaseVersion(version) {
  replaceJsonVersions("package.json", 1, version);
  replaceJsonVersions("package-lock.json", 2, version);
  replaceJsonVersions("src-tauri/tauri.conf.json", 1, version);
  replaceCargoVersion("src-tauri/Cargo.toml", version);
  replaceCargoVersion("crates/lark-core/Cargo.toml", version);
  replaceCargoVersion("crates/lark-clip-hw/Cargo.toml", version);
  replaceLockPackage("lark", version);
  replaceLockPackage("lark-core", version);
  replaceLockPackage("lark-clip-hw", version);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  const version = versionFromTag(process.env.LARK_TAG || "");
  applyReleaseVersion(version);
  console.log(version);
}
