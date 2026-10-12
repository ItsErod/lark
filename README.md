# Lark

Lark is a personal Discord client for one account on macOS and Windows. It is an unofficial client: it is not affiliated with, endorsed by, or supported by Discord. Discord’s terms of service do not allow unofficial clients, and using Lark can get an account banned.

The session token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord. Lark identifies itself as Lark.

## Download

Installers for the latest release are on the [releases page](https://github.com/ItsErod/lark/releases/latest). What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

The current release is [v2.4.5](https://github.com/ItsErod/lark/releases/tag/v2.4.5):

- [macOS universal .dmg](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.5_universal.dmg) — Apple Silicon and Intel
- [Windows setup .exe](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.5_x64-setup.exe)
- [Windows .msi](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.5_x64_en-US.msi)

Requires macOS 11 or newer, or 64-bit Windows 10 or newer. Windows on ARM is not built. These builds are unsigned.

On a Mac, Gatekeeper blocks the first open. Right-click the app, choose **Open**, then **Open** again, or use **System Settings → Privacy & Security → Open Anyway**.

On Windows, SmartScreen may say the publisher is unknown. Choose **More info → Run anyway** only for an installer from the releases above.

## Features

- Servers, DMs, threads, search, pins, replies, reactions, and uploads
- Saved messages, reminders, and scheduled send. Ctrl+K (⌘K on macOS) opens them
- Streamer mode hides emails, tokens, DM previews, and personal info
- Composer drafts encrypted with a key in the macOS Keychain or Windows Credential Manager
- Notifications, a tray icon, and shortcuts (`mod` is Command on macOS and Ctrl on Windows)
- A theme gallery. The shipped themes are in [THEMES.md](THEMES.md)
- Plugins that stay off until you turn them on. The pack is in [PLUGINS.md](PLUGINS.md)
- Voice calls with a call view, participant tiles, speaking rings, per-person volume, and a local mute. Audio is Opus inside a DAVE end-to-end encryption handshake. RNNoise can run on the microphone
- A soundboard for short WAV clips, mixed into the voice channel
- Notes on profiles, saved to the Discord account, and friend activity on the friends list
- A voice HUD that can sit on top of a game, with an optional RAM, CPU, and FPS strip. It stays off until you turn it on
- Game Mode, which eases resource use while a game is in front, with a profile per game
- Go Live screen or window share, up to 4K
- A clip hotkey that saves up to 30 seconds of the main display as an MP4 while screen share or Game Mode capture is on

## Sign in

The first screen has **Sign in with Discord**, **Sign in in your browser**, and a QR code.

**Sign in with Discord** opens Discord’s own login page in a separate window. The password, two-factor prompt, and captcha stay on that page. Lark waits until Discord’s session appears, stores it, and closes the window.

**Sign in in your browser** opens that same login page in your system browser. After you sign in, Discord’s page sends a one-time grant to Lark on this computer. Lark exchanges it and stores the session.

**Scan with the Discord mobile app** is Discord’s QR login. If that step asks for a captcha, use one of the other two options.

**Advanced** accepts a pasted user token. Quotes, line breaks, and an `Authorization:` label are removed. A bot token or an OAuth bearer token is refused.

The browser preview will not store a token. From a checkout, run `npm run dev`, then open [http://127.0.0.1:47321/?demo=1](http://127.0.0.1:47321/?demo=1).

## Build from source

Install [Node.js 22](https://nodejs.org/), [Rust](https://rustup.rs/) (the repo pins 1.99.0 in `rust-toolchain.toml`), and CMake. Then:

```sh
npm ci
```

`npm run tauri dev` runs the desktop shell against the Vite dev server.

### macOS

Install the Xcode Command Line Tools (`xcode-select --install`). A universal build also needs both Apple targets:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
```

The `.dmg` and `.app` are under `src-tauri/target/universal-apple-darwin/release/bundle/`. For a build of the host architecture only, drop the `--target` flag and look in `src-tauri/target/release/bundle/`.

### Windows

Install Visual Studio Build Tools with the Desktop development with C++ workload, and the WebView2 runtime (already present on current Windows 11). The `.msi` bundle needs [WiX Toolset 3](https://wixtoolset.org/) on `PATH`. Tauri fetches NSIS for the `.exe` setup.

From a Visual Studio developer prompt, or any shell where `link.exe` is on `PATH`:

```bat
npm run tauri build -- --bundles nsis,msi
```

Installers are under `src-tauri\target\release\bundle\nsis` and `src-tauri\target\release\bundle\msi`.

Linux can compile the shell, but it will not save a token or a draft key. Drafts stay in memory for that session.

## Limitations

- No video calls. A camera id can be stored for later; video is not sent.
- Markdown is a subset: bold, italic, code, quotes, spoilers, mentions, emoji, and links.
- Plugins are trusted local scripts. They never receive the token.

## License

[MIT](LICENSE) © ItsErod
