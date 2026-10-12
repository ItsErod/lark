import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

// Printed in this order. Empty sections are omitted.
export const SECTION_ORDER = [
  "✨ Added",
  "🔧 Changed",
  "🐛 Fixed",
  "🗑️ Removed",
  "⚡ Performance",
  "🔒 Security",
];

const TITLE_RULES = [
  [/^fix(?:es|ed)?\b/i, "🐛 Fixed"],
  [/^bug\b/i, "🐛 Fixed"],
  [/^add(?:s|ed)?\b/i, "✨ Added"],
  [/^feat(?:ure)?\b/i, "✨ Added"],
  [/^(?:remove|removes|removed|drop|drops|dropped|delete|deletes|deleted)\b/i, "🗑️ Removed"],
  [/^(?:perf|performance|faster|speed)\b/i, "⚡ Performance"],
  [/^sec(?:urity)?\b/i, "🔒 Security"],
  [/^(?:change|changes|changed|update|updates|updated)\b/i, "🔧 Changed"],
];

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseReleaseConfig(text) {
  const excludeLabels = [];
  const categories = [];
  let section = null;
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    if (/^changelog:/.test(line)) continue;
    if (/^ {2}exclude:/.test(line)) {
      section = "exclude";
      current = null;
      continue;
    }
    if (/^ {2}categories:/.test(line)) {
      section = "categories";
      current = null;
      continue;
    }
    if (section === "exclude" && /^ {6}- /.test(line)) {
      excludeLabels.push(unquote(line.trim().slice(2)));
      continue;
    }
    if (section === "categories" && /^ {4}- title:/.test(line)) {
      const title = unquote(line.slice(line.indexOf(":") + 1));
      current = { title, labels: [] };
      categories.push(current);
      continue;
    }
    if (current && /^ {8}- /.test(line)) {
      current.labels.push(unquote(line.trim().slice(2)));
    }
  }
  return { excludeLabels, categories };
}

export function versionParts(tag) {
  return tag.replace(/^v/, "").split(".").map((part) => Number(part) || 0);
}

export function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function previousVersionTag(tags, current) {
  const sorted = tags.filter((tag) => /^v\d+(?:\.\d+)*$/.test(tag)).sort(compareVersions);
  const index = sorted.indexOf(current);
  if (index <= 0) return null;
  return sorted[index - 1];
}

export function sentenceFromTitle(title) {
  const text = title.replace(/\s+/g, " ").trim();
  if (!text) return "Update Lark.";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function categoryFromTitle(title, config) {
  const known = new Set(config.categories.map((category) => category.title));
  for (const [pattern, section] of TITLE_RULES) {
    if (pattern.test(title.trim()) && known.has(section)) return section;
  }
  return null;
}

function labelNames(labels) {
  return (labels || []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

export function classifyEntry(entry, config) {
  const names = labelNames(entry.labels);
  if (names.some((name) => config.excludeLabels.includes(name))) return null;
  for (const category of config.categories) {
    if (category.labels.includes("*")) continue;
    if (names.some((name) => category.labels.includes(name))) return category.title;
  }
  if (names.length === 0) {
    const guessed = categoryFromTitle(entry.title, config);
    if (guessed) return guessed;
  }
  const fallback = config.categories.find((category) => category.labels.includes("*"));
  return fallback ? fallback.title : "🔧 Changed";
}

export function groupItems(items, config) {
  const titles = [];
  const seen = new Set();
  for (const title of SECTION_ORDER) {
    titles.push(title);
    seen.add(title);
  }
  for (const category of config.categories) {
    if (!seen.has(category.title)) {
      titles.push(category.title);
      seen.add(category.title);
    }
  }
  const grouped = new Map(titles.map((title) => [title, []]));
  for (const item of items) {
    if (!grouped.has(item.section)) grouped.set(item.section, []);
    grouped.get(item.section).push(item);
  }
  return [...grouped.entries()]
    .filter(([, sectionItems]) => sectionItems.length > 0)
    .map(([title, sectionItems]) => ({ title, items: sectionItems }));
}

function firstClause(sentence) {
  const text = sentence.replace(/[.]+$/, "").trim();
  const comma = text.indexOf(",");
  return comma > 24 ? text.slice(0, comma) : text;
}

function joinAnd(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

export function summaryLine(items) {
  if (items.length === 0) return "No changes since the previous release.";
  if (items.length === 1) return items[0].sentence;
  const clauses = items.slice(0, 3).map((item, index) => {
    const clause = firstClause(item.sentence);
    if (index === 0) return clause.charAt(0).toUpperCase() + clause.slice(1);
    return clause.charAt(0).toLowerCase() + clause.slice(1);
  });
  const more = items.length - clauses.length;
  let line = joinAnd(clauses);
  if (more > 0) line += `, plus ${more} more`;
  if (!/[.!?]$/.test(line)) line += ".";
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export function renderNotes(summary, groups) {
  const lines = [summary, ""];
  for (const group of groups) {
    lines.push(`### ${group.title}`, "");
    for (const item of group.items) {
      lines.push(`- ${item.sentence} (${item.link})`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function buildReleaseNotes({ entries, config }) {
  const items = [];
  const seenPulls = new Set();
  for (const entry of entries) {
    if (entry.number) {
      if (seenPulls.has(entry.number)) continue;
      seenPulls.add(entry.number);
    }
    const section = classifyEntry(entry, config);
    if (!section) continue;
    const sentence = sentenceFromTitle(entry.title);
    const link = entry.number
      ? `[#${entry.number}](${entry.url})`
      : `[\`${String(entry.sha).slice(0, 9)}\`](${entry.url})`;
    items.push({ section, sentence, link, title: entry.title });
  }
  const groups = groupItems(items, config);
  const summary = summaryLine(items);
  return { summary, groups, items, body: renderNotes(summary, groups) };
}

export function changelogHeading(tag, repo, date) {
  const version = tag.replace(/^v/, "");
  return `## [${version}](https://github.com/${repo}/releases/tag/${tag}) — ${date}`;
}

export function prependChangelog(existing, { tag, repo, date, notes }) {
  const source = existing ?? "";
  if (source.includes(`releases/tag/${tag})`)) return source;
  const heading = changelogHeading(tag, repo, date);
  const block = `${heading}\n\n${notes.trim()}\n\n`;
  const index = source.search(/^## /m);
  if (index === -1) {
    const base = source.trimEnd();
    return `${base}${base ? "\n\n" : ""}${block}`;
  }
  const head = source.slice(0, index).replace(/\s*$/, "\n\n");
  return `${head}${block}${source.slice(index)}`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function commitPullNumber(subject) {
  const merge = /^Merge pull request #(\d+)\b/.exec(subject);
  if (merge) return Number(merge[1]);
  const suffix = /\(#(\d+)\)\s*$/.exec(subject);
  if (suffix) return Number(suffix[1]);
  return null;
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lark-release-notes",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub ${response.status} for ${path}: ${detail.slice(0, 180)}`);
  }
  return response.json();
}

function choosePull(pulls, sha) {
  if (!pulls?.length) return null;
  return pulls.find((pull) => pull.merge_commit_sha === sha) || (pulls.length === 1 ? pulls[0] : null);
}

export async function entriesBetween({ repo, previous, tag, token }) {
  const range = previous ? `${previous}..${tag}` : tag;
  const log = git(["log", "--first-parent", "--reverse", "--pretty=format:%H%x09%s", range]);
  if (!log) return [];
  const commits = log.split("\n").filter(Boolean).map((line) => {
    const tab = line.indexOf("\t");
    return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
  });
  const entries = [];
  for (const commit of commits) {
    const pulls = await github(`/repos/${repo}/commits/${commit.sha}/pulls`, token);
    const pull = choosePull(pulls, commit.sha);
    if (pull) {
      entries.push({
        number: pull.number,
        title: pull.title,
        labels: (pull.labels || []).map((label) => label.name),
        url: pull.html_url,
        sha: commit.sha,
      });
      continue;
    }
    const number = commitPullNumber(commit.subject);
    if (number) {
      const fetched = await github(`/repos/${repo}/pulls/${number}`, token);
      if (fetched) {
        entries.push({
          number: fetched.number,
          title: fetched.title,
          labels: (fetched.labels || []).map((label) => label.name),
          url: fetched.html_url,
          sha: commit.sha,
        });
        continue;
      }
    }
    entries.push({
      number: null,
      title: commit.subject,
      labels: [],
      url: `https://github.com/${repo}/commit/${commit.sha}`,
      sha: commit.sha,
    });
  }
  return entries;
}

export async function generateNotes({ tag, repo, token, configText }) {
  if (!/^v\d+(?:\.\d+)*$/.test(tag)) {
    throw new Error(`Release tag must look like v2.4.5, got ${tag}`);
  }
  const config = parseReleaseConfig(configText);
  const tags = git(["tag", "--list", "v*"]).split("\n").filter(Boolean);
  const previous = previousVersionTag(tags, tag);
  const entries = await entriesBetween({ repo, previous, tag, token });
  return buildReleaseNotes({ entries, config });
}

function writeGithubOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  let delimiter = `LARK_${crypto.randomUUID().replace(/-/g, "")}`;
  while (value.includes(delimiter)) delimiter += "x";
  const body = value.endsWith("\n") ? value : `${value}\n`;
  appendFileSync(file, `${name}<<${delimiter}\n${body}${delimiter}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--prepend") {
    const changelogPath = args[1];
    const notesFlag = args.indexOf("--notes");
    const dateFlag = args.indexOf("--date");
    if (!changelogPath || notesFlag === -1 || !args[notesFlag + 1]) {
      throw new Error("Usage: release-notes.mjs --prepend CHANGELOG.md --notes notes.md [--date YYYY-MM-DD]");
    }
    const tag = process.env.LARK_TAG || "";
    const repo = process.env.GITHUB_REPOSITORY || "";
    if (!tag || !repo) throw new Error("LARK_TAG and GITHUB_REPOSITORY are required");
    const date = (dateFlag === -1 ? "" : args[dateFlag + 1]) || new Date().toISOString().slice(0, 10);
    const existing = readFileSync(changelogPath, "utf8");
    const notes = readFileSync(args[notesFlag + 1], "utf8");
    const next = prependChangelog(existing, { tag, repo, date, notes });
    if (next !== existing) writeFileSync(changelogPath, next);
    return;
  }

  const tag = process.env.LARK_TAG || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!tag || !repo || !token) {
    throw new Error("LARK_TAG, GITHUB_REPOSITORY, and GITHUB_TOKEN are required");
  }
  const configText = readFileSync(new URL("../release.yml", import.meta.url), "utf8");
  const notes = await generateNotes({ tag, repo, token, configText });
  if (args.includes("--github-output")) {
    writeGithubOutput("body", notes.body);
    writeFileSync("/tmp/lark-release-notes.md", notes.body);
    return;
  }
  process.stdout.write(notes.body);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
