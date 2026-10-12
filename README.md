# Lark

**[Live progress](https://itserod.github.io/lark/progress/)** — what’s shipping right now.

Lark is a fast, native desktop Discord client built with Tauri. It aims for 1:1 Discord parity, plus extras: Game Mode, clips, Go Live screen sharing, a voice HUD, plugins, and themes.

It exists for speed and customization. Chat and calls should feel quick, and you should be able to change how the client looks and behaves.

The 3.0 release is the parity pass. 3.0.1 follows with speed work and a network viewer. 3.1 is the features release after that.

## Features

### Chat

Servers, DMs, threads, search, replies, reactions, uploads, saved messages, reminders, and scheduled send.

### Voice and Video

Voice calls, Go Live screen sharing, a soundboard, and short clips.

### Gaming

Game Mode while a game is in front, and an optional voice HUD on top of the game.

### Customization

Themes, keyboard shortcuts, notifications, and a tray icon. The shipped themes are in [THEMES.md](THEMES.md).

### Privacy

Streamer mode, and composer drafts encrypted with a key in the macOS Keychain or Windows Credential Manager.

### Plugins

Local plugins that stay off until you turn them on. The pack is in [PLUGINS.md](PLUGINS.md).

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
