import { describe, expect, it } from "vitest";
import { memberNote, mergeGuilds, mergePeople, personFromMember } from "./roster";
import type { Guild, Person } from "./types";

const ethan: Person = { id: "1", name: "Ethan", status: "online", custom: "In queue", avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png" };

describe("member roster", () => {
  it("prefers a nickname and keeps a real status over a later offline payload", () => {
    const person = personFromMember({
      id: "1",
      name: "Ethan",
      nick: "Erod",
      status: "online",
      custom: "In queue",
      avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
    });
    expect(person?.name).toBe("Erod");
    expect(person?.status).toBe("online");
    const merged = mergePeople([ethan], [{ id: "1", name: "Ethan", status: "offline", custom: "", avatarUrl: null }]);
    expect(merged[0].status).toBe("online");
    expect(merged[0].custom).toBe("In queue");
    expect(merged[0].avatarUrl).toContain("cdn.discordapp.com");
    const added = mergePeople(merged, [{ id: "2", name: "Maya", status: "idle" }]);
    expect(added.map((item) => item.name)).toEqual(["Ethan", "Maya"]);
  });

  it("does not let a READY stub erase a server icon", () => {
    const full: Guild = {
      id: "10",
      name: "Battlefield",
      initials: "B",
      iconUrl: "https://cdn.discordapp.com/icons/10/abc.png?size=64",
    };
    const stub: Guild = { id: "10", name: "Server", initials: "S", iconUrl: null };
    const [kept] = mergeGuilds([stub], [full]);
    expect(kept.name).toBe("Battlefield");
    expect(kept.initials).toBe("B");
    expect(kept.iconUrl).toContain("/icons/10/abc.png");
    const [upgraded] = mergeGuilds([full], [stub]);
    expect(upgraded.name).toBe("Battlefield");
    expect(upgraded.iconUrl).toContain("abc.png");
  });

  it("only uses the closed-server copy when no server is open", () => {
    expect(memberNote(false, 0, undefined)).toMatch(/after a server is open/);
    expect(memberNote(true, 0, undefined)).toMatch(/Loading members/);
    expect(memberNote(true, 0, "done")).toMatch(/No members/);
    expect(memberNote(true, 4, "loading")).toBeNull();
  });
});
