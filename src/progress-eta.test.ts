import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../docs/progress/index.html", import.meta.url), "utf8");
const marked = html.match(/\/\* eta-api \*\/([\s\S]*?)\/\* eta-api-end \*\//);
if (!marked) throw new Error("ETA helpers missing from the progress page");

type Eta = {
  state: string;
  remainingMs?: number;
  finishAt?: number;
  finishedAt?: number;
};

const api = new Function(
  `${marked[1]}\nreturn { agentEta, workEta, pluginAgentsFrom, overallAgentEta, formatEta, isPluginBranch };`,
)() as {
  agentEta: (startMs: number | null, fraction: number, now: number, finishedAt: number | null) => Eta;
  workEta: (prs: Array<Record<string, unknown>>, fraction: number, now: number) => Eta;
  pluginAgentsFrom: (pulls: Array<Record<string, unknown>>) => Array<{ id: string; ratio: number; status: string }>;
  overallAgentEta: (etas: Eta[], now: number) => Eta;
  formatEta: (remainingMs: number) => string;
  isPluginBranch: (ref: string) => boolean;
};

const { agentEta, workEta, pluginAgentsFrom, overallAgentEta, formatEta, isPluginBranch } = api;

describe("agent ETA", () => {
  it("estimates remaining time from elapsed divided by fraction done", () => {
    const now = Date.parse("2026-10-12T20:00:00Z");
    const start = now - (2 * 60 * 60 * 1000);
    const eta = agentEta(start, 0.5, now, null);
    expect(eta.state).toBe("eta");
    expect(eta.remainingMs).toBe(2 * 60 * 60 * 1000);
    expect(eta.finishAt).toBe(now + 2 * 60 * 60 * 1000);
    expect(formatEta(60 * 60 * 1000 + 12 * 60 * 1000)).toBe("ETA ~1h 12m 00s");
    expect(formatEta(0)).toBe("ETA ~any moment");
  });

  it("uses the first pull request as the start and shows Done at the last merge", () => {
    const now = Date.parse("2026-10-12T20:00:00Z");
    const open = workEta([
      { state: "open", created_at: "2026-10-12T18:00:00Z" },
      { state: "closed", merged_at: "2026-10-12T19:00:00Z", created_at: "2026-10-12T16:00:00Z" },
    ], 0.5, now);
    expect(open.remainingMs).toBe(now - Date.parse("2026-10-12T16:00:00Z"));

    const done = workEta([
      { state: "closed", merged_at: "2026-10-12T19:00:00Z", created_at: "2026-10-12T16:00:00Z" },
    ], 1, now);
    expect(done.state).toBe("done");
    expect(done.finishedAt).toBe(Date.parse("2026-10-12T19:00:00Z"));
    expect(workEta([], 0.05, now).state).toBe("unknown");
  });

  it("takes the overall 3.0 ETA from the latest agent and lists plugin agents", () => {
    const now = Date.parse("2026-10-12T20:00:00Z");
    const soon = { state: "eta", finishAt: now + 30 * 60 * 1000 };
    const later = { state: "eta", finishAt: now + 90 * 60 * 1000 };
    const done = { state: "done", finishedAt: now - 60 * 60 * 1000 };
    const overall = overallAgentEta([soon, done, later, { state: "unknown" }], now);
    expect(overall.finishAt).toBe(later.finishAt);
    expect(overallAgentEta([done], now)).toEqual({ state: "done", finishedAt: done.finishedAt });

    expect(isPluginBranch("cursor/plugin-spotify-plug")).toBe(true);
    expect(isPluginBranch("cursor/messages-290f")).toBe(false);
    const agents = pluginAgentsFrom([
      { number: 89, title: "Spotify", state: "open", created_at: "2026-10-12T18:00:00Z", head: { ref: "cursor/plugin-spotify-plug" }, html_url: "https://github.com/ItsErod/lark/pull/89" },
      { number: 3, title: "Messages", state: "open", created_at: "2026-10-12T18:00:00Z", head: { ref: "cursor/messages-290f" } },
      { number: 2, title: "Closed plugin", state: "closed", head: { ref: "cursor/old-plug" } },
    ]);
    expect(agents.map((agent) => agent.id)).toEqual(["plug-89"]);
    expect(agents[0].ratio).toBe(0.5);
    expect(agents[0].status).toBe("review");
  });
});
