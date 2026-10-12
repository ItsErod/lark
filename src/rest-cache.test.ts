import { describe, expect, it } from "vitest";
import { readRestCache, writeRestCache, type RestHit } from "./rest-cache";

describe("REST cache", () => {
  it("returns a fresh page and drops it after the ttl", () => {
    const store = new Map<string, RestHit<string[]>>();
    writeRestCache(store, "GET /channels/1/messages", ["a"], 1_000);
    expect(readRestCache(store, "GET /channels/1/messages", 1_500, 1_000)).toEqual(["a"]);
    expect(readRestCache(store, "GET /channels/1/messages", 2_500, 1_000)).toBeUndefined();
  });

  it("forgets the oldest route when the map is full", () => {
    const store = new Map<string, RestHit<number>>();
    writeRestCache(store, "a", 1, 1, 2);
    writeRestCache(store, "b", 2, 2, 2);
    writeRestCache(store, "c", 3, 3, 2);
    expect([...store.keys()]).toEqual(["b", "c"]);
  });
});
