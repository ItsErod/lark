import type { OsName } from "./types";

export function detectOs(ua: string, platform = ""): OsName {
  const hay = `${ua} ${platform}`.toLowerCase();
  if (hay.includes("mac os") || hay.includes("macintosh") || platform.toLowerCase().includes("mac")) {
    return "macos";
  }
  if (hay.includes("windows")) return "windows";
  if (hay.includes("linux") || hay.includes("x11")) return "linux";
  return "other";
}

export function credentialStoreLabel(os: OsName): string {
  if (os === "macos") return "macOS Keychain";
  if (os === "windows") return "Windows Credential Manager";
  return "macOS Keychain or Windows Credential Manager";
}

export function configDirHint(os: OsName): string {
  if (os === "macos") return "~/Library/Application Support/dev.lark.desktop";
  if (os === "windows") return "%APPDATA%\\dev.lark.desktop";
  return "Shown in Settings when the desktop app is running";
}

export function notificationNote(os: OsName): string {
  if (os === "macos") {
    return "macOS asks once for notification permission. Alerts show as banners and in Notification Center.";
  }
  if (os === "windows") {
    return "Windows shows toasts in Action Center. Focus assist and quiet hours can hide them.";
  }
  return "Native notifications are available in the macOS and Windows apps.";
}

export function fontStack(family: string): string {
  switch (family) {
    case "system":
      return 'system-ui, "Segoe UI", sans-serif';
    case "serif":
      return '"Iowan Old Style", Palatino, Georgia, serif';
    case "mono":
      return '"SF Mono", "Cascadia Mono", Consolas, ui-monospace, monospace';
    default:
      return '"Inter", "Segoe UI", system-ui, sans-serif';
  }
}

export interface PlatformInfo {
  os: OsName;
  credentialStore: string;
  configDir: string;
  themesDir: string;
  pluginsDir: string;
  clipsDir: string;
  configFile: string;
  notificationNote: string;
}

export function browserPlatform(): PlatformInfo {
  const os = detectOs(navigator.userAgent, navigator.platform);
  const dir = configDirHint(os);
  const sep = os === "windows" ? "\\" : "/";
  return {
    os,
    credentialStore: credentialStoreLabel(os),
    configDir: dir,
    themesDir: `${dir}${sep}themes`,
    pluginsDir: `${dir}${sep}plugins`,
    clipsDir: `${dir}${sep}clips`,
    configFile: `${dir}${sep}config.toml`,
    notificationNote: notificationNote(os),
  };
}
