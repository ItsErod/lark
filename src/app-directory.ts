import { bitsOf, PERMISSIONS } from "./server-model";

/** App Directory install choices. Rust builds the request and refuses anything this screen would only link out. */

export const CUSTOM_INSTALL_REASON = "This app uses its own install page. Lark opens it in the browser and does not send your Discord token.";
export const ACCOUNT_SCOPE_REASON = "This app asks for account access beyond adding a bot. Lark opens Discord's install page and does not send your token there.";
export const NO_INSTALL_REASON = "This app does not publish an in-app install. Continue in the App Directory.";
export const UNSAFE_INSTALL_REASON = "This app's install page is not a safe link. Continue in the App Directory. Lark does not send your token there.";
export const CAPTCHA_REASON = "Discord asked for a captcha. Lark does not solve captchas. Continue on Discord to install.";

const GUILD_SCOPES = new Set(["bot", "applications.commands", "applications.commands.permissions.update"]);

export interface DirectoryApp {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  bannerUrl: string;
  guildCount: number;
  permissions: string;
  scopes: string[];
  customInstallUrl: string;
  customInstallBlocked: boolean;
  categories: string[];
}

export type InstallChoice =
  | { kind: "authorize"; permissions: string; scopes: string[]; labels: string[] }
  | { kind: "link"; url: string; reason: string };

export type DirectoryMode = "loading" | "error" | "browse" | "confirm";

export function directoryMode(input: { loading: boolean; error: string; confirm: boolean }): DirectoryMode {
  if (input.confirm) return "confirm";
  if (input.loading) return "loading";
  if (input.error) return "error";
  return "browse";
}

export function installChoice(app: DirectoryApp, guildId: string): InstallChoice {
  const id = app.id.trim();
  if (!snowflake(id)) {
    return { kind: "link", url: "https://discord.com/application-directory", reason: NO_INSTALL_REASON };
  }
  if (app.customInstallBlocked || app.customInstallUrl.trim()) {
    const url = safeHttps(app.customInstallUrl);
    if (url && !app.customInstallBlocked) return { kind: "link", url, reason: CUSTOM_INSTALL_REASON };
    return { kind: "link", url: `https://discord.com/application-directory/${id}`, reason: UNSAFE_INSTALL_REASON };
  }
  const scopes = app.scopes.map((scope) => scope.trim()).filter(Boolean);
  const guildOnly = scopes.length > 0 && scopes.every((scope) => GUILD_SCOPES.has(scope));
  if (guildOnly && snowflake(guildId.trim())) {
    const permissions = permissionDigits(app.permissions);
    return { kind: "authorize", permissions, scopes, labels: permissionLabels(permissions) };
  }
  const reason = scopes.some((scope) => !GUILD_SCOPES.has(scope)) ? ACCOUNT_SCOPE_REASON : NO_INSTALL_REASON;
  return { kind: "link", url: oauthUrl(id, guildId, app.permissions, scopes), reason };
}

export function permissionLabels(bits: string): string[] {
  const value = bitsOf(permissionDigits(bits));
  if (value === 0n) return ["No extra permissions"];
  const names = PERMISSIONS.filter((item) => (value & item.flag) === item.flag).map((item) => item.label);
  return names.length ? names : ["Custom permissions"];
}

export function guildCountLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "New to servers";
  const value = Math.trunc(count);
  if (value === 1) return "In 1 server";
  if (value < 1000) return `In ${value} servers`;
  const scaled = value / 1000;
  const text = scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1);
  return `In ${text.replace(/\.0$/, "")}K servers`;
}

export function moreApps(page: number, pages: number): boolean {
  return page > 0 && pages > page;
}

export function mediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    if (parsed.hostname !== "cdn.discordapp.com" && parsed.hostname !== "media.discordapp.net") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function captchaNote(): string {
  return CAPTCHA_REASON;
}

function oauthUrl(applicationId: string, guildId: string, permissions: string, scopes: string[]): string {
  const scope = (scopes.length ? scopes : ["bot", "applications.commands"]).join(" ");
  const params = new URLSearchParams();
  params.set("client_id", applicationId);
  params.set("scope", scope);
  params.set("permissions", permissionDigits(permissions));
  params.set("disable_guild_select", "true");
  params.set("integration_type", "0");
  if (snowflake(guildId.trim())) params.set("guild_id", guildId.trim());
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function safeHttps(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const query = url.search.toLowerCase();
    if (query.includes("token=") || query.includes("password=")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function permissionDigits(raw: string): string {
  const text = raw.trim();
  return /^\d{1,20}$/.test(text) ? text : "0";
}

function snowflake(value: string): boolean {
  return /^\d{5,22}$/.test(value);
}
