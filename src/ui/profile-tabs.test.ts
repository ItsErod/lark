import { describe, expect, it } from "vitest";
import { PROFILE_TABS, profileTabId, profileTabLines, type ProfileTabModel } from "./profile-tabs";

const model: ProfileTabModel = {
  bio: "At the desk",
  pronouns: "she/her",
  since: "Member since Jan 2, 2024",
  roles: ["Design"],
  badges: ["Lark"],
  note: "Met at the booth",
  servers: ["Northwind"],
  friends: [{ id: "3", name: "Jonah" }],
  friendCount: 2,
  custom: "Heads down",
  activity: "Playing Lark",
  connections: ["Spotify · spotify"],
};

describe("full profile tabs", () => {
  it("offers about, mutual servers, mutual friends, activity, and connections", () => {
    expect(PROFILE_TABS.map((tab) => tab.id)).toEqual(["about", "servers", "friends", "activity", "connections"]);
    expect(profileTabId("nope")).toBe("about");
    expect(profileTabId("activity")).toBe("activity");
  });

  it("fills each tab and uses an empty line when Discord sent nothing", () => {
    expect(profileTabLines("about", model)).toEqual(["At the desk", "she/her", "Member since Jan 2, 2024", "Design", "Lark", "Met at the booth"]);
    expect(profileTabLines("servers", model)).toEqual(["Northwind"]);
    expect(profileTabLines("friends", model)).toEqual(["Jonah"]);
    expect(profileTabLines("activity", model)).toEqual(["Heads down", "Playing Lark"]);
    expect(profileTabLines("connections", model)).toEqual(["Spotify · spotify"]);
    const empty: ProfileTabModel = {
      bio: "",
      pronouns: "",
      since: "",
      roles: [],
      badges: [],
      note: "",
      servers: [],
      friends: [],
      friendCount: 2,
      custom: "",
      activity: "",
      connections: [],
    };
    expect(profileTabLines("about", empty)).toEqual(["No bio yet"]);
    expect(profileTabLines("servers", empty)).toEqual(["No mutual servers"]);
    expect(profileTabLines("friends", empty)).toEqual(["2 mutual friends"]);
    expect(profileTabLines("friends", { ...empty, friendCount: 0 })).toEqual(["No mutual friends"]);
    expect(profileTabLines("activity", empty)).toEqual(["No activity"]);
    expect(profileTabLines("connections", empty)).toEqual(["No connections"]);
  });
});