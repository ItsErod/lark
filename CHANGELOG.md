# Changelog

Brief notes for each Lark version, newest first. Installers for published releases are on the [Releases](https://github.com/ItsErod/lark/releases) page.

[v1](https://github.com/ItsErod/lark/tree/v1), [v2](https://github.com/ItsErod/lark/tree/v2), and [v2.1](https://github.com/ItsErod/lark/tree/v2.1) are git tags with no GitHub Release. The installer jobs for those tags failed. Published installers start at [v2.1.1](https://github.com/ItsErod/lark/releases/tag/v2.1.1).

## [2.4.0] — unreleased

Wave 1. The voice HUD can show RAM, CPU, and FPS. Ctrl+Shift+P (⌘⇧P on macOS) toggles that strip, and Settings → Voice & Video has the same switch. Game Mode turns on when a game is in front or when you toggle it: animations stop, channel prefetch stops, and the existing polls slow down. Each detected game can remember push-to-talk, its key, and the Game Mode and overlay defaults.

## [2.3.1](https://github.com/ItsErod/lark/releases/tag/v2.3.1) — 2026-10-07

Adds an in-game voice HUD, a 30-second clip hotkey, and optional GPU, CPU temperature, and game text on a custom status. The HUD is a small always-on-top window that shows who is speaking and who is muted; it stays off until Ctrl+Shift+O (⌘⇧O on macOS) or Settings → Voice & Video, and the clip hotkey saves the last 30 seconds of a screen share or game capture. Guild channel loads no longer stampede Discord’s REST limit, and the login window skips WebView2 script while the page is still busy. Switching channels, scrolling a long history, and the voice HUD update only what changed, so those views paint from cache instead of rebuilding the window.

## [2.3.0](https://github.com/ItsErod/lark/releases/tag/v2.3.0) — 2026-10-06

Discord dark is the default theme, and the open text channel stays stable while messages load. Chat includes replies, reactions, markdown, and embeds, and the member list comes from gateway opcode 14. The app shell adds folders, badges, settings, notifications, and Ctrl+K, and a voice channel shows who is in it and carries call audio.

## [2.2.5](https://github.com/ItsErod/lark/releases/tag/v2.2.5) — 2026-10-06

Fixes Windows sign-in for the in-app window, the system browser, and QR. The Discord login window loads the login page, the browser button opens that page in the system browser, and QR shows a live code or the reason the handshake failed.

## [2.2.4](https://github.com/ItsErod/lark/releases/tag/v2.2.4) — 2026-10-06

Adds **Sign in in your browser**. Discord’s login page opens in the system browser, a one-time grant comes back to this computer, and Lark stores the session in the macOS Keychain or Windows Credential Manager. The separate in-app login window is unchanged.

## [2.2.3](https://github.com/ItsErod/lark/releases/tag/v2.2.3) — 2026-10-06

Makes the signed-in shell easier to read and keeps scrolling inside each panel. Type uses Inter at real weights, server buttons draw Discord’s icons, and the open server’s member list comes from the gateway when the REST member list is empty.

## [2.2.2](https://github.com/ItsErod/lark/releases/tag/v2.2.2) — 2026-10-06

Saves the Discord token in the macOS Keychain and Windows Credential Manager. The previous build kept the token in memory only, so the next lookup always said nothing was saved. A save that cannot be read back is reported as a failure.

## [2.2.1](https://github.com/ItsErod/lark/releases/tag/v2.2.1) — 2026-10-06

Fixes Sign in with Discord when the login page kept the session out of a simple storage read, and names the installers `Lark_2.2.1_*`. It also lets the Windows release build read the lockfile with Windows line endings, so the Windows installers upload.

## [2.2](https://github.com/ItsErod/lark/releases/tag/v2.2) — 2026-10-06

Adds Sign in with Discord (a separate login window and a mobile QR code), a theme gallery with fourteen new colour themes, and twelve plugins that stay off until Settings turns them on. Paste stays under Advanced. The files on this release are still named `Lark_0.1.0_*`.

## [2.1.1](https://github.com/ItsErod/lark/releases/tag/v2.1.1) — 2026-10-06

Fixes the macOS bundle, which pointed at a missing icon and never produced a universal disk image. The Windows job uses the WiX already on the runner. This is the first tag with published installers.

## [v2.1](https://github.com/ItsErod/lark/tree/v2.1) — 2026-10-06

Caps interface paints at the display refresh rate, up to 240 fps, and runs that clock only when something changes. The tag also publishes universal macOS and Windows installers for `v*` tags and states that those builds are unsigned. The installer jobs failed, so this tag has no GitHub Release.

## [v2](https://github.com/ItsErod/lark/tree/v2) — 2026-10-06

Adds a voice handshake and screen share that sends a frame only when the picture changes, on a faster shell. This tag also includes presence, read sync, search, threads, split view, a command palette, a theme editor, and a tray icon. Video calls are not in this version, and the installer jobs failed, so there is no GitHub Release.

## [v1](https://github.com/ItsErod/lark/tree/v1) — 2026-10-06

First version of Lark, a personal Discord client for one account on macOS and Windows. The token stays in the macOS Keychain or Windows Credential Manager, the app identifies itself as Lark, and it ships themes, remappable shortcuts, and local plugins that do not receive the token. Voice, video, and screen share are not in this version, and there is no GitHub Release for the tag.
