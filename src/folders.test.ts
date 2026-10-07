import { describe, expect, it } from "vitest";
import {
  FolderSync,
  applyFolderDrop,
  folderStructureKey,
  foldersKey,
  intentFromHit,
  parseStoredFolders,
  recolorFolder,
  renameFolder,
  type RailHit,
} from "./folders";
import { layoutRail } from "./shell";

const a = "100000000000000010";
const b = "100000000000000011";
const c = "100000000000000012";
const d = "100000000000000013";
const guilds = [a, b, c, d];

function order(ids: string[], folders: Parameters<typeof layoutRail>[1]): string[] {
  return layoutRail(ids, folders).map((entry) => (entry.kind === "folder" ? `folder:${entry.guildIds.join("+")}` : entry.guildId));
}

describe("server rail drops", () => {
  it("reorders loose servers without rebuilding folder metadata", () => {
    const next = applyFolderDrop(guilds, [], { kind: "guild", id: a }, { kind: "after-guild", guildId: c }, 50);
    expect(order(guilds, next)).toEqual([b, c, a, d]);
    expect(next.every((folder) => folder.id === null)).toBe(true);
  });

  it("creates a folder when one server is dropped onto another", () => {
    const next = applyFolderDrop(guilds, [], { kind: "guild", id: a }, { kind: "onto-guild", guildId: b }, 50);
    expect(order(guilds, next)).toEqual([`folder:${b}+${a}`, c, d]);
    expect(next[0]).toMatchObject({ id: "50", name: null, color: null, guildIds: [b, a] });
  });

  it("moves a server into a folder, out of it, and reorders inside it", () => {
    const start = [{ id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] }];
    const into = applyFolderDrop(guilds, start, { kind: "guild", id: c }, { kind: "into-folder", folderId: "4" }, 50);
    expect(into[0].guildIds).toEqual([a, b, c]);
    expect(into[0].name).toBe("Friends");

    const inside = applyFolderDrop(guilds, into, { kind: "guild", id: c }, { kind: "before-guild", guildId: a }, 50);
    expect(inside[0].guildIds).toEqual([c, a, b]);
    expect(inside[0].id).toBe("4");

    const outside = applyFolderDrop(guilds, inside, { kind: "guild", id: c }, { kind: "end" }, 50);
    expect(outside.find((folder) => folder.id === "4")?.guildIds).toEqual([a, b]);
    expect(order(guilds, outside).at(-1)).toBe(c);
  });

  it("dissolves a folder once one server is left, including while reordering the pair", () => {
    const start = [{ id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] }];
    const out = applyFolderDrop(guilds, start, { kind: "guild", id: a }, { kind: "after-guild", guildId: c }, 50);
    expect(out.some((folder) => folder.id === "4")).toBe(false);
    expect(order(guilds, out)).toEqual([b, c, a, d]);

    const swapped = applyFolderDrop(guilds, start, { kind: "guild", id: b }, { kind: "before-guild", guildId: a }, 50);
    expect(swapped[0]).toMatchObject({ id: "4", guildIds: [b, a] });
  });

  it("reorders folders and does not nest a folder inside a server", () => {
    const start = [
      { id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] },
      { id: "5", name: "Work", color: null, guildIds: [c, d] },
    ];
    const moved = applyFolderDrop(guilds, start, { kind: "folder", id: "5" }, { kind: "before-folder", folderId: "4" }, 50);
    expect(moved.map((folder) => folder.id)).toEqual(["5", "4"]);

    const nested = applyFolderDrop(guilds, start, { kind: "folder", id: "5" }, { kind: "onto-guild", guildId: a }, 50);
    expect(nested.map((folder) => folder.id)).toEqual(["5", "4"]);
    expect(folderStructureKey(nested)).not.toBe(folderStructureKey(start));
  });

  it("renames and recolors without changing membership", () => {
    const start = [{ id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] }];
    const named = renameFolder(start, "4", "  Night  ");
    expect(named[0].name).toBe("Night");
    expect(folderStructureKey(named)).toBe(folderStructureKey(start));
    const colored = recolorFolder(named, "4", "#E2A15A");
    expect(colored[0].color).toBe("#e2a15a");
    expect(recolorFolder(colored, "4", "#000000")[0].color).toBeNull();
    expect(renameFolder(colored, "4", "   ")[0].name).toBeNull();
  });
});

describe("drop intent", () => {
  const hits: RailHit[] = [
    { role: "guild", guildId: a, folderId: null, top: 0, bottom: 48 },
    { role: "folder", guildId: null, folderId: "4", top: 56, bottom: 104 },
    { role: "guild", guildId: b, folderId: "4", top: 112, bottom: 160 },
  ];

  it("uses the center of a server to combine and the center of a folder to receive", () => {
    expect(intentFromHit(hits, 24, { kind: "guild", id: c })).toEqual({ kind: "onto-guild", guildId: a });
    expect(intentFromHit(hits, 4, { kind: "guild", id: c })).toEqual({ kind: "before-guild", guildId: a });
    expect(intentFromHit(hits, 44, { kind: "guild", id: c })).toEqual({ kind: "after-guild", guildId: a });
    expect(intentFromHit(hits, 80, { kind: "guild", id: c })).toEqual({ kind: "into-folder", folderId: "4" });
    expect(intentFromHit(hits, 70, { kind: "folder", id: "9" })).toEqual({ kind: "before-folder", folderId: "4" });
    expect(intentFromHit(hits, 200, { kind: "guild", id: c })).toEqual({ kind: "end" });
  });
});

describe("guild folder sync", () => {
  function harness() {
    let raw: string | null = null;
    const sent: ReturnType<typeof renameFolder>[] = [];
    const pending = new Map<number, () => void>();
    let next = 1;
    let fail = false;
    let errors = 0;
    const sync = new FolderSync({
      delayMs: 1000,
      retryMs: 8000,
      read: () => raw,
      write: (value) => {
        raw = value;
      },
      send: async (folders) => {
        if (fail) throw new Error("limited");
        sent.push(folders);
      },
      schedule: (_ms, fn) => {
        const id = next++;
        pending.set(id, fn);
        return id;
      },
      cancel: (id) => pending.delete(id),
      onError: () => {
        errors += 1;
      },
    });
    return {
      sync,
      sent,
      errors: () => errors,
      stored: () => parseStoredFolders(raw),
      setFail: (value: boolean) => {
        fail = value;
      },
      fire: () => {
        const jobs = [...pending.entries()];
        pending.clear();
        for (const [, fn] of jobs) fn();
      },
      pending: () => pending.size,
    };
  }

  it("debounces a burst of edits into one write", async () => {
    const { sync, sent, stored, fire, pending } = harness();
    const first = [{ id: null, name: null, color: null, guildIds: [a] }];
    const second = [{ id: null, name: null, color: null, guildIds: [b] }];
    sync.edit(first);
    sync.edit(second);
    expect(pending()).toBe(1);
    expect(sent).toHaveLength(0);
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([second]);
    expect(stored()).toMatchObject({ dirty: false });
    expect(foldersKey(stored()?.folders ?? [])).toBe(foldersKey(second));
  });

  it("keeps the local copy when Discord rejects the write, then retries once", async () => {
    const { sync, sent, stored, fire, setFail, errors, pending } = harness();
    const folders = [{ id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] }];
    setFail(true);
    sync.edit(folders);
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(0);
    expect(stored()).toMatchObject({ dirty: true });
    expect(errors()).toBe(1);
    expect(pending()).toBe(1);
    setFail(false);
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(stored()?.dirty).toBe(false);
    fire();
    expect(pending()).toBe(0);
  });

  it("ignores a remote folder list while a local edit is still dirty", () => {
    const { sync, stored } = harness();
    const local = [{ id: "4", name: "Friends", color: null, guildIds: [a, b] }];
    const remote = [{ id: null, name: null, color: null, guildIds: [c] }];
    sync.edit(local);
    expect(sync.acceptRemote(remote)).toBe(false);
    expect(stored()?.folders[0].id).toBe("4");
  });

  it("accepts Discord's list when nothing is waiting", () => {
    const { sync, stored } = harness();
    const remote = [{ id: "4", name: "Friends", color: "#ff0000", guildIds: [a, b] }];
    expect(sync.acceptRemote(remote)).toBe(true);
    expect(stored()).toMatchObject({ dirty: false });
    expect(parseStoredFolders("not json")).toBeNull();
    expect(parseStoredFolders(JSON.stringify({ folders: [] }))).toBeNull();
  });
});
