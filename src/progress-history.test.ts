import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../docs/progress/index.html", import.meta.url), "utf8");
const marked = html.match(/\/\* version-history-api \*\/([\s\S]*?)\/\* version-history-api-end \*\//);
if (!marked) throw new Error("version history helpers missing from the progress page");

type Entry = {
  kind: string;
  version: string;
  durationMs: number | null;
  since: string | null;
  date: number;
};

type History = {
  entries: Entry[];
  totalMs: number;
  completedMs: number;
  inProgress: { version: string; since: string; startedAt: number; durationMs: number } | null;
  firstTag: string;
  latestTag: string;
  versions: Entry[];
};

const api = new Function(
  `${marked[1]}\nreturn { RELEASES_REFRESH_MS, formatDuration, buildVersionHistory, inProgressName };`,
)() as {
  RELEASES_REFRESH_MS: number;
  formatDuration: (ms: number | null, live?: boolean) => string;
  inProgressName: (tags: string[]) => string;
  buildVersionHistory: (releases: Array<Record<string, unknown>>, now: number) => History;
};

const { RELEASES_REFRESH_MS, formatDuration, buildVersionHistory, inProgressName } = api;

describe("version history", () => {
  it("keeps the release list on a 10 minute cache so the page stays under 60 requests an hour", () => {
    expect(RELEASES_REFRESH_MS).toBe(10 * 60 * 1000);
    expect(html).toContain('const REFRESH_MS = 120000');
    expect(html).toContain("lark30-version-history-v1");
    expect(html).toContain("(Date.now() - savedReleases.fetchedAt) < RELEASES_REFRESH_MS");
    expect(html).toContain("https://api.github.com/repos/ItsErod/lark/releases?per_page=100");
  });

  it("names the in-progress version 3.0 until a 3.x release exists", () => {
    expect(inProgressName(["v2.2", "v2.4.5"])).toBe("3.0");
    expect(inProgressName(["v2.4.5", "v3.0.0"])).toBe("3.0.1");
    expect(inProgressName(["v3.1"])).toBe("3.1.1");
    expect(inProgressName(["v2.4.5", "v4.0.2"])).toBe("4.0.3");
  });

  it("formats finished gaps and the live clock", () => {
    expect(formatDuration(null, false)).toBe("—");
    expect(formatDuration(42 * 60 * 1000 + 33 * 1000, false)).toBe("42 min 33 sec");
    expect(formatDuration(60 * 60 * 1000 + 45 * 60 * 1000, false)).toBe("1 hour 45 min");
    expect(formatDuration(90 * 1000, true)).toBe("00:01:30");
    expect(formatDuration((4 * 86400 + 3 * 3600 + 2 * 60 + 1) * 1000, true)).toBe("4d 03:02:01");
  });

  it("measures each version from the previous publish time and sums them with the live timer", () => {
    const releases = [
      { tag_name: "v2.4.5", published_at: "2026-10-12T17:10:27Z", html_url: "https://github.com/ItsErod/lark/releases/tag/v2.4.5" },
      { tag_name: "v2.4.4", published_at: "2026-10-08T02:07:59Z", html_url: "https://github.com/ItsErod/lark/releases/tag/v2.4.4" },
      { tag_name: "v2.1.1", published_at: "2026-10-06T15:28:11Z", html_url: "https://github.com/ItsErod/lark/releases/tag/v2.1.1" },
    ];
    const now = Date.parse("2026-10-12T19:28:00Z");
    const history = buildVersionHistory(releases, now);
    const first = Date.parse("2026-10-06T15:28:11Z");
    const previous = Date.parse("2026-10-08T02:07:59Z");
    const latest = Date.parse("2026-10-12T17:10:27Z");

    expect(history.inProgress?.version).toBe("3.0");
    expect(history.inProgress?.since).toBe("v2.4.5");
    expect(history.inProgress?.startedAt).toBe(latest);
    expect(history.entries.map((entry) => entry.version)).toEqual(["3.0", "v2.4.5", "v2.4.4", "v2.1.1"]);
    expect(history.entries[0].kind).toBe("progress");
    expect(history.entries[1].durationMs).toBe(latest - previous);
    expect(formatDuration(history.entries[1].durationMs, false)).toBe("4 days 15 hours 2 min");
    expect(history.entries.at(-1)?.durationMs).toBeNull();
    expect(history.completedMs + (history.inProgress?.durationMs || 0)).toBe(history.totalMs);
    expect(history.totalMs).toBe(now - first);
  });

  it("picks up a newly published release without a hardcoded list", () => {
    const now = Date.parse("2026-10-20T15:00:00Z");
    const history = buildVersionHistory([
      { tag_name: "v2.4.5", published_at: "2026-10-12T17:10:27Z" },
      { tag_name: "v3.0.0", published_at: "2026-10-20T12:00:00Z", html_url: "https://github.com/ItsErod/lark/releases/tag/v3.0.0" },
    ], now);
    expect(history.latestTag).toBe("v3.0.0");
    expect(history.inProgress?.version).toBe("3.0.1");
    expect(history.inProgress?.since).toBe("v3.0.0");
    expect(history.entries.some((entry) => entry.version === "v3.0.0" && entry.kind === "release")).toBe(true);
    expect(history.totalMs).toBe(now - Date.parse("2026-10-12T17:10:27Z"));
  });
});
