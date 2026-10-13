import assert from "node:assert/strict";
import test from "node:test";
import { comparePerf, extractPerfReport, moreThanTwentyPercentSlower, renderPerf } from "./perf-compare.mjs";

test("parses the harness line out of a vitest log", () => {
  const report = extractPerfReport(
    'stdout | harness\nLARK_PERF {"summary":{"coldStartMs":10,"messageLoadMs":20}}\n',
  );
  assert.equal(report.summary.coldStartMs, 10);
  assert.equal(report.summary.messageLoadMs, 20);
});

test("treats exactly 20 percent slower as allowed", () => {
  assert.equal(moreThanTwentyPercentSlower(120, 100), false);
  assert.equal(moreThanTwentyPercentSlower(121, 100), true);
});

test("fails only when cold start or message load regresses more than 20 percent", () => {
  const result = comparePerf(
    { summary: { coldStartMs: 121, messageLoadMs: 100, scrollFps: 10 } },
    { summary: { coldStartMs: 100, messageLoadMs: 80, scrollFps: 50 } },
  );
  assert.deepEqual(result.failures, ["coldStartMs", "messageLoadMs"]);
  assert.match(renderPerf(result), /fail \(> 20% slower\)/);
  assert.match(renderPerf(result), /scrollFps/);
});

test("does not fail without a main baseline", () => {
  const result = comparePerf({ summary: { coldStartMs: 900, messageLoadMs: 900 } }, null);
  assert.deepEqual(result.failures, []);
  assert.match(renderPerf(result), /does not fail on regression/);
});
