/**
 * Decide, sign, and stage an interface bundle inside a full Pages site.
 *
 * --plan writes action=canary|promote|skip for GitHub Actions.
 * --site assembles docs, the store, the live /ui tree, and this release.
 */

import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assemblePages,
  buildManifest,
  planRelease,
  preserveLiveUi,
  promoteCanary,
  readInterfaceConfig,
  readPackageVersion,
  writeChannel,
  zipDirectory,
} from "./ui-release.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function changedFiles() {
  const before = process.env.GITHUB_BEFORE || "";
  const sha = process.env.GITHUB_SHA || "HEAD";
  const zero = /^0+$/.test(before);
  const range = !before || zero ? `HEAD~1 ${sha}` : `${before} ${sha}`;
  try {
    return execSync(`git diff --name-only ${range}`, { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function currentPlan() {
  const promote = process.env.LARK_PROMOTE === "true" || process.env.LARK_PROMOTE === "1";
  return planRelease({
    eventName: process.env.GITHUB_EVENT_NAME || "",
    ref: process.env.GITHUB_REF || "",
    files: changedFiles(),
    promote,
  });
}

function writeOutput(action) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  appendFileSync(output, `action=${action}\n`);
}

async function stage(siteDir) {
  const action = currentPlan();
  if (action === "skip") return action;
  if (action === "canary") {
    const pem = process.env.LARK_UI_SIGNING_PRIVATE_KEY || "";
    if (!pem.includes("PRIVATE KEY")) {
      throw new Error("Set the LARK_UI_SIGNING_PRIVATE_KEY repository secret. The public key is in interface.json.");
    }
  }
  assemblePages(siteDir, repoRoot);
  await preserveLiveUi(siteDir);
  if (action === "canary") {
    const pem = process.env.LARK_UI_SIGNING_PRIVATE_KEY || "";
    const build = Number(process.env.GITHUB_RUN_NUMBER);
    const zipBytes = zipDirectory(path.join(repoRoot, "dist"));
    const config = readInterfaceConfig(repoRoot);
    const manifest = buildManifest({
      version: readPackageVersion(repoRoot),
      build,
      minNative: config.minNative,
      zipBytes,
      privateKeyPem: pem,
      created: new Date().toISOString(),
    });
    writeChannel(siteDir, "canary", manifest, zipBytes);
    console.log(`staged canary interface build ${manifest.build}`);
  } else {
    promoteCanary(siteDir);
    console.log("promoted the canary interface bundle to stable");
  }
  return action;
}

const planOnly = process.argv.includes("--plan");
const siteFlag = process.argv.indexOf("--site");
if (planOnly) {
  const action = currentPlan();
  writeOutput(action);
  console.log(action);
} else if (siteFlag !== -1) {
  const siteDir = path.resolve(repoRoot, process.argv[siteFlag + 1] || "site");
  const action = await stage(siteDir);
  writeOutput(action);
  if (action === "skip") console.log("skip");
} else {
  console.error("Use --plan or --site <dir>.");
  process.exit(1);
}
