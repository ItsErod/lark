import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import {
  activeStatKind,
  buildText,
  calloutChoices,
  canReplaceSession,
  crewText,
  deskActions,
  lfgText,
  overwatchUrl,
  parseSteamProfile,
  profileTarget,
  readCatalog,
  sanitizeCatalog,
  sanitizeDesks,
  sessionClock,
  sessionStatusLine,
  setSession,
  statsCard,
  steamPageUrl,
  steamXmlUrl,
} from "./game-desk";
import { sanitizePack } from "./state";

function pluginSource(id: string): string {
  return readFileSync(`store/plugins/${id}/plugin.js`, "utf8");
}

const sessionSource = `function describe(){ return { gameDesk: true }; }
function catalog(){ return { game: "Session", nameEditable: true, tools: ["session"] }; }`;

describe("game desk", () => {
  it("reads a catalog and drops anything that is not a desk tool", () => {
    const catalog = readCatalog(sessionSource);
    expect(catalog).toMatchObject({ game: "Session", nameEditable: true, tools: ["session"] });
    expect(sanitizeCatalog({ game: "X", tools: ["lfg", "fetch", "stats"], stats: { kinds: ["steam", "tracker"] } })?.tools).toEqual(["lfg", "stats"]);
    expect(sanitizeCatalog({ tools: [] })).toBeNull();
    expect(sanitizeCatalog(null)).toBeNull();
  });

  it("formats posts from the fields you filled in", () => {
    const desk = sanitizeDesks({
      "session-clock": {
        role: "Support",
        mode: "Competitive",
        size: "5",
        note: "evening",
        slots: ["Ana", "Nano"],
        crew: "Driver: Sam\nHacker: Jo",
        statLines: "K/D: 1.2",
      },
    })["session-clock"];
    expect(lfgText("Overwatch 2", desk)).toBe("LFG · Overwatch 2\nRole: Support\nMode: Competitive\nSquad: 5\nevening");
    expect(buildText("Overwatch 2", ["Hero", "Perk"], desk)).toBe("Build · Overwatch 2\nHero: Ana\nPerk: Nano");
    expect(buildText("Overwatch 2", ["Hero"], { ...desk, slots: [] })).toBe("");
    expect(crewText("GTA V", desk)).toBe("Crew · GTA V\nDriver: Sam\nHacker: Jo\nReply with ready.");
    expect(statsCard("Call of Duty", desk)).toBe("Stats · Call of Duty\nK/D: 1.2");
    expect(calloutChoices({ game: "Callouts", nameEditable: false, tools: ["callouts"], roles: [], modes: [], sizes: [], slots: [], callouts: ["Hold"], stats: null }, { ...desk, callouts: "Hold\nPush" })).toEqual(["Hold", "Push"]);
  });

  it("keeps one session clock and a status line you can replace", () => {
    const now = 1_000_000;
    const started = setSession({}, "session-clock", true, now - 90_000);
    expect(started["session-clock"].sessionStart).toBe(now - 90_000);
    expect(sessionClock(now - 90_000, now)).toBe("1:30");
    expect(sessionStatusLine("Hades", now - 90_000, now)).toBe("Hades · 1m");
    expect(sessionStatusLine("Session", now, now)).toBe("Session · just started");
    expect(canReplaceSession("brb", "Hades · 1m", false)).toBe(false);
    expect(canReplaceSession("Hades · 1m", "Hades · 1m", false)).toBe(true);
    expect(canReplaceSession("brb", "Hades · 1m", true)).toBe(true);
    const stopped = setSession(started, "session-clock", false, now);
    expect(stopped["session-clock"].sessionStart).toBe(0);
    const pack = sanitizePack({ gameDesks: { "session-clock": { sessionStart: now, presence: true, gameName: "Hades" } } });
    expect(pack.gameDesks["session-clock"].gameName).toBe("Hades");
    expect(pack.gameDesks["session-clock"].presence).toBe(true);
    expect(sanitizePack({ gameDesks: { "../x": { gameName: "nope" } } }).gameDesks).toEqual({});
  });

  it("opens only official public profile links", () => {
    expect(steamPageUrl("76561198000000000")).toBe("https://steamcommunity.com/profiles/76561198000000000");
    expect(steamXmlUrl("gaben")).toBe("https://steamcommunity.com/id/gaben?xml=1");
    expect(steamPageUrl("../etc")).toBeNull();
    expect(steamPageUrl("a")).toBeNull();
    const career = "https://overwatch.blizzard.com/en-us/career/abc12345def/";
    expect(overwatchUrl(career)).toBe(career);
    expect(overwatchUrl("https://overwatch.blizzard.com/en-us/")).toBeNull();
    expect(overwatchUrl("https://tracker.gg/overwatch")).toBeNull();
    expect(overwatchUrl("https://api.deadlock-api.com/v1/players/1")).toBeNull();
    expect(overwatchUrl("https://my.callofduty.com/api/papi-client/stats")).toBeNull();
    expect(overwatchUrl("http://overwatch.blizzard.com/en-us/career/abc12345def/")).toBeNull();
    expect(profileTarget("steam", "gaben")?.url).toBe("https://steamcommunity.com/id/gaben");
    expect(profileTarget("card", "gaben")).toBeNull();
    const xml = "<profile><steamID><![CDATA[Gabe <Newell>]]></steamID><onlineState>online</onlineState><memberSince>January 1, 2003</memberSince></profile>";
    expect(parseSteamProfile(xml, "https://steamcommunity.com/id/gaben?xml=1")).toEqual({
      name: "Gabe Newell",
      state: "online",
      memberSince: "January 1, 2003",
      url: "https://steamcommunity.com/id/gaben",
    });
    expect(parseSteamProfile(xml, "https://tracker.gg/gaben")).toBeNull();
    expect(activeStatKind(
      { game: "Stats", nameEditable: true, tools: ["stats"], roles: [], modes: [], sizes: [], slots: [], callouts: [], stats: { kinds: ["steam", "card"], label: "Public profile", placeholder: "", hint: "Steam only.", fields: [] } },
      sanitizeDesks({ "public-stats": { statKind: "tracker" } })["public-stats"],
    )).toBe("steam");
  });

  it("lists composer actions for the tools in the catalog", () => {
    const catalog = readCatalog(sessionSource);
    expect(catalog).not.toBeNull();
    const desk = sanitizeDesks({ "session-clock": {} })["session-clock"];
    expect(deskActions("session-clock", catalog!, desk).map((item) => item.id)).toEqual(["session-clock:session"]);
  });
});

describe("store game plugins", () => {
  const ids = readdirSync("store/plugins").filter((id) => {
    try {
      return describePlugin(pluginSource(id), id).hooks.gameDesk;
    } catch {
      return false;
    }
  });

  it("ships at least the session clock, and none of them call the network", () => {
    expect(ids).toContain("session-clock");
    for (const id of ids) {
      const source = pluginSource(id);
      expect(source, id).not.toMatch(/fetch\s*\(|XMLHttpRequest|\btoken\b|WebSocket|child_process|process\.|ReadProcessMemory/i);
      const plugin = describePlugin(source, id);
      expect(plugin.hooks.gameDesk, id).toBe(true);
      expect(readCatalog(source)?.tools.length, id).toBeGreaterThan(0);
    }
  });
});

function sanitizePackDesk(now: number) {
  return sanitizePack({ gameDesks: { "session-clock": { sessionStart: now - 13 * 60 * 60 * 1000 } } });
}

describe("stale sessions", () => {
  it("drops a session that has already run for more than twelve hours", () => {
    const now = Date.now();
    expect(sanitizePackDesk(now).gameDesks["session-clock"].sessionStart).toBe(0);
  });
});
