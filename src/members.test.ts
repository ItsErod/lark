import { describe, expect, it } from "vitest";
import {
  applyMemberListSort,
  applyMemberOps,
  emptyMemberList,
  groupMembers,
  rangesForScroll,
  roleColor,
  sortDms,
  sortPeople,
  visibleRows,
} from "./members";
import type { Person } from "./types";

const roles = [
  { id: "r-mod", name: "Mods", color: "#e2a15a", position: 5, hoist: true },
  { id: "r-art", name: "Art", color: "#3d7ea6", position: 2, hoist: true },
  { id: "r-muted", name: "Muted", color: null, position: 1, hoist: false },
];

function person(partial: Partial<Person> & { id: string; name: string }): Person {
  return { status: "online", ...partial };
}

describe("member list ops", () => {
  it("syncs a range, then inserts, updates, deletes, and invalidates without shifting the wrong rows", () => {
    const state = emptyMemberList("chan");
    applyMemberOps(state, {
      listId: "chan",
      memberCount: 4,
      onlineCount: 2,
      groups: [
        { id: "r-mod", count: 1 },
        { id: "online", count: 1 },
        { id: "offline", count: 1 },
      ],
      ops: [
        {
          op: "SYNC",
          range: [0, 99],
          items: [
            { kind: "group", id: "r-mod", count: 1 },
            { kind: "member", member: { id: "1", name: "Ethan", nick: "Erod", status: "online", roleIds: ["r-mod"], custom: "In queue" } },
            { kind: "group", id: "online", count: 1 },
            { kind: "member", member: { id: "2", name: "Maya", status: "idle", activity: "Playing Lark" } },
            { kind: "group", id: "offline", count: 1 },
            { kind: "member", member: { id: "3", name: "Leo", status: "offline" } },
          ],
        },
      ],
    });
    applyMemberOps(state, {
      ops: [
        { op: "INSERT", index: 2, item: { kind: "member", member: { id: "4", name: "Jonah", status: "dnd", roleIds: ["r-mod"] } } },
        { op: "UPDATE", index: 1, item: { kind: "member", member: { id: "1", name: "Ethan", nick: "Erod", status: "dnd", roleIds: ["r-mod", "r-art"] } } },
        { op: "DELETE", index: 6 },
      ],
    });
    const rows = visibleRows(state, roles);
    expect(rows.map((row) => (row.type === "group" ? row.label : row.person.name))).toEqual(["Mods", "Erod", "Jonah", "Online", "Maya", "Offline"]);
    const erod = rows[1];
    expect(erod.type).toBe("member");
    if (erod.type === "member") {
      expect(erod.person.status).toBe("dnd");
      expect(erod.color).toBe("#e2a15a");
    }
    expect(state.rows.has(6)).toBe(false);
    applyMemberOps(state, { ops: [{ op: "INVALIDATE", range: [3, 4] }] });
    expect(state.rows.has(3)).toBe(false);
    expect(state.rows.has(5)).toBe(true);
    applyMemberOps(state, { ops: [{ op: "SYNC", range: [0, 99], items: [] }] });
    expect(state.rows.has(0)).toBe(true);
  });
});

describe("role groups", () => {
  it("puts online members under the highest hoisted role and leaves offline members together", () => {
    const sections = groupMembers(
      [
        person({ id: "1", name: "Zoe", roleIds: ["r-art", "r-mod"], status: "online" }),
        person({ id: "2", name: "Amy", roleIds: ["r-art"], status: "idle" }),
        person({ id: "3", name: "Bea", roleIds: ["r-muted"], status: "dnd" }),
        person({ id: "4", name: "Leo", roleIds: ["r-mod"], status: "offline" }),
      ],
      roles,
    );
    expect(sections.map((section) => [section.label, section.people.map((item) => item.name)])).toEqual([
      ["Mods", ["Zoe"]],
      ["Art", ["Amy"]],
      ["Online", ["Bea"]],
      ["Offline", ["Leo"]],
    ]);
    expect(roleColor(["r-art", "r-mod"], roles)).toBe("#e2a15a");
    expect(roleColor(["r-muted"], roles)).toBeNull();
  });

  it("asks for the 100-wide window around the scroll position", () => {
    expect(rangesForScroll(0, 600, 0)).toEqual([[0, 99]]);
    expect(rangesForScroll(4200, 640, 5000)).toEqual([
      [0, 99],
      [100, 199],
    ]);
    expect(rangesForScroll(9000, 800, 120)).toEqual([[100, 199]]);
  });

  it("sorts direct messages by recent snowflake and friends by presence", () => {
    const sorted = sortDms([
      { id: "a", name: "Old", kind: "dm", position: 0, lastMessageId: "100" },
      { id: "b", name: "New", kind: "group", position: 1, lastMessageId: "900000000000000000" },
      { id: "c", name: "Mid", kind: "dm", position: 2, lastMessageId: "200" },
    ]);
    expect(sorted.map((channel) => channel.name)).toEqual(["New", "Mid", "Old"]);
    const people = sortPeople([
      person({ id: "1", name: "Zoe", status: "offline" }),
      person({ id: "2", name: "Amy", status: "dnd" }),
      person({ id: "3", name: "Bea", status: "online" }),
    ]);
    expect(people.map((item) => item.name)).toEqual(["Bea", "Amy", "Zoe"]);
  });

  it("sorts the member list by name or activity and keeps role groups for status", () => {
    const rows = [
      { type: "group" as const, id: "online", label: "Online", count: 2, color: null },
      { type: "member" as const, person: person({ id: "1", name: "Zoe", activity: "Queue" }), color: null },
      { type: "member" as const, person: person({ id: "2", name: "Amy" }), color: null },
    ];
    const status = applyMemberListSort(rows, "status");
    rows.length = 0;
    expect(status).toHaveLength(3);
    const named = [
      { type: "group" as const, id: "online", label: "Online", count: 2, color: null },
      { type: "member" as const, person: person({ id: "1", name: "Zoe", activity: "Queue" }), color: null },
      { type: "member" as const, person: person({ id: "2", name: "Amy" }), color: null },
    ];
    expect(applyMemberListSort(named, "name").map((row) => row.type === "member" ? row.person.name : "")).toEqual(["Amy", "Zoe"]);
    expect(applyMemberListSort(named, "activity").map((row) => row.type === "member" ? row.person.name : "")).toEqual(["Zoe", "Amy"]);
  });
});
