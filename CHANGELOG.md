# Changelog

Brief notes for each Lark version, newest first. Installers for published releases are on the [Releases](https://github.com/ItsErod/lark/releases) page.

[v1](https://github.com/ItsErod/lark/tree/v1), [v2](https://github.com/ItsErod/lark/tree/v2), and [v2.1](https://github.com/ItsErod/lark/tree/v2.1) are git tags with no GitHub Release. The installer jobs for those tags failed. Published installers start at [v2.1.1](https://github.com/ItsErod/lark/releases/tag/v2.1.1).

## [3.0.1](https://github.com/ItsErod/lark/releases/tag/v3.0.1) — 2026-10-12

A joined voice channel is audible again on Windows. Copying voice diagnostics and resizing the window work.

### 🐛 Fixed

- Windows voice opens the communications microphone and speakers, and tries a shared-mode format when the mix format is unsupported, so both directions play. ([#133](https://github.com/ItsErod/lark/pull/133))
- Copy voice diagnostics copies the handshake log and shows a Copied toast. ([#133](https://github.com/ItsErod/lark/pull/133))
- Resizing the window can read whether it is minimized. ([#133](https://github.com/ItsErod/lark/pull/133))

## [3.0.0](https://github.com/ItsErod/lark/releases/tag/v3.0.0) — 2026-10-12

Lark 3.0 is the Discord parity release: servers and settings, your account, chat, people, calls, and threads, forums, polls, events, and the inbox.

### ✨ Added

- Servers and settings cover the Discord server surface: server and channel menus, invites, and create flows; channel overview, permissions, invites, and webhooks; Server Settings for the profile, expressions, members, roles, invites, moderation, and community; member-list sort; and stage and media channels (kinds 13 and 16). ([#61](https://github.com/ItsErod/lark/pull/61), [#62](https://github.com/ItsErod/lark/pull/62), [#66](https://github.com/ItsErod/lark/pull/66), [#67](https://github.com/ItsErod/lark/pull/67), [#59](https://github.com/ItsErod/lark/pull/59))
- User settings add the Discord account pages, account switching, and keybinds, plus Developer Mode, embed, and spoiler display flags. ([#72](https://github.com/ItsErod/lark/pull/72), [#60](https://github.com/ItsErod/lark/pull/60))
- Messaging and the composer add Discord-style message tools and search filters, and the composer can open a thread or a poll. ([#73](https://github.com/ItsErod/lark/pull/73))
- Direct messages, friends, and profiles add Discord actions for the people you talk to. ([#65](https://github.com/ItsErod/lark/pull/65))
- Voice, video, and stage add desk controls, call chrome, stage chat, camera video on the voice socket, and stage commands. ([#75](https://github.com/ItsErod/lark/pull/75), [#76](https://github.com/ItsErod/lark/pull/76))
- Threads, forums, polls, events, and the inbox are in the client, with the routes that open them. ([#64](https://github.com/ItsErod/lark/pull/64), [#63](https://github.com/ItsErod/lark/pull/63))
- Plugins merged so far stay off until Settings → Plugins. This release adds Message logger, Call Timer, Volume Booster, Keyword highlights, Pin DMs, Panic Key, Incognito Mode, Streamer Safe, Clean Links, Better timestamps, Typing indicators, Translate, Show hidden channels, Spotify controls, Spoiler Everything, Hide Blocked Messages, Quick replies, Copy message markdown, Image zoom, Read all, User whois, Emote cloner, Message scheduler, Reverse image search, Bigger emoji, Voice Message Downloader, and View Original Image. The earlier pack is still there: message translator, inline syntax, quiet media, send later, quick reactions, keyword ping, auto away, now playing, bookmarks, hide muted people, relative time, and silent typing. ([#68](https://github.com/ItsErod/lark/pull/68), [#71](https://github.com/ItsErod/lark/pull/71), [#69](https://github.com/ItsErod/lark/pull/69), [#70](https://github.com/ItsErod/lark/pull/70), [#77](https://github.com/ItsErod/lark/pull/77), [#79](https://github.com/ItsErod/lark/pull/79), [#82](https://github.com/ItsErod/lark/pull/82), [#85](https://github.com/ItsErod/lark/pull/85), [#87](https://github.com/ItsErod/lark/pull/87), [#89](https://github.com/ItsErod/lark/pull/89), [#86](https://github.com/ItsErod/lark/pull/86), [#90](https://github.com/ItsErod/lark/pull/90), [#92](https://github.com/ItsErod/lark/pull/92), [#95](https://github.com/ItsErod/lark/pull/95), [#96](https://github.com/ItsErod/lark/pull/96), [#80](https://github.com/ItsErod/lark/pull/80))

### 🔧 Changed

- The repository is cleaned up for a public release. `.gitignore` covers installers, local config, and secrets. The README and MIT license describe the project. Actions keeps contents write on the installer job only. ([#55](https://github.com/ItsErod/lark/pull/55))

### 🐛 Fixed

- Settings can save. `save_config` rejected the call-view keybind (`toggle_call`), so opening Settings hit the fatal error screen. That keybind is accepted, unknown keybinds are ignored, and a failed save shows as a toast. ([#54](https://github.com/ItsErod/lark/pull/54))

### 🗑️ Removed

- The agent screenshot and perf scripts (`shots.mjs`, `signin-shots.mjs`, `theme-shots.mjs`, `plugin-shots.mjs`, and `perf.mjs`) are gone. Layout tests still cover the UI. ([#55](https://github.com/ItsErod/lark/pull/55))

### Known limitations

- Remote camera video isn't drawn.
- The guild soundboard plays a local chime.
- There is no Krisp noise suppression.
- There is no embedded activity runtime.
- DM pins are local only.
- Friend-request rows in the inbox are display-only.

## [2.4.5](https://github.com/ItsErod/lark/releases/tag/v2.4.5) — 2026-10-12

Opening Lark no longer stops on a blank window after the startup splash.

### 🐛 Fixed

- The shell is shown when the startup splash finishes, the splash gives up if startup stalls, and a first-paint error shows the message and a Reload button instead of a gray screen. ([#52](https://github.com/ItsErod/lark/pull/52))

## [2.4.4](https://github.com/ItsErod/lark/releases/tag/v2.4.4) — 2026-10-08

Voice calls encrypt Opus with a finished DAVE handshake, and a channel paints the newest messages first.

### 🐛 Fixed

- Windows casts the WASAPI COM init flag so the microphone build compiles. ([#51](https://github.com/ItsErod/lark/pull/51))

### ⚡ Performance

- A channel paints the newest 20 messages first, loads older history on scroll, shows image attachments again, and lines up compact rows. ([#48](https://github.com/ItsErod/lark/pull/48))

### 🔒 Security

- Voice calls finish the DAVE handshake and encrypt each Opus frame, speaking stays in order so the call is not dropped, Windows initializes WASAPI before the microphone starts, and Settings → Voice & Video can copy voice diagnostics. ([#49](https://github.com/ItsErod/lark/pull/49))

## [2.4.3](https://github.com/ItsErod/lark/releases/tag/v2.4.3) — 2026-10-08

Go Live shares a screen, a call sits beside the chat, and Windows no longer launches the tools Defender flagged.

### ✨ Added

- Go Live shares a screen or a window as a real stream, with quality options up to 4K. ([#45](https://github.com/ItsErod/lark/pull/45))

### 🔧 Changed

- A voice call stays beside the text channel, so the message list remains the chat. ([#44](https://github.com/ItsErod/lark/pull/44))

### 🔒 Security

- Windows hardware reads and Open at login use native Windows APIs, so this build no longer launches a hidden PowerShell or reg.exe that Defender flagged on 2.4.2. ([#46](https://github.com/ItsErod/lark/pull/46))

## [2.4.2](https://github.com/ItsErod/lark/releases/tag/v2.4.2) — 2026-10-07

Clips gain a library and higher capture rates, server folders sync, and Settings uses a Discord-style layout.

### ✨ Added

- The Clips view lists saved clips and compresses one that is over the upload limit before it is sent. ([#36](https://github.com/ItsErod/lark/pull/36))
- Clips can be captured at 60, 120, or 240 fps, from 720p through 2160p. ([#41](https://github.com/ItsErod/lark/pull/41))
- Servers and folders drag into a new order that syncs back to Discord. ([#39](https://github.com/ItsErod/lark/pull/39))

### 🔧 Changed

- Attaching a clip over 8 MB uses that compress-to-fit flow. ([#42](https://github.com/ItsErod/lark/pull/42))
- Settings opens as a full-screen Discord-style layout, and the page stays readable on a narrow window. ([#32](https://github.com/ItsErod/lark/pull/32))

## [2.4.1](https://github.com/ItsErod/lark/releases/tag/v2.4.1) — 2026-10-07

IRC messages use the full column, a send shows up once, voice finishes reconnecting, and clips save as MP4.

### 🔧 Changed

- Clips save as faststart H.264 AAC MP4. ([#35](https://github.com/ItsErod/lark/pull/35))
- Voice calls use a Discord-style layout, and a custom ring flows around whoever is speaking. ([#38](https://github.com/ItsErod/lark/pull/38))

### 🐛 Fixed

- IRC messages use the full column, a message you send shows up once, and joining a voice channel completes the DAVE handshake instead of staying on reconnecting. ([#33](https://github.com/ItsErod/lark/pull/33))
- The installer typecheck no longer includes the layout test, so the macOS and Windows jobs can produce installers. ([#37](https://github.com/ItsErod/lark/pull/37))
- The macOS clip encoder builds with Xcode 26. ([#40](https://github.com/ItsErod/lark/pull/40))

## [2.4.0](https://github.com/ItsErod/lark/releases/tag/v2.4.0) — 2026-10-07

A startup splash, richer voice controls, Game Mode, and message tools that stay on this computer.

### ✨ Added

- A startup splash covers the window while the first connect loads servers and opens the last channel. ([#27](https://github.com/ItsErod/lark/pull/27))
- Calls add per-person volume and a local mute, RNNoise on the microphone, and a soundboard of local WAV clips. Profile notes stay on the Discord account, and friends in a game or listening to something show that activity. ([#28](https://github.com/ItsErod/lark/pull/28))
- The voice HUD can show RAM, CPU, and FPS, and Game Mode with a profile per detected game quiets the shell while a game is in front. ([#29](https://github.com/ItsErod/lark/pull/29))
- Messages add a saved list, one-time reminders, scheduled send, and streamer mode, and composer drafts are encrypted with a key in the macOS Keychain or Windows Credential Manager. ([#30](https://github.com/ItsErod/lark/pull/30))

## [2.3.1](https://github.com/ItsErod/lark/releases/tag/v2.3.1) — 2026-10-07

An in-game voice HUD, a 30-second clip hotkey, optional hardware on a custom status, and a snappier channel and call view.

### ✨ Added

- An in-game voice HUD, a small always-on-top window of who is speaking and who is muted, stays off until Ctrl+Shift+O (⌘⇧O on macOS) or Settings → Voice & Video. ([#21](https://github.com/ItsErod/lark/pull/21))
- A custom status can show GPU, CPU temperature, and the current game, and those lines stay off until they are turned on. ([#24](https://github.com/ItsErod/lark/pull/24))
- A clip hotkey saves the last 30 seconds of a screen share or game capture. ([#23](https://github.com/ItsErod/lark/pull/23))

### 🐛 Fixed

- Guild channel loads no longer stampede Discord's REST limit, and the login window skips WebView2 script while the page is still busy. ([#22](https://github.com/ItsErod/lark/pull/22))

### ⚡ Performance

- Switching channels, scrolling a long history, and the voice HUD update only what changed, so those views paint from cache instead of rebuilding the window. ([#26](https://github.com/ItsErod/lark/pull/26))

## [2.3.0](https://github.com/ItsErod/lark/releases/tag/v2.3.0) — 2026-10-06

Discord dark is the default, chat and the shell catch up with Discord, and a voice channel carries call audio.

### ✨ Added

- The member list comes from gateway opcode 14, with presence and profiles, and Home lists friends and direct messages. ([#14](https://github.com/ItsErod/lark/pull/14))
- The app shell adds server folders, unread badges, settings, notifications, and Ctrl+K. ([#15](https://github.com/ItsErod/lark/pull/15))
- Chat adds replies, reactions, markdown, embeds, mentions, and history. ([#13](https://github.com/ItsErod/lark/pull/13))
- A voice channel shows who is in it, and the call carries Opus audio. ([#16](https://github.com/ItsErod/lark/pull/16))

### 🔧 Changed

- Discord dark is the default theme, and warm ink stays available in the gallery. ([#11](https://github.com/ItsErod/lark/pull/11))
- The changelog and README record what changed in each version. ([#18](https://github.com/ItsErod/lark/pull/18))

### 🐛 Fixed

- The open text channel stays stable while messages load. ([#12](https://github.com/ItsErod/lark/pull/12))
- The bundled Opus library builds on CMake 4, which is what the GitHub runners ship. ([#19](https://github.com/ItsErod/lark/pull/19))

## [2.2.5](https://github.com/ItsErod/lark/releases/tag/v2.2.5) — 2026-10-06

Windows sign-in works for the in-app window, the system browser, and QR.

### 🐛 Fixed

- The Discord login window loads the login page, the browser button opens that page in the system browser, and QR shows a live code or the reason the handshake failed. ([#10](https://github.com/ItsErod/lark/pull/10))

## [2.2.4](https://github.com/ItsErod/lark/releases/tag/v2.2.4) — 2026-10-06

Discord's login page can open in the system browser and hand the session back to Lark.

### ✨ Added

- Sign in in your browser opens Discord's login page in the system browser, brings a one-time grant back to this computer, and stores the session in the macOS Keychain or Windows Credential Manager. The in-app login window is unchanged. ([#9](https://github.com/ItsErod/lark/pull/9))

## [2.2.3](https://github.com/ItsErod/lark/releases/tag/v2.2.3) — 2026-10-06

The signed-in shell is easier to read, and scrolling stays inside each panel.

### 🐛 Fixed

- Type uses Inter at real weights, server buttons draw Discord's icons, the member list falls back to the gateway when REST is empty, and scrolling stays inside each panel. ([#7](https://github.com/ItsErod/lark/pull/7))

## [2.2.2](https://github.com/ItsErod/lark/releases/tag/v2.2.2) — 2026-10-06

The Discord token is stored in the macOS Keychain and Windows Credential Manager.

### 🐛 Fixed

- The Discord token is saved in the macOS Keychain and Windows Credential Manager, and a save that cannot be read back is reported as a failure. ([#6](https://github.com/ItsErod/lark/pull/6))

## [2.2.1](https://github.com/ItsErod/lark/releases/tag/v2.2.1) — 2026-10-06

Discord sign-in finds the session, and the Windows installers are named for 2.2.1.

### 🔧 Changed

- The README is shorter around download, install, and sign-in. ([`9067e6a6b`](https://github.com/ItsErod/lark/commit/9067e6a6b129ec97c6fd998a948a6fbc34ea3d5b))

### 🐛 Fixed

- Sign in with Discord finds the session when the login page keeps it out of a simple storage read, and the installers are named Lark_2.2.1_*. ([#4](https://github.com/ItsErod/lark/pull/4))
- The Windows release build reads Cargo.lock with Windows line endings, so the Windows installers upload. ([#5](https://github.com/ItsErod/lark/pull/5))

## [2.2](https://github.com/ItsErod/lark/releases/tag/v2.2) — 2026-10-06

Sign in with Discord, a theme gallery, and plugins that stay off until Settings turns them on.

### ✨ Added

- Sign in with Discord opens Discord's login page in a separate window and offers a mobile QR code. A pasted token stays under Advanced. ([#3](https://github.com/ItsErod/lark/pull/3))
- A theme gallery adds fourteen colour themes and applies one in a click. ([#1](https://github.com/ItsErod/lark/pull/1))
- Twelve plugins ship with the app and stay off until Settings turns them on. None of them receive the token. ([#2](https://github.com/ItsErod/lark/pull/2))

## [2.1.1](https://github.com/ItsErod/lark/releases/tag/v2.1.1) — 2026-10-06

The first release with published installers. The macOS disk image builds, and the Windows job uses the WiX already on the runner.

### 🐛 Fixed

- The macOS bundle points at its icon so the universal disk image is produced, and the Windows job uses the WiX already on the runner instead of an older Chocolatey pin. ([`328080e95`](https://github.com/ItsErod/lark/commit/328080e95a5ad36868afacb442302752c1173bf6))

## [v2.1](https://github.com/ItsErod/lark/tree/v2.1) — 2026-10-06

Interface paints follow the display, and the tag is set up to publish universal installers. The installer jobs failed, so this tag has no GitHub Release.

### 🔧 Changed

- A v* tag publishes universal macOS and Windows installers, and those builds are unsigned. ([`69fcd4b75`](https://github.com/ItsErod/lark/commit/69fcd4b7537f7268aeba2e76a98b11d84e87f53c))

### ⚡ Performance

- Interface paints are capped at the display refresh rate, up to 240 fps, and that clock runs only when something changes. ([`a8a9ae98d`](https://github.com/ItsErod/lark/commit/a8a9ae98db7a151c987c326b4682074c21769cc3))

## [v2](https://github.com/ItsErod/lark/tree/v2) — 2026-10-06

Voice, a change-gated screen share, and a faster shell. Video calls are not in this version, and the installer jobs failed, so there is no GitHub Release.

### ✨ Added

- A voice handshake and a screen share that sends a frame only when the picture changes, plus presence, read sync, search, threads, split view, a command palette, a theme editor, and a tray icon, on a faster shell. ([`fcd1185fb`](https://github.com/ItsErod/lark/commit/fcd1185fbe6a9e526d9eb7235e91beaf92432586))

### 🔧 Changed

- A v* tag publishes installers to a GitHub Release. ([`ab52e9f40`](https://github.com/ItsErod/lark/commit/ab52e9f407cb9bf7c31f33b4f24de927cd0ab16f))

## [v1](https://github.com/ItsErod/lark/tree/v1) — 2026-10-06

First version of Lark, a personal Discord client for one account on macOS and Windows. Voice, video, and screen share are not in this version, and there is no GitHub Release for the tag.

### ✨ Added

- Lark keeps the token in the macOS Keychain or Windows Credential Manager, identifies itself as Lark, and ships themes, remappable shortcuts, and local plugins that do not receive the token. ([`f53d12bb7`](https://github.com/ItsErod/lark/commit/f53d12bb702cf2247ef0cbe76b24c615a4486f0d))
