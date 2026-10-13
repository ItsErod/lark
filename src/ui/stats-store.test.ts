import { afterEach, describe, expect, it } from "vitest";
import {
  STATS_KEY,
  STATS_OFF_KEY,
  clearStats,
  collecting,
  formatDuration,
  noteAll,
  resetStatsModule,
  setCollecting,
  statsView,
  useStatsStorage,
  type StatNote,
} from "./stats-store";

function memory(): Storage {
  const bag = new Map<string, string>();
  return {
    get length() { return bag.size; },
    clear() { bag.clear(); },
    getItem(key: string) { return bag.has(key) ? bag.get(key) ?? null : null; },
    key(index: number) { return [...bag.keys()][index] ?? null; },
    removeItem(key: string) { bag.delete(key); },
    setItem(key: string, value: string) { bag.set(key, value); },
  };
}

let bin: Storage;

afterEach(() => {
  resetStatsModule();
  useStatsStorage(null);
});

function setup() {
  bin = memory();
  useStatsStorage(bin);
  resetStatsModule();
  useStatsStorage(bin);
}

const channel = { id: "c1", name: "design-crit", place: "Northwind", scope: "text" };

describe("local stats", () => {
  it("counts messages, focus time, voice, speaking, games, and clips on this device", () => {
    setup();
    const t = Date.parse("2026-10-13T15:00:00");
    const notes: StatNote[] = [
      { t, kind: "focus", ...channel },
      { t: t + 5_000, kind: "focus", id: "dm1", name: "Maya Chen", place: "Direct messages", scope: "dm" },
      { t: t + 1_000, kind: "message", ...channel },
      { t: t + 2_000, kind: "message", ...channel },
      { t: t + 6_000, kind: "message", id: "dm1", name: "Maya Chen", place: "Direct messages", scope: "dm" },
      { t, kind: "voice", on: 1, id: "booth", name: "Studio booth", place: "Northwind", scope: "voice" },
      { t: t + 1_000, kind: "speak", on: 1 },
      { t: t + 4_000, kind: "speak", on: 0 },
      { t: t + 10_000, kind: "voice", on: 0 },
      { t, kind: "game", on: 1, name: "Lark" },
      { t: t + 60_000, kind: "game", on: 0 },
      { t, kind: "clip" },
      { t, kind: "clip" },
    ];
    noteAll(notes, t);
    const view = statsView(t + 60_000);
    expect(view.messages).toBe(3);
    expect(view.clips).toBe(2);
    expect(view.voiceMs).toBe(10_000);
    expect(view.speakMs).toBe(3_000);
    expect(view.games).toEqual([{ name: "Lark", ms: 60_000 }]);
    expect(view.channels[0]).toMatchObject({ name: "design-crit", messages: 2, ms: 5_000 });
    expect(view.dms[0]).toMatchObject({ name: "Maya Chen", messages: 1 });
    expect(view.servers[0]?.name).toBe("Northwind");
    expect(view.voicePlaces[0]).toMatchObject({ name: "Studio booth", voiceMs: 10_000, speakMs: 3_000 });
    expect(view.days.some((day) => day.messages === 3 && day.day === "2026-10-13")).toBe(true);
    const saved = JSON.parse(bin.getItem(STATS_KEY) ?? "{}") as { messages: number };
    expect(saved.messages).toBe(3);
    expect(JSON.stringify(saved)).not.toMatch(/token|password|secret/i);
  });

  it("ignores notes when collection is off and clears stored counts", () => {
    setup();
    setCollecting(false);
    noteAll([{ t: 1_000, kind: "message", ...channel }]);
    expect(statsView().messages).toBe(0);
    expect(collecting()).toBe(false);
    setCollecting(true);
    noteAll([{ t: 2_000, kind: "message", ...channel }]);
    expect(statsView().messages).toBe(1);
    clearStats();
    expect(statsView().messages).toBe(0);
    expect(collecting()).toBe(true);
    expect(bin.getItem(STATS_OFF_KEY)).toBe("0");
  });

  it("caps a single open span at six hours", () => {
    setup();
    noteAll([
      { t: 0, kind: "voice", on: 1, id: "booth", name: "Studio booth", place: "Northwind", scope: "voice" },
      { t: 10 * 60 * 60 * 1000, kind: "voice", on: 0 },
    ]);
    expect(statsView().voiceMs).toBe(6 * 60 * 60 * 1000);
  });

  it("formats short and long durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(90_000)).toBe("1m");
    expect(formatDuration(3_720_000)).toBe("1h 2m");
  });
});
