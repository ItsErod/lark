/**
 * In-memory index of messages already loaded on this device.
 * Callers pass message text in. Nothing in this module sends it anywhere.
 */

export const LOCAL_SEARCH_CAP = 8000;
export const LOCAL_SEARCH_FLOOR = 7000;
export const LOCAL_SEARCH_LIMIT = 30;

const TOKEN = /[a-z0-9]{2,32}/g;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DISCORD_EPOCH = 1_420_070_400_000n;
const PREFIX_CAP = 48;

export interface LocalDocInput {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  nonce?: string | null;
  attachments?: { name?: string }[];
  stickers?: { name?: string }[];
  mentionUsers?: { id?: string; name?: string }[];
}

export interface LocalPlace {
  guildId: string;
  guildName: string;
  channelName: string;
}

export interface LocalDoc {
  key: string;
  id: string;
  channelId: string;
  guildId: string;
  authorId: string;
  authorName: string;
  channelName: string;
  guildName: string;
  text: string;
  preview: string;
  ms: number;
  nonce?: string;
}

export interface SavedDoc {
  key: string;
  id: string;
  channelId: string;
  guildId: string;
  authorId: string;
  authorName: string;
  channelName: string;
  guildName: string;
  text: string;
  preview: string;
  ms: number;
}

export interface LocalHit {
  id: string;
  channelId: string;
  guildId: string;
  authorId: string;
  authorName: string;
  channelName: string;
  guildName: string;
  preview: string;
  ms: number;
  score: number;
}

export interface LocalFacet {
  id: string;
  name: string;
  guildId?: string;
}

export interface LocalFacets {
  guilds: LocalFacet[];
  channels: LocalFacet[];
  authors: LocalFacet[];
}

export interface LocalQuery {
  text: string;
  guildId: string;
  channelId: string;
  authorId: string;
  guild: string;
  channel: string;
  author: string;
}

export interface LocalPage {
  hits: LocalHit[];
  facets: LocalFacets;
  count: number;
}

export interface LocalDiff {
  put: SavedDoc[];
  del: string[];
}

interface StoredDoc extends SavedDoc {
  tokens: string[];
}

export interface LocalIndex {
  docs: Map<string, StoredDoc>;
  dirty: boolean;
  postings: Map<string, string[]>;
  vocab: string[];
  byGuild: Map<string, string[]>;
  byChannel: Map<string, string[]>;
  byAuthor: Map<string, string[]>;
  facets: LocalFacets;
}

export function createIndex(): LocalIndex {
  return {
    docs: new Map(),
    dirty: true,
    postings: new Map(),
    vocab: [],
    byGuild: new Map(),
    byChannel: new Map(),
    byAuthor: new Map(),
    facets: emptyFacets(),
  };
}

export function emptyFacets(): LocalFacets {
  return { guilds: [], channels: [], authors: [] };
}

export function emptyQuery(): LocalQuery {
  return { text: "", guildId: "", channelId: "", authorId: "", guild: "", channel: "", author: "" };
}

export function docKey(channelId: string, id: string, nonce?: string | null): string {
  if (id.startsWith("local-")) {
    const stable = (nonce ?? "").trim() || id;
    return `${channelId}:nonce:${stable}`;
  }
  return `${channelId}:${id}`;
}

export function localKeys(channelId: string, messageId: string, nonce?: string | null): string[] {
  const keys = new Set<string>([docKey(channelId, messageId, nonce), `${channelId}:${messageId}`]);
  const stable = (nonce ?? "").trim();
  if (stable) keys.add(`${channelId}:nonce:${stable}`);
  return [...keys];
}

export function parseLocalQuery(input: string): { text: string; guild: string; channel: string; author: string } {
  const guilds: string[] = [];
  const channels: string[] = [];
  const authors: string[] = [];
  const text = input.replace(/(?:^|\s)(from|in|server|guild):(?:"([^"]+)"|(\S+))/gi, (_all, key: string, quoted?: string, bare?: string) => {
    const value = (quoted ?? bare ?? "").trim();
    const name = key.toLowerCase();
    if (!value) return " ";
    if (name === "from") authors.push(value.replace(/^@/, ""));
    else if (name === "in") channels.push(value.replace(/^#/, ""));
    else guilds.push(value);
    return " ";
  }).replace(/\s+/g, " ").trim();
  return {
    text,
    guild: guilds[0]?.toLowerCase() ?? "",
    channel: channels[0]?.toLowerCase() ?? "",
    author: authors[0]?.toLowerCase() ?? "",
  };
}

export function localDocFromMessage(message: LocalDocInput, place: LocalPlace): LocalDoc | null {
  const id = message.id?.trim() ?? "";
  const channelId = message.channelId?.trim() ?? "";
  if (!id || !channelId) return null;
  const names = [
    ...(message.attachments ?? []).map((file) => file.name?.trim() ?? ""),
    ...(message.stickers ?? []).map((sticker) => sticker.name?.trim() ?? ""),
  ].filter(Boolean);
  const content = (message.content ?? "").replace(/\s+/g, " ").trim();
  const preview = displayPreview(content, message.mentionUsers, names[0] || "");
  const searchable = [preview, ...names].join(" ").replace(/\s+/g, " ").trim();
  if (!searchable) return null;
  const nonce = (message.nonce ?? "").trim();
  return {
    key: docKey(channelId, id, nonce),
    id,
    channelId,
    guildId: place.guildId,
    authorId: message.authorId ?? "",
    authorName: message.authorName ?? "",
    channelName: place.channelName,
    guildName: place.guildName,
    text: searchable.toLowerCase().slice(0, 2000),
    preview: preview.slice(0, 160),
    ms: messageTime(id, message.timestamp),
    nonce: nonce || undefined,
  };
}

export function upsertDocs(index: LocalIndex, docs: readonly LocalDoc[]): LocalDiff {
  const put: SavedDoc[] = [];
  const del: string[] = [];
  let changed = false;
  for (const doc of docs) {
    const stored = storeDoc(doc);
    if (!stored) continue;
    const echo = doc.nonce ? `${doc.channelId}:nonce:${doc.nonce}` : "";
    if (echo && echo !== stored.key && index.docs.delete(echo)) {
      del.push(echo);
      changed = true;
    }
    const prev = index.docs.get(stored.key);
    if (prev && sameDoc(prev, stored)) continue;
    index.docs.set(stored.key, stored);
    put.push(toSaved(stored));
    changed = true;
  }
  if (index.docs.size > LOCAL_SEARCH_CAP) {
    const oldest = [...index.docs.values()].sort((a, b) => a.ms - b.ms || (a.key < b.key ? -1 : 1));
    const extra = index.docs.size - LOCAL_SEARCH_FLOOR;
    for (let i = 0; i < extra; i += 1) {
      const doc = oldest[i];
      if (!doc) break;
      index.docs.delete(doc.key);
      del.push(doc.key);
      changed = true;
    }
  }
  if (changed) index.dirty = true;
  const dropped = new Set(del);
  return { put: put.filter((doc) => !dropped.has(doc.key)), del };
}

export function removeKeys(index: LocalIndex, keys: readonly string[]): string[] {
  const del: string[] = [];
  for (const key of keys) {
    if (!index.docs.delete(key)) continue;
    del.push(key);
  }
  if (del.length) index.dirty = true;
  return del;
}

export function loadDocs(index: LocalIndex, saved: readonly SavedDoc[]): void {
  index.docs.clear();
  for (const doc of saved) {
    const stored = fromSaved(doc);
    if (!stored) continue;
    index.docs.set(stored.key, stored);
  }
  index.dirty = true;
}

export function queryIndex(index: LocalIndex, query: LocalQuery, now = Date.now()): LocalPage {
  ensure(index);
  const count = index.docs.size;
  const parsed = splitQuery(query.text, index.vocab);
  const filtered = collect(index, query, parsed);
  if (!filtered) return { hits: [], facets: index.facets, count };
  const hits: LocalHit[] = [];
  for (const key of filtered) {
    const doc = index.docs.get(key);
    if (!doc || !accepts(doc, query)) continue;
    const score = rank(doc, parsed, now);
    if (score <= 0) continue;
    hits.push({
      id: doc.id,
      channelId: doc.channelId,
      guildId: doc.guildId,
      authorId: doc.authorId,
      authorName: doc.authorName,
      channelName: doc.channelName,
      guildName: doc.guildName,
      preview: doc.preview,
      ms: doc.ms,
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score || b.ms - a.ms || (a.id < b.id ? 1 : -1));
  return { hits: hits.slice(0, LOCAL_SEARCH_LIMIT), facets: index.facets, count };
}

function collect(index: LocalIndex, query: LocalQuery, parsed: ParsedTerms): string[] | null {
  const hasText = parsed.exact.length > 0 || parsed.prefix.length > 0;
  const hasFilter = Boolean(query.guildId || query.channelId || query.authorId || query.guild || query.channel || query.author);
  if (!hasText && !hasFilter) return null;
  let keys: string[] | null = null;
  if (parsed.exact.length) {
    const lists = parsed.exact.map((token) => index.postings.get(token) ?? []);
    keys = intersectMany(lists);
  }
  if (parsed.prefix.length) {
    const tokens = prefixKeys(index.vocab, parsed.prefix);
    const allowed = new Set<string>();
    for (const token of tokens) {
      for (const key of index.postings.get(token) ?? []) allowed.add(key);
    }
    keys = keys ? keys.filter((key) => allowed.has(key)) : [...allowed];
  }
  if (!hasText) {
    const lists: string[][] = [];
    const guildKey = query.guildId === "@dm" ? "" : query.guildId;
    if (query.guildId) lists.push(index.byGuild.get(guildKey) ?? []);
    if (query.channelId) lists.push(index.byChannel.get(query.channelId) ?? []);
    if (query.authorId) lists.push(index.byAuthor.get(query.authorId) ?? []);
    if (lists.length) return intersectMany(lists);
    return [...index.docs.keys()];
  }
  return keys ?? [];
}

interface ParsedTerms {
  exact: string[];
  prefix: string;
  phrase: string;
}

function splitQuery(text: string, vocab: readonly string[]): ParsedTerms {
  const phrase = text.toLowerCase().replace(/\s+/g, " ").trim();
  const tokens = tokenize(phrase);
  if (!tokens.length) return { exact: [], prefix: "", phrase: "" };
  const last = tokens[tokens.length - 1];
  const head = tokens.slice(0, -1);
  const expanded = prefixKeys(vocab, last);
  if (expanded.length > 0 && expanded.length <= PREFIX_CAP) {
    return { exact: head, prefix: last, phrase };
  }
  return { exact: tokens, prefix: "", phrase };
}

function rank(doc: StoredDoc, parsed: ParsedTerms, now: number): number {
  let score = recency(doc.ms, now);
  const tokens = new Set(doc.tokens);
  for (const token of parsed.exact) {
    if (!tokens.has(token)) return 0;
    score += 16;
  }
  if (parsed.prefix) {
    let matched = false;
    for (const token of doc.tokens) {
      if (!token.startsWith(parsed.prefix)) continue;
      matched = true;
      score += token === parsed.prefix ? 16 : 8;
      break;
    }
    if (!matched) return 0;
  }
  if (parsed.phrase && doc.text.includes(parsed.phrase)) score += 28;
  return score;
}

function recency(ms: number, now: number): number {
  const age = Math.max(0, now - ms);
  return 1 + 9 * Math.exp(-age / WEEK_MS);
}

function accepts(doc: StoredDoc, query: LocalQuery): boolean {
  if (query.guildId === "@dm") {
    if (doc.guildId) return false;
  } else if (query.guildId && doc.guildId !== query.guildId) return false;
  if (query.channelId && doc.channelId !== query.channelId) return false;
  if (query.authorId && doc.authorId !== query.authorId) return false;
  if (query.guild && !loose(doc.guildId, doc.guildName, query.guild)) return false;
  if (query.channel && !loose(doc.channelId, doc.channelName, query.channel)) return false;
  if (query.author && !loose(doc.authorId, doc.authorName, query.author)) return false;
  return true;
}

function loose(id: string, name: string, needle: string): boolean {
  const token = needle.trim().toLowerCase();
  if (!token) return true;
  if (token === id.toLowerCase()) return true;
  return name.toLowerCase().includes(token);
}

function ensure(index: LocalIndex): void {
  if (!index.dirty) return;
  const postings = new Map<string, string[]>();
  const byGuild = new Map<string, string[]>();
  const byChannel = new Map<string, string[]>();
  const byAuthor = new Map<string, string[]>();
  const guilds = new Map<string, LocalFacet>();
  const channels = new Map<string, LocalFacet>();
  const authors = new Map<string, LocalFacet>();
  for (const doc of index.docs.values()) {
    push(byGuild, doc.guildId, doc.key);
    push(byChannel, doc.channelId, doc.key);
    if (doc.authorId) push(byAuthor, doc.authorId, doc.key);
    const guildKey = doc.guildId || "@dm";
    remember(guilds, guildKey, doc.guildId ? (doc.guildName || "Server") : (doc.guildName || "Direct messages"));
    remember(channels, doc.channelId, doc.channelName || "channel", doc.guildId);
    if (doc.authorId) remember(authors, doc.authorId, doc.authorName || "Someone");
    for (const token of doc.tokens) push(postings, token, doc.key);
  }
  for (const list of postings.values()) list.sort();
  for (const list of byGuild.values()) list.sort();
  for (const list of byChannel.values()) list.sort();
  for (const list of byAuthor.values()) list.sort();
  index.postings = postings;
  index.vocab = [...postings.keys()].sort();
  index.byGuild = byGuild;
  index.byChannel = byChannel;
  index.byAuthor = byAuthor;
  index.facets = {
    guilds: [...guilds.values()].sort(byName).slice(0, 200),
    channels: [...channels.values()].sort(byName).slice(0, 400),
    authors: [...authors.values()].sort(byName).slice(0, 400),
  };
  index.dirty = false;
}

function remember(map: Map<string, LocalFacet>, id: string, name: string, guildId?: string): void {
  if (map.has(id)) return;
  map.set(id, guildId === undefined ? { id, name } : { id, name, guildId });
}

function byName(a: LocalFacet, b: LocalFacet): number {
  return a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function intersectMany(lists: readonly string[][]): string[] {
  if (!lists.length) return [];
  const ordered = [...lists].sort((a, b) => a.length - b.length);
  let acc = ordered[0] ?? [];
  for (let i = 1; i < ordered.length; i += 1) {
    acc = intersectSorted(acc, ordered[i] ?? []);
    if (!acc.length) break;
  }
  return acc;
}

function intersectSorted(left: readonly string[], right: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      out.push(left[i]);
      i += 1;
      j += 1;
    } else if (left[i] < right[j]) i += 1;
    else j += 1;
  }
  return out;
}

function prefixKeys(vocab: readonly string[], prefix: string): string[] {
  if (!prefix) return [];
  let lo = 0;
  let hi = vocab.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vocab[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  for (let i = lo; i < vocab.length; i += 1) {
    const token = vocab[i];
    if (!token.startsWith(prefix)) break;
    out.push(token);
  }
  return out;
}

function storeDoc(doc: LocalDoc): StoredDoc | null {
  const text = doc.text.trim();
  if (!doc.key || !doc.id || !doc.channelId || !text) return null;
  return {
    key: doc.key,
    id: doc.id,
    channelId: doc.channelId,
    guildId: doc.guildId,
    authorId: doc.authorId,
    authorName: doc.authorName,
    channelName: doc.channelName,
    guildName: doc.guildName,
    text,
    preview: doc.preview,
    ms: doc.ms,
    tokens: tokenize(text),
  };
}

function fromSaved(doc: SavedDoc): StoredDoc | null {
  if (!doc || typeof doc.key !== "string" || typeof doc.id !== "string" || typeof doc.channelId !== "string") return null;
  return storeDoc({ ...doc, text: String(doc.text ?? ""), preview: String(doc.preview ?? "") });
}

function toSaved(doc: StoredDoc): SavedDoc {
  return {
    key: doc.key,
    id: doc.id,
    channelId: doc.channelId,
    guildId: doc.guildId,
    authorId: doc.authorId,
    authorName: doc.authorName,
    channelName: doc.channelName,
    guildName: doc.guildName,
    text: doc.text,
    preview: doc.preview,
    ms: doc.ms,
  };
}

function sameDoc(prev: StoredDoc, next: StoredDoc): boolean {
  return prev.text === next.text
    && prev.preview === next.preview
    && prev.authorId === next.authorId
    && prev.authorName === next.authorName
    && prev.guildId === next.guildId
    && prev.guildName === next.guildName
    && prev.channelName === next.channelName
    && prev.ms === next.ms;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.toLowerCase().matchAll(TOKEN)) {
    const token = match[0];
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= 64) break;
  }
  return out;
}

export type SearchIn =
  | { op: "upsert"; docs: readonly LocalDoc[] }
  | { op: "remove"; keys: readonly string[] }
  | { op: "query"; id: number; query: LocalQuery; now: number };

export type SearchOut =
  | { op: "ready"; count: number }
  | { op: "result"; id: number; page: LocalPage };

function displayPreview(content: string, mentions: { id?: string; name?: string }[] | undefined, fallback: string): string {
  let text = content;
  for (const mention of mentions ?? []) {
    const id = mention.id?.trim() ?? "";
    const name = mention.name?.trim() ?? "";
    if (!id || !name) continue;
    text = text.replaceAll(`<@${id}>`, `@${name}`).replaceAll(`<@!${id}>`, `@${name}`);
  }
  text = text
    .replace(/<@!?\d+>/g, "@someone")
    .replace(/<a?:([^:>]+):\d+>/g, "$1")
    .replace(/<#\d+>/g, "#channel")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function messageTime(id: string, timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (/^\d{5,22}$/.test(id)) {
    try {
      return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
    } catch {
      return 0;
    }
  }
  return 0;
}
