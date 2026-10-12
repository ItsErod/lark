import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// The release script is plain JavaScript used by GitHub Actions.
// @ts-expect-error no declaration file for the workflow script.
import {
  SECTION_ORDER,
  buildReleaseNotes,
  compareVersions,
  parseReleaseConfig,
  prependChangelog,
  previousVersionTag,
} from "../.github/scripts/release-notes.mjs";

const configText = readFileSync(new URL("../.github/release.yml", import.meta.url), "utf8");
const config = parseReleaseConfig(configText);
const workflow = readFileSync(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

const published = [
  "v2.4.5",
  "v2.4.4",
  "v2.4.3",
  "v2.4.2",
  "v2.4.1",
  "v2.4.0",
  "v2.3.1",
  "v2.3.0",
  "v2.2.5",
  "v2.2.4",
  "v2.2.3",
  "v2.2.2",
  "v2.2.1",
  "v2.2",
  "v2.1.1",
];

describe("release note categories", () => {
  it("reads the label categories and the labels that stay out of the notes", () => {
    expect(config.excludeLabels).toEqual(["release", "ignore-for-release"]);
    expect(config.categories.map((category: { title: string }) => category.title)).toContain("✨ Added");
    expect(config.categories.some((category: { labels: string[] }) => category.labels.includes("*"))).toBe(true);
  });

  it("lets a specific label win over a broader one", () => {
    const notes = buildReleaseNotes({
      config,
      entries: [
        {
          number: 10,
          title: "Speed up channel switches",
          labels: ["enhancement", "performance"],
          url: "https://github.com/ItsErod/lark/pull/10",
          sha: "abc",
        },
        {
          number: 11,
          title: "Encrypt drafts at rest",
          labels: ["security", "enhancement"],
          url: "https://github.com/ItsErod/lark/pull/11",
          sha: "def",
        },
      ],
    });
    expect(notes.body).toContain("### ⚡ Performance");
    expect(notes.body).toContain("### 🔒 Security");
    expect(notes.body).not.toContain("### ✨ Added");
    expect(notes.body.indexOf("### ⚡ Performance")).toBeLessThan(notes.body.indexOf("### 🔒 Security"));
  });

  it("classifies an unlabeled title from its first word and drops release-only pull requests", () => {
    const notes = buildReleaseNotes({
      config,
      entries: [
        {
          number: 4,
          title: "Add a theme gallery",
          labels: [],
          url: "https://github.com/ItsErod/lark/pull/4",
          sha: "111",
        },
        {
          number: 5,
          title: "Fix Windows sign-in",
          labels: [],
          url: "https://github.com/ItsErod/lark/pull/5",
          sha: "222",
        },
        {
          number: 6,
          title: "Show the shell when the splash finishes",
          labels: [],
          url: "https://github.com/ItsErod/lark/pull/6",
          sha: "333",
        },
        {
          number: 7,
          title: "Set Lark 2.4.6 and publish the patch notes",
          labels: ["release"],
          url: "https://github.com/ItsErod/lark/pull/7",
          sha: "444",
        },
        {
          number: null,
          title: "Remove the legacy login window",
          labels: [],
          url: "https://github.com/ItsErod/lark/commit/abcdef1234567890",
          sha: "abcdef1234567890",
        },
      ],
    });
    expect(notes.body).toContain("### ✨ Added");
    expect(notes.body).toContain("[#4](https://github.com/ItsErod/lark/pull/4)");
    expect(notes.body).toContain("### 🐛 Fixed");
    expect(notes.body).toContain("Fix Windows sign-in. ([#5](https://github.com/ItsErod/lark/pull/5))");
    expect(notes.body).toContain("### 🔧 Changed");
    expect(notes.body).toContain("Show the shell when the splash finishes.");
    expect(notes.body).toContain("### 🗑️ Removed");
    expect(notes.body).toContain("[`abcdef123`](https://github.com/ItsErod/lark/commit/abcdef1234567890)");
    expect(notes.body).not.toContain("2.4.6");
    expect(notes.body).not.toContain("### ⚡ Performance");
    expect(notes.body).not.toContain("### 🔒 Security");
  });

  it("summarizes one change as that sentence and several as a short line", () => {
    const one = buildReleaseNotes({
      config,
      entries: [
        {
          number: 1,
          title: "Fix the blank startup window",
          labels: ["bug"],
          url: "https://github.com/ItsErod/lark/pull/1",
          sha: "a",
        },
      ],
    });
    expect(one.summary).toBe("Fix the blank startup window.");
    expect(one.body.startsWith("Fix the blank startup window.\n")).toBe(true);

    const many = buildReleaseNotes({
      config,
      entries: [1, 2, 3, 4].map((number) => ({
        number,
        title: `Add feature ${number}`,
        labels: ["enhancement"],
        url: `https://github.com/ItsErod/lark/pull/${number}`,
        sha: String(number),
      })),
    });
    expect(many.summary).toBe("Add feature 1, add feature 2, and add feature 3, plus 1 more.");
  });

  it("orders version tags and finds the previous release", () => {
    expect(compareVersions("v2.2", "v2.2.0")).toBe(0);
    expect(compareVersions("v2.1.1", "v2.2")).toBeLessThan(0);
    expect(compareVersions("v2.10.0", "v2.9.0")).toBeGreaterThan(0);
    const tags = ["v2.2", "v1", "v2.1.1", "v2.4.5", "v2.1", "not-a-release"];
    expect(previousVersionTag(tags, "v2.2")).toBe("v2.1.1");
    expect(previousVersionTag(tags, "v1")).toBeNull();
  });

  it("prepends a new version and leaves an existing one untouched", () => {
    const notes = "Opening Lark shows the shell.\n\n### 🐛 Fixed\n\n- The splash gives up. ([#52](https://github.com/ItsErod/lark/pull/52))\n";
    const original = "# Changelog\n\nIntro.\n\n## [2.4.4](https://github.com/ItsErod/lark/releases/tag/v2.4.4) — 2026-10-08\n\nOlder.\n";
    const next = prependChangelog(original, {
      tag: "v2.4.5",
      repo: "ItsErod/lark",
      date: "2026-10-12",
      notes,
    });
    expect(next.indexOf("releases/tag/v2.4.5)")).toBeLessThan(next.indexOf("releases/tag/v2.4.4)"));
    expect(next).toContain("### 🐛 Fixed");
    expect(prependChangelog(next, { tag: "v2.4.5", repo: "ItsErod/lark", date: "2026-10-13", notes: "nope" })).toBe(next);
  });
});

describe("changelog and release workflow", () => {
  it("documents every published release in the same section order", () => {
    for (const tag of published) {
      expect(changelog).toContain(`https://github.com/ItsErod/lark/releases/tag/${tag})`);
    }
    const sections = changelog.split(/^## /m).slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(published.length);
    for (const section of sections) {
      const headers = [...section.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
      expect(headers.length).toBeGreaterThan(0);
      const standard = headers.filter((header) => header !== "Known limitations");
      if (headers.includes("Known limitations")) {
        expect(headers.at(-1)).toBe("Known limitations");
      }
      const indexes = standard.map((header) => SECTION_ORDER.indexOf(header));
      expect(indexes.every((index) => index >= 0)).toBe(true);
      expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
      expect(section).toMatch(/^- .+\(\[.+\]\(https:\/\/github.com\/ItsErod\/lark\/.+\).*\)$/m);
    }
  });

  it("keeps the installer build and feeds it generated notes on a tag", () => {
    expect(workflow).toContain("tauri-apps/tauri-action@v0");
    expect(workflow).toContain("node .github/scripts/set-release-version.mjs");
    expect(workflow).toContain("universal-apple-darwin");
    expect(workflow).toContain("x86_64-pc-windows-msvc");
    expect(workflow).toContain("--bundles nsis,msi");
    expect(workflow).toContain("releaseDraft: false");
    expect(workflow).toContain("prerelease: false");
    expect(workflow).toContain("node .github/scripts/release-notes.mjs --github-output");
    expect(workflow).toContain("node .github/scripts/release-notes.mjs --prepend");
    expect(workflow).toContain("releaseBody: ${{ needs.release-notes.outputs.body || 'Unsigned installers for this tag.' }}");
    expect(workflow).toContain("cargo test -p lark-core");
    const build = workflow.slice(workflow.indexOf("\n  build:"));
    expect(build).toContain("contents: write");
    expect(build).toContain("fail-fast: false");
  });
});
