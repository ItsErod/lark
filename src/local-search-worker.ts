import { createIndex, loadDocs, queryIndex, removeKeys, upsertDocs, type SavedDoc, type SearchIn, type SearchOut } from "./local-search";

const DB_NAME = "lark.local-search";
const STORE = "docs";

const index = createIndex();
let db: IDBDatabase | null = null;
let hydrated = false;
const waiting: SearchIn[] = [];
let pendingPut: SavedDoc[] = [];
let pendingDel: string[] = [];
let flushTimer = 0;

self.onmessage = (event: MessageEvent<SearchIn>) => {
  if (!hydrated) {
    waiting.push(event.data);
    return;
  }
  handle(event.data);
};

void boot();

async function boot(): Promise<void> {
  try {
    db = await openDb();
    loadDocs(index, await readAll(db));
  } catch {
    db = null;
  }
  hydrated = true;
  const queued = waiting.splice(0, waiting.length);
  for (const message of queued) handle(message);
  post({ op: "ready", count: index.docs.size });
}

function handle(message: SearchIn): void {
  if (message.op === "upsert") {
    const diff = upsertDocs(index, message.docs);
    schedulePersist(diff.put, diff.del);
    return;
  }
  if (message.op === "remove") {
    const del = removeKeys(index, message.keys);
    schedulePersist([], del);
    return;
  }
  post({ op: "result", id: message.id, page: queryIndex(index, message.query, message.now) });
}

function schedulePersist(put: SavedDoc[], del: string[]): void {
  if (put.length) pendingPut.push(...put);
  if (del.length) pendingDel.push(...del);
  if (!db || flushTimer || (!pendingPut.length && !pendingDel.length)) return;
  flushTimer = self.setTimeout(() => {
    flushTimer = 0;
    void flushPersist();
  }, 400);
}

async function flushPersist(): Promise<void> {
  const database = db;
  if (!database) return;
  const put = pendingPut;
  const del = pendingDel;
  pendingPut = [];
  pendingDel = [];
  if (!put.length && !del.length) return;
  try {
    await writeAll(database, put, del);
  } catch {
    pendingPut = put.concat(pendingPut);
    pendingDel = del.concat(pendingDel);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(database: IDBDatabase): Promise<SavedDoc[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as SavedDoc[] : []);
    request.onerror = () => reject(request.error);
  });
}

function writeAll(database: IDBDatabase, put: SavedDoc[], del: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const key of del) store.delete(key);
    for (const doc of put) store.put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function post(message: SearchOut): void {
  self.postMessage(message);
}
