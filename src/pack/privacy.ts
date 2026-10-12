/** Options for the privacy plugins. Each plugin stays off until it is enabled. */
export interface PrivacyOptions {
  panicKey: string;
  panicAction: "hide" | "minimize";
  panicMute: boolean;
  incognitoHoldRead: boolean;
  incognitoHideActivity: boolean;
}

const DEFAULT_PANIC_KEY = "mod+shift+h";

export function defaultPrivacy(): PrivacyOptions {
  return {
    panicKey: DEFAULT_PANIC_KEY,
    panicAction: "hide",
    panicMute: true,
    incognitoHoldRead: true,
    incognitoHideActivity: true,
  };
}

export function sanitizePrivacy(input: unknown): PrivacyOptions {
  const base = defaultPrivacy();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<PrivacyOptions>;
  if (typeof raw.panicKey === "string") base.panicKey = cleanPanicKey(raw.panicKey);
  if (raw.panicAction === "hide" || raw.panicAction === "minimize") base.panicAction = raw.panicAction;
  if (typeof raw.panicMute === "boolean") base.panicMute = raw.panicMute;
  if (typeof raw.incognitoHoldRead === "boolean") base.incognitoHoldRead = raw.incognitoHoldRead;
  if (typeof raw.incognitoHideActivity === "boolean") base.incognitoHideActivity = raw.incognitoHideActivity;
  return base;
}

/** A panic shortcut needs a modifier so a letter typed in the composer cannot fire it. */
export function cleanPanicKey(value: string): string {
  const shortcut = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!shortcut || shortcut.length > 40 || shortcut.includes(" ")) return DEFAULT_PANIC_KEY;
  const parts = shortcut.split("+").filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return DEFAULT_PANIC_KEY;
  const key = parts[parts.length - 1];
  if (!/^[a-z0-9]+$/.test(key) || key.length > 16) return DEFAULT_PANIC_KEY;
  const mods = new Set(["mod", "ctrl", "control", "alt", "option", "shift", "meta", "cmd", "command"]);
  if (!parts.slice(0, -1).every((part) => mods.has(part))) return DEFAULT_PANIC_KEY;
  return parts.join("+");
}

export interface PanicPlan {
  action: "hide" | "minimize";
  mute: boolean;
}

export function panicPlan(action: PrivacyOptions["panicAction"], mute: boolean): PanicPlan {
  return { action: action === "minimize" ? "minimize" : "hide", mute };
}

/** Automatic read receipts stay off while Incognito is on and this option is on. */
export function holdRead(enabled: boolean, option: boolean): boolean {
  return enabled && option;
}

/** Plugin-driven presence and typing stay local. A status the person sets still publishes. */
export function publishActivity(enabled: boolean, hide: boolean, source: "user" | "plugin"): boolean {
  if (!(enabled && hide)) return true;
  return source === "user";
}

/** The account chip hides a custom status and activity line while Incognito is hiding activity. */
export function visibleStatus(enabled: boolean, hide: boolean, custom: string, connection: string): string {
  if (enabled && hide) return "Incognito";
  return custom || connection;
}
