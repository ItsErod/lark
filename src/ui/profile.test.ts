import { afterEach, describe, expect, it } from "vitest";
import { setRelationshipIndex } from "../social";
import { blockedIds, pendingFriendCount, profileSlotLabels, sampleProfile, sampleRoles } from "./profile";

describe("profile contracts", () => {
  afterEach(() => setRelationshipIndex([]));

  it("re-exports the blocked set and the pending count", () => {
    setRelationshipIndex([
      { id: "2", kind: "blocked", name: "No", username: "no", nickname: "" },
      { id: "3", kind: "incoming", name: "Ada", username: "ada", nickname: "" },
    ]);
    expect([...blockedIds()]).toEqual(["2"]);
    expect(pendingFriendCount()).toBe(1);
  });

  it("keeps profile action slot labels for later moderation buttons", () => {
    expect(profileSlotLabels(undefined)).toEqual([]);
    expect(profileSlotLabels([
      { id: "timeout", label: " Timeout ", onClick: () => undefined },
      { id: "blank", label: "  ", onClick: () => undefined },
    ])).toEqual(["Timeout"]);
  });

  it("fills a demo profile with about text, a badge, and role chips", () => {
    const details = sampleProfile({ id: "1", name: "Maya Chen", custom: "At the desk" });
    expect(details.username).toBe("mayachen");
    expect(details.bio).toBe("At the desk");
    expect(details.badges.map((badge) => badge.description)).toEqual(["Lark"]);
    expect(sampleRoles().map((role) => role.name)).toEqual(["Design", "Voice"]);
  });
});
