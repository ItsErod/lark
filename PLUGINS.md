# Lark plugins

Plugins are local scripts. Lark loads a plugin’s file only after you turn it on in **Settings → Plugins**, and the pack below starts **off**. The two samples `highlight-mentions` and `code-badge` stay on, the same as before.

A plugin can highlight a message, add a badge, collapse it, ask for a small display effect, or return `null` to hide it. The host keeps `authorId` and the timestamp. Plugins do not receive the token, and the scripts in this folder do not call the network. Treat every plugin as trusted code: it runs with `new Function` in the window.

Send later and the two status plugins are the only ones that cause a Discord request, and they use the same commands as the composer and the profile chip. Those requests are paced: one scheduled send at a time, one presence write per away transition, and a listening line at most every 30 seconds.

## Message translator

Click **Translate** on a message. Lark swaps in a line from a local phrase book (English, Spanish, French, German, Japanese) or from a line you added in the plugin’s settings. Click **Original** to put the message back. Unknown lines stay as they are, and Lark says so. Nothing is sent anywhere.

## Inline syntax

Inline code (`` `const rail = 4` ``) is colored with the same highlighter as fenced blocks. Fenced blocks were already colored. The pass runs only for messages on screen, and only while the plugin is on.

## Quiet media

This is the link-preview toggle and compact media together.

- **Hide** drops embed cards. The link in the message stays.
- **Show** puts the cards back.
- **Images on** caps previews and stickers to a short thumbnail.
- **Images off** leaves attachment size alone.

## Send later

Scheduled send is built in. **Later** in the composer uses the same queue as this plugin, whether or not the plugin is on.

**Later** in the composer queues the draft. The soonest time is 15 seconds from now, the latest is 7 days, and the queue stops at 20. A timer sends the oldest due message, then waits before it looks again, so a stack of due messages cannot go out in one burst. A failed send is retried twice, 30 seconds apart, and then dropped. The queue lives on this device. If Lark is closed, a due message waits until the next time the app is open.

## Quick reactions

Hover a message and the action bar includes 👍 ❤️ 😂 🎉 👀. One click toggles that reaction through the same path as the emoji picker. Nothing reacts on its own.

## Keyword ping

Add words for every channel, or words for the channel you have open. A match is highlighted and badged. On a mentions-only channel, a keyword also raises a desktop notification when the message does not mention you, you are not looking at that channel, and the same word has not already pinged in the last minute. **Mute wins.** The notification rule for the open channel is the same setting as the bell in the header: all, mentions, or mute.

## Auto away

After 5, 15, or 30 quiet minutes, Lark sets you to idle once. A key or a click sets you back to online, again once, and not until 30 seconds after the previous presence write. Do not disturb, invisible, and an idle status you chose yourself are left alone.

## Now playing

Type a track and an artist, then **Show on my status**. The custom status becomes `Listening to …`. If you already have a custom status, it stays until you turn on **Replace a custom status**. When the system media session exposes a title, Lark can use that instead, and only when the line changed, at most every 30 seconds. Lark does not sign in to Spotify and does not read a token to do this.

## Bookmarks

Saved messages are built in. **Save** on a message and **Saved** in the header use the same list as this plugin.

**Save** on a message keeps it in a list on this device. **Saved** in the header opens the list. Opening one jumps to that channel. Discord pins are not changed.

## Hide muted people

**Hide** on a message drops that person’s messages in Lark. **Show** in the plugin’s settings brings them back. This is a local filter. It does not block or mute them on Discord, and it does not call the API.

## Relative time

Timestamps read as `3m ago` or `just now`. Hover or focus the time for the full local date and time. The label refreshes about twice a minute, not on every scroll frame.

## Silent typing

While this is on, the composer does not send a typing indicator. Incoming typing lines are unchanged.

## Samples that were already here

| Plugin | Default | What it does |
| --- | --- | --- |
| highlight-mentions | on | Highlights a message that mentions you |
| code-badge | on | Badges a message that contains a fence |
| hide-joins | off | Hides join and system lines |
| edit-log | off | Badges an edited message |
| collapse-long | off | Folds a message longer than 280 characters |
| translate | off | Rewrites a line that starts with `tr:` if it is in a one-line glossary |

Call Timer, Volume Booster, and the other media plugins are documented in [docs/PLUGINS.md](docs/PLUGINS.md).
