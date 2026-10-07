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
