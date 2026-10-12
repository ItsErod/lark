import { describe, expect, it } from "vitest";
import { applyRemoteLists, flattenFavoriteIds, ListSync, mapToPins, refileFavorites, toggleListed, type LocalLists } from "./user-lists";

const base = (): LocalLists => ({
  favorites: ["100000000000000030"],
  favoritesMuted: false,
  favoriteExtras: [],
  pinnedDms: ["100000000000000040"],
  channelPins: { "100000000000000010": ["100000000000000021"] },
  favoritesMigrated: false,
  pinsMigrated: false,
});

describe("user lists", () => {
  it("refiles favorite ids onto the guild that owns the channel", () => {
    const map = refileFavorites(["100000000000000030", "100000000000000040"], {
      "100000000000000010": [{ id: "100000000000000030" }, { id: "100000000000000031" }],
    });
    expect(map).toEqual({ "100000000000000010": ["100000000000000030"] });
    expect(flattenFavoriteIds({ a: ["100000000000000030"], b: ["100000000000000030", "nope"] })).toEqual(["100000000000000030"]);
    expect(toggleListed(["100000000000000030"], "100000000000000030")).toEqual([]);
    expect(mapToPins({ "100000000000000010": ["100000000000000021"] })).toEqual([
      { guildId: "100000000000000010", channelIds: ["100000000000000021"] },
    ]);
  });

  it("keeps local lists when the proto field is absent and uploads them once from READY", () => {
    const kept = applyRemoteLists(base(), { fromReady: true }, false);
    expect(kept.next.favorites).toEqual(["100000000000000030"]);
    expect(kept.next.pinnedDms).toEqual(["100000000000000040"]);
    expect(kept.push).toBe(true);
    expect(kept.next.favoritesMigrated).toBe(true);
    const again = applyRemoteLists(kept.next, { fromReady: true }, false);
    expect(again.push).toBe(false);
  });

  it("replaces a list only when Discord sent that field", () => {
    const remote = applyRemoteLists(base(), { favorites: [], favoritesMuted: true, fromReady: true }, false);
    expect(remote.next.favorites).toEqual([]);
    expect(remote.next.favoritesMuted).toBe(true);
    expect(remote.next.pinnedDms).toEqual(["100000000000000040"]);
    expect(remote.push).toBe(true);
    const partial = applyRemoteLists(base(), { favorites: ["100000000000000031"] }, false);
    expect(partial.next.favorites).toEqual(["100000000000000031"]);
    expect(partial.next.channelPins["100000000000000010"]).toEqual(["100000000000000021"]);
    expect(partial.push).toBe(false);
    const dirty = applyRemoteLists(base(), { favorites: [], pinnedDms: [], channelPins: [], fromReady: true }, true);
    expect(dirty.next.favorites).toEqual(["100000000000000030"]);
    expect(dirty.push).toBe(false);
  });

  it("holds remote lists while a write is in flight", async () => {
    let sent = 0;
    let release: () => void = () => undefined;
    const sync = new ListSync({
      delayMs: 0,
      retryMs: 1_000,
      send: () => new Promise((resolve) => {
        sent += 1;
        release = resolve;
      }),
      schedule: (ms, fn) => setTimeout(fn, ms) as unknown as number,
      cancel: (id) => clearTimeout(id),
    });
    sync.edit({ favorites: ["100000000000000030"], favoritesMuted: false, favoriteExtras: [], pinnedDms: [], channelPins: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sync.acceptRemote()).toBe(false);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toBe(1);
    expect(sync.acceptRemote()).toBe(true);
  });
});
