/** Local folder counts and display order. Discord's folder list is not written. */

export interface FolderServer {
  id: string;
  name: string;
  mentions: number;
  unread: boolean;
  muted: boolean;
}

export interface FolderSummary {
  id: string;
  name: string;
  servers: number;
  unread: number;
  mentions: number;
  muted: number;
}

export function summarizeFolder(id: string, name: string, servers: readonly FolderServer[]): FolderSummary {
  let unread = 0;
  let mentions = 0;
  let muted = 0;
  for (const server of servers) {
    if (server.muted) {
      muted += 1;
      continue;
    }
    const count = Number.isFinite(server.mentions) && server.mentions > 0 ? Math.floor(server.mentions) : 0;
    mentions += count;
    if (server.unread || count > 0) unread += 1;
  }
  return {
    id,
    name: name.trim().slice(0, 80) || "Folder",
    servers: servers.length,
    unread,
    mentions,
    muted,
  };
}

export function folderTitle(summary: FolderSummary): string {
  const servers = summary.servers === 1 ? "1 server" : `${summary.servers} servers`;
  const unread = summary.unread === 1 ? "1 unread" : `${summary.unread} unread`;
  const mentions = summary.mentions === 1 ? "1 mention" : `${summary.mentions} mentions`;
  return `${summary.name} · ${servers} · ${unread} · ${mentions}`;
}

export function orderUnreadFirst(ids: readonly string[], hot: (id: string) => boolean): string[] {
  const first: string[] = [];
  const rest: string[] = [];
  for (const id of ids) {
    if (hot(id)) first.push(id);
    else rest.push(id);
  }
  return [...first, ...rest];
}

export function peekNames(servers: readonly FolderServer[], limit = 12): string {
  const names = servers.map((server) => server.name.trim()).filter(Boolean).slice(0, limit);
  if (!names.length) return "Empty folder";
  const extra = servers.length - names.length;
  return extra > 0 ? `${names.join(", ")} +${extra}` : names.join(", ");
}
