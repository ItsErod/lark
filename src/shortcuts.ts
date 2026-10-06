import type { OsName, Shortcuts } from "./types";

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIERS = new Set(["mod", "cmd", "command", "ctrl", "control", "alt", "option", "shift", "meta", "super"]);

export function canonicalKey(key: string): string {
  const value = key.toLowerCase();
  switch (value) {
    case "down":
    case "arrowdown":
      return "arrowdown";
    case "up":
    case "arrowup":
      return "arrowup";
    case "left":
    case "arrowleft":
      return "arrowleft";
    case "right":
    case "arrowright":
      return "arrowright";
    case "esc":
    case "escape":
      return "escape";
    case "return":
    case "enter":
      return "enter";
    case ",":
    case "comma":
      return "comma";
    case " ":
    case "space":
      return "space";
    case "`":
    case "backquote":
      return "backquote";
    default:
      return value;
  }
}

export function eventKey(event: KeyEventLike): string {
  if (event.key === ",") return "comma";
  if (event.key === " ") return "space";
  if (event.key === "`" || event.key === "Backquote") return "backquote";
  if (event.key.length === 1) return event.key.toLowerCase();
  return canonicalKey(event.key);
}

export function matchShortcut(event: KeyEventLike, shortcut: string, os: OsName): boolean {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  const key = canonicalKey(parts[parts.length - 1]);
  if (eventKey(event) !== key) return false;
  let wantCtrl = false;
  let wantAlt = false;
  let wantShift = false;
  let wantMeta = false;
  for (const mod of parts.slice(0, -1)) {
    if (!MODIFIERS.has(mod)) return false;
    if (mod === "mod") {
      if (os === "macos") wantMeta = true;
      else wantCtrl = true;
    } else if (mod === "cmd" || mod === "command" || mod === "meta" || mod === "super") wantMeta = true;
    else if (mod === "ctrl" || mod === "control") wantCtrl = true;
    else if (mod === "alt" || mod === "option") wantAlt = true;
    else if (mod === "shift") wantShift = true;
    else if (mod === "meta" || mod === "super") wantMeta = true;
  }
  return event.ctrlKey === wantCtrl && event.altKey === wantAlt && event.shiftKey === wantShift && event.metaKey === wantMeta;
}

export function formatShortcut(shortcut: string, os: OsName): string {
  const mac = os === "macos";
  return shortcut
    .split("+")
    .map((part) => {
      const value = part.trim().toLowerCase();
      if (value === "mod") return mac ? "⌘" : "Ctrl";
      if (value === "cmd" || value === "command") return mac ? "⌘" : "Cmd";
      if (value === "shift") return mac ? "⇧" : "Shift";
      if (value === "alt" || value === "option") return mac ? "⌥" : "Alt";
      if (value === "ctrl" || value === "control") return mac ? "⌃" : "Ctrl";
      if (value === "meta") return mac ? "⌘" : "Win";
      if (value === "comma") return ",";
      if (value === "backquote") return "`";
      if (value === "arrowup") return "↑";
      if (value === "arrowdown" || value === "down") return "↓";
      if (value === "arrowleft") return "←";
      if (value === "arrowright") return "→";
      if (value.length === 1) return value.toUpperCase();
      return value;
    })
    .join(mac ? "" : "+");
}

export function shortcutFromEvent(event: KeyEventLike, os: OsName): string | null {
  const key = eventKey(event);
  if (MODIFIERS.has(key) || key === "control" || key === "meta") return null;
  const parts: string[] = [];
  const mod = os === "macos" ? event.metaKey : event.ctrlKey;
  if (mod) parts.push("mod");
  if (os === "macos" && event.ctrlKey) parts.push("ctrl");
  if (os !== "macos" && event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(key);
  if (parts.length === 1 && !/^[a-z0-9]$/.test(key) && !key.startsWith("arrow") && key !== "escape" && key !== "enter") {
    return parts.join("+");
  }
  return parts.join("+");
}

export function shortcutConflicts(shortcuts: Shortcuts): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const [action, shortcut] of Object.entries(shortcuts)) {
    const key = shortcut.toLowerCase().replace(/\s+/g, "");
    const previous = seen.get(key);
    if (previous) conflicts.push(`${previous} and ${action} both use ${shortcut}`);
    else seen.set(key, action);
  }
  return conflicts;
}
