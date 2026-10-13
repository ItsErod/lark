# Lark parity remaining — 13 Oct 2026

Code reading of `main` at `a8a4683` (after [#206](https://github.com/ItsErod/lark/pull/206)). The latest published installer is still [v3.0.3](https://github.com/ItsErod/lark/releases/tag/v3.0.3). This pass did not sign in to Discord. Draft PR #8 stays closed.

The 202-row inventory in [PARITY-3.0.md](PARITY-3.0.md) was scored at `2a5ea2f`, before the 3.0 streams. Those tables still say Missing for friends tabs, DM calls, server settings, search filters, and the call grid. The client on current main has those paths.

**Coverage: about 90%** of that 202-row inventory. Done counts as 1, Partial as 0.5. Nitro, Shop, Quests, billing, gift checkout, password, MFA, and Krisp count as satisfied because they stay link-outs or on RNNoise on purpose. High-traffic chat, friends, DMs, and joining a call sit above that. Server-admin pages were read as source, not clicked on a live server, so the whole-inventory figure stays at about 90% rather than the mid-90s the chat path would suggest.

## High-traffic areas

| Area | Now | What is still open |
| --- | --- | --- |
| Home / Friends | Done | Online, All, Pending (with a badge), and Add Friend. Rows show a server tag and an activity line with elapsed time. Active Now is a column of cards with art, Live, Watch, and Join. Nitro, Shop, and Quests are rail buttons that open Discord. |
| Direct messages | Done | Header voice and video calls, add people, profile side panel, close, group member count, 1:1 “in voice” / LIVE, and the right-click menu (pin, favorite, mute, block, copy id when Developer Mode is on). Incoming DM and group calls ring, with Answer and Decline, including from a background notification. |
| Servers and channels | Done | Folders, categories, channel and server menus, create and join, invites, and the server-settings pages (profile, roles, members, invites, audit log, bans, AutoMod, community). |
| Voice | Partial | Join, Opus, DAVE, playback, Go Live, stage board (audience, raise hand, topic), guild soundboard, camera send and receive, loss and jitter, the muted-talk banner, and HUD mute and deafen hotkeys. The three gaps below are the ones people will feel. |
| Settings and accessibility | Done | Account, privacy, appearance (Light, Ash, Dark, Onyx plus the Lark gallery), text size 12–24, contrast, density, saturation, reduced motion (System / Reduce / Allow), and pause GIF and sticker autoplay. |
| Search | Partial | In a server or an open DM, search sends `from:`, `mentions:`, `has:`, `before:`, `after:`, `in:`, and `pinned:` to Discord, and falls back to messages already on the device. |
| Store | Done for Lark’s store | In-app browse, kind and category filters, changelog on the row, and up to six theme swatches. Discord’s Shop stays a link. |

## Top 15 remaining gaps

Ranked by how often someone hits them in a normal day. Admin-only and link-out rows sit lower.

1. **Activities do not run inside the call.** The Apps list can create an activity invite and toast the link. Watch Together in the call is a YouTube embed. Poker Night, Chess, and the other listed activities never open a session in Lark.
2. **Camera video is a thumbnail.** Send and receive are real (`voice_camera.rs` seals H.264 on the voice socket; `camera-view.ts` decodes it). The capture size is 320×176 at 15 fps, so a video call is a small picture.
3. **Echo cancellation is a one-tap filter.** The voice panel and Voice & Video can turn it on. The processor subtracts one delayed copy of the playback mix. A call on speakers can still feed the mic. RNNoise stays the noise suppressor. Krisp stays out.
4. **Slash commands with options have no form.** The Apps list runs a command that needs no arguments. Anything with options tells you to type it in the composer. Bot-heavy servers hit this on every command.
5. **Discover leaves the app.** The rail button and Add Server open `discord.com/discovery` in the browser. There is no in-app server browser.
6. **Search on Home does not ask Discord.** With no server and no open DM, the search box only shows messages already loaded. Filters work once a server or DM is open.
7. **The create-or-join shortcut opens Discord’s site.** The rail plus button opens the in-app Add Server modal. Ctrl+Shift+N (Command+Shift+N on macOS) goes to `discord.com/channels/@me` instead.
8. **The language list is wider than the translations.** Settings offers English, French, Spanish, German, Portuguese, Japanese, Korean, Chinese, and several more. Phrase catalogs exist for French, Spanish, German, and Brazilian Portuguese. The other choices leave the interface in English.
9. **Connections cannot be added here.** YouTube, Spotify, Steam, and Xbox show up when Discord returns them. Adding one opens Discord. Now Playing reads the system media session and does not sign in to Spotify.
10. **The App Directory leaves the app.** Server settings can list bots and webhooks. Installing an app opens `discord.com/application-directory`.
11. **The email notification switch is local.** Notifications stores the toggle on this device and links to Discord to manage mail. It does not change Discord’s email setting.
12. **Custom status emoji is a text field.** Clear-after (never, today, and the timed choices) works. The emoji control is a box you type into, not the emoji grid.
13. **A store theme has swatches, not a live preview.** An install row shows up to six colours. The theme applies after install. Discord’s Shop is a separate link-out and stays that way.
14. **A profile is one card.** Banner, about, note, badges, mutual servers, and mutual friends render. There is no second, full-profile page.
15. **A group DM row does not show an in-call mark.** A 1:1 row shows “in voice” and LIVE when that person is streaming. A group row shows the member count only.

Left on purpose: Krisp (RNNoise stays), Nitro, Shop, Quests, billing, and gift checkout. Do not build those.

## Closed overnight

The earlier gap list (agent artifact `overnight-gaps.md`, after [#180](https://github.com/ItsErod/lark/pull/180)–[#183](https://github.com/ItsErod/lark/pull/183)) had ten leftovers. Eight are on main. Activities are still gap 1. PR #8 was already closed and was left alone.

| Prior gap | Where it closed |
| --- | --- |
| Voice panel names ping quality. The HUD shows that line, the front game, and Deafened separately from Muted. | [#180](https://github.com/ItsErod/lark/pull/180) |
| In-app store search, kind and category filters, changelog on the install row. | [#181](https://github.com/ItsErod/lark/pull/181) |
| Streamer mode hides `discord.gg` and `/invite/` links, and drops a link target that contains an invite, email, or token. | [#182](https://github.com/ItsErod/lark/pull/182) |
| Ctrl+Alt+Up / Ctrl+Alt+Down move along the server rail, including servers inside a folder. | [#183](https://github.com/ItsErod/lark/pull/183) |
| Quiet hours, keyword alerts, and a missed-message digest. | [#184](https://github.com/ItsErod/lark/pull/184) |
| Share and trim clips from the gallery. | [#185](https://github.com/ItsErod/lark/pull/185) |
| Offline search across messages already on this device. | [#186](https://github.com/ItsErod/lark/pull/186) |
| First channel paints before settings, thread code, and the preview QR. Cold start on the bench medians in [PERF.md](PERF.md) moved from 148.8 ms to 131.7 ms, then to 123.8 ms after the follow-up. | [#187](https://github.com/ItsErod/lark/pull/187), [#203](https://github.com/ItsErod/lark/pull/203) |
| Incoming DM and group calls ring, with sound, Answer, Decline, and a background notification. | [#188](https://github.com/ItsErod/lark/pull/188) |
| “You’re talking while muted” banner. The meter uses the voice-activity gate and does not transmit. | [#191](https://github.com/ItsErod/lark/pull/191) |
| Mute and deafen from global HUD hotkeys. The overlay stays click-through. | [#194](https://github.com/ItsErod/lark/pull/194) |
| Packet loss and jitter on the voice panel, beside the ping bucket. | [#198](https://github.com/ItsErod/lark/pull/198) |
| Voice & Video no longer says the camera is unused. It opens for the preview and for video in a call. | [#200](https://github.com/ItsErod/lark/pull/200) |
| Theme swatches on store install rows. | [#202](https://github.com/ItsErod/lark/pull/202) |
| Pause GIF and sticker autoplay. | [#204](https://github.com/ItsErod/lark/pull/204) |
| In-app reduced motion: System, Reduce, or Allow. | [#205](https://github.com/ItsErod/lark/pull/205) |

Also on main since v3.0.3, outside that gap list: Mono store themes ([#190](https://github.com/ItsErod/lark/pull/190), [#192](https://github.com/ItsErod/lark/pull/192), [#197](https://github.com/ItsErod/lark/pull/197)), the optional Minimal Mono dashboard ([#201](https://github.com/ItsErod/lark/pull/201)), and a local stats page for play time, voice, and usage ([#206](https://github.com/ItsErod/lark/pull/206)). Pull-request CI now runs clippy, rustfmt, eslint, and native tests ([#193](https://github.com/ItsErod/lark/pull/193)), with a release test gate ([#195](https://github.com/ItsErod/lark/pull/195)) and a perf check that fails on a large regression versus main ([#196](https://github.com/ItsErod/lark/pull/196)). Those are build gates, not user-facing Discord gaps.
