import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { DISCORD_EPOCH, accountAgeLabel, joinLabel, mutualNames, snowflakeTime, whoisLines } from "./whois";

describe("user whois", () => {
  it("reads account age from a snowflake and formats mutuals and the join date", () => {
    const created = Date.parse("2020-01-01T00:00:00.000Z");
    const id = ((BigInt(created) - BigInt(DISCORD_EPOCH)) << 22n).toString();
    const now = created + 400 * 86_400_000;
    expect(snowflakeTime(id, now)).toBe(created);
    expect(snowflakeTime("nope", now)).toBeNull();
    expect(accountAgeLabel(created, now)).toBe("Account is 1y 1mo old");
    expect(accountAgeLabel(now - 3 * 86_400_000, now)).toBe("Account is 3 days old");
    expect(joinLabel("2024-06-15T12:00:00.000Z")).toMatch(/2024/);
    expect(joinLabel("nope")).toBe("");
    expect(mutualNames("7", [{ name: "Northwind", memberIds: ["7"] }, { name: "Booth", memberIds: ["8"] }], ["Northwind", "Ink"])).toEqual(["Northwind", "Ink"]);
    expect(whoisLines({
      userId: id,
      now,
      joinedAt: "2024-06-15T12:00:00.000Z",
      mutuals: ["Northwind"],
      showAge: true,
      showMutuals: true,
      showJoin: true,
    }).join(" | ")).toContain("Mutual servers: Northwind");
  });

  it("can hide each line from the plugin options", () => {
    const lines = whoisLines({
      userId: "1",
      now: Date.now(),
      mutuals: ["Northwind"],
      showAge: false,
      showMutuals: false,
      showJoin: false,
    });
    expect(lines).toEqual([]);
  });

  it("declares the whois hook", () => {
    const plugin = describePlugin(readFileSync("plugins/user-whois.js", "utf8"), "user-whois");
    expect(plugin.hooks.userWhois).toBe(true);
    expect(plugin.name).toBe("User whois");
  });
});
