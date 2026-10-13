import { describe, expect, it } from "vitest";
import { hasSearchCriteria, parseSearchQuery, resolveSearch } from "./ui/composer-tools";
import {
  remoteSearchCall,
  searchNote,
  searchPlace,
  searchPlaceholder,
  searchUsers,
} from "./home-search";

const directory = {
  meId: "100000000000000001",
  users: { "100000000000000007": "Maya" },
  channels: { "100000000000000022": "design" },
};

describe("home message search", () => {
  it("asks Discord across direct messages when no server and no conversation is open", () => {
    expect(searchPlace(null, null)).toBe("direct-messages");
    expect(searchPlace("", "  ")).toBe("direct-messages");
    expect(searchPlace(null, "")).toBe("direct-messages");
    expect(remoteSearchCall(null, "")).toEqual({ guildId: null, channelId: null });
    expect(searchPlace("100000000000000010", "100000000000000022")).toBe("server");
    expect(remoteSearchCall("100000000000000010", "100000000000000022")).toEqual({
      guildId: "100000000000000010",
      channelId: null,
    });
    expect(searchPlace(null, "100000000000000022")).toBe("conversation");
    expect(remoteSearchCall(null, "100000000000000022")).toEqual({
      guildId: null,
      channelId: "100000000000000022",
    });
  });

  it("keeps from, has, before, and after on a home query", () => {
    const parsed = parseSearchQuery("notes from:Maya has:image before:2020-01-01 after:2019-01-01");
    const resolved = resolveSearch(parsed, {
      ...directory,
      users: searchUsers(directory.users, [{ id: "100000000000000008", name: "Jonah" }]),
    });
    expect(resolved.content).toBe("notes");
    expect(resolved.authorIds).toEqual(["100000000000000007"]);
    expect(resolved.has).toEqual(["image"]);
    expect(resolved.beforeId).toMatch(/^\d{15,}$/);
    expect(resolved.afterId).toMatch(/^\d{15,}$/);
    expect(hasSearchCriteria(resolved)).toBe(true);
    expect(searchUsers({}, [{ id: "100000000000000008", name: "Jonah" }])).toEqual({
      "100000000000000008": "Jonah",
    });
    expect(searchUsers({ "100000000000000008": "Jo" }, [{ id: "100000000000000008", name: "Jonah" }])["100000000000000008"]).toBe("Jo");
  });

  it("names the home, server, and fallback states", () => {
    expect(searchPlaceholder("direct-messages")).toContain("direct messages");
    expect(searchPlaceholder("direct-messages")).toContain("from:");
    expect(searchPlaceholder("direct-messages")).toContain("has:");
    expect(searchPlaceholder("direct-messages")).toContain("before:");
    expect(searchPlaceholder("direct-messages")).toContain("after:");
    expect(searchNote({
      place: "direct-messages",
      query: "",
      hasCriteria: false,
      unresolved: [],
      phase: "local",
    })).toContain("Direct messages on Discord");
    expect(searchNote({
      place: "direct-messages",
      query: "notes",
      hasCriteria: true,
      unresolved: [],
      phase: "local",
    })).toBe("Asking Discord across direct messages.");
    expect(searchNote({
      place: "direct-messages",
      query: "notes",
      hasCriteria: true,
      unresolved: ["from:nobody"],
      phase: "fallback",
    })).toBe("Couldn't match from:nobody. Discord search missed. Showing messages already loaded.");
    expect(searchNote({
      place: "server",
      query: "notes",
      hasCriteria: true,
      unresolved: [],
      phase: "remote",
    })).toBe("");
    expect(searchNote({
      place: "server",
      query: "",
      hasCriteria: false,
      unresolved: [],
      phase: "local",
    })).toContain("This server on Discord");
  });
});
