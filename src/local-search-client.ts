import {
  createIndex,
  emptyFacets,
  queryIndex,
  removeKeys,
  upsertDocs,
  type LocalDoc,
  type LocalPage,
  type LocalQuery,
  type SearchIn,
  type SearchOut,
} from "./local-search";

export interface LocalSearchClient {
  upsert(docs: readonly LocalDoc[]): void;
  remove(keys: readonly string[]): void;
  query(query: LocalQuery, now?: number): Promise<LocalPage>;
}

export function startLocalSearch(): LocalSearchClient {
  if (typeof Worker === "function") {
    try {
      const worker = new Worker(new URL("./local-search-worker.ts", import.meta.url), { type: "module" });
      return bindWorker(worker);
    } catch {
      /* The in-memory client still keeps the work off the current call stack. */
    }
  }
  return bindMemory();
}

function bindWorker(worker: Worker): LocalSearchClient {
  let nextId = 1;
  const pending = new Map<number, (page: LocalPage) => void>();
  worker.onmessage = (event: MessageEvent<SearchOut>) => {
    const message = event.data;
    if (message.op !== "result") return;
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    resolve(message.page);
  };
  return {
    upsert(docs) {
      if (!docs.length) return;
      const message: SearchIn = { op: "upsert", docs };
      worker.postMessage(message);
    },
    remove(keys) {
      if (!keys.length) return;
      const message: SearchIn = { op: "remove", keys };
      worker.postMessage(message);
    },
    query(query, now = Date.now()) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        const message: SearchIn = { op: "query", id, query, now };
        worker.postMessage(message);
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          resolve({ hits: [], facets: emptyFacets(), count: 0 });
        }, 4000);
      });
    },
  };
}

function bindMemory(): LocalSearchClient {
  const index = createIndex();
  let chain: Promise<void> = Promise.resolve();
  const later = (task: () => void) => {
    chain = chain.then(() => {
      task();
    }, () => {
      task();
    });
    return chain;
  };
  return {
    upsert(docs) {
      void later(() => {
        upsertDocs(index, docs);
      });
    },
    remove(keys) {
      void later(() => {
        removeKeys(index, keys);
      });
    },
    query(query, now = Date.now()) {
      return new Promise((resolve) => {
        void later(() => {
          resolve(queryIndex(index, query, now));
        });
      });
    },
  };
}
