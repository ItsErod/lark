# Lark

Lark is a small personal Discord client for **one account**, on macOS and Windows. One Tauri codebase builds both. The interface is a warm ink-and-apricot layout, not the official client, and the app identifies itself as Lark.

**Using Lark can get the Discord account banned.** Discord’s terms do not allow third-party clients that sign in with a user token. This project does not hide that. The token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord’s API and gateway. It is not logged, not written into the config file, and not given to plugins.

Voice, video, and screen share are not in this version.

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

Member presence is not requested, so the live member list does not show online, idle, or do-not-disturb.

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

Themes are CSS files that set variables (`--bg-0`, `--text`, `--accent`, and the rest in `themes/modern-dark.css`). Shipped themes: **modern-dark** (the default), **daylight**, **ink-contrast**. Drop another `name.css` in the themes folder; `name` must match `[a-z0-9][a-z0-9-]{0,63}`. The file is picked up while the app is open.

The UI font is bundled Inter so both operating systems match. Settings can switch to the system UI font (Segoe UI on Windows), a serif stack, or a mono stack (SF Mono, Cascadia Mono, Consolas).

Plugins are local JavaScript files with `function onMessage(message, api)`. They can highlight, add a badge, change content, or return `null` to hide a message. They do not get the token, the network, or the filesystem. Shipped plugins:

- `highlight-mentions` — on by default
- `code-badge` — on by default
- `hide-joins` — shipped, off by default

Enable them under `[plugins]` or in Settings. Treat every plugin as trusted code; `new Function` runs it in the window.

Per-server and per-channel notification overrides live under `[notifications.guilds]` and `[notifications.channels]`. A channel mute wins over a server setting, which wins over the default.

## What the connection does

Lark speaks Discord HTTP API v10 and the JSON gateway as a user account. The identify payload says `browser` and `device` are Lark. It does not pretend to be the official client, and it does not send client fingerprints, super-properties, or captcha workarounds.

Gateway intents are guilds, guild messages, reactions, typing, direct messages, and message content. Presence and the full member list intent are off. If Discord closes the socket with `4014`, Lark reconnects once without the message-content intent. Close `4004` stops the connection. Heartbeats, resume, and a reconnect delay from 1s to 60s are handled in the shell. Message sends are paced, typing is sent at most once every 8 seconds, and REST calls follow Discord’s rate-limit headers. There is no message-ack call, no mass action, and no automation.

Outgoing limits: 2,000 characters, 4 files, 8 MB total.

## Tests

```bash
npm test
cargo test -p lark-core
```

Frontend tests cover message rendering, shortcuts, notification rules, and platform labels. The Rust crate covers config parsing, the rate limiter, and Discord payload mapping.

## Continuous integration

`.github/workflows/build.yml` runs the tests on Ubuntu, then builds installers (not on pull requests):

- macOS universal `.app` and `.dmg`
- Windows x64 NSIS `.exe` and WiX `.msi`

The workflow uses `tauri-apps/tauri-action` and uploads the artifacts to the workflow run. They are unsigned.

## Measured size

These numbers are from a local build on Linux x86_64 (WebKitGTK), not estimates, and not the macOS or Windows installers. Those installers come from CI and use WKWebView and WebView2, so their RAM will differ.

- Frontend production bundle (`npm run build`): **340 KB** on disk. The app script is 69 KB (23 KB gzip) plus the Inter Latin files.
- Release shell (`cargo build --release -p lark`): **21 MB** unstripped, **14 MB** after `strip`.
- Resident memory under Xvfb: the process was up immediately and settled at about **175 MB** RSS (178,600 KB, steady across later samples) roughly **2 seconds** after launch. That includes the WebKit process, not just the Rust binary.

## Limitations

- No voice, video, screen share, stage channels, forums, threads, stickers, or slash commands.
- Unread badges are local to this process. Lark does not mark channels read on Discord’s servers.
- Markdown is a subset: bold, italic, underline, strike, code, quotes, spoilers, mentions, custom emoji, and links.
- The member list is the first 100 members and has no live presence.
- Plugins are trusted local scripts.
- Windows on ARM is not built.
- Linux has no supported credential store, so the token is not saved.
