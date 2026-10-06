# Lark

Lark is a personal Discord client for one account on macOS and Windows. It is not the official app, and it identifies itself as Lark.

**Discord’s terms do not allow this.** Using Lark can get the account banned. The token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord.

## Download

Installers are on the [Releases](https://github.com/ItsErod/lark/releases) page.

- [macOS universal .dmg](https://github.com/ItsErod/lark/releases/latest/download/Lark_0.1.0_universal.dmg) — Apple Silicon and Intel
- [Windows setup .exe](https://github.com/ItsErod/lark/releases/latest/download/Lark_0.1.0_x64-setup.exe)
- [Windows .msi](https://github.com/ItsErod/lark/releases/latest/download/Lark_0.1.0_x64_en-US.msi)

macOS 11 or newer, or 64-bit Windows 10 or newer. Windows on ARM is not built.

## Install

These builds are unsigned.

On a Mac, Gatekeeper blocks the first open. Right-click the app, choose **Open**, then **Open** again. You can also use **System Settings → Privacy & Security → Open Anyway**. Leave Gatekeeper on.

On Windows, SmartScreen may say the publisher is unknown. Use **More info → Run anyway** only for an installer from the releases above.

## Sign in

The first screen has **Sign in with Discord** and a QR code.

**Sign in with Discord** opens Discord’s own login page in a separate window. The password, two-factor prompt, and captcha stay on that page. Lark stores the session and closes the window.

**Scan with the Discord mobile app** is Discord’s QR login. If that step asks for a captcha, use **Sign in with Discord** instead.

**Advanced** accepts a pasted user token. Quotes, line breaks, and an `Authorization:` label are removed. A bot token or an OAuth bearer token is refused.

The browser preview will not store a token. `npm run dev`, then open [http://127.0.0.1:47321/?demo=1](http://127.0.0.1:47321/?demo=1).

## Features

- Servers, DMs, threads, search, pins, replies, and uploads
- Notifications, a tray icon, and shortcuts (`mod` is Command on macOS and Ctrl on Windows)
- A theme gallery in Settings. The shipped themes are in [THEMES.md](THEMES.md)
- Plugins that stay off until you turn them on. The pack is in [PLUGINS.md](PLUGINS.md)
- Voice controls: mute, deafen, push to talk, and voice activity
- Paints follow the display, up to 240 fps

## Limitations

- No video calls.
- Voice does not capture the microphone or play other people yet.
- Screen share does not send a live desktop capture yet.
- Markdown is a subset: bold, italic, code, quotes, spoilers, mentions, emoji, and links.
- Plugins are trusted local scripts. They never receive the token.
- Linux can compile the shell, but it will not save a token.
