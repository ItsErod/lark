/** Thread and forum chrome. The message list can paint before this chunk loads. */

export type ThreadsUi = typeof import("./threads-forums");

let threads: ThreadsUi | null = null;
let loading: Promise<ThreadsUi> | null = null;

export function threadsNow(): ThreadsUi | null {
  return threads;
}

export function loadThreadsUi(): Promise<ThreadsUi> {
  if (threads) return Promise.resolve(threads);
  if (!loading) {
    loading = import("./threads-forums").then((mod) => {
      threads = mod;
      return mod;
    });
  }
  return loading;
}
