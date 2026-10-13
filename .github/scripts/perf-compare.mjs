/**
 * Compare a pull request perf report with main.
 *
 * Cold start and message load fail the run only when they are more than 20%
 * slower than main. A missing main report is not a failure.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const GATED = ["coldStartMs", "messageLoadMs"];
const INFO = ["channelSwitchMs", "scrollFps", "inputLatencyMs", "idleMemoryMb", "idleCpuPct"];

export function extractPerfReport(log) {
  const lines = String(log)
    .split(/\r?\n/)
    .filter((line) => line.includes("LARK_PERF"));
  if (!lines.length) return null;
  const line = lines[lines.length - 1];
  const json = line.slice(line.indexOf("LARK_PERF") + "LARK_PERF".length).trim();
  return JSON.parse(json);
}

function metric(report, key) {
  const value = Number(report?.summary?.[key]);
  return Number.isFinite(value) ? value : null;
}

/** True when `pr` is more than 20% above `base`. Equal to 20% is allowed. */
export function moreThanTwentyPercentSlower(pr, base) {
  if (!(base > 0) || !Number.isFinite(pr)) return false;
  return (pr - base) / base > 0.2 + 1e-9;
}

export function comparePerf(pr, base) {
  const hadBaseline = base?.summary != null;
  const rows = [];
  const failures = [];
  for (const key of [...GATED, ...INFO]) {
    const prValue = metric(pr, key);
    const baseValue = metric(base, key);
    const gated = GATED.includes(key);
    const comparable = hadBaseline && baseValue != null && prValue != null;
    const slower = gated && comparable && moreThanTwentyPercentSlower(prValue, baseValue);
    if (slower) failures.push(key);
    rows.push({
      key,
      prValue,
      baseValue,
      gated,
      status: !comparable ? "skipped" : slower ? "fail" : "ok",
    });
  }
  return { failures, rows, hadBaseline };
}

function cell(value) {
  return value == null ? "n/a" : String(Math.round(value * 10) / 10);
}

export function renderPerf(result) {
  const lines = [
    "### Perf",
    "",
    "Cold start and message load fail this job when they are more than 20% slower than main. Other numbers are informational.",
    "",
    "| metric | main | this pull request | result |",
    "| --- | ---: | ---: | --- |",
  ];
  for (const row of result.rows) {
    let note = "info";
    if (row.gated && row.status === "fail") note = "fail (> 20% slower)";
    else if (row.gated && row.status === "ok") note = "ok";
    else if (row.status === "skipped") note = "no baseline";
    lines.push(`| ${row.key} | ${cell(row.baseValue)} | ${cell(row.prValue)} | ${note} |`);
  }
  if (!result.hadBaseline) {
    lines.push("", "Main did not produce a baseline, so this run does not fail on regression.");
  }
  return `${lines.join("\n")}\n`;
}

function readReport(path) {
  try {
    return extractPerfReport(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCli()) {
  const prPath = process.argv[2];
  const basePath = process.argv[3];
  if (!prPath) {
    console.error("Usage: perf-compare.mjs <pr-log> [main-log]");
    process.exit(2);
  }
  const pr = readReport(prPath);
  if (!pr) {
    console.error(`No LARK_PERF report in ${prPath}`);
    process.exit(1);
  }
  const base = basePath ? readReport(basePath) : null;
  const result = comparePerf(pr, base);
  process.stdout.write(renderPerf(result));
  if (result.failures.length) process.exit(1);
}
