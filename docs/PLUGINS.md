# Lark plugins

These plugins use the existing local plugin host. Each one stays **off** until you turn them on in **Settings → Plugins and Themes**, and each one has its own options there. A plugin never receives the token. The scripts in `store/plugins/` do not call the network. Anything that talks to Discord is a host action you started yourself, through the same commands the rest of Lark already uses.

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

## Translate

Right-click a message and choose **Translate**. The line is replaced in place. **Show original** puts it back.

- Lark asks MyMemory, a free endpoint that does not need a key. Nothing in this plugin stores a token or a paid credential.
- If that request fails, or the quota warning comes back, Lark uses the local phrase book (English, Spanish, French, German, Japanese) and any lines you saved on the message translator.
- **Translate into**, **Source language**, and **Prefer** live in the plugin’s settings. Prefer can try the local book first.
- A line that matches neither stays as it was, and Lark says so.

## Show hidden channels

Channels you cannot view stay in the channel list under **Hidden**, with a lock.

- The topic is shown under the name when **Show topics** is on.
- Clicking one does not open it and does not fetch its messages. Lark says you cannot view it.
- Categories are left out. A channel you can already open is unchanged.

## Spotify controls

A small player sits above your name in the user panel.

- It reads the listening line already on a profile (`Listening to …`). It does not sign in to Spotify and it does not store a key.
- A Spotify track, album, or playlist link in the open channel fills in an **Open** link. Without a link, **Open** searches Spotify for the title.
- **Listening status** and **Spotify links** can be turned off on their own.

## Keyword highlights

Highlight a word or a small regular expression in every server, and optionally notify.

- One pattern per line. `deploy` matches that word anywhere, ignoring case.
- `/deploy/i` is a regular expression. Flags are `i`, `m`, and `u` only.
- Patterns that match an empty string, use a backreference, or nest a quantifier inside a quantified group are dropped.
- **Also in this server** adds lines that apply only while you are in that server. The global list still applies everywhere, including direct messages.
- **Notifications** pings when the channel is not muted, you are not already looking at it, and Lark did not already notify you for that message. The same pattern in the same channel waits a minute before it can ping again. **Mute wins.**

The highlight is the same wash as other keyword highlights.

## Pin DMs

Right-click a direct message and choose **Pin**. While this plugin is on, pinned conversations move into a **Pinned** category above **Direct messages**, in the order you pinned them. **Unpin** in the plugin’s settings, or **Unpin** on the conversation, puts it back. The list is the same local pin list Lark already keeps. Discord’s own pin list is unchanged. With the plugin off, pinned conversations still sit at the top of **Direct messages**.

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

## Quick reply templates

Save a name and a line in the plugin settings. **Replies** in the composer inserts that line at the caret. The list stays on this device, up to 30 replies.

## Copy message markdown

Right-click a message and choose **Copy Markdown**. The message text is copied. **Include author and time** adds a bold name and the timestamp above it.

## Image zoom

Open an image, then click it to zoom in or scroll to zoom in and out. **Largest zoom** is 2×, 3×, or 4×. Clicking the dim area around the image still closes it.

## Read all

**Read all** in the channel header, or **Mark every server read** in the plugin’s settings, clears unread badges in every server.

- Unread text, announcement, forum, media, and thread channels are included. Voice channels and categories are not.
- **Muted channels** are skipped unless you include them.
- **Direct messages** are included unless you turn that off.
- Lark updates the badges immediately, then tells Discord about one channel at a time.

## User whois

Hover a name or an avatar. The card shows:

- **Account age**, from the user id.
- **Mutual servers**, from people already loaded in those servers and from the profile.
- **Join date**, from the profile, for the server you are in.

Each line can be turned off. Streamer mode hides the card. The hover does not change roles or send a message.

## Emote cloner

Right-click a custom emoji or a sticker and choose **Add to** a server where you can manage expressions (or you own the server). Lark downloads that image from Discord’s CDN and uploads it with the same server action the expression settings use. You start every copy. The plugin does not receive the token.

**Stickers** can be turned off if you only want emoji.

## Message scheduler

**Schedule** in the composer queues the message you just wrote. Pick a time, at least 15 seconds from now and at most 7 days. The default delay is 15 minutes, 1 hour, or 1 day.

The queue stays in memory. Closing Lark drops it, including anything that was due while the app was closed. Turning the plugin off drops messages that are already due instead of sending them. Lark sends one due message at a time. A failed send is retried twice, then dropped. Nothing is scheduled unless you press Queue.

## Reverse image search

Right-click an image in a message and choose **Google Lens**, **TinEye**, or **Yandex**. Each engine can be turned off in the plugin’s settings. Lark opens the search in your browser. Only an `https` image address is used, and only when you pick it. The plugin does not receive the token and does not upload the file itself.

## Bigger emoji

A message that is only emoji, up to 27 of them, grows to the size you pick: **32px**, **48px**, **64px**, or **96px**. A message with any other text stays the normal size. Custom emoji and ordinary emoji both count.

## Voice Message Downloader

A **Download** button sits on a voice message. **Every attachment** adds that button to images, video, and other files too.

The file is saved from the link Discord already sent. Nothing else is requested.

## View Original Image

**Original** on an image opens the full-size picture and downloads it.

- **Open and download** does both.
- **Open full size** only opens it.
- **Download** only saves it.

The preview's width and height are dropped. A signed Discord link keeps its expiry. The same button is on images inside embeds.

## YouTube Picture-in-Picture

**Pop out** on a YouTube embed opens a floating player.

- **Small** is 320×180. **Medium** is 480×270.
- **Muted** starts the player silent. **With sound** does not.
- The player address is built when you click Pop out. A message that merely contains a YouTube link does not load it.
- Close dismisses the player. Escape does the same.

## Quick Clip Share

One hotkey sends the newest clip in the clips folder to the channel you have open.

- **Ctrl/Cmd Shift X** is the default. **Ctrl/Cmd Shift K** and **Ctrl/Cmd Alt X** are the other choices. Save clip stays on Ctrl/Cmd Shift C.
- The newest clip is the one with the latest modified time.
- If the file is over the upload limit, Lark uses the existing Clips compression setting: send, compress, ask, or block.

## Game Activity Toggle

**Show** puts the detected game on your profile as what you are playing. **Hide** takes it off.

- The game is a playing activity. It is not written into your custom status.
- Hiding it sends the next presence without that activity. A status you typed stays.
- With the plugin off, Lark does not add a game activity.

## Now Playing Status

Your custom status can follow the detected game or whatever this computer is playing.

- **Game or player** uses a track when one is playing, and the game otherwise.
- **Current game** reads `Playing Hades II`.
- **System player** reads `Listening to Apricot — Maya`. That player is the system media session, including Spotify. Lark does not sign in.
- **Keep a status you wrote** leaves a custom status alone. **Replace it** overwrites it.
- This is separate from the Now playing plugin. Both share the same short wait between status writes.

## Read receipts

A message you scroll past can show **Seen**.

- The mark is stored on this device, one cursor per channel.
- Lark does not send a read receipt. Incognito and Mark read are unchanged.
- **Show Seen** turns the label off without forgetting the cursor.

## Mention digest

**Mentions** in the channel header lists channels that already have a mention count.

- The list uses counts Lark already has. It does not fetch history.
- **Include direct messages** can leave those out.
- Opening a row jumps to that channel.

## Word counter

The composer shows how many words you have typed, next to the character count.

- **Badge a message** can mark a message of 40, 100, or 280 words. **Off** leaves messages alone.
- The count stays on this device. Nothing is sent.

## Reply chain

Right-click a reply and choose **Reply chain**.

- Lark walks the reply parents that are already loaded, up to 12.
- A parent that isn't loaded stops the chain. It is not fetched.
- A repeating chain stops instead of looping.

## Show connections

Right-click a message and choose **Connections**.

- Lark loads that one profile and lists linked accounts.
- The same profile is reused for five minutes. The member list is not scanned.
- Streamer mode hides the names.

## Local nicknames

Right-click a message and choose **Local nickname**.

- The name is shown in messages and the member list on this device.
- **Clear** removes it. Discord's nickname is unchanged.
- The list stops at 100 names, and each name stops at 32 characters.
