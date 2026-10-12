import { describe, expect, it } from "vitest";
import { joinLabel, messageLines, roleRows, voiceCommand } from "./mod-view";

describe("mod view", () => {
  it("labels a join date and leaves a missing one blank", () => {
    expect(joinLabel(null)).toBe("Join date not loaded");
    expect(joinLabel("not-a-date")).toBe("Join date not loaded");
    expect(joinLabel("2024-06-15T12:00:00.000Z")).toMatch(/^Joined /);
  });

  it("keeps the newest search hits and skips rows without an id", () => {
    const lines = messageLines([
      { id: "1", channelId: "c", content: "  hello  " },
      { id: "", content: "skip" },
      { id: "2", channel_id: "d", content: "" },
      null,
    ]);
    expect(lines).toEqual([
      { id: "1", channelId: "c", content: "hello" },
      { id: "2", channelId: "d", content: "Empty message" },
    ]);
    expect(messageLines([{ id: "a", channelId: "c", content: "one" }, { id: "b", channelId: "c", content: "two" }], 1)).toHaveLength(1);
  });

  it("drops the everyone role and sorts the rest", () => {
    expect(roleRows([
      { id: "g", name: "@everyone", position: 0 },
      { id: "2", name: "Mod", position: 2 },
      { id: "1", name: "Member", position: 1 },
    ], "g").map((role) => role.name)).toEqual(["Mod", "Member"]);
  });

  it("mutes through the voice state in a channel, and the member record otherwise", () => {
    expect(voiceCommand(true, "mute", true, "g", "u").command).toBe("set_member_voice");
    expect(voiceCommand(true, "deaf", true, "g", "u").args).toMatchObject({ mute: true, deaf: true });
    expect(voiceCommand(false, "mute", false, "g", "u")).toEqual({
      command: "guild_admin",
      args: { request: { op: "patch_member", guildId: "g", userId: "u", body: { mute: false } } },
    });
    expect(voiceCommand(false, "deaf", true, "g", "u").args).toMatchObject({
      request: { body: { deaf: true, mute: true } },
    });
  });
});
