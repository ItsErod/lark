# Lark

Lark is a small personal Discord client for **one account**, on macOS and Windows. One Tauri codebase builds both. The interface is a warm ink-and-apricot layout, not the official client, and the app identifies itself as Lark.

**Using Lark can get the Discord account banned.** Discord’s terms do not allow third-party clients that sign in with a user token. This project does not hide that. The token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord’s API and gateway. It is not logged, not written into the config file, and not given to plugins.

Voice and screen share are in this version. Video calls are not. Screen share sends nothing while the picture is still.

## Preview without a token

The web UI can run with sample data. It will not accept or store a token.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:47321/?demo=1](http://127.0.0.1:47321/?demo=1). The gate also has **Preview with sample data**.

## Requirements

- Node.js 22
- Rust **1.99.0** (pinned in `rust-toolchain.toml`; rustup will install it)
- macOS 11 or newer, or 64-bit Windows 10 or newer

Linux can compile the shell for development, but Lark will not save a token there.

## Build on macOS

Install the Xcode command line tools, then:

```bash
npm install
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
```

Artifacts:

- `src-tauri/target/universal-apple-darwin/release/bundle/macos/Lark.app`
- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Lark_0.1.0_universal.dmg`

For a faster single-architecture build while iterating, `npm run tauri dev` is enough. It uses the host architecture.

The CI builds are **unsigned**. Gatekeeper will block the first open. Right-click `Lark.app`, choose Open, then Open again. Do not disable Gatekeeper.

## Build on Windows

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the “Desktop development with C++” workload, plus the [WiX Toolset 3.14](https://wixtoolset.org/docs/wix3/) if you want an MSI. NSIS (the `.exe` installer) is downloaded by the Tauri bundler.

```bash
npm install
npm run tauri build -- --bundles nsis,msi
```

Artifacts (paths use the MSVC release folder):

- `src-tauri\target\release\bundle\nsis\Lark_0.1.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\Lark_0.1.0_x64_en-US.msi`

Skip `--bundles msi` if WiX is not installed; the NSIS `.exe` is still an installer.

These builds are unsigned. SmartScreen may say the publisher is unknown. Use **More info → Run anyway** only if you built the installer yourself or downloaded it from a CI run you trust. Windows on ARM is not produced by CI.

## Run the desktop app

```bash
npm run tauri dev
```

### Where the token goes

| | macOS | Windows |
| --- | --- | --- |
| Credential store | Keychain, service `Lark`, account `discord-user-token` | Credential Manager, same service and account |
| Config, themes, plugins | `~/Library/Application Support/dev.lark.desktop` | `%APPDATA%\dev.lark.desktop` |
| Default shortcut modifier | Command | Ctrl |

The first launch copies the bundled themes, plugins, and an example `config.toml` into that folder.

### How to copy your token

1. In a browser where you are already logged into Discord, open Developer Tools.
2. Open the **Network** panel and select a request whose URL contains `discord.com/api`.
3. In the request headers, copy the **Authorization** value. That string is the token.
4. Paste it into Lark’s token field and choose **Save and connect**.

Lark does not include a snippet that reads the token out of the page. Do not paste the token into a terminal, a plugin, or the config file. On Linux, and in the browser preview, Save and connect refuses to store it.

### Notifications

macOS asks once for permission, then shows banners and Notification Center alerts. Windows shows Action Center toasts; Focus Assist and quiet hours can hide them. Mute and mention settings are applied before either OS is asked to notify. Your own messages, and messages in the channel you are looking at while the window is focused, stay quiet.

The member list shows online, idle, do-not-disturb, and offline when Discord sends presence. You can set your own status, including a custom line, from the profile chip.

## Config, themes, shortcuts, plugins

`config.toml` is the file in the app config folder. `config.example.toml` in the repo is the same shape. Settings writes the file back, which drops comments. Editing the file on disk reloads it.

`mod` in a shortcut means Command on macOS and Ctrl on Windows. You can also write `cmd`, `command`, `ctrl`, or `control` if a binding should be one platform’s key on both. Bindings that collide are called out in Settings. Defaults:

| Action | Binding |
| --- | --- |
| Quick switcher | `mod+k` |
| Settings | `mod+comma` |
| Toggle members | `mod+shift+m` |
| Toggle channels | `mod+b` |
| Focus the composer | `mod+l` |
| Next unread | `alt+shift+down` |
| Previous / next channel | `alt+up` / `alt+down` |
| Edit your last message | `arrowup` |
| Mute | `mod+shift+alt+m` |
| Deafen | `mod+shift+d` |
| Push to talk | `` ` `` |

Themes are CSS files that set variables (`--bg-0`, `--text`, `--accent`, and the rest in `themes/modern-dark.css`). The gallery in Settings previews each one and applies it in one click. Import and export use CSS or JSON. Shipped themes are listed in [THEMES.md](THEMES.md): a Linear-style dark and light, OLED black, Nord, Tokyo Night, Catppuccin Mocha and Latte, Dracula, Gruvbox, synthwave, a static RGB accent, frosted glass (native vibrancy on macOS and Windows), a phosphor terminal, a 7:1 high-contrast theme, plus the original **modern-dark** (the default), **daylight**, and **ink-contrast**. A theme id matches `[a-z0-9][a-z0-9-]{0,63}`. New files are copied into the config folder when they are missing. A file you already edited there is left alone. The file is picked up while the app is open.

The UI font is bundled Inter so both operating systems match. Settings can switch to the system UI font (Segoe UI on Windows), a serif stack, or a mono stack (SF Mono, Cascadia Mono, Consolas).

Plugins are local JavaScript files with `function onMessage(message, api)`. They can highlight, add a badge, change content, or return `null` to hide a message. They do not get the token, the network, or the filesystem. Shipped plugins:

- `highlight-mentions` — on by default
- `code-badge` — on by default
- `hide-joins` — shipped, off by default
- `edit-log` — badge after an edit, off by default
- `collapse-long` — fold messages over 280 characters, off by default
- `translate` — a local glossary for lines that start with `tr:`, off by default, no network

Enable them under `[plugins]` or in Settings. Treat every plugin as trusted code; `new Function` runs it in the window.

Per-server and per-channel notification overrides live under `[notifications.guilds]` and `[notifications.channels]`. A channel mute wins over a server setting, which wins over the default.

## What the connection does

Lark speaks Discord HTTP API v10 and the JSON gateway as a user account. The identify payload says `browser` and `device` are Lark. It does not pretend to be the official client, and it does not send client fingerprints, super-properties, or captcha workarounds.

Gateway intents are guilds, presence, guild messages, reactions, typing, direct messages, and message content. The full member-list intent stays off; members still load from REST. If Discord closes the socket with `4014`, Lark reconnects once without the message-content intent. Close `4004` stops the connection. Heartbeats, resume, and a reconnect delay from 1s to 60s are handled in the shell. Message sends are paced, typing is sent at most once every 8 seconds, and REST calls follow Discord’s rate-limit headers. Looking at a channel marks that one channel read. There is no bulk ack sweep, no mass action, and no automation.

Outgoing limits: 2,000 characters, 4 files, 8 MB total.

## Tests

```bash
npm test
cargo test -p lark-core
```

Frontend tests cover message rendering, shortcuts, notification rules, platform labels, and the theme pack. The Rust crate covers config parsing, theme CSS checks, the rate limiter, and Discord payload mapping.

## Continuous integration

`.github/workflows/build.yml` runs the tests on Ubuntu, then builds installers (not on pull requests):

- macOS universal `.app` and `.dmg`
- Windows x64 NSIS `.exe` and WiX `.msi`

The workflow uses `tauri-apps/tauri-action`. A push of a `v*` tag (v1, v2, …) builds the same installers and attaches the `.dmg`, `.exe`, and `.msi` to a GitHub Release named after the tag. The macOS artifact is a universal binary (Apple Silicon and Intel). Branch builds do not create a release. The installers are unsigned. On first launch, macOS users should right-click the app and choose Open.

## Measured size

These numbers are from a local build on Linux x86_64 (WebKitGTK), not estimates, and not the macOS or Windows installers. Those installers come from CI and use WKWebView and WebView2, so their RAM will differ.

- Frontend production bundle (`npm run build`): **340 KB** on disk. The app script is 69 KB (23 KB gzip) plus the Inter Latin files.
- Release shell (`cargo build --release -p lark`): **21 MB** unstripped, **14 MB** after `strip`.
- Resident memory under Xvfb: the process was up immediately and settled at about **175 MB** RSS (178,600 KB, steady across later samples) roughly **2 seconds** after launch. That includes the WebKit process, not just the Rust binary.

## Speed and memory

The goal is that the app feels immediate. Message lists are windowed, so a long channel keeps a few dozen rows in the DOM. Switching back to a recent channel paints the cached page first. Sends and reactions update the screen before Discord answers. The composer updates its character count without rebuilding the window.

`node scripts/perf.mjs` (with `npm run dev` already running) records startup, channel-switch, composer latency, scroll frame time, and process RSS against the demo. It needs Chrome and `puppeteer-core`. The Linux column is that script on this machine, 6 Oct 2026, demo data in Chrome. macOS (WKWebView) and Windows (WebView2) are estimates from that run.

| | Linux, measured | macOS, estimate | Windows, estimate |
| --- | --- | --- | --- |
| Cold start until the demo shell is ready | 91 ms (`window.__lark.ready`) | often in the same range; WKWebView can be a little quicker | similar to macOS |
| Channel switch, first visit | 35 ms (`#general`, includes the short demo page load) | under 50 ms | under 50 ms |
| Channel switch, cached | 5–8 ms (`#design-crit` after it had been open) | under 20 ms | under 20 ms |
| Composer input to the counter | under 1 ms (slowest of five keystrokes, 0.3 ms) | under 16 ms | under 16 ms |
| Message list scroll | 60 fps on this 60 Hz display; slowest frame 17 ms; 23 message rows in the DOM | one paint per vsync, up to the frame cap | one paint per vsync, up to the frame cap |
| JavaScript heap, demo open | about 3 MB used | the webview adds its own heap on top | the webview adds its own heap on top |
| Resident memory, desktop shell | about 175 MB RSS, Linux WebKitGTK, measured on the v1 shell (see above) | WKWebView often lands around 150–250 MB | WebView2 often lands around 150–250 MB |
| Idle CPU, channel open, no voice | about 2% of one core for the Chrome process tree | the UI is waiting | the UI is waiting |

The Chrome process tree for that sample was about 950 MB RSS. That figure is Chrome (browser, renderer, and GPU processes). The page heap inside it was about 3 MB. 200 MB remains a soft target for the packaged shell. Recent channels are cached (up to 8), images stay lazy, and a long history keeps a window of rows in the DOM.

## Frame rate

Paints follow the monitor, up to a hard cap of 240 fps. `desktop.frame_cap` in the config (and the Desktop page in Settings) is **240** by default. **0** matches the display and still will not schedule a paint faster than 240. The choices are Match, 240, 165, 144, 120, and 60. Scrolling, the channel drawer, and overlays are timed in milliseconds, so the compositor samples them on each vsync. There is no 16 ms timer and no frame budget that holds motion at 60.

The paint clock asks the browser for a frame only after something changes. A still channel does not run a 240 fps loop. On this machine, after a short burst of paints, idle CPU for the Chrome process tree was about **1%** of one core.

Measured here, in Chrome, the display vsync is **60 Hz**. A 400 ms paint burst produced **25 paints** (about 60 fps), the same rate as scrolling. Headless Chrome stayed near 60 Hz even with vsync disabled, so a faster panel was not available to time directly. The clock’s own tests, fed timestamps for other refresh rates, are the numbers for those panels:

| Display | Cap | Paints |
| --- | --- | --- |
| 60 Hz (this machine, Chrome) | 240 | about 60 fps, measured |
| 144 Hz | 240 | every vsync, about 144 fps |
| 240 Hz | 120 | about 120 fps, gaps stay above 8 ms |
| 360 Hz | 240 | under 240 fps (about 180, because paints stay on vsync) |

120, 144, and 165 Hz monitors are estimated the same way: with the default cap, every vsync is slower than 1/240 s, so Lark paints on each one. macOS and Windows estimates match that table when the webview is actually running at the panel rate.

Platform limits:

- **macOS 14 and later.** Lark sets the WKWebView layer’s preferred frame-rate range to 10–240 fps, preferred 240. ProMotion and high-refresh external displays can run above 60, and the system will not be asked for more than 240. **macOS 11–13** have no public API for that range, so WKWebView there often stays at 60 Hz.
- **Windows.** WebView2 presents through the desktop window manager, which vsyncs to the monitor on current runtimes. WebView2 has no public preferred-frame-rate call. Lark does not pass `--disable-gpu-vsync` or `--disable-frame-rate-limit`, because those keep the GPU busy while the page is idle. A monitor faster than 240 Hz can still composite inside the webview at the monitor rate; script paints stay at or under 240.
- **Linux.** WebKitGTK follows the compositor. This environment measured 60 Hz.

## Voice

Joining a voice channel or a DM call sends gateway opcode 4, then the voice gateway v8 handshake: identify, UDP IP discovery, protocol select, and the AEAD mode Discord requires (`aead_aes256_gcm_rtpsize`, or `aead_xchacha20_poly1305_rtpsize` when AES is absent). Deprecated XSalsa modes are refused. Mute, deafen, push-to-talk, and voice activity are in the UI, with a sensitivity slider and per-person volume. A dropped voice socket reconnects with the same 1–20s cap as the main gateway.

The noise control is a small high-pass gate on PCM, on by default. It is not RNNoise. Echo cancellation is off: a WebRTC audio processor is a lot of CPU for a call that is already this small. Microphone encode and speaker playback are not linked. libopus plus a capture device would add native audio threads, so the UDP socket sends an encrypted Opus silence keepalive every 5 seconds to hold the mapping open, and it sets the speaking flag from push-to-talk or voice activity. Device names are saved for when capture is connected.

## Screen share

Discord does not accept raw dirty rectangles. A share is a full-frame H.264 or VP8 video stream (and newer clients wrap media in DAVE). Lark still refuses to send when the screen is still:

- Thumbnails are luma, 160×90, and tiles are 16×16. An unchanged thumbnail produces **zero packets**, 0 fps, and 0 bitrate.
- A small edit (under 5% of tiles) plans 5 fps and 200 kbps. Under 25% plans 15 fps and 1.2 Mb/s. Broader motion plans 30 fps and 2.5 Mb/s. One encoded frame per planned tick, not one packet per rectangle. The encoder’s own skip blocks cover the unchanged part of that frame.
- Capture order is ScreenCaptureKit on macOS, and Windows Graphics Capture then DXGI on Windows. Encoder order is VideoToolbox on macOS, and NVENC, Quick Sync, AMF, then Media Foundation on Windows.
- Those native capture and hardware-encode sessions are selected by that table and covered by tests. They are not linked into the binary. Wiring ScreenCaptureKit, WGC, and a hardware encoder through Discord’s video/DAVE session is the next step; doing it halfway would still have to emit a codec stream, which is what the scheduler already gates.

Idle bandwidth is 0, measured by the scheduler tests (`packets_for` is 0). Active bandwidth is the plan above, not a capture from a real desktop. Idle CPU for the diff is one pass over a 14 KB thumbnail and then a sleep; a full-screen hardware encode is what would cost CPU, and it does not run while the plan says send nothing. Treat active CPU as an estimate: a hardware encoder at 15 fps is typically well under one core, and at 0 fps it is idle.

## What shipped in v2, and what did not

Shipped: presence and your own status, one-channel read receipts, search over loaded messages (live search hits Discord one query at a time), threads and a forum channel, pins, timestamps, stickers, GIF embeds, code highlighting, an emoji picker that remembers what you use, drag-and-drop and paste uploads, per-channel drafts, split view, a command palette, keyword highlights, IRC density, a per-server accent, a theme editor, three more plugins, a short message cache, a tray icon with an unread count, minimise to tray, and open at login on macOS and Windows.

Not shipped: video calls, stage channels, slash commands, echo cancellation, neural noise suppression, live microphone encode and playback, and the native screen-capture session described above. Windows on ARM is not built. Linux still has no credential store, so the token is not saved.

## Limitations

- Markdown is a subset: bold, italic, underline, strike, code, quotes, spoilers, mentions, custom emoji, timestamps, and links.
- The member list is the first 100 members, plus presence updates for people already loaded.
- Plugins are trusted local scripts.
- Windows on ARM is not built.
- Linux has no supported credential store, so the token is not saved.
