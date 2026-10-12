/** Options for the privacy plugins. Each plugin stays off until it is enabled. */
export interface PrivacyOptions {
  panicKey: string;
  panicAction: "hide" | "minimize";
  panicMute: boolean;
  incognitoHoldRead: boolean;
  incognitoHideActivity: boolean;
  streamerManual: boolean;
  streamerAutoObs: boolean;
  streamerAutoShare: boolean;
  streamerEmails: boolean;
  streamerPhones: boolean;
  streamerIds: boolean;
  streamerDms: boolean;
  cleanOnSend: boolean;
  cleanOnClick: boolean;
}

const DEFAULT_PANIC_KEY = "mod+shift+h";

export function defaultPrivacy(): PrivacyOptions {
  return {
    panicKey: DEFAULT_PANIC_KEY,
    panicAction: "hide",
    panicMute: true,
    incognitoHoldRead: true,
    incognitoHideActivity: true,
    streamerManual: false,
    streamerAutoObs: true,
    streamerAutoShare: true,
    streamerEmails: true,
    streamerPhones: true,
    streamerIds: true,
    streamerDms: true,
    cleanOnSend: true,
    cleanOnClick: true,
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
  if (typeof raw.streamerManual === "boolean") base.streamerManual = raw.streamerManual;
  if (typeof raw.streamerAutoObs === "boolean") base.streamerAutoObs = raw.streamerAutoObs;
  if (typeof raw.streamerAutoShare === "boolean") base.streamerAutoShare = raw.streamerAutoShare;
  if (typeof raw.streamerEmails === "boolean") base.streamerEmails = raw.streamerEmails;
  if (typeof raw.streamerPhones === "boolean") base.streamerPhones = raw.streamerPhones;
  if (typeof raw.streamerIds === "boolean") base.streamerIds = raw.streamerIds;
  if (typeof raw.streamerDms === "boolean") base.streamerDms = raw.streamerDms;
  if (typeof raw.cleanOnSend === "boolean") base.cleanOnSend = raw.cleanOnSend;
  if (typeof raw.cleanOnClick === "boolean") base.cleanOnClick = raw.cleanOnClick;
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

const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/g;
const SNOWFLAKE = /\b\d{17,20}\b/g;

/** Foreground app or process names that mean OBS or another streaming program. */
export function obsDetected(names: readonly (string | null | undefined)[]): boolean {
  return names.some((name) => {
    if (!name) return false;
    const base = name.trim().toLowerCase().replace(/\\/g, "/").split("/").pop()?.replace(/\.exe$/, "") ?? "";
    if (!base) return false;
    return base === "obs" || base === "obs64" || base === "obs32" || base === "obs-studio" || base.includes("obs studio") || base.includes("streamlabs");
  });
}

export function streamerSafeActive(input: {
  enabled: boolean;
  manual: boolean;
  autoObs: boolean;
  obs: boolean;
  autoShare: boolean;
  sharing: boolean;
}): boolean {
  if (!input.enabled) return false;
  if (input.manual) return true;
  if (input.autoObs && input.obs) return true;
  if (input.autoShare && input.sharing) return true;
  return false;
}

export function redactStreamerText(input: string, flags: { phones: boolean; ids: boolean }): string {
  let text = input;
  if (flags.phones) text = text.replace(PHONE, "[phone hidden]");
  if (flags.ids) text = text.replace(SNOWFLAKE, "[id hidden]");
  return text;
}
