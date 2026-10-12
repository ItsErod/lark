import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { versionFromTag } from "./set-release-version.mjs";

/**
 * Publish one latest.json after both installer jobs have uploaded.
 * The macOS asset is the universal .app.tar.gz. It fills both darwin
 * architectures, which is how the Tauri updater addresses a universal build.
 * Windows points at the NSIS installer, including the nsis-specific key the
 * updater tries before windows-x86_64.
 */

export function selectUpdaterAssets(assets) {
  const named = (Array.isArray(assets) ? assets : []).filter(
    (asset) => asset && typeof asset.name === "string" && typeof asset.url === "string",
  );
  const nsis = named
    .filter((asset) => !asset.name.endsWith(".sig") && /-setup\.exe$/i.test(asset.name))
    .sort((a, b) => scoreNsis(b.name) - scoreNsis(a.name))[0];
  if (!nsis) throw new Error("Windows NSIS installer was not attached to the release");
  const nsisSig = named.find((asset) => asset.name === `${nsis.name}.sig`);
  if (!nsisSig) throw new Error(`Windows NSIS signature ${nsis.name}.sig was not attached to the release`);

  const macs = named.filter((asset) => asset.name.endsWith(".app.tar.gz"));
  const mac = macs.find((asset) => /universal/i.test(asset.name)) || macs[0];
  if (!mac) throw new Error("macOS updater archive (.app.tar.gz) was not attached to the release");
  const macSig = named.find((asset) => asset.name === `${mac.name}.sig`);
  if (!macSig) throw new Error(`macOS updater signature ${mac.name}.sig was not attached to the release`);
  return { nsis, nsisSig, mac, macSig };
}

function scoreNsis(name) {
  if (/arm64/i.test(name)) return 0;
  if (/x64/i.test(name)) return 2;
  return 1;
}

export function latestManifest({ version, notes, pubDate, windows, darwin }) {
  const win = platform(windows, "Windows");
  const mac = platform(darwin, "macOS");
  return {
    version,
    notes: typeof notes === "string" ? notes : "",
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": win,
      "windows-x86_64-nsis": win,
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "darwin-aarch64-app": mac,
      "darwin-x86_64-app": mac,
    },
  };
}

function platform(entry, label) {
  const signature = typeof entry?.signature === "string" ? entry.signature.trim() : "";
  const url = typeof entry?.url === "string" ? entry.url.trim() : "";
  if (!signature || !url) throw new Error(`${label} updater entry needs a signature and a download url`);
  return { signature, url };
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

export function publishLatestJson({ tag, repo, notes, pubDate = new Date().toISOString() } = {}) {
  if (!repo || !tag) throw new Error("LARK_TAG and GITHUB_REPOSITORY are required");
  const version = versionFromTag(tag);
  const release = JSON.parse(gh(["api", `repos/${repo}/releases/tags/${tag}`]));
  const assets = (release.assets || []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
  }));
  const picked = selectUpdaterAssets(assets);
  const dir = mkdtempSync(join(tmpdir(), "lark-updater-"));
  gh([
    "release",
    "download",
    tag,
    "--repo",
    repo,
    "--dir",
    dir,
    "--clobber",
    "--pattern",
    picked.nsisSig.name,
    "--pattern",
    picked.macSig.name,
  ]);
  const manifest = latestManifest({
    version,
    notes: notes || "",
    pubDate,
    windows: {
      signature: readFileSync(join(dir, picked.nsisSig.name), "utf8"),
      url: picked.nsis.url,
    },
    darwin: {
      signature: readFileSync(join(dir, picked.macSig.name), "utf8"),
      url: picked.mac.url,
    },
  });
  const out = join(dir, "latest.json");
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  gh(["release", "upload", tag, out, "--repo", repo, "--clobber"]);
  return manifest;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  const manifest = publishLatestJson({
    tag: process.env.LARK_TAG || "",
    repo: process.env.GITHUB_REPOSITORY || "",
    notes: process.env.LARK_NOTES || "",
  });
  console.log(`published latest.json for ${manifest.version}`);
}
