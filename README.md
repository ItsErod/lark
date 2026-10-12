# Lark

Lark is a fast desktop Discord client built with Tauri.

**[Live progress](https://itserod.github.io/lark/progress/)** — what’s shipping right now.

## Features

- Servers, DMs, threads, search, replies, reactions, and uploads
- Voice calls, screen share, clips, and a soundboard
- Themes, plus plugins that stay off until you turn them on
- Notifications, a tray icon, and keyboard shortcuts
- Saved messages, reminders, scheduled send, and encrypted drafts
- Game Mode and an optional voice overlay while you play

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
