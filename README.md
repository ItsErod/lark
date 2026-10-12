# Lark

**[Live progress](https://itserod.github.io/lark/progress/)** — what’s shipping right now.

**[Plugin store](https://itserod.github.io/lark/store/)** — plugins and themes, kept out of the app download.

Lark is a fast, native desktop Discord client built with Tauri. It aims for 1:1 Discord parity, plus extras: Game Mode, clips, Go Live screen sharing, a voice HUD, plugins, and themes.

It exists for speed and customization. Chat and calls should feel quick, and you should be able to change how the client looks and behaves.

The 3.0 release is the parity pass. 3.0.1 is the Windows voice hotfix. Camera, soundboard, and noise suppression follow in 3.0.2.

## Features

### Chat

Servers, DMs, threads, search, replies, reactions, uploads, saved messages, reminders, and scheduled send.

### Voice and Video

Voice calls, Go Live screen sharing, a soundboard, and short clips.

### Gaming

Game Mode while a game is in front, and an optional voice HUD on top of the game.

### Customization

Themes from the [store](https://itserod.github.io/lark/store/), keyboard shortcuts, notifications, and a tray icon. Theme notes are in [THEMES.md](THEMES.md).

### Privacy

Streamer mode, and composer drafts encrypted with a key in the macOS Keychain or Windows Credential Manager.

### Plugins

Plugins from the [store](https://itserod.github.io/lark/store/) stay off until you turn them on. The pack is in [PLUGINS.md](PLUGINS.md).

## Download

Installers are on the [latest release](https://github.com/ItsErod/lark/releases/latest):

- Windows: `.exe` and `.msi`
- macOS: `.dmg`

## Build from source

Install [Node.js 22](https://nodejs.org/), [Rust](https://rustup.rs/), and CMake. Then:

```sh
npm ci
npm run tauri dev
```

`npm run tauri build` makes the installers.

## License

[MIT](LICENSE) © ItsErod
