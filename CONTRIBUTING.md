# Contributing

## Release notes

Write the pull request title as one plain-English sentence. That title is the line in the release notes, with a link back to the pull request.

Pushing a `v*` tag runs `.github/scripts/release-notes.mjs`. It lists pull requests between the previous `v*` tag and the new one, then prepends the same notes to `CHANGELOG.md`. A commit on the tag that is not part of a pull request is included from its subject line.

`.github/release.yml` picks the section from labels. Earlier categories win when a pull request has more than one of these labels.

| Labels | Section |
| --- | --- |
| `security` | 🔒 Security |
| `performance` | ⚡ Performance |
| `removal`, `removed` | 🗑️ Removed |
| `bug`, `fix` | 🐛 Fixed |
| `enhancement`, `feature` | ✨ Added |
| `change`, `documentation` | 🔧 Changed |

A pull request with no label is classified from the first word of the title (`Add`, `Fix`, `Remove`, `Update`, and so on). Anything else goes under Changed. Label a version-bump or changelog-only pull request `release` (or `ignore-for-release`) so it stays out of the notes.
