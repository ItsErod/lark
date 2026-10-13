/** Where message search should ask Discord. Home, with no server and no open DM, searches direct messages. */

export type SearchPlace = "server" | "conversation" | "direct-messages";

export interface RemoteSearchCall {
  guildId: string | null;
  channelId: string | null;
}

export interface NamedPerson {
  id: string;
  name: string;
}

const FILTERS = "from:, mentions:, has:, before:, after:, in:, pinned:";

export function searchPlace(guildId: string | null | undefined, channelId: string | null | undefined): SearchPlace {
  if (guildId?.trim()) return "server";
  if (channelId?.trim()) return "conversation";
  return "direct-messages";
}

/** Guild search wins. An open DM searches that conversation. Home searches every DM. */
export function remoteSearchCall(guildId: string | null | undefined, channelId: string | null | undefined): RemoteSearchCall {
  const guild = guildId?.trim() ?? "";
  const channel = channelId?.trim() ?? "";
  if (guild) return { guildId: guild, channelId: null };
  if (channel) return { guildId: null, channelId: channel };
  return { guildId: null, channelId: null };
}

export function searchPlaceholder(place: SearchPlace): string {
  if (place === "direct-messages") {
    return `Search direct messages — ${FILTERS.replaceAll(",", "")}`;
  }
  return `Search — ${FILTERS.replaceAll(",", "")}`;
}

export function searchUsers(base: Record<string, string>, friends: readonly NamedPerson[]): Record<string, string> {
  const users = { ...base };
  for (const person of friends) {
    const id = person.id.trim();
    const name = person.name.trim();
    if (id && name && !users[id]) users[id] = name;
  }
  return users;
}

export function searchNote(input: {
  place: SearchPlace;
  query: string;
  hasCriteria: boolean;
  unresolved: readonly string[];
  phase: "local" | "remote" | "fallback";
}): string {
  const unmatched = input.unresolved.length ? `Couldn't match ${input.unresolved.join(", ")}.` : "";
  if (!input.query.trim() || !input.hasCriteria) {
    if (input.place === "direct-messages") return `Direct messages on Discord. Filters: ${FILTERS}`;
    if (input.place === "conversation") return `This conversation on Discord. Filters: ${FILTERS}`;
    return `This server on Discord. Filters: ${FILTERS}`;
  }
  if (input.phase === "fallback") {
    const missed = input.place === "direct-messages"
      ? "Discord search missed. Showing messages already loaded."
      : "Discord search missed. Showing loaded messages.";
    return [unmatched, missed].filter(Boolean).join(" ");
  }
  if (input.phase === "local" && input.place === "direct-messages") {
    return [unmatched, "Asking Discord across direct messages."].filter(Boolean).join(" ");
  }
  return unmatched;
}
