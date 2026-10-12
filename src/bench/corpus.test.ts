import { describe, expect, it } from "vitest";
import { BENCH_HISTORY, BENCH_MEMBERS, benchHistory, benchPeople } from "./corpus";

describe("bench corpus", () => {
  it("builds a long channel history with stable ids", () => {
    const rows = benchHistory("100000000000000022", BENCH_HISTORY);
    expect(rows).toHaveLength(BENCH_HISTORY);
    expect(new Set(rows.map((row) => row.id)).size).toBe(BENCH_HISTORY);
    expect(rows[0].content).toContain("bench 100000000000000022 0");
    expect(rows.at(-1)?.channelId).toBe("100000000000000022");
  });

  it("builds a member list past the virtual window", () => {
    const roster = benchPeople();
    expect(roster.length).toBe(BENCH_MEMBERS);
    expect(new Set(roster.map((person) => person.id)).size).toBe(BENCH_MEMBERS);
    expect(roster[0].name).toBe("Ethan Park");
  });
});
