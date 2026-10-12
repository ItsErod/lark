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

## Streamer Safe

Auto-blur emails, phone numbers, IDs, and direct messages when OBS or streaming is detected, or when you turn it on.

- **On now** forces the blur even if nothing is streaming.
- **When OBS is the front app** uses the same front-app sample as game detection. `obs`, `obs64`, `obs32`, OBS Studio, and Streamlabs count. The sample runs only while this option is on.
- **When sharing or recording** follows a screen share and the clip buffer.
- **Emails, phone numbers, account IDs, direct messages** each have their own switch. A direct message is replaced with “Message hidden”. An email becomes `[email hidden]`, a phone `[phone hidden]`, and a 17–20 digit id `[id hidden]`.

## Clean Links

Strip tracking parameters from links you send and links you click.

- Removed names: `utm_*`, `fbclid`, `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `twclid`, `ttclid`, `li_fat_id`, `mc_cid`, `mc_eid`, `igshid`, `igsh`, `si`, `yclid`, `srsltid`, `scid`, `epik`, `_ga`, `vero_id`, `vero_conv`, `oly_anon_id`, `oly_enc_id`, `rb_clickid`, and `spm`.
- **Clean links you send** rewrites the composer text before it goes out.
- **Clean links you open** rewrites links in messages and the address you actually open.
- A link that is not http(s), and every other query parameter, stays as it is.

## Spoiler Everything

Blur all images and embeds until you click them, with a choice per channel.

- **Every channel** is Blur or Show. Blur is the default once the plugin is on.
- The channel you have open can follow that default, or blur, or show, on its own.
- A click on the image, video, sticker, or embed reveals that message. Another click opens the image.

## Hide Blocked Messages

Fully hide blocked people's messages instead of a Blocked message row.

- Discord tells Lark who is blocked (relationship type 2). With the plugin on, those messages are not drawn.
- With the plugin off, the same people leave a one-line Blocked message so the gap is visible.
- Hiding is local. It does not unblock anyone, and it does not call the API.
