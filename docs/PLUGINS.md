# Lark plugins

These plugins use the existing local plugin host. Each one stays **off** until you turn them on in **Settings → Plugins**, and each one has its own options there. A plugin never receives the token. The scripts in `plugins/` do not call the network.

## Message logger

Turn this on and Lark keeps a copy of edited and deleted messages on this device.

- A deleted message stays in the channel, greyed out, with a Deleted label. It is not sent back to Discord.
- An edited message keeps the earlier drafts under the current text.
- **Show deleted messages** and **Show edit history** can be turned off without wiping the log. **Clear log** removes it.
- The log stops at 200 messages, and each one keeps up to 8 earlier drafts.

## Call Timer

The voice panel shows how long the call has been up.

- **Connected** starts the clock when the call connects.
- **Join** starts it when you join, including the connecting time.
- **Hours when needed** reads `1:05` until an hour has passed, then `1:01:01`.
- **Always show hours** reads `0:00:03`.

The clock stays on this device. It does not tell anyone else.

## Volume Booster

Right-click someone in voice and the volume slider can go past 200%.

- **200%**, **300%**, or **400%** is the ceiling while the plugin is on.
- **Mute for you** still silences that person. The slider position is kept.
- Turning the plugin off sends playback at 200% again. A higher level you already set is kept for the next time you turn it on.

The extra gain is only applied to that person's playback on this computer.

## Better timestamps

The clock under each message can read as `3m ago` or as a clock time.

- **Relative** and **Absolute** switch the label. Hover or focus the time for the full local date, including seconds.
- **12-hour** and **24-hour** choose the clock. The hover date uses the same choice.
- The relative label refreshes about twice a minute.

## Silent typing

While this is on, the composer does not send a typing indicator. Incoming typing lines are unchanged. The switch is the only option.

## Typing indicators

A channel row and a direct-message row can show that someone is typing there.

- The label reads `typing`, or `2 typing` when more than one person is going. Hover it for the names.
- **Channel list** and **Direct messages** turn each list off on its own.
- The label clears about eight seconds after the last typing event, the same window as the line under the composer.

## Panic Key

A hotkey that instantly hides or minimizes Lark and mutes.

- **Hotkey.** Default is Ctrl+Shift+H, or Command+Shift+H on macOS. Click the key, then press a new chord. A shortcut without a modifier is ignored, so a letter in the composer cannot fire it.
- **Window.** Hide covers the window. Minimize leaves it on the taskbar or dock. Either way the chat is blanked first, so a capture of the animation does not show messages.
- **Mute and deafen.** On by default. A live call is muted and deafened through the same voice path as the mute button. With no call, only the window moves.
- Press the hotkey again after Lark is visible to bring the chat back.

## Incognito Mode

Don't mark channels read until you choose, and hide your activity locally.

- **Hold read receipts.** Opening a channel, following the bottom, or sending a message does not tell Discord the channel is read. The unread badge stays, including while the channel is open. **Mark read** in the header, or Esc when nothing else is open, is the choice that sends the receipt.
- **Hide activity on this device.** The account chip says Incognito. Your custom status and activity line are blank on this screen. Lark does not send a typing indicator, and it does not publish an automatic status from auto away, now playing, or hardware. A status you set yourself still publishes.

