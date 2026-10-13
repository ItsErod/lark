import { describe, expect, it } from "vitest";
import {
  cleanAlertList,
  digestLines,
  digestSummary,
  dropChannel,
  inQuietHours,
  matchAlert,
  planNotification,
  releaseHeld,
  rememberMissed,
  sanitizeMissed,
  sanitizeQuiet,
  type MissedNote,
} from "./smart-notify";

const base = {
  fromMe: false,
  windowFocused: false,
  sameChannel: false,
  desktopEnabled: true,
  level: "all" as const,
  mentionsMe: false,
  direct: false,
  quiet: false,
  quietMode: "batch" as const,
  alert: false,
  blocked: false,
  away: true,
};

function at(hour: number, minute = 0): Date {
  return new Date(2026, 9, 13, hour, minute, 0, 0);
}

describe("quiet hours", () => {
  it("keeps an invalid window off and accepts a local clock", () => {
    expect(sanitizeQuiet(null)).toMatchObject({ enabled: false, start: "22:00", end: "07:00", mode: "batch" });
    expect(sanitizeQuiet({ enabled: true, start: "9:00", end: "17:00", mode: "suppress" })).toMatchObject({
      enabled: true,
      start: "22:00",
      end: "17:00",
      mode: "suppress",
    });
    const quiet = sanitizeQuiet({ enabled: true, start: "22:00", end: "07:00", mode: "batch" });
    expect(inQuietHours(quiet, at(22, 0))).toBe(true);
    expect(inQuietHours(quiet, at(23, 30))).toBe(true);
    expect(inQuietHours(quiet, at(6, 59))).toBe(true);
    expect(inQuietHours(quiet, at(7, 0))).toBe(false);
    expect(inQuietHours(quiet, at(12, 0))).toBe(false);
    expect(inQuietHours({ ...quiet, start: "09:00", end: "17:00" }, at(9, 0))).toBe(true);
    expect(inQuietHours({ ...quiet, start: "09:00", end: "17:00" }, at(17, 0))).toBe(false);
    expect(inQuietHours({ ...quiet, start: "12:00", end: "12:00" }, at(12, 0))).toBe(false);
    expect(inQuietHours({ ...quiet, enabled: false }, at(23, 0))).toBe(false);
  });
});

describe("keyword and person alerts", () => {
  it("notifies on a muted channel unless the match is blocked", () => {
    const muted = { ...base, level: "mute" as const, alert: true };
    expect(planNotification(muted).action).toBe("send");
    expect(planNotification({ ...muted, blocked: true }).action).toBe("skip");
    expect(planNotification({ ...base, level: "mute" }).action).toBe("skip");

    expect(matchAlert({
      content: "ship the wordmark",
      authorId: "100000000000000002",
      authorName: "Maya Chen",
      channelId: "100000000000000025",
      keywords: ["wordmark"],
      people: [],
      blocked: [],
    })).toEqual({ kind: "keyword", blocked: false });

    expect(matchAlert({
      content: "ship the wordmark",
      authorId: "100000000000000002",
      authorName: "Maya Chen",
      channelId: "100000000000000025",
      keywords: ["wordmark"],
      people: ["Maya Chen"],
      blocked: ["wordmark"],
    })).toEqual({ kind: "person", blocked: false });

    expect(matchAlert({
      content: "hello",
      authorId: "100000000000000002",
      authorName: "Maya Chen",
      channelId: "c1",
      keywords: [],
      people: ["Maya Chen"],
      blocked: [],
    }).kind).toBe("person");

    expect(matchAlert({
      content: "ship the wordmark",
      authorId: "100000000000000002",
      authorName: "Maya Chen",
      channelId: "100000000000000025",
      keywords: ["wordmark"],
      people: ["Maya Chen"],
      blocked: ["100000000000000025"],
    })).toEqual({ kind: null, blocked: true });

    expect(matchAlert({
      content: "ship the wordmark",
      authorId: "100000000000000002",
      authorName: "Maya Chen",
      channelId: "c1",
      keywords: ["wordmark"],
      people: [],
      blocked: ["Maya Chen"],
    })).toEqual({ kind: null, blocked: true });

    expect(cleanAlertList("Ada, ada, a, mfa.abcdefghijklmnopqrstuvwxyz, ship")).toEqual(["Ada", "ship"]);
  });

  it("still sends mentions and direct messages during quiet hours", () => {
    const quiet = { ...base, quiet: true, quietMode: "suppress" as const };
    expect(planNotification(quiet).action).toBe("skip");
    expect(planNotification(quiet).record).toBe(true);
    expect(planNotification({ ...quiet, quietMode: "batch" }).action).toBe("hold");
    expect(planNotification({ ...quiet, mentionsMe: true }).action).toBe("send");
    expect(planNotification({ ...quiet, direct: true }).action).toBe("send");
    expect(planNotification({ ...quiet, alert: true }).action).toBe("send");
    expect(planNotification({ ...base, fromMe: true }).action).toBe("skip");
    expect(planNotification({ ...base, windowFocused: true, sameChannel: true, away: false }).record).toBe(false);
    expect(planNotification({ ...base, desktopEnabled: false }).action).toBe("skip");
    expect(planNotification({ ...base, desktopEnabled: false }).record).toBe(true);
  });
});

describe("missed digest", () => {
  const note = (patch: Partial<MissedNote>): MissedNote => ({
    id: "1",
    channelId: "c1",
    channel: "general",
    author: "Maya",
    preview: "hello",
    at: 10,
    reason: "away",
    held: false,
    ...patch,
  });

  it("groups a local summary and drops a channel once it is opened", () => {
    const notes = rememberMissed(
      rememberMissed([note({ id: "1" })], note({ id: "2", channelId: "c2", channel: "design", held: true })),
      note({ id: "3", preview: "again" }),
    );
    expect(digestLines(notes).map((line) => [line.channelId, line.count])).toEqual([
      ["c1", 2],
      ["c2", 1],
    ]);
    expect(digestSummary(notes).title).toBe("3 messages missed");
    expect(digestSummary(notes).body).toContain("general · 2");
    expect(dropChannel(notes, "c1").map((item) => item.id)).toEqual(["2"]);
    expect(releaseHeld(notes).every((item) => !item.held)).toBe(true);
    expect(sanitizeMissed([{ id: "ok", channelId: "c1", preview: "mfa.abcdefghijklmnopqrstuvwxyz" }])).toEqual([]);
    expect(sanitizeMissed([note({ id: "9", preview: "  saved  " })])).toMatchObject([{ id: "9", preview: "saved" }]);
  });
});
