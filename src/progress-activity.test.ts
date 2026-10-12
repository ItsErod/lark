import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../docs/progress/index.html", import.meta.url), "utf8");
const marked = html.match(/\/\* activity-api \*\/([\s\S]*?)\/\* activity-api-end \*\//);
if (!marked) throw new Error("activity helpers missing from the progress page");

type Commit = { message: string; at: number; sha: string; branch: string; order?: number };
type Activity = {
  state: string;
  task: string;
  taskUrl: string;
  startedAt: number | null;
  taskStartedAt: number | null;
  finishedAt: number | null;
  workedMs: number | null;
  commits: Commit[];
};

const api = new Function(
  `${marked[1]}\nreturn { ACTIVITY_REFRESH_MS, ACTIVITY_REMAINING_FLOOR, ACTIVITY_COMMIT_FLOOR, ACTIVITY_CACHE_KEY, refMatchesAgent, commitsFromEvents, slimBranches, pushesFromEvents, agentBranch, normalizeCommits, compareUrl, shouldFetchActivity, buildAgentActivity, formatWorking, formatTotal, formatWorked };`,
)() as {
  ACTIVITY_REFRESH_MS: number;
  ACTIVITY_REMAINING_FLOOR: number;
  ACTIVITY_COMMIT_FLOOR: number;
  ACTIVITY_CACHE_KEY: string;
  refMatchesAgent: (ref: string, suffix: string, longerSuffixes?: string[]) => boolean;
  commitsFromEvents: (events: Array<Record<string, unknown>>, suffixes?: string[]) => Commit[];
  slimBranches: (list: Array<Record<string, unknown>>, suffixes?: string[]) => Array<{ name: string; sha: string }>;
  pushesFromEvents: (events: Array<Record<string, unknown>>, suffixes?: string[]) => Array<{ branch: string; sha: string; at: number }>;
  agentBranch: (opts: Record<string, unknown>) => { branch: string; sha: string; open: boolean } | null;
  normalizeCommits: (list: Array<Record<string, unknown>>, branch: string, onTask?: boolean) => Commit[];
  compareUrl: (branch: string) => string;
  shouldFetchActivity: (fetchedAt: number | null, now: number, remaining: number, manual: boolean) => boolean;
  buildAgentActivity: (opts: Record<string, unknown>) => Activity;
  formatWorking: (ms: number) => string;
  formatTotal: (ms: number) => string;
  formatWorked: (ms: number) => string;
};

const {
  ACTIVITY_REFRESH_MS,
  ACTIVITY_REMAINING_FLOOR,
  ACTIVITY_COMMIT_FLOOR,
  ACTIVITY_CACHE_KEY,
  refMatchesAgent,
  commitsFromEvents,
  slimBranches,
  pushesFromEvents,
  agentBranch,
  normalizeCommits,
  compareUrl,
  shouldFetchActivity,
  buildAgentActivity,
  formatWorking,
  formatTotal,
  formatWorked,
} = api;

describe("agent activity", () => {
  it("caches one branches page and one events page and skips them when the hourly budget is low", () => {
    expect(ACTIVITY_REFRESH_MS).toBe(15 * 60 * 1000);
    expect(ACTIVITY_REMAINING_FLOOR).toBe(18);
    expect(ACTIVITY_CACHE_KEY).toBe("lark30-activity-v1");
    expect(ACTIVITY_COMMIT_FLOOR).toBe(12);
    expect(html).toContain("https://api.github.com/repos/ItsErod/lark/branches?per_page=100");
    expect(html).toContain("https://api.github.com/repos/ItsErod/lark/events?per_page=100");
    expect(html).toContain("https://api.github.com/repos/ItsErod/lark/compare/main...");
    expect(html).toContain("const REFRESH_MS = 60000");
    expect(html.match(/fetch\(BRANCHES_URL\)/g)).toHaveLength(1);
    expect(html.match(/fetch\(EVENTS_URL\)/g)).toHaveLength(1);
    expect(html.match(/fetch\(compareUrl\(/g)).toHaveLength(1);
    expect(html.match(/fetch\(tipUrl\(/g)).toHaveLength(1);
    expect(html).toContain("commits?per_page=1&sha=");
    expect(html).not.toContain("per_page=3&sha=");
    const now = 1_000_000_000_000;
    expect(shouldFetchActivity(now - 1000, now, 20, false)).toBe(false);
    expect(shouldFetchActivity(now - ACTIVITY_REFRESH_MS, now, 20, false)).toBe(true);
    expect(shouldFetchActivity(null, now, 40, false)).toBe(true);
    expect(shouldFetchActivity(now - 1000, now, 18, true)).toBe(true);
    expect(shouldFetchActivity(now - ACTIVITY_REFRESH_MS, now, 17, true)).toBe(false);
  });

  it("reads push events into commit subjects and keeps branch names that match a suffix", () => {
    const commits = commitsFromEvents([
      {
        type: "PushEvent",
        created_at: "2026-10-12T19:00:00Z",
        payload: {
          ref: "refs/heads/cursor/messages-290f",
          commits: [
            { sha: "1", message: "older\n\ndetail" },
            { sha: "2", message: "newer" },
          ],
        },
      },
      { type: "PushEvent", created_at: "2026-10-12T19:05:00Z", payload: { ref: "refs/tags/v1", commits: [{ sha: "3", message: "tag" }] } },
      { type: "IssuesEvent", created_at: "2026-10-12T19:06:00Z", payload: {} },
      {
        type: "PushEvent",
        created_at: "2026-10-12T19:10:00Z",
        payload: { ref: "refs/heads/cursor/other-dbd3", commits: [{ sha: "4", message: "servers" }] },
      },
    ], ["290f", "dbd3"]);
    expect(commits.map((commit) => commit.message)).toEqual(["servers", "newer", "older"]);
    expect(commits[1].at).toBe(Date.parse("2026-10-12T19:00:00Z"));
    expect(commits[1].order).toBe(1);
    expect(slimBranches([
      { name: "cursor/messages-290f", commit: { sha: "abc" } },
      { name: "cursor/panic-privacy-plug", commit: { sha: "def" } },
      { name: "main", commit: { sha: "fff" } },
    ], ["290f", "-plug"])).toEqual([
      { name: "cursor/messages-290f", sha: "abc" },
      { name: "cursor/panic-privacy-plug", sha: "def" },
    ]);
    const pushes = pushesFromEvents([
      { type: "PushEvent", created_at: "2026-10-12T19:00:00Z", payload: { ref: "refs/heads/cursor/messages-290f", head: "aaa" } },
      { type: "PushEvent", created_at: "2026-10-12T19:10:00Z", payload: { ref: "refs/heads/cursor/messages-290f", head: "bbb" } },
      { type: "PushEvent", created_at: "2026-10-12T19:05:00Z", payload: { ref: "refs/heads/cursor/other-dbd3", head: "ccc" } },
    ], ["290f", "dbd3"]);
    expect(pushes.map((push) => push.sha)).toEqual(["bbb", "ccc"]);
    expect(agentBranch({
      suffix: "-plug",
      longerSuffixes: ["-privacy-plug", "-chat-plug", "-media-plug"],
      pulls: [{ state: "open", updated_at: "2026-10-12T19:00:00Z", head: { ref: "cursor/logger-plug" } }],
      pushes: [{ branch: "cursor/panic-privacy-plug", at: Date.parse("2026-10-12T20:00:00Z"), sha: "p" }],
      branches: [{ name: "cursor/logger-plug", sha: "abc" }],
    })).toEqual({ branch: "cursor/logger-plug", sha: "abc", open: true });
    expect(agentBranch({
      suffix: "290f",
      pulls: [],
      pushes: [],
      branches: [{ name: "cursor/old-290f", sha: "old" }],
    })).toBeNull();
    const compared = normalizeCommits([
      { sha: "1", commit: { message: "first", committer: { date: "2026-10-12T18:00:00Z" } } },
      { sha: "2", commit: { message: "second", committer: { date: "2026-10-12T19:00:00Z" } } },
    ], "cursor/messages-290f", true);
    expect(compared.map((commit) => commit.message)).toEqual(["second", "first"]);
    expect(compareUrl("cursor/messages-290f")).toBe("https://api.github.com/repos/ItsErod/lark/compare/main...cursor%2Fmessages-290f");
    expect(refMatchesAgent("cursor/panic-privacy-plug", "-plug", ["-privacy-plug", "-chat-plug", "-media-plug"])).toBe(false);
    expect(refMatchesAgent("cursor/panic-privacy-plug", "-privacy-plug", ["-plug"])).toBe(true);
    expect(refMatchesAgent("cursor/messages-290f", "290f", [])).toBe(true);
  });

  it("uses the latest open pull request, otherwise the latest commit, and shows Idle or Done", () => {
    const now = Date.parse("2026-10-12T20:00:00Z");
    const working = buildAgentActivity({
      suffix: "290f",
      status: "review",
      now,
      pulls: [
        { title: "Composer rewrite", state: "open", created_at: "2026-10-12T18:00:00Z", updated_at: "2026-10-12T19:30:00Z", html_url: "https://github.com/ItsErod/lark/pull/12", head: { ref: "cursor/messages-290f" } },
        { title: "Older open", state: "open", created_at: "2026-10-12T17:00:00Z", updated_at: "2026-10-12T17:10:00Z", head: { ref: "cursor/messages-290f" } },
        { title: "Other stream", state: "open", created_at: "2026-10-12T19:50:00Z", updated_at: "2026-10-12T19:55:00Z", head: { ref: "cursor/servers-dbd3" } },
      ],
      commits: [
        { message: "wip composer", branch: "cursor/messages-290f", at: now - 30 * 60 * 1000, sha: "a", order: 1 },
        { message: "first commit", branch: "cursor/messages-290f", at: now - 3 * 60 * 60 * 1000, sha: "b", order: 0 },
        { message: "unrelated", branch: "cursor/servers-dbd3", at: now - 1000, sha: "c", order: 0 },
      ],
    });
    expect(working.state).toBe("working");
    expect(working.task).toBe("Composer rewrite");
    expect(working.taskUrl).toContain("/pull/12");
    expect(working.taskStartedAt).toBe(now - 3 * 60 * 60 * 1000);
    expect(working.startedAt).toBe(Date.parse("2026-10-12T17:00:00Z"));
    expect(working.commits.map((commit) => commit.message)).toEqual(["wip composer", "first commit"]);
    expect(formatWorking(60 * 60 * 1000 + 12 * 60 * 1000)).toBe("working for 1h 12m");
    expect(formatTotal(2 * 60 * 60 * 1000)).toBe("total 2h 0m");

    const fromCommit = buildAgentActivity({
      suffix: "290f",
      status: "coding",
      now,
      pulls: [],
      branches: [{ name: "cursor/live-290f" }],
      commits: [
        { message: "deleted tip", branch: "cursor/gone-290f", at: now - 1000, sha: "d", order: 0 },
        { message: "live tip", branch: "cursor/live-290f", at: now - 10 * 60 * 1000, sha: "l", order: 0 },
        { message: "live first", branch: "cursor/live-290f", at: now - 50 * 60 * 1000, sha: "f", order: 0 },
      ],
    });
    expect(fromCommit.state).toBe("working");
    expect(fromCommit.task).toBe("live tip");
    expect(fromCommit.taskStartedAt).toBe(now - 50 * 60 * 1000);
    expect(fromCommit.commits).toHaveLength(2);

    const idle = buildAgentActivity({
      suffix: "290f",
      status: "merged",
      now,
      pulls: [{ title: "Closed", state: "closed", created_at: "2026-10-12T12:00:00Z", head: { ref: "cursor/messages-290f" } }],
      commits: [],
    });
    expect(idle.state).toBe("idle");
    expect(idle.task).toBe("");
    expect(idle.startedAt).toBe(Date.parse("2026-10-12T12:00:00Z"));

    const done = buildAgentActivity({
      suffix: "290f",
      status: "done",
      now,
      pulls: [{ title: "Landed", state: "closed", merged_at: "2026-10-12T19:00:00Z", created_at: "2026-10-12T16:00:00Z", head: { ref: "cursor/messages-290f" } }],
      commits: [{ message: "land it", branch: "cursor/messages-290f", at: Date.parse("2026-10-12T18:00:00Z"), sha: "a", order: 0 }],
    });
    expect(done.state).toBe("done");
    expect(done.taskStartedAt).toBeNull();
    expect(done.workedMs).toBe(3 * 60 * 60 * 1000);
    expect(formatWorked(done.workedMs || 0)).toBe("worked 3h 0m");
    expect(done.commits.map((commit) => commit.message)).toEqual(["land it"]);

    const starter = buildAgentActivity({
      suffix: "-plug",
      longerSuffixes: ["-privacy-plug", "-chat-plug", "-media-plug"],
      status: "review",
      now,
      pulls: [
        { title: "Panic", state: "open", created_at: "2026-10-12T18:00:00Z", updated_at: "2026-10-12T19:00:00Z", head: { ref: "cursor/panic-privacy-plug" } },
        { title: "Logger", state: "open", created_at: "2026-10-12T18:30:00Z", updated_at: "2026-10-12T18:40:00Z", head: { ref: "cursor/logger-plug" } },
      ],
      commits: [],
    });
    expect(starter.task).toBe("Logger");

    const skewed = buildAgentActivity({
      suffix: "290f",
      status: "review",
      now,
      pulls: [{ title: "Composer", state: "open", created_at: new Date(now - 10 * 60 * 1000).toISOString(), updated_at: new Date(now).toISOString(), head: { ref: "cursor/messages-290f" } }],
      commits: [
        { message: "old main", branch: "cursor/messages-290f", at: now - 10 * 60 * 60 * 1000, sha: "m", order: 1, onTask: false },
        { message: "task commit", branch: "cursor/messages-290f", at: now - 5 * 60 * 1000, sha: "t", order: 2, onTask: true },
      ],
    });
    expect(skewed.taskStartedAt).toBe(now - 10 * 60 * 1000);
    expect(skewed.commits.map((commit) => commit.message)).toEqual(["task commit", "old main"]);
  });
});
