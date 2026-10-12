/** Network capture for the developer panel. Disarmed work is a boolean read. */

import { redactValue } from "../gateway-cache";

export interface RestRow {
  id: number;
  at: number;
  method: string;
  route: string;
  status: number;
  ms: number;
  bytes: number;
}

export interface GatewayRow {
  id: number;
  at: number;
  op: number;
  t: string;
  payload: unknown;
}

export interface VoiceStats {
  at: number;
  packets: number;
  bitrate: number;
  loss: number;
  jitter: number;
  ping: number;
}

export interface TrafficDump {
  rest: RestRow[];
  gateway: GatewayRow[];
  voice: VoiceStats;
}

const CAP = 200;
let armed = false;
let paused = false;
let nextId = 1;
const rest: RestRow[] = [];
const gateway: GatewayRow[] = [];
let voice: VoiceStats = { at: 0, packets: 0, bitrate: 0, loss: 0, jitter: 0, ping: 0 };

const ROUTES: Record<string, [string, string]> = {
  fetch_messages: ["GET", "/channels/:id/messages"],
  send_message: ["POST", "/channels/:id/messages"],
  edit_message: ["PATCH", "/channels/:id/messages/:message"],
  delete_message: ["DELETE", "/channels/:id/messages/:message"],
  fetch_guild_channels: ["GET", "/guilds/:id/channels"],
  fetch_members: ["GET", "/guilds/:id/members"],
  fetch_roles: ["GET", "/guilds/:id/roles"],
  fetch_dms: ["GET", "/users/@me/channels"],
  fetch_friends: ["GET", "/users/@me/relationships"],
  fetch_pins: ["GET", "/channels/:id/pins"],
  pin_message: ["PUT", "/channels/:id/pins/:message"],
  unpin_message: ["DELETE", "/channels/:id/pins/:message"],
  toggle_reaction: ["PUT", "/channels/:id/messages/:message/reactions/:emoji/@me"],
  typing: ["POST", "/channels/:id/typing"],
  ack_message: ["POST", "/channels/:id/messages/:message/ack"],
  search_messages: ["GET", "/guilds/:id/messages/search"],
  preview_invite: ["GET", "/invites/:code"],
  accept_invite: ["POST", "/invites/:code"],
  join_voice: ["PATCH", "/guilds/:id/voice-states/@me"],
  leave_voice: ["DELETE", "/guilds/:id/voice-states/@me"],
  voice_diagnostics: ["GET", "/voice/diagnostics"],
};

const GATEWAY_T: Record<string, string> = {
  ready: "READY",
  message: "MESSAGE_CREATE",
  messageUpdate: "MESSAGE_UPDATE",
  messageDelete: "MESSAGE_DELETE",
  typing: "TYPING_START",
  presence: "PRESENCE_UPDATE",
  voiceState: "VOICE_STATE_UPDATE",
  voiceServer: "VOICE_SERVER_UPDATE",
  voiceLink: "VOICE_SERVER_UPDATE",
  guild: "GUILD_CREATE",
  channels: "GUILD_CREATE",
  members: "GUILD_MEMBERS_CHUNK",
};

export function trafficArmed(): boolean {
  return armed;
}

export function setTrafficArmed(on: boolean) {
  armed = on;
  if (!on) paused = false;
}

export function setTrafficPaused(on: boolean) {
  paused = on;
}

export function trafficPaused(): boolean {
  return paused;
}

export function clearTraffic() {
  rest.length = 0;
  gateway.length = 0;
  voice = { at: 0, packets: 0, bitrate: 0, loss: 0, jitter: 0, ping: 0 };
}

export function noteRest(input: {
  command: string;
  args?: Record<string, unknown>;
  ok: boolean;
  ms: number;
  status?: number;
  body?: unknown;
}): void {
  if (!armed || paused) return;
  const [method, route] = routeFor(input.command, input.args);
  rest.push({
    id: nextId++,
    at: Date.now(),
    method,
    route,
    status: input.ok ? (input.status ?? 200) : (input.status ?? 0),
    ms: Math.max(0, Math.round(input.ms * 10) / 10),
    bytes: byteSize(input.body),
  });
  if (rest.length > CAP) rest.splice(0, rest.length - CAP);
}

export function noteGateway(payload: unknown): void {
  if (!armed || paused) return;
  if (!payload || typeof payload !== "object") return;
  const kind = String((payload as { kind?: unknown }).kind ?? "");
  if (!kind) return;
  const op = kind === "hello" ? 10 : kind === "heartbeat" ? 1 : kind === "ack" ? 11 : 0;
  gateway.push({
    id: nextId++,
    at: Date.now(),
    op,
    t: GATEWAY_T[kind] ?? kind.toUpperCase(),
    payload: redactValue(payload),
  });
  if (gateway.length > CAP) gateway.splice(0, gateway.length - CAP);
  if (kind === "voiceLink") {
    const ping = (payload as { pingMs?: unknown }).pingMs;
    if (typeof ping === "number" && Number.isFinite(ping)) noteVoice({ ping });
  }
}

export function noteVoice(patch: Partial<Omit<VoiceStats, "at">>): void {
  if (!armed || paused) return;
  voice = { ...voice, ...patch, at: Date.now() };
}

export function noteVoiceDiagnostics(text: string): void {
  if (!armed || paused) return;
  noteVoice({
    packets: lineNumber(text, "packets"),
    bitrate: lineNumber(text, "bitrate"),
    loss: lineNumber(text, "loss"),
    jitter: lineNumber(text, "jitter_ms"),
    ping: lineNumber(text, "ping_ms"),
  });
}

export function trafficSnapshot(): TrafficDump {
  return { rest: rest.slice(), gateway: gateway.slice(), voice: { ...voice } };
}

export function exportTraffic(query = "", event = ""): string {
  return JSON.stringify(filterTraffic(trafficSnapshot(), query, event));
}

export function filterTraffic(dump: TrafficDump, query: string, event = ""): TrafficDump {
  const needle = query.trim().toLowerCase();
  const name = event.trim().toLowerCase();
  return {
    rest: dump.rest.filter((row) => !needle || `${row.method} ${row.route} ${row.status}`.toLowerCase().includes(needle)),
    gateway: dump.gateway.filter((row) => {
      if (name && !row.t.toLowerCase().includes(name)) return false;
      if (!needle) return true;
      return `${row.op} ${row.t}`.toLowerCase().includes(needle);
    }),
    voice: dump.voice,
  };
}

export function httpStatus(error: unknown): number {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const match = text.match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : 0;
}

function routeFor(command: string, args?: Record<string, unknown>): [string, string] {
  const known = ROUTES[command];
  const method = known?.[0] ?? "CALL";
  let route = known?.[1] ?? command;
  const channel = textArg(args, "channelId");
  const guild = textArg(args, "guildId");
  const message = textArg(args, "messageId");
  const code = textArg(args, "code");
  if (channel) route = route.replace(":id", channel);
  else if (guild) route = route.replace(":id", guild);
  if (message) route = route.replace(":message", message);
  if (code) route = route.replace(":code", code);
  return [method, route];
}

function textArg(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  return typeof value === "string" && value && !/token|secret|authorization/i.test(key) ? value : "";
}

function byteSize(body: unknown): number {
  if (body == null) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(redactValue(body))).length;
  } catch {
    return 0;
  }
}

function lineNumber(text: string, key: string): number {
  const match = text.match(new RegExp(`^${key}:\\s*(-?\\d+(?:\\.\\d+)?)`, "m"));
  return match ? Number(match[1]) : 0;
}
