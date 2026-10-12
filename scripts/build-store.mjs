import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeDir = path.join(root, "store");
const indexPath = path.join(storeDir, "index.json");

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const ICONS = new Set([
  "archive",
  "at",
  "bell",
  "bolt",
  "bookmark",
  "clock",
  "code",
  "contrast",
  "eye-off",
  "fold",
  "image",
  "keyboard",
  "languages",
  "link",
  "lock",
  "moon",
  "music",
  "palette",
  "pencil",
  "phone",
  "pin",
  "shield",
  "smile",
  "snow",
  "spark",
  "sun",
  "terminal",
  "volume",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file}: ${error instanceof Error ? error.message : "invalid json"}`);
  }
}

function field(manifest, key, max) {
  const value = manifest[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    fail(`${manifest.id || "item"}: ${key} must be a short string`);
  }
  return value.trim();
}

function swatches(css) {
  const keys = ["--bg-0", "--bg-2", "--accent", "--text"];
  const out = [];
  for (const key of keys) {
    const match = new RegExp(`${key}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
    if (match) out.push(match[1].toLowerCase());
  }
  return out;
}

function loadKind(kind) {
  const dir = path.join(storeDir, kind);
  const folders = readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory()).sort();
  const items = [];
  for (const id of folders) {
    if (!SLUG.test(id)) fail(`${kind}/${id}: folder name is not a slug`);
    const folder = path.join(dir, id);
    const manifest = readJson(path.join(folder, "manifest.json"));
    if (manifest.id !== id) fail(`${kind}/${id}: manifest id does not match the folder`);
    const entry = field(manifest, "entry", 64);
    if (entry.includes("/") || entry.includes("\\") || entry.includes("..")) fail(`${id}: entry must be a file name`);
    const entryPath = path.join(folder, entry);
    if (!statSync(entryPath).isFile()) fail(`${id}: missing ${entry}`);
    const bytes = readFileSync(entryPath);
    if (bytes.includes(0)) fail(`${id}: entry is not text`);
    const limit = kind === "themes" ? 16 * 1024 : 128 * 1024;
    if (bytes.length > limit) fail(`${id}: entry is too large`);
    const name = field(manifest, "name", 80);
    const description = field(manifest, "description", 240);
    const author = field(manifest, "author", 80);
    const version = field(manifest, "version", 32);
    const category = field(manifest, "category", 32);
    const minLark = field(manifest, "minLark", 32);
    const changelog = field(manifest, "changelog", 500);
    const icon = field(manifest, "icon", 32);
    if (!VERSION.test(version)) fail(`${id}: version must be major.minor.patch`);
    if (!VERSION.test(minLark)) fail(`${id}: minLark must be major.minor.patch`);
    if (!ICONS.has(icon)) fail(`${id}: unknown icon ${icon}`);
    if (kind === "plugins" && entry !== "plugin.js") fail(`${id}: plugin entry must be plugin.js`);
    if (kind === "themes" && entry !== "theme.css") fail(`${id}: theme entry must be theme.css`);
    const text = bytes.toString("utf8");
    items.push({
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
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      file: `${kind}/${id}/${entry}`,
      download: `downloads/${id}.zip`,
      swatches: kind === "themes" ? swatches(text) : [],
      folder,
      entryBytes: bytes,
      manifestBytes: readFileSync(path.join(folder, "manifest.json")),
    });
  }
  return items;
}

function zipStore(files) {
  const parts = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data) >>> 0;
    const size = file.data.length;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    parts.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

function publicItem(item) {
  const copy = {
    id: item.id,
    name: item.name,
    description: item.description,
    author: item.author,
    version: item.version,
    category: item.category,
    minLark: item.minLark,
    entry: item.entry,
    icon: item.icon,
    changelog: item.changelog,
    sha256: item.sha256,
    bytes: item.bytes,
    file: item.file,
    download: item.download,
  };
  if (item.swatches.length) copy.swatches = item.swatches;
  if (!HASH.test(copy.sha256)) fail(`${item.id}: hash was not generated`);
  return copy;
}

function buildIndex() {
  const plugins = loadKind("plugins");
  const themes = loadKind("themes");
  const ids = new Set();
  for (const item of [...plugins, ...themes]) {
    if (ids.has(item.id)) fail(`${item.id}: id is used by both a plugin and a theme`);
    ids.add(item.id);
  }
  return {
    version: 1,
    plugins: plugins.map(publicItem),
    themes: themes.map(publicItem),
    packed: [...plugins, ...themes],
  };
}

function indexText(index) {
  return `${JSON.stringify({ version: index.version, plugins: index.plugins, themes: index.themes }, null, 2)}\n`;
}

function publish(target) {
  const index = buildIndex();
  const dest = path.resolve(target);
  const storeOut = path.join(dest, "store");
  rmSync(path.join(storeOut, "plugins"), { recursive: true, force: true });
  rmSync(path.join(storeOut, "themes"), { recursive: true, force: true });
  rmSync(path.join(storeOut, "downloads"), { recursive: true, force: true });
  mkdirSync(path.join(storeOut, "downloads"), { recursive: true });
  for (const item of index.packed) {
    const folder = path.join(storeOut, path.dirname(item.file));
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(storeOut, item.file), item.entryBytes);
    writeFileSync(path.join(folder, "manifest.json"), item.manifestBytes);
    const zip = zipStore([
      { name: "manifest.json", data: item.manifestBytes },
      { name: item.entry, data: item.entryBytes },
    ]);
    writeFileSync(path.join(storeOut, item.download), zip);
  }
  writeFileSync(path.join(storeOut, "index.json"), indexText(index));
  console.log(`published ${index.plugins.length} plugins and ${index.themes.length} themes to ${storeOut}`);
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const publishAt = args.indexOf("--publish");
const index = buildIndex();
const next = indexText(index);
if (check) {
  const current = readFileSync(indexPath, "utf8");
  if (current !== next) fail("store/index.json is stale. Run node scripts/build-store.mjs");
  console.log(`store index matches ${index.plugins.length} plugins and ${index.themes.length} themes`);
} else if (publishAt === -1) {
  writeFileSync(indexPath, next);
  console.log(`wrote store/index.json (${index.plugins.length} plugins, ${index.themes.length} themes)`);
}
if (publishAt !== -1) {
  const target = args[publishAt + 1];
  if (!target) fail("--publish needs a directory");
  publish(target);
}
