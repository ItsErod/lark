import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCAL_SEARCH_FLOOR,
  createIndex,
  emptyQuery,
  loadDocs,
  localDocFromMessage,
  localKeys,
  parseLocalQuery,
  queryIndex,
  removeKeys,
  upsertDocs,
  type LocalDoc,
  type LocalPlace,
} from "./local-search";

const north: LocalPlace = { guildId: "g-north", guildName: "Northwind", channelName: "design" };
const south: LocalPlace = { guildId: "g-south", guildName: "Southwind", channelName: "general" };
const now = Date.parse("2026-10-13T00:00:00.000Z");

function doc(partial: {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  minutesAgo?: number;
  nonce?: string;
  attachment?: string;
}, place: LocalPlace): LocalDoc {
  const made = localDocFromMessage({
    id: partial.id,
    channelId: partial.channelId,
    authorId: partial.authorId,
    authorName: partial.authorName,
    content: partial.content,
    timestamp: new Date(now - (partial.minutesAgo ?? 0) * 60_000).toISOString(),
    nonce: partial.nonce,
    attachments: partial.attachment ? [{ name: partial.attachment }] : [],
  }, place);
  if (!made) throw new Error("expected a doc");
  return made;
}

describe("local message search", () => {
  it("parses server, channel, and author filters out of the query", () => {
    expect(parseLocalQuery('wordmark from:Maya in:#design server:"Northwind"')).toEqual({
      text: "wordmark",
      author: "maya",
      channel: "design",
      guild: "northwind",
    });
    expect(parseLocalQuery("from:@me guild:studio")).toMatchObject({ author: "me", guild: "studio", text: "" });
  });

  it("ranks a phrase above a newer one-word hit and keeps both servers", () => {
    const index = createIndex();
    upsertDocs(index, [
      doc({ id: "1", channelId: "c-design", authorId: "maya", authorName: "Maya Chen", content: "the rust borrow checker is fast", minutesAgo: 10_000 }, north),
      doc({ id: "2", channelId: "c-general", authorId: "jonah", authorName: "Jonah Adler", content: "fast", minutesAgo: 1 }, south),
      doc({ id: "3", channelId: "c-design", authorId: "leo", authorName: "Leo Martins", content: "shipping the compact density", minutesAgo: 5 }, north),
    ]);
    const hits = queryIndex(index, { ...emptyQuery(), text: "borrow checker" }, now).hits;
    expect(hits.map((hit) => hit.id)).toEqual(["1"]);

    const fast = queryIndex(index, { ...emptyQuery(), text: "fast" }, now).hits.map((hit) => hit.id);
    expect(fast[0]).toBe("2");
    expect(fast).toContain("1");

    const across = queryIndex(index, { ...emptyQuery(), text: "fast" }, now).hits.map((hit) => hit.guildId);
    expect(new Set(across)).toEqual(new Set(["g-north", "g-south"]));
  });

  it("filters by server, channel, and author without asking the network", () => {
    const index = createIndex();
    upsertDocs(index, [
      doc({ id: "1", channelId: "c-design", authorId: "maya", authorName: "Maya Chen", content: "wordmark study" }, north),
      doc({ id: "2", channelId: "c-general", authorId: "jonah", authorName: "Jonah Adler", content: "wordmark notes" }, south),
      doc({ id: "3", channelId: "dm-1", authorId: "priya", authorName: "Priya Shah", content: "wordmark in a dm" }, { guildId: "", guildName: "Direct messages", channelName: "Priya Shah" }),
    ]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", guildId: "g-south" }, now).hits.map((hit) => hit.id)).toEqual(["2"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", channelId: "c-design" }, now).hits.map((hit) => hit.id)).toEqual(["1"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", authorId: "maya" }, now).hits.map((hit) => hit.id)).toEqual(["1"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", author: "jonah" }, now).hits.map((hit) => hit.id)).toEqual(["2"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", guild: "north" }, now).hits.map((hit) => hit.id)).toEqual(["1"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", channel: "design" }, now).hits.map((hit) => hit.id)).toEqual(["1"]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordmark", guildId: "@dm" }, now).hits.map((hit) => hit.id)).toEqual(["3"]);
    const facets = queryIndex(index, emptyQuery(), now).facets;
    expect(facets.guilds.map((item) => item.id).sort()).toEqual(["@dm", "g-north", "g-south"]);
    expect(facets.channels.find((item) => item.id === "c-design")?.guildId).toBe("g-north");
  });

  it("matches a prefix on the last word and drops deleted or replaced echoes", () => {
    const index = createIndex();
    upsertDocs(index, [
      doc({ id: "1", channelId: "c-design", authorId: "maya", authorName: "Maya Chen", content: "wordmark v3 is up" }, north),
    ]);
    expect(queryIndex(index, { ...emptyQuery(), text: "wordm" }, now).hits.map((hit) => hit.id)).toEqual(["1"]);

    upsertDocs(index, [
      doc({ id: "local-1", channelId: "c-design", authorId: "ethan", authorName: "Ethan Park", content: "optimistic apricot", nonce: "local-1" }, north),
    ]);
    upsertDocs(index, [
      doc({ id: "9", channelId: "c-design", authorId: "ethan", authorName: "Ethan Park", content: "optimistic apricot", nonce: "local-1" }, north),
    ]);
    const apricot = queryIndex(index, { ...emptyQuery(), text: "apricot" }, now).hits;
    expect(apricot).toHaveLength(1);
    expect(apricot[0]?.id).toBe("9");

    removeKeys(index, localKeys("c-design", "9"));
    expect(queryIndex(index, { ...emptyQuery(), text: "apricot" }, now).hits).toEqual([]);
  });

  it("keeps the newest messages when the index is full and ignores unchanged upserts", () => {
    const index = createIndex();
    const docs: LocalDoc[] = [];
    for (let i = 0; i < 8500; i += 1) {
      docs.push(doc({
        id: `m${i}`,
        channelId: "c-design",
        authorId: "maya",
        authorName: "Maya Chen",
        content: i === 0 ? "ancienttoken stays out" : i === 8499 ? "fresh zeppelin" : `padding note ${i}`,
        minutesAgo: 8500 - i,
      }, north));
    }
    const first = upsertDocs(index, docs);
    expect(first.put.length).toBe(LOCAL_SEARCH_FLOOR);
    expect(index.docs.size).toBe(LOCAL_SEARCH_FLOOR);
    expect(queryIndex(index, { ...emptyQuery(), text: "ancienttoken" }, now).hits).toEqual([]);
    expect(queryIndex(index, { ...emptyQuery(), text: "zeppelin" }, now).hits.map((hit) => hit.id)).toEqual(["m8499"]);
    const again = upsertDocs(index, [docs[8499]]);
    expect(again.put).toEqual([]);
  });

  it("stores message text only, and round-trips that through a fresh index", () => {
    const made = localDocFromMessage({
      id: "9",
      channelId: "c-design",
      authorId: "maya",
      authorName: "Maya Chen",
      content: "hello wordmark",
      timestamp: "2024-01-01T00:00:00.000Z",
      attachments: [{ name: "shot.png" }],
    }, north);
    expect(made?.text).toContain("shot.png");
    expect(JSON.stringify(made)).not.toContain("cdn");
    expect(JSON.stringify(made)).not.toContain("token");
    expect(JSON.stringify(made)).not.toContain("password");
    const index = createIndex();
    const diff = upsertDocs(index, made ? [made] : []);
    expect(Object.keys(diff.put[0] ?? {}).sort()).toEqual([
      "authorId",
      "authorName",
      "channelId",
      "channelName",
      "guildId",
      "guildName",
      "id",
      "key",
      "ms",
      "preview",
      "text",
    ]);
    const restored = createIndex();
    loadDocs(restored, diff.put);
    expect(queryIndex(restored, { ...emptyQuery(), text: "wordmark" }, now).hits[0]?.preview).toBe("hello wordmark");
    const mentioned = localDocFromMessage({
      id: "10",
      channelId: "c-design",
      authorId: "maya",
      authorName: "Maya Chen",
      content: "Ethan, see <@100000000000000001> and <:lark:99>",
      timestamp: "2024-01-01T00:00:00.000Z",
      mentionUsers: [{ id: "100000000000000001", name: "Ethan Park" }],
    }, north);
    expect(mentioned?.preview).toBe("Ethan, see @Ethan Park and lark");
    expect(mentioned?.text).not.toContain("<@");
  });

  it("answers a query over a few thousand messages quickly", () => {
    const index = createIndex();
    const docs: LocalDoc[] = [];
    for (let i = 0; i < 4000; i += 1) {
      docs.push(doc({
        id: `q${i}`,
        channelId: `c${i % 40}`,
        authorId: `u${i % 25}`,
        authorName: `User ${i % 25}`,
        content: i === 1234 ? "unique apricot wordmark" : `hello ${i % 17} the channel update`,
        minutesAgo: 4000 - i,
      }, i % 2 ? north : south));
    }
    upsertDocs(index, docs);
    queryIndex(index, { ...emptyQuery(), text: "apricot" }, now);
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) queryIndex(index, { ...emptyQuery(), text: "apricot" }, now);
    const average = (performance.now() - started) / 20;
    expect(average).toBeLessThan(20);
    expect(queryIndex(index, { ...emptyQuery(), text: "apricot" }, now).hits[0]?.id).toBe("q1234");
  });

  it("does not call the network from the index, worker, or client", () => {
    for (const file of ["src/local-search.ts", "src/local-search-worker.ts", "src/local-search-client.ts", "src/ui/local-search-view.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/discord\.com|search_filtered|XMLHttpRequest|\bfetch\(/);
    }
  });
});
