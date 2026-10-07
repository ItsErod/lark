# Lark

Lark is a personal Discord client for one account on macOS and Windows. It is not the official app, and it identifies itself as Lark.

**Discord’s terms do not allow this.** Using Lark can get the account banned. The token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord.

## Download

Installers are on the [Releases](https://github.com/ItsErod/lark/releases) page. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

- [macOS universal .dmg](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.1_universal.dmg) — Apple Silicon and Intel
- [Windows setup .exe](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.1_x64-setup.exe)
- [Windows .msi](https://github.com/ItsErod/lark/releases/latest/download/Lark_2.4.1_x64_en-US.msi)

macOS 11 or newer, or 64-bit Windows 10 or newer. Windows on ARM is not built.

## Install

These builds are unsigned.

On a Mac, Gatekeeper blocks the first open. Right-click the app, choose **Open**, then **Open** again. You can also use **System Settings → Privacy & Security → Open Anyway**. Leave Gatekeeper on.

On Windows, SmartScreen may say the publisher is unknown. Use **More info → Run anyway** only for an installer from the releases above.

## Sign in

The first screen has **Sign in with Discord**, **Sign in in your browser**, and a QR code.

**Sign in with Discord** opens Discord’s own login page in a separate window. The password, two-factor prompt, and captcha stay on that page. Lark waits until Discord’s session appears, stores it, and closes the window.

**Sign in in your browser** opens that same login page in your system browser. Password, two-factor, and captcha stay on Discord’s site. After you sign in, Discord’s page sends a one-time grant to Lark on this computer. Lark exchanges it and stores the session in the macOS Keychain or Windows Credential Manager. The separate login window is unchanged.

**Scan with the Discord mobile app** is Discord’s QR login. The app shows a live code after Discord accepts the handshake, or the reason it could not. The sample code in the browser preview is not a session. If that step asks for a captcha, use **Sign in with Discord** or **Sign in in your browser** instead.

**Advanced** accepts a pasted user token. Quotes, line breaks, and an `Authorization:` label are removed. A bot token or an OAuth bearer token is refused.

The browser preview will not store a token. `npm run dev`, then open [http://127.0.0.1:47321/?demo=1](http://127.0.0.1:47321/?demo=1).

## Features

- Servers, DMs, threads, search, pins, replies, and uploads
- Saved messages, reminders, and scheduled send. Ctrl+K (⌘K on macOS) opens them
- Streamer mode hides emails, tokens, DM previews, and personal info. It can turn on while you share or record
- Composer drafts are encrypted with a key in the macOS Keychain or Windows Credential Manager
- Notifications, a tray icon, and shortcuts (`mod` is Command on macOS and Ctrl on Windows)
- A theme gallery in Settings. The shipped themes are in [THEMES.md](THEMES.md)
- Plugins that stay off until you turn them on. The pack is in [PLUGINS.md](PLUGINS.md)
- Voice: a call view with participant tiles, a control bar, and sidebar speaking rings. Right-click someone for their volume and a local mute. The ring color is in Settings → Voice & Video
- RNNoise on the microphone, with a switch in Settings → Voice & Video
- A soundboard for short WAV clips, with hotkeys, mixed into the voice channel
- Notes on profiles, saved to the Discord account, and friend activity on the friends list
- A voice HUD that can sit on top of a game. It stays off until you turn it on
- A performance strip on that same HUD for RAM, CPU, and FPS
- Game Mode, which eases resource use while a game is in front, with a profile per game
- A clip hotkey saves up to 30 seconds of the main display as an MP4 (H.264 and AAC) while screen share or Game Mode capture is on. The file stays in the clips folder until you attach it
- Paints follow the display, up to 240 fps

## Voice HUD

The HUD is a small always-on-top window that shows who is talking and who is muted. It reads the same voice roster as the channel list. It does not start a second call.

Turn it on with **Ctrl+Shift+O** on Windows or **⌘⇧O** on macOS. The same keys hide it, including while a game is focused. Settings → Voice & Video has the switch, the opacity, and click-through. Click-through is on by default so the game keeps the mouse. Turn click-through off to drag the HUD. The shortcut is `toggle voice overlay` under Settings → Keybinds.

The window is for macOS and Windows. Exclusive fullscreen can cover it. Borderless and windowed games show it. In the browser preview it stays in the corner of Lark instead of a separate window.

**Ctrl+Shift+P** (⌘⇧P on macOS) adds RAM, CPU, and FPS to that window. The shortcut is `toggle perf overlay` under Settings → Keybinds. Opacity and click-through are the same controls as the voice HUD.

## Game Mode

Game Mode pauses interface animations, stops prefetching channels you have not opened, and slows the polls Lark already runs (plugins, relative timestamps, theme refresh, and hardware status). It turns on when a game is in front, or when you toggle it with **Ctrl+Shift+G** (⌘⇧G) or Settings → Lark. Turning off game detection stops the foreground check. GPU sensors still stay off unless Hardware in status is on. While Game Mode is on, the performance strip still shows RAM, CPU, and FPS; the FPS number is a one-second sample on that slower poll, so the frame loop does not stay armed.

Settings → Voice & Video keeps a profile for each game you adjust: push-to-talk on or off, that game's key, and the Game Mode, voice HUD, and performance defaults. Those apply while that game is detected and step back when it closes.

## Limitations

- No video calls.
- Voice does not capture the microphone or play other people yet.
- Screen share does not send a live desktop capture yet. The clip buffer is a separate local recording of the main display, and only while screen share or Game Mode capture is on.
- Markdown is a subset: bold, italic, code, quotes, spoilers, mentions, emoji, and links.
- Plugins are trusted local scripts. They never receive the token.
- Linux can compile the shell, but it will not save a token or a draft key. Drafts stay in memory for that session.
