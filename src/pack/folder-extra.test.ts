import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { folderTitle, orderUnreadFirst, peekNames, summarizeFolder, type FolderServer } from "./folder-extra";
import { sanitizePack } from "./state";

const servers: FolderServer[] = [
  { id: "1", name: "Quiet", mentions: 0, unread: false, muted: false },
  { id: "2", name: "Loud", mentions: 3, unread: true, muted: false },
  { id: "3", name: "Muted", mentions: 9, unread: true, muted: true },
];

describe("folder tools", () => {
  it("counts unread servers and leaves muted ones out", () => {
    const summary = summarizeFolder("f", "Work", servers);
    expect(summary).toMatchObject({ servers: 3, unread: 1, mentions: 3, muted: 1 });
    expect(folderTitle(summary)).toBe("Work · 3 servers · 1 unread · 3 mentions");
    expect(orderUnreadFirst(["1", "2", "3"], (id) => id === "2")).toEqual(["2", "1", "3"]);
    expect(peekNames(servers, 2)).toBe("Quiet, Loud +1");
    const pack = sanitizePack({ folderUnreadFirst: false });
    expect(pack.folderUnreadFirst).toBe(false);
    expect(sanitizePack({}).folderUnreadFirst).toBe(true);
    expect(describePlugin(readFileSync("store/plugins/folder-stats/plugin.js", "utf8"), "folder-stats").hooks.folderStats).toBe(true);
    expect(describePlugin(readFileSync("store/plugins/better-folders/plugin.js", "utf8"), "better-folders").hooks.betterFolders).toBe(true);
  });
});
