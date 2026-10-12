import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../docs/progress/index.html", import.meta.url), "utf8");
const status = JSON.parse(readFileSync(new URL("../docs/progress/status.json", import.meta.url), "utf8"));
const marked = html.match(/\/\* status-api \*\/([\s\S]*?)\/\* status-api-end \*\//);
if (!marked) throw new Error("status helpers missing from the progress page");

type Progress = { expected: number; ratio: number; status: string; finishedAt: number | null };
type Entry = { done: boolean; finishedAt: number | null };

const api = new Function(
  `${marked[1]}\nreturn { normalizeStatus, statusEntry, finishedFromPulls, resolveWork };`,
)() as {
  normalizeStatus: (json: unknown) => { streams: Record<string, Entry>; tracks: Record<string, Entry> };
  statusEntry: (status: { streams: Record<string, Entry>; tracks: Record<string, Entry> }, kind: "streams" | "tracks", id: string) => Entry | null;
  finishedFromPulls: (prs: Array<Record<string, unknown>>) => { finishedAt: number | null } | null;
  resolveWork: (progress: Progress, prs: Array<Record<string, unknown>>, entry: Entry | null) => Progress;
};

const { normalizeStatus, resolveWork } = api;

const short = { expected: 2, ratio: 0.5, status: "merged", finishedAt: null };

describe("work status", () => {
  it("marks the six streams done at the recorded Eastern times", () => {
    expect(html).toContain('new URL("status.json"');
    expect(html).not.toContain("merged >= stream.estimate");
    expect(html).not.toContain("merged >= estimate");
    const parsed = normalizeStatus(status);
    expect(parsed.streams.A.done).toBe(true);
    expect(parsed.streams.A.finishedAt).toBe(Date.parse("2026-10-12T15:43:00-04:00"));
    expect(parsed.streams.B.finishedAt).toBe(Date.parse("2026-10-12T15:19:10-04:00"));
    expect(parsed.streams.C.finishedAt).toBe(Date.parse("2026-10-12T15:24:00-04:00"));
    expect(parsed.streams.D.finishedAt).toBe(Date.parse("2026-10-12T15:32:00-04:00"));
    expect(parsed.streams.E.finishedAt).toBe(Date.parse("2026-10-12T16:03:00-04:00"));
    expect(parsed.streams.F.finishedAt).toBe(Date.parse("2026-10-12T15:14:41-04:00"));
    expect(parsed.tracks.privacy.done).toBe(false);
    (["A", "B", "C", "D", "E", "F"] as const).forEach((id) => {
      const forced = resolveWork(short, [{ state: "open", created_at: "2026-10-12T18:00:00Z" }], parsed.streams[id]);
      expect(forced.status).toBe("done");
      expect(forced.ratio).toBe(1);
      expect(forced.finishedAt).toBe(parsed.streams[id].finishedAt);
    });
  });

  it("finishes an agent once nothing is open and the latest pull request merged", () => {
    const merged = resolveWork(short, [
      { state: "closed", merged_at: "2026-10-12T19:43:35Z", created_at: "2026-10-12T18:00:00Z" },
    ], { done: false, finishedAt: null });
    expect(merged).toMatchObject({ status: "done", ratio: 1, finishedAt: Date.parse("2026-10-12T19:43:35Z") });

    const open = resolveWork(
      { expected: 2, ratio: 0.25, status: "review", finishedAt: null },
      [{ state: "open", created_at: "2026-10-12T18:00:00Z" }],
      null,
    );
    expect(open.status).toBe("review");
    expect(open.ratio).toBe(0.25);

    const closedAfter = resolveWork(short, [
      { state: "closed", merged_at: "2026-10-12T19:00:00Z", created_at: "2026-10-12T18:00:00Z" },
      { state: "closed", closed_at: "2026-10-12T20:00:00Z", created_at: "2026-10-12T19:30:00Z" },
    ], null);
    expect(closedAfter.status).toBe("merged");
    expect(closedAfter.ratio).toBe(0.5);

    const coding = resolveWork({ expected: 2, ratio: 0.05, status: "coding", finishedAt: null }, [], null);
    expect(coding.status).toBe("coding");
    expect(coding.ratio).toBe(0.05);
  });
});
