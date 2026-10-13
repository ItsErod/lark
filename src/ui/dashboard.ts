import "../design-dashboard.css";
import type { Person } from "../types";
import type { SocialRelationship } from "../social";
import { el, portrait } from "./dom";

export interface DashboardVoice {
  userId: string;
  guildId: string;
  channelId: string;
  sharing: boolean;
  streamLabel?: string;
  name?: string;
  avatarUrl?: string | null;
}

export interface DashboardPlace {
  guild: string;
  channel: string;
}

export interface DashboardInput {
  people: Person[];
  relationships: SocialRelationship[];
  voices: DashboardVoice[];
  meId: string;
  now?: number;
  place?: (guildId: string, channelId: string) => DashboardPlace;
}

export interface DashboardAction {
  id: "watch" | "join" | "accept" | "ignore" | "cancel";
  label: string;
}

export interface DashboardRow {
  key: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  text: string;
  time: string;
  aside: string;
  actions: DashboardAction[];
  sort: number;
}

export interface DashboardModel {
  rows: DashboardRow[];
  ticking: boolean;
}

export interface DashboardHandlers {
  onOpen: (userId: string) => void;
  onWatch: (userId: string) => void;
  onJoin: (userId: string) => void;
  onAccept: (userId: string) => void;
  onIgnore: (userId: string) => void;
  onCancel: (userId: string) => void;
}

const ACTIVITY_CAP = 40;
const REQUEST_CAP = 12;

/** Compact clock for the right edge. Hours show as h:mm:ss. */
export function activityClock(startedAt: number | null | undefined, now: number): string {
  if (!startedAt || startedAt <= 0 || now < startedAt) return "";
  const seconds = Math.floor((now - startedAt) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  const ss = String(remain).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Left-column age. Blank when Discord did not send a start time. */
export function activityAgo(startedAt: number | null | undefined, now: number): string {
  if (!startedAt || startedAt <= 0 || now < startedAt) return "";
  const seconds = Math.floor((now - startedAt) / 1000);
  if (seconds < 45) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function dashboardSig(model: DashboardModel): string {
  return model.rows.map((row) => [
    row.key,
    row.name,
    row.time,
    row.text,
    row.aside,
    row.status,
    row.actions.map((action) => action.id).join(","),
  ].join("|")).join("\n");
}

type ActivityKind = "stream" | "game" | "listen" | "watch" | "other" | "";

function activityKind(person: Person): ActivityKind {
  const type = person.rich?.type;
  if (person.rich?.live || type === 1) return "stream";
  if (type === 0 || type === 5) return "game";
  if (type === 2) return "listen";
  if (type === 3) return "watch";
  const line = person.activity?.trim() ?? "";
  if (/^streaming\b/i.test(line)) return "stream";
  if (/^playing\b/i.test(line) || /^competing\b/i.test(line)) return "game";
  if (/^listening\b/i.test(line)) return "listen";
  if (/^watching\b/i.test(line)) return "watch";
  if (line) return "other";
  return "";
}

function subject(person: Person): string {
  const named = person.rich?.name?.trim();
  if (named) return named;
  return (person.activity ?? "").replace(/^(Playing|Listening to|Watching|Streaming|Competing in)\s+/i, "").trim();
}

function voiceFor(voices: DashboardVoice[], userId: string): DashboardVoice | undefined {
  const hits = voices.filter((voice) => voice.userId === userId && voice.channelId);
  return hits.find((voice) => voice.sharing) ?? hits[0];
}

function placeOf(voice: DashboardVoice, place: DashboardInput["place"]): { guild: string; channel: string } {
  const named = place?.(voice.guildId, voice.channelId);
  return {
    guild: named?.guild?.trim() ?? "",
    channel: named?.channel?.trim() || voice.streamLabel?.trim() || "voice",
  };
}

function where(voice: DashboardVoice, place: DashboardInput["place"]): string {
  const named = placeOf(voice, place);
  return named.guild ? `${named.channel} in ${named.guild}` : named.channel;
}

function personName(person: Person): string {
  return person.friendNick?.trim() || person.name || "Someone";
}

/**
 * One activity list. Streams, games, listening, voice, and friend requests
 * are rows. The newest activity is first. Requests follow, because Discord
 * does not stamp them.
 */
export function dashboardFeed(input: DashboardInput): DashboardModel {
  const now = input.now ?? Date.now();
  const me = input.meId;
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const person of input.people) {
    if (!person.id || person.id === me || seen.has(person.id)) continue;
    seen.add(person.id);
    people.push(person);
  }
  for (const voice of input.voices) {
    if (!voice.userId || voice.userId === me || !voice.channelId || seen.has(voice.userId)) continue;
    seen.add(voice.userId);
    people.push({
      id: voice.userId,
      name: voice.name?.trim() || "Someone",
      avatarUrl: voice.avatarUrl,
      status: "online",
    });
  }

  const activities: DashboardRow[] = [];
  for (const person of people) {
    const voice = voiceFor(input.voices, person.id);
    const kind = activityKind(person);
    const started = person.rich?.startedAt ?? null;
    const clock = activityClock(started, now);
    const name = subject(person);
    const spot = voice ? where(voice, input.place) : "";
    let text = "";
    let actions: DashboardAction[] = [];
    let aside = "";
    let sort = started && started > 0 ? started : 0;

    if (voice?.sharing) {
      text = spot ? `started sharing ${spot}` : "started sharing";
      actions = [{ id: "watch", label: "Watch" }];
      if (!sort) sort = now;
    } else if (kind === "stream") {
      text = name ? `is streaming ${name}` : "is streaming";
      if (voice) actions = [{ id: "watch", label: "Watch" }];
      else aside = clock;
      if (!sort) sort = now - 1;
    } else if (kind === "game") {
      text = name ? `started ${name}` : "started a game";
      if (spot) text = `${text} · ${spot}`;
      aside = clock;
      if (!aside && voice) actions = [{ id: "join", label: "Join" }];
    } else if (kind === "listen") {
      text = name ? `is listening to ${name}` : "is listening";
      aside = clock;
      if (!aside && voice) actions = [{ id: "join", label: "Join" }];
    } else if (kind === "watch") {
      text = name ? `is watching ${name}` : "is watching";
      aside = clock;
    } else if (voice) {
      text = spot ? `joined ${spot}` : "joined voice";
      actions = [{ id: "join", label: "Join" }];
      if (!sort) sort = now - 2;
    } else if (kind === "other") {
      text = person.activity?.trim() || name;
      aside = clock;
    }

    if (!text) continue;
    activities.push({
      key: person.id,
      userId: person.id,
      name: personName(person),
      avatarUrl: person.avatarUrl ?? null,
      status: person.status || (voice ? "online" : "offline"),
      text,
      time: activityAgo(started, now) || (voice?.sharing ? "now" : ""),
      aside,
      actions,
      sort,
    });
  }
  activities.sort((a, b) => b.sort - a.sort || a.name.localeCompare(b.name));

  const requests: DashboardRow[] = [];
  for (const row of input.relationships) {
    if (!row.id || row.id === me) continue;
    if (row.kind !== "incoming" && row.kind !== "outgoing") continue;
    const incoming = row.kind === "incoming";
    requests.push({
      key: `${row.kind}:${row.id}`,
      userId: row.id,
      name: row.nickname?.trim() || row.name || "Someone",
      avatarUrl: row.avatarUrl ?? null,
      status: "offline",
      text: incoming ? "sent you a friend request" : "friend request sent",
      time: "",
      aside: "",
      actions: incoming
        ? [{ id: "accept", label: "Accept" }, { id: "ignore", label: "Ignore" }]
        : [{ id: "cancel", label: "Cancel" }],
      sort: 0,
    });
    if (requests.length >= REQUEST_CAP) break;
  }

  return {
    rows: [...activities.slice(0, ACTIVITY_CAP), ...requests],
    ticking: activities.some((row) => row.aside !== ""),
  };
}

function runAction(action: DashboardAction, userId: string, handlers: DashboardHandlers) {
  if (action.id === "watch") handlers.onWatch(userId);
  else if (action.id === "join") handlers.onJoin(userId);
  else if (action.id === "accept") handlers.onAccept(userId);
  else if (action.id === "ignore") handlers.onIgnore(userId);
  else handlers.onCancel(userId);
}

/** Paint the feed into a host. The caller skips this when the view is hidden. */
export function renderDashboard(host: HTMLElement, model: DashboardModel, handlers: DashboardHandlers, dock: boolean) {
  const feed = el("section", `dash-feed${dock ? " is-dock" : ""}`);
  feed.setAttribute("aria-label", "Activity");
  if (dock) {
    const head = el("div", "dash-head");
    head.append(el("h2", "", "Activity"));
    feed.append(head);
  }
  if (!model.rows.length) {
    feed.append(el("p", "dash-empty", "Nothing happening right now."));
  }
  for (const row of model.rows) {
    const line = el("article", "dash-row");
    line.append(el("time", "dash-time", row.time));
    const face = el("div", "avatar-wrap");
    face.append(portrait(row.name, row.userId, row.avatarUrl, true), el("i", `status ${row.status || "offline"}`));
    const copy = el("button", "dash-copy");
    copy.type = "button";
    copy.append(el("strong", "", row.name), el("span", "", row.text));
    copy.addEventListener("click", () => handlers.onOpen(row.userId));
    const side = el("div", "dash-actions");
    if (row.aside) side.append(el("span", "dash-tag", row.aside));
    for (const action of row.actions) {
      const button = el("button", `dash-btn${action.id === "ignore" || action.id === "cancel" ? " ghost" : ""}`, action.label);
      button.type = "button";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        runAction(action, row.userId, handlers);
      });
      side.append(button);
    }
    line.append(face, copy, side);
    feed.append(line);
  }
  host.replaceChildren(feed);
}
