# Changelog

Brief notes for each Lark version, newest first. Installers for published releases are on the [Releases](https://github.com/ItsErod/lark/releases) page.

## Unreleased

Opening a text channel paints the newest 20 messages first, from cache when a page is already stored, then catches up with Discord. Older history loads 20 at a time when the reader nears the top, without jumping the line they were on. Images and embeds wait until they are near the screen, attachment links keep their CDN URL, proxy URL, and expiry query, and compact rows keep the author and the message on one grid.

Voice calls complete the DAVE MLS handshake and encrypt each Opus frame before the transport cipher. Joining a channel no longer sends audio while the speaking flag is 0, which was closing the voice gateway and dropping the member. Settings → Voice & Video → Copy voice diagnostics lists the handshake, close codes, and packet counters.

[v1](https://github.com/ItsErod/lark/tree/v1), [v2](https://github.com/ItsErod/lark/tree/v2), and [v2.1](https://github.com/ItsErod/lark/tree/v2.1) are git tags with no GitHub Release. The installer jobs for those tags failed. Published installers start at [v2.1.1](https://github.com/ItsErod/lark/releases/tag/v2.1.1).

## [2.4.3](https://github.com/ItsErod/lark/releases/tag/v2.4.3) — 2026-10-08

Go Live shares a screen or window as a real stream, with quality options up to 4K. A voice call stays beside the text channel in a quiet layout, so the message list remains the chat. Windows hardware reads and Open at login use native Windows APIs, so this build no longer launches a hidden PowerShell or `reg.exe` that Defender flagged on 2.4.2.

## [2.4.2](https://github.com/ItsErod/lark/releases/tag/v2.4.2) — 2026-10-07

Voice calls use a Discord-style layout, and a custom ring flows around whoever is speaking. Clips save as MP4 and can be captured at 60, 120, or 240 fps from 720p through 2160p; the Clips view compresses a clip that is over the upload limit before it is sent. Servers and folders drag into a new order that syncs back to Discord, and Settings opens as a full-screen Discord-style layout.

## [2.4.1](https://github.com/ItsErod/lark/releases/tag/v2.4.1) — 2026-10-07

IRC messages use the full column, a message you send shows up once, and joining a voice channel completes the DAVE handshake instead of staying on reconnecting.

## [2.4.0](https://github.com/ItsErod/lark/releases/tag/v2.4.0) — 2026-10-07

A startup splash covers the window while the first connect loads servers and opens the last channel. Calls add per-person volume and a local mute, RNNoise on the microphone, and a soundboard that plays local WAV clips; profile notes stay on the Discord account, and friends who are in a game or listening to something show that activity. The voice HUD can show RAM, CPU, and FPS, Game Mode and a profile per detected game quiet the shell while a game is in front, and messages add a saved list, one-time reminders, scheduled send, streamer mode, and drafts encrypted with a key in the macOS Keychain or Windows Credential Manager.

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
