import type { Guild, Person } from "./types";

export interface RawMember {
  id: string;
  name: string;
  nick?: string | null;
  bot?: boolean;
  status?: string;
  custom?: string;
  avatarUrl?: string | null;
}

const LIVE = new Set(["online", "idle", "dnd"]);

export function personFromMember(member: RawMember): Person | null {
  const id = member.id?.trim();
  if (!id) return null;
  const nick = member.nick?.trim();
  const name = nick || member.name?.trim() || "Unknown";
  const status = member.status === "online" || member.status === "idle" || member.status === "dnd" || member.status === "invisible"
    ? member.status
    : "offline";
  return {
    id,
    name,
    bot: Boolean(member.bot),
    status,
    custom: member.custom?.trim() || "",
    avatarUrl: member.avatarUrl || null,
  };
}

/** Keep a known online status when a later payload only says offline. */
export function mergePeople(current: Person[], incoming: Person[]): Person[] {
  const byId = new Map(current.map((person) => [person.id, person]));
  for (const person of incoming) {
    const prev = byId.get(person.id);
    if (!prev) {
      byId.set(person.id, person);
      continue;
    }
    const incomingLive = person.status && LIVE.has(person.status);
    const previousLive = prev.status && LIVE.has(prev.status);
    byId.set(person.id, {
      ...prev,
      ...person,
      name: person.name || prev.name,
      status: incomingLive ? person.status : previousLive ? prev.status : person.status ?? prev.status,
      custom: person.custom || prev.custom,
      avatarUrl: person.avatarUrl || prev.avatarUrl || null,
    });
  }
  return [...byId.values()];
}

function named(guild: Guild | undefined): boolean {
  return Boolean(guild && guild.name && guild.name !== "Server");
}

/** READY stubs must not wipe an icon or name that GUILD_CREATE already delivered. */
export function mergeGuilds(incoming: Guild[], existing: Guild[]): Guild[] {
  const prev = new Map(existing.map((guild) => [guild.id, guild]));
  const seen = new Set<string>();
  const merged = incoming.map((guild) => {
    seen.add(guild.id);
    const old = prev.get(guild.id);
    if (!old) return guild;
    const useIncoming = named(guild);
    return {
      ...old,
      ...guild,
      name: useIncoming ? guild.name : old.name || guild.name,
      initials: useIncoming ? guild.initials || old.initials : old.initials || guild.initials,
      iconUrl: guild.iconUrl || old.iconUrl || null,
    };
  });
  for (const guild of existing) {
    if (!seen.has(guild.id)) merged.push(guild);
  }
  return merged;
}

export function memberNote(guildOpen: boolean, count: number, phase: "loading" | "done" | undefined): string | null {
  if (count > 0) return null;
  if (!guildOpen) return "Members show up after a server is open.";
  if (phase === "done") return "No members in this server yet.";
  return "Loading members…";
}
