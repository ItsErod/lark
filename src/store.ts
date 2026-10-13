/** Store catalog, hash checks, and install links. Downloaded scripts still run through the plugin API. */

export const STORE_PAGE_URL = "https://itserod.github.io/lark/store/";
export const STORE_INDEX_URL = "https://itserod.github.io/lark/store/index.json";
export const STORE_ROOT = "https://itserod.github.io/lark/store/";
export const APP_VERSION = "3.0.2";
export const STORE_LOCAL_KEY = "lark.store.v1";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const HASH = /^[a-f0-9]{64}$/;

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  minLark: string;
  entry: string;
  icon: string;
  changelog: string;
  sha256: string;
  bytes: number;
  file: string;
  download: string;
  swatches: string[];
}

export interface StoreIndex {
  version: 1;
  plugins: StoreItem[];
  themes: StoreItem[];
}

export interface InstalledRecord {
  id: string;
  kind: "plugin" | "theme";
  name: string;
  description: string;
  version: string;
  sha256: string;
}

export interface LocalPlugin {
  version: string;
  sha256: string;
  source: string;
  name: string;
  description: string;
}

export interface LocalTheme {
  version: string;
  sha256: string;
  css: string;
  name: string;
  description: string;
}

export interface LocalStore {
  plugins: Record<string, LocalPlugin>;
  themes: Record<string, LocalTheme>;
}

export function parseStoreIndex(data: unknown): StoreIndex | null {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const record = data as { version?: unknown; plugins?: unknown; themes?: unknown };
  if (record.version !== 1 || !Array.isArray(record.plugins) || !Array.isArray(record.themes)) return null;
  const plugins = record.plugins.map((item) => parseItem(item, "plugin"));
  const themes = record.themes.map((item) => parseItem(item, "theme"));
  if (plugins.some((item) => !item) || themes.some((item) => !item)) return null;
  const ids = new Set<string>();
  for (const item of [...plugins, ...themes]) {
    if (!item || ids.has(item.id)) return null;
    ids.add(item.id);
  }
  return { version: 1, plugins: plugins as StoreItem[], themes: themes as StoreItem[] };
}

export function availableStoreItems(
  index: StoreIndex,
  installed: readonly { id: string; kind: string }[],
  kind: "plugin" | "theme",
): StoreItem[] {
  const have = new Set(installed.filter((item) => item.kind === kind).map((item) => item.id));
  const list = kind === "plugin" ? index.plugins : index.themes;
  return list.filter((item) => !have.has(item.id));
}

export function findStoreItem(index: StoreIndex, id: string): { kind: "plugin" | "theme"; item: StoreItem } | null {
  const plugin = index.plugins.find((item) => item.id === id);
  const theme = index.themes.find((item) => item.id === id);
  if (plugin && theme) return null;
  if (plugin) return { kind: "plugin", item: plugin };
  if (theme) return { kind: "theme", item: theme };
  return null;
}

export function entryUrl(item: StoreItem): string | null {
  if (!item.file || item.file.includes("..") || item.file.includes("\\") || item.file.startsWith("/")) return null;
  const url = `${STORE_ROOT}${item.file}`;
  if (!url.startsWith(STORE_ROOT)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://itserod.github.io") return null;
    if (!parsed.pathname.startsWith("/lark/store/")) return null;
  } catch {
    return null;
  }
  return url;
}

export function larkVersionOk(minLark: string, appVersion: string): boolean {
  const required = versionParts(minLark);
  const current = versionParts(appVersion);
  if (!required || !current) return false;
  return compareParts(current, required) >= 0;
}

export function newerVersion(installed: string, remote: string): boolean {
  const left = versionParts(installed);
  const right = versionParts(remote);
  if (!left || !right) return false;
  return compareParts(right, left) > 0;
}

export function hashMatches(actual: string, expected: string): boolean {
  return HASH.test(actual) && HASH.test(expected) && actual === expected;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function acceptBytes(item: StoreItem, bytes: Uint8Array, hash: string): string | null {
  const limit = item.entry === "theme.css" ? 16 * 1024 : 128 * 1024;
  if (bytes.byteLength === 0 || bytes.byteLength > limit) return "That download is the wrong size.";
  if (bytes.byteLength !== item.bytes) return "That download is the wrong size.";
  if (bytes.includes(0)) return "That download is not text.";
  if (!hashMatches(hash, item.sha256)) return "The download does not match the store hash.";
  return null;
}

export function parseInstallUrl(url: string): string | null {
  if (url.includes("..") || url.includes("\\") || url.includes("@") || /%2e/i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "lark:") return null;
  const path = `${parsed.hostname}${parsed.pathname}`.replace(/^\/+|\/+$/g, "");
  const match = /^install\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
  return match ? match[1] : null;
}

export function emptyLocalStore(): LocalStore {
  return { plugins: {}, themes: {} };
}

export function readLocalStore(raw: string | null): LocalStore {
  if (!raw) return emptyLocalStore();
  try {
    const data = JSON.parse(raw) as { plugins?: unknown; themes?: unknown };
    return {
      plugins: cleanPlugins(data.plugins),
      themes: cleanThemes(data.themes),
    };
  } catch {
    return emptyLocalStore();
  }
}

export function writeLocalStore(store: LocalStore): string {
  return JSON.stringify(store);
}

function parseItem(value: unknown, kind: "plugin" | "theme"): StoreItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id, 64);
  const name = text(record.name, 80);
  const description = text(record.description, 240);
  const author = text(record.author, 80);
  const version = text(record.version, 32);
  const category = text(record.category, 32);
  const minLark = text(record.minLark, 32);
  const entry = text(record.entry, 64);
  const icon = text(record.icon, 32);
  const changelog = text(record.changelog, 500);
  const sha256 = text(record.sha256, 64);
  const file = text(record.file, 160);
  const download = text(record.download, 160);
  if (!id || !SLUG.test(id) || !name || !description || !author || !version || !category || !minLark || !entry || !icon || !changelog) return null;
  if (!VERSION.test(version) || !VERSION.test(minLark) || !sha256 || !HASH.test(sha256) || !file || !download) return null;
  if (kind === "plugin" && (entry !== "plugin.js" || file !== `plugins/${id}/plugin.js`)) return null;
  if (kind === "theme" && (entry !== "theme.css" || file !== `themes/${id}/theme.css`)) return null;
  if (download !== `downloads/${id}.zip`) return null;
  if (typeof record.bytes !== "number" || !Number.isInteger(record.bytes) || record.bytes < 1) return null;
  const limit = kind === "theme" ? 16 * 1024 : 128 * 1024;
  if (record.bytes > limit) return null;
  const swatches = Array.isArray(record.swatches)
    ? record.swatches.filter((item): item is string => typeof item === "string" && /^#[0-9a-fA-F]{3,8}$/.test(item)).slice(0, 6)
    : [];
  return {
    id,
    name,
    description,
    author,
    version,
    category,
    minLark,
    entry,
    icon,
    changelog,
    sha256,
    bytes: record.bytes,
    file,
    download,
    swatches,
  };
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return "";
  return trimmed;
}

function versionParts(value: string): [number, number, number] | null {
  const match = VERSION.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareParts(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function cleanPlugins(value: unknown): Record<string, LocalPlugin> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, LocalPlugin> = {};
  for (const [id, item] of Object.entries(value)) {
    if (!SLUG.test(id) || !item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const source = typeof record.source === "string" ? record.source : "";
    const sha256 = typeof record.sha256 === "string" ? record.sha256 : "";
    const version = typeof record.version === "string" ? record.version : "";
    if (!source || source.length > 128 * 1024 || !HASH.test(sha256) || !VERSION.test(version)) continue;
    out[id] = {
      source,
      sha256,
      version,
      name: text(record.name, 80) || id,
      description: text(record.description, 240),
    };
  }
  return out;
}

function cleanThemes(value: unknown): Record<string, LocalTheme> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, LocalTheme> = {};
  for (const [id, item] of Object.entries(value)) {
    if (!SLUG.test(id) || !item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const css = typeof record.css === "string" ? record.css : "";
    const sha256 = typeof record.sha256 === "string" ? record.sha256 : "";
    const version = typeof record.version === "string" ? record.version : "";
    if (!css || css.length > 16 * 1024 || !HASH.test(sha256) || !VERSION.test(version)) continue;
    out[id] = {
      css,
      sha256,
      version,
      name: text(record.name, 80) || id,
      description: text(record.description, 240),
    };
  }
  return out;
}
