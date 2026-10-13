import { describe, expect, it } from "vitest";
import { activityAgo, activityClock, dashboardFeed, dashboardSig } from "./dashboard";
import type { Person } from "../types";
import type { SocialRelationship } from "../social";

const now = Date.parse("2026-10-13T18:00:00Z");

function person(partial: Person): Person {
  return partial;
}

describe("activity clock", () => {
  it("formats hours and short ages", () => {
    expect(activityClock(now - (1 * 3600 + 12 * 60 + 4) * 1000, now)).toBe("1:12:04");
    expect(activityClock(now - (2 * 60 + 18) * 1000, now)).toBe("2:18");
    expect(activityAgo(now - 2 * 60 * 1000, now)).toBe("2m");
    expect(activityAgo(now - 3 * 3600 * 1000, now)).toBe("3h");
    expect(activityAgo(null, now)).toBe("");
  });
});

describe("dashboard feed", () => {
  const maya = person({
    id: "maya",
    name: "Maya Chen",
    status: "online",
    avatarUrl: "https://example.test/maya.png",
    rich: { name: "design-crit", type: 1, live: true, startedAt: now - 2 * 60 * 1000 },
  });
  const jonah = person({
    id: "jonah",
    name: "Jonah Adler",
    status: "online",
    friendNick: "Jo",
    activity: "Playing Deadlock",
    rich: { name: "Deadlock", type: 0, startedAt: now - (1 * 3600 + 12 * 60 + 4) * 1000 },
  });
  const priya = person({
    id: "priya",
    name: "Priya Shah",
    status: "online",
    activity: "Listening to Nala Sinephro",
    rich: { name: "Nala Sinephro", type: 2, startedAt: now - (2 * 60 + 18) * 1000 },
  });
  const me = person({ id: "me", name: "Ethan", status: "online", activity: "Playing Lark" });
  const requests: SocialRelationship[] = [
    { id: "rio", kind: "incoming", name: "Rio Santos", username: "rio", nickname: "" },
    { id: "leah", kind: "outgoing", name: "Leah Kim", username: "leah", nickname: "Leah" },
    { id: "sam", kind: "friend", name: "Sam", username: "sam", nickname: "" },
  ];

  const model = dashboardFeed({
    people: [me, priya, jonah, maya],
    relationships: requests,
    voices: [{
      userId: "maya",
      guildId: "north",
      channelId: "booth",
      sharing: true,
      streamLabel: "LIVE",
    }],
    meId: "me",
    now,
    place: () => ({ guild: "Northwind", channel: "design-crit" }),
  });

  it("lists a share, a game, listening, and requests with the action on the right", () => {
    expect(model.rows.map((row) => [row.name, row.text, row.time, row.aside, row.actions.map((action) => action.label).join("/")])).toEqual([
      ["Maya Chen", "started sharing design-crit in Northwind", "2m", "", "Watch"],
      ["Priya Shah", "is listening to Nala Sinephro", "2m", "2:18", ""],
      ["Jo", "started Deadlock", "1h", "1:12:04", ""],
      ["Rio Santos", "sent you a friend request", "", "", "Accept/Ignore"],
      ["Leah", "friend request sent", "", "", "Cancel"],
    ]);
    expect(model.ticking).toBe(true);
  });

  it("keeps you out of the list and ignores plain friends", () => {
    expect(model.rows.some((row) => row.userId === "me" || row.userId === "sam")).toBe(false);
  });

  it("uses Go Live when presence did not say they were streaming", () => {
    const feed = dashboardFeed({
      people: [],
      relationships: [],
      voices: [{ userId: "maya", guildId: "north", channelId: "booth", sharing: true, name: "Maya Chen" }],
      meId: "me",
      now,
      place: () => ({ guild: "Northwind", channel: "Studio booth" }),
    });
    expect(feed.rows[0]).toMatchObject({
      name: "Maya Chen",
      text: "started sharing Studio booth in Northwind",
      time: "now",
      actions: [{ id: "watch", label: "Watch" }],
    });
  });

  it("offers Join for a voice channel with no richer activity", () => {
    const feed = dashboardFeed({
      people: [person({ id: "sam", name: "Sam Okonkwo", status: "online" })],
      relationships: [],
      voices: [{ userId: "sam", guildId: "north", channelId: "booth", sharing: false }],
      meId: "me",
      now,
      place: () => ({ guild: "Northwind", channel: "Studio booth" }),
    });
    expect(feed.rows[0]).toMatchObject({
      text: "joined Studio booth in Northwind",
      actions: [{ id: "join", label: "Join" }],
    });
    expect(feed.ticking).toBe(false);
  });

  it("changes the signature when the clock moves", () => {
    const later = dashboardFeed({
      people: [jonah],
      relationships: [],
      voices: [],
      meId: "me",
      now: now + 1000,
    });
    expect(dashboardSig(later)).not.toBe(dashboardSig(dashboardFeed({
      people: [jonah],
      relationships: [],
      voices: [],
      meId: "me",
      now,
    })));
  });
});
