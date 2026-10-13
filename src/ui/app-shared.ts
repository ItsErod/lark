import type { Channel, Person, RawMessage } from "../types";
import { httpStatus, noteRest, trafficArmed } from "../net/traffic";
import type { LarkApp } from "./app";

export interface VoiceMember {
  id: string;
  name: string;
  speaking: boolean;
  volume: number;
  localMuted?: boolean;
  avatarUrl?: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
  serverMute?: boolean;
  serverDeaf?: boolean;
  video?: boolean;
  sharing?: boolean;
  streamLabel?: string;
}

export interface VoiceSession {
  channelId: string;
  guildId: string | null;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
  detail?: string;
  muted: boolean;
  deafened: boolean;
  members: VoiceMember[];
}

export interface PerfMarks {
  ready: number;
  lastSwitch: number;
  lastInput: number;
  lastLoad: number;
  switchAt: number;
  displayHz: number;
  benchFrames: (ms: number) => Promise<{ paints: number; hz: number }>;
}

export type ScrollMode = "none" | "bottom" | "preserve";

export interface LocalFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  url: string;
  clipName?: string;
  declaredBytes?: number;
  spoiler?: boolean;
}

export interface ClipAsk {
  name: string;
  channelId: string;
  mode: "send" | "attach";
}

export function downloadFile(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!trafficArmed()) {
    const { invoke: call } = await import("@tauri-apps/api/core");
    return call<T>(command, args);
  }
  const started = performance.now();
  try {
    const { invoke: call } = await import("@tauri-apps/api/core");
    const body = await call<T>(command, args);
    noteRest({ command, args, ok: true, ms: performance.now() - started, status: 200, body });
    return body;
  } catch (error) {
    noteRest({ command, args, ok: false, ms: performance.now() - started, status: httpStatus(error) });
    throw error;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function rectBox(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function friendlyVoiceDetail(detail: string): string {
  const text = detail.trim();
  if (!text || text.startsWith("aead_") || text.startsWith("xsalsa20")) return "";
  return text;
}

export function statusLabel(status: Person["status"]): string {
  if (status === "dnd") return "Do not disturb";
  if (status === "idle") return "Idle";
  if (status === "online") return "Online";
  if (status === "invisible") return "Invisible";
  return "Offline";
}

export function localInputValue(time: number): string {
  const date = new Date(time);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function readStringMap(key: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function readJson(key: string): Record<string, never> & { pages?: Record<string, RawMessage[]> } {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rgbToHex(value: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) return "";
  const hex = (part: string) => Number(part).toString(16).padStart(2, "0");
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

export function normalizeMessage(message: RawMessage): RawMessage {
  const kind = message.kind === "reply" || message.kind === "join" || message.kind === "system" ? message.kind : "default";
  const nonce = message.nonce == null ? "" : String(message.nonce).trim();
  return {
    ...message,
    nonce: nonce || undefined,
    kind,
    attachments: message.attachments ?? [],
    embeds: message.embeds ?? [],
    reactions: message.reactions ?? [],
    mentionIds: message.mentionIds ?? [],
    mentionUsers: message.mentionUsers ?? [],
    mentionRoleIds: message.mentionRoleIds ?? message.mentionRoles ?? [],
    mentionRoles: message.mentionRoles ?? message.mentionRoleIds ?? [],
    stickers: message.stickers ?? [],
    authorAvatar: message.authorAvatar ?? null,
  };
}

export const CHANNEL_KINDS = new Set<Channel["kind"]>(["text", "voice", "category", "forum", "dm", "group", "announcement", "thread", "stage", "media"]);

export function normalizeChannel(channel: Channel): Channel {
  return {
    ...channel,
    kind: CHANNEL_KINDS.has(channel.kind) ? channel.kind : "text",
    parentId: channel.parentId ?? null,
    topic: channel.topic ?? null,
    recipientIds: channel.recipientIds ?? [],
    recipients: channel.recipients ?? [],
    lastMessageId: channel.lastMessageId ?? null,
  };
}

export function asStatus(status: string): Person["status"] {
  if (status === "online" || status === "idle" || status === "dnd") return status;
  return "offline";
}

/** Build a group of LarkApp methods that live outside app.ts. */
export function defineMethods<T extends object>(methods: T & ThisType<LarkApp>): T {
  return methods;
}

/** Attach moved methods to a class prototype exactly as class methods (non-enumerable). */
export function installMethods(target: { prototype: object }, methods: object): void {
  for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
    Object.defineProperty(target.prototype, key, { ...desc, enumerable: false });
  }
}
