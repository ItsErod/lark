import type { KeyEventLike } from "./shortcuts";
import { matchShortcut } from "./shortcuts";
import type { OsName, SoundClip } from "./types";

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function sanitizeClips(input: unknown): SoundClip[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const hotkeys = new Set<string>();
  const out: SoundClip[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<SoundClip>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!ID.test(id) || seen.has(id)) continue;
    const path = typeof raw.path === "string" ? raw.path.replaceAll("\0", "").trim() : "";
    if (!path || path.length > 512 || /[\u0000-\u001f]/.test(path)) continue;
    let name = typeof raw.name === "string" ? [...raw.name.trim()].filter((ch) => ch >= " ").slice(0, 40).join("") : "";
    if (!name) name = "Sound";
    let hotkey = typeof raw.hotkey === "string" ? raw.hotkey.trim() : "";
    if (hotkey && !/^[a-z0-9+]+$/i.test(hotkey)) hotkey = "";
    const key = hotkey.toLowerCase();
    if (key && hotkeys.has(key)) hotkey = "";
    if (hotkey) hotkeys.add(key);
    const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume)
      ? Math.min(200, Math.max(0, Math.round(raw.volume)))
      : 100;
    seen.add(id);
    out.push({ id, name, path, hotkey, volume });
    if (out.length >= 24) break;
  }
  return out;
}

export function clipForHotkey(clips: SoundClip[], event: KeyEventLike, os: OsName): SoundClip | null {
  for (const clip of clips) {
    if (clip.hotkey && matchShortcut(event, clip.hotkey, os)) return clip;
  }
  return null;
}

/** A modifier or a function key can be a global shortcut. Bare letters stay inside Lark. */
export function soundHotkeyIsGlobal(shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const functionKey = /^f([1-9]|1[0-9]|2[0-4])$/.test(key);
  return parts.length > 1 || functionKey;
}

export interface GuildSound {
  id: string;
  name: string;
  guildId: string;
  volume: number;
  emojiName: string;
  available: boolean;
}

const SNOWFLAKE = /^\d{5,22}$/;

export function sanitizeGuildSounds(input: unknown, guildId: string): GuildSound[] {
  if (!Array.isArray(input) || !SNOWFLAKE.test(guildId)) return [];
  const seen = new Set<string>();
  const out: GuildSound[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { sound_id?: string; name?: string; volume?: number; emoji_name?: string; available?: boolean; id?: string };
    const id = String(raw.sound_id ?? raw.id ?? "").trim();
    if (!SNOWFLAKE.test(id) || seen.has(id)) continue;
    let name = typeof raw.name === "string" ? [...raw.name.trim()].filter((ch) => ch >= " ").slice(0, 40).join("") : "";
    if (!name) name = "Sound";
    const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : 1;
    const emojiName = typeof raw.emoji_name === "string" ? raw.emoji_name.trim().slice(0, 32) : "";
    seen.add(id);
    out.push({ id, name, guildId, volume, emojiName, available: raw.available !== false });
    if (out.length >= 48) break;
  }
  return out;
}

export function sanitizeSoundToggles(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id) && !SNOWFLAKE.test(id)) continue;
    out[id] = value !== false;
    if (Object.keys(out).length >= 64) break;
  }
  return out;
}

export function soundEnabled(toggles: Record<string, boolean>, id: string): boolean {
  return toggles[id] !== false;
}

/** Guild sounds stay quiet while deafened. A per-sound toggle can turn one off. Local clips are a separate board. */
export function playableGuildSounds(sounds: readonly GuildSound[], toggles: Record<string, boolean>, deafened: boolean): GuildSound[] {
  if (deafened) return [];
  return sounds.filter((sound) => sound.available && soundEnabled(toggles, sound.id));
}

export function playableClipIds(clips: readonly { id: string }[], toggles: Record<string, boolean>): string[] {
  return clips.filter((clip) => soundEnabled(toggles, clip.id)).map((clip) => clip.id);
}
