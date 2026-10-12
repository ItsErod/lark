# Lark 3.0 parity

Analysis only. This document compares Lark at `2a5ea2f` (2.4.5 plus the first parity note) with the Discord web client inventory captured on 12 Oct 2026. It does not add features.

The first pass reconstructed a client from public patch notes because `discord-audit.md` never landed. The condensed inventory (Home, DMs, servers, composer, settings) is the next section. A later section is the server-settings and voice deep-dive. Stage, forums, polls, and search filters stay in the entry-point section so the original brief is still covered.

Status values:

- **Done** — a person can use the feature the way Discord web does.
- **Partial** — some of the path works, and a named gap remains.
- **Missing** — there is no user-facing path.

Nitro purchasing, Shop purchasing, Quests purchasing, and billing payments are link-outs. Do not build a checkout.

`README.md` still says the microphone is not captured and other people are not played. That sentence is stale. Voice send and playback are implemented in `crates/lark-core/src/discord/voice_media.rs`.

## Home

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Friends tabs: Online, All, Pending with a badge, Add Friend | Partial | `paintFriends` in `src/ui/app.ts` groups Online, Idle, Do not disturb, and Offline. No All / Pending / Add Friend tabs, and no pending-request badge. Relationships keep type `1` only (`friends_from_relationships` in `crates/lark-core/src/discord/types.rs`). |
| Friend rows: status | Done | Status dot on each `friend-row`. |
| Friend rows: Server Tag | Missing | No clan or server-tag field on `Person` (`src/types.ts`). |
| Friend rows: activity | Partial | `friendGlance` in `src/social.ts` shows one flattened string. `activity_parts` in `types.rs` keeps `Playing …` or `Listening to …` and drops elapsed time, assets, and party details. |
| Active Now column | Partial | `activeFriends` renders up to six chips on the friends board, not a column of cards. |
| Active Now voice cards with LIVE / Watch Stream | Missing | No voice or stream card on Home. Go Live itself is elsewhere (`src/ui/share-view.ts`). |
| Active Now game activity with elapsed time and rich presence | Missing | Activity is a string. No timestamp, no large art, no buttons. |
| Nitro Home page | Missing | Link-out only. `premiumType` is used for upload limits in `src/clips.ts`. |
| Shop page | Missing | Link-out only. Do not render a store. |
| Quests page | Missing | Link-out only. Do not render quests or claims. |

## Direct messages

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Quick switcher | Partial | `openSwitcher` in `src/ui/app.ts` and `commandCatalog` in `src/palette.ts` jump to channels, DMs, and Lark commands. No people search and no paste-an-invite join. |
| DM row status | Done | Avatar status dot in `channelButton` when `kind === "dm"`. |
| DM row voice indicator | Missing | A joined voice channel is marked in the server list. A DM row does not show that the person is in voice. |
| Group DMs with member count | Partial | Kind `3` maps to `"group"` and the row uses the channel name. No member count. No create, rename, or add-member flow. |
| Close button on a DM row | Missing | No hide or close control. |
| DM header: voice call | Missing | `paintHeader` has no call button. `joinVoice` is for a channel you already opened. |
| DM header: video call | Missing | `toggleCamera` only flips a local flag. |
| DM header: pins | Done | Pin button calls `paintPins`. |
| DM header: add to DM | Missing | No add-recipient control. `open_dm` in `rest.rs` opens a 1:1 from a profile. |
| DM header: toggle profile panel | Missing | Profile opens as a modal from a click (`openProfile`), not as a DM side panel. |
| DM header: search | Done | Message search and the command palette are in `paintHeader` for DMs too. Filters are missing; see Search below. |
| Profile panel: banner, about, note, mutual server count, mutual friend count, member since, Message | Done | `renderProfileCard` in `src/ui/profile.ts`. Notes save with `set_user_note`. |
| Profile panel: badges | Missing | Not on `WireProfile`. |
| Profile panel: join voice | Missing | No voice action on the card. |
| Profile panel: full profile | Missing | One card, no second page. |
| Profile panel: add friend | Missing | No relationship mutation. |
| DM right-click menu | Missing | DM rows have no `contextmenu` handler. The actions below are absent as a menu. |
| Mark As Read | Missing | Read state only moves forward via `ack_message`. |
| Pin (conversation) | Missing | Message pins exist. A DM cannot be pinned to the top of the list. |
| Add to Favorites | Missing | No Favorites list. Lark’s Saved messages are bookmarks, not this. |
| Profile, Start a Call | Missing | Profile is a left click. No call entry. |
| Note, Friend Nickname | Partial | The note field is on the profile card and syncs to Discord. No nickname editor, and neither is on a right-click. |
| Close DM, Apps, Invite to Server | Missing | |
| Remove Friend, Ignore, Block | Missing | |
| Mute (DM) | Partial | The header bell cycles a local level (`cycleNotify`). It is not this menu, and it is not written back to Discord. |
| Copy User ID, Copy Channel ID | Missing | No developer-mode copy. |

## Servers

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Favorites | Missing | No favorites section in the channel sidebar. |
| Folders: drag, expand, sync | Done | `src/folders.ts`; `set_guild_folders` in `rest.rs`. |
| Folder menu: Mark As Read, Move to | Missing | `onRailContextMenu` only opens a folder when you right-click one. |
| Folder Settings | Partial | `openFolderMenu` renames the folder and picks a color. That is the whole menu. |
| Add a Server modal with templates | Missing | No add button on the rail. |
| Join a Server from that modal | Missing | Join works only from an invite link already in chat (`openInvite`, `accept_invite`). |
| Discover | Missing | `crates/lark-core/src/discord/page.rs` allows `/discovery` in the login window only. |
| Server right-click: Mark As Read, Invite, Mute Server, Notification Settings, Hide Muted Channels, Server Settings, Privacy Settings, Per-server Profile, Create Channel, Create Category, Create Event, Move to, Copy ID | Missing | Right-click on a server icon does nothing. `onRailContextMenu` returns unless the target is a folder. |
| Server header dropdown, including Server Boost and App Directory | Missing | `channel-head` is a plain title. Boost is link-out only. App Directory is link-out only. |
| Events entry in the sidebar | Missing | No scheduled-event list. |
| Server Boosts entry | Missing | Link-out only. No level on the server. |
| Categories: collapse | Done | `toggleCategory`; `set_channel_collapsed` in `rest.rs`. |
| Categories: mute, notifications, edit, delete | Missing | Category headers only collapse. |
| Channel right-click: Mark Read, Favorite, Invite, Pin Channel to Top, Copy Link, Mute, Notifications, Move, Edit, Duplicate, Delete, Copy ID | Missing | Channel rows only select or join. Mute is the header bell, local, for the open channel. |
| Private channels | Partial | `canSeeChannel` / `can_view_channel` in `crates/lark-core/src/discord/shell.rs` hides a channel you cannot view. Channels you can view that are still private to other roles have no lock. |
| Member list grouped by role | Done | `groupMembers` in `src/members.ts`; gateway member-list op 14. Presence and click-to-profile work. Sort and activity overflow menus do not. |

## Text channel header

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Threads | Missing | Active threads nest in the sidebar (`threadsFor`). The header has no Threads button. |
| Notifications | Partial | Bell calls `cycleNotify` and stores all / mentions / mute on this device. |
| Pins | Partial | The button opens `paintPins`, and `pinMessage` calls `set_pin`. `unpin_message` in `src-tauri/src/lib.rs` is never called. |
| Members | Done | Toggles `show_member_list`. |
| Server search | Partial | `paintSearch` calls `search_guild` with `content=` only (`rest.rs`). |
| Search filters (`from:`, `mentions:`, `has:`, `before:`, `after:`, `in:`, `pinned:`) | Missing | No parser and no extra query parameters. |
| Inbox | Missing | Mention badges on the rail are not an inbox. |
| Help | Missing | No help button. |

## Composer

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Text box, Enter to send, Shift+Enter | Done | Composer handler in `src/ui/app.ts`. |
| + menu | Missing | Upload is a separate file button (`takeFiles`), not a plus menu. |
| + Upload | Done | File input, paste, and drag-drop. Chips show names, not thumbnails, and there is no spoiler flag. |
| + Create Thread | Missing | |
| + Create Poll | Missing | No poll field on the message struct in `types.rs`. |
| + Use Apps | Missing | |
| Gift button | Missing | Link to Discord’s Nitro page. Not a checkout. |
| GIF picker, including Shift-click to insert the URL | Missing | |
| Sticker picker | Missing | Incoming stickers render in `src/ui/messages.ts`. |
| Emoji picker | Done | `emojiPicker`; `emojis` in `rest.rs`. `:` autocomplete is missing (`mentionQuery` in `src/mentions.ts` is `@` and `#` only). |
| Apps launcher (activities) | Missing | The activity icon on a call opens the local soundboard (`src/ui/voice-view.ts`). |
| Slash menu, built-in and app commands | Missing | The command palette is Lark commands (`src/palette.ts`), not Discord slash commands. |

## Message hover and message menu

Discord’s hover bar is three quick reactions, Add Reaction, Edit, Forward, and More. The right-click menu is the long list below. Lark has no message `contextmenu`. The hover bar is the only menu.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Three quick reactions on hover | Partial | `store/plugins/quick-react/plugin.js` adds five emoji, and only after the plugin is turned on. The default bar does not show them. |
| Add Reaction | Done | `src/ui/messages.ts` action row; `toggleReaction`. |
| Edit (your messages) | Done | `beginEdit`; `edit_message`. |
| Forward | Missing | |
| More | Missing | No overflow menu. |
| Reply | Done | On the hover bar, not a right-click. |
| Copy Text | Missing | |
| Pin | Done | Hover action. Unpin is missing, as above. |
| Bookmark | Partial | Hover **Save** stores a local bookmark (`src/pack/bookmarks.ts`). It is not a right-click, and it does not sync to Discord. Opening one jumps to the channel, not the message. |
| Create Reminder | Partial | Hover **Remind** schedules a local notification (`src/reminders.ts`). Same placement gap. |
| Apps | Missing | |
| Mark Unread | Missing | |
| Copy Link | Missing | |
| Speak Message | Missing | No TTS. |
| Delete (your messages) | Done | Hover action, with a confirm banner. |
| Copy ID | Missing | Developer mode is also missing. |
| Who reacted | Missing | Counts and `me` only (`RawReaction` in `src/types.ts`). |

## User panel

The user panel is the chip at the bottom of the channel list (`paintChannels`), not the voice bar that appears only after you join.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Status popout: online, idle, do not disturb, invisible | Done | `openProfile(me, true)` and `setStatus`. |
| Custom status text | Partial | A plain 128-character string. No emoji and no clear-after. |
| Account switching | Missing | One token. `src/ui/signin.ts`. Forget token signs out. |
| Mute and deafen on the user panel | Partial | `voicePanel` shows mute and deafen only while a call is connected. The resting user chip has neither button. |
| Device dropdowns on those buttons | Missing | Input and output pickers live in the in-call gear (`paintGear`) and in Settings → Voice & Video, not on the user-panel buttons. |

## User settings

Discord’s pages, in the inventory’s order. Lark’s settings catalog is `SETTINGS_SECTIONS` in `src/ui/settings.ts`.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Account: username, email, phone | Missing | `paneAccount` shows avatar, name, masked id, and where the token is stored. It does not load email or phone. |
| Account: password, MFA | Missing | Link to Discord. Do not collect a password or a MFA secret in Lark. |
| Account: devices | Missing | No session list. |
| Account: standing | Missing | |
| Account: disable or delete | Missing | Link to Discord. Do not collect a delete confirmation that Lark sends itself. |
| Data & Privacy toggles | Missing | A link-out for a data request is enough for the download. The toggles themselves are absent. |
| Messaging Permissions: sensitive-content filters, spam filters, DM permissions, friend-request permissions | Missing | `panePrivacy` is streamer mode (`src/privacy.ts`), not this page. |
| Notifications: desktop, notify-me-when, sounds, unread badge, emails | Partial | `paneNotifications` has a default of all / mentions / mute, a test notification, and highlight keywords. Not this list. |
| Nitro, Server Boost, Subscriptions, Gift Inventory | Missing | Link-out rows. No plan picker. |
| Billing | Missing | Link-out only. No payment form and no transaction list. |
| Voice & Video: devices | Done | `paneVoice` stores input, output, and a camera id. |
| Voice & Video: mic test | Missing | |
| Voice & Video: input profiles | Missing | Per-game push-to-talk profiles are Lark’s (`paneGaming`), not Discord input profiles. |
| Voice & Video: sensitivity | Done | Slider, used by VAD in `produce_frame` (`voice_media.rs`). |
| Voice & Video: Krisp noise suppression | Partial | RNNoise in `crates/lark-core/src/discord/noise.rs`. Not Krisp, and the copy says echo cancellation stays off. |
| Voice & Video: echo cancellation | Missing | |
| Voice & Video: push to talk | Done | `pushTransmit` and the keybind. |
| Voice & Video: automatic gain control | Missing | |
| Voice & Video: camera test | Missing | The camera id is stored. Video is not sent. |
| Voice & Video: stream previews | Partial | The in-call share dialog previews a source (`src/ui/share-view.ts`). Settings has no preview wall. |
| Voice & Video: per-sound toggles | Missing | |
| Appearance: Light, Ash, Dark, Onyx | Missing | `paneAppearance` applies Lark theme files (`src/themes.ts`), not these four modes. |
| Appearance: color themes | Partial | The gallery and CSS/JSON import are a different system. Keep them. |
| Appearance: app icon | Missing | |
| Appearance: message media and embed toggles | Missing | The quiet-media plugin can hide embeds locally (`store/plugins/quiet-media/plugin.js`). |
| Accessibility: text size 12–24 | Partial | The slider is 12–20 (`paneAppearance`, clamped in `src/config.ts`). It is on Appearance, not an Accessibility page. |
| Accessibility: underline links, UI density, group spacing, saturation, high contrast | Missing | |
| Accessibility: compact or cozy | Partial | Cozy, compact, and IRC are one density control, and IRC is extra. Discord splits UI density from message density. |
| Keybinds | Partial | `paneShortcuts` rebinds Lark’s list (`SHORTCUT_COPY`). |
| Language and time format | Missing | |
| Activity Privacy | Missing | |
| Connections | Missing | |
| Developer Mode | Missing | |
| Log Out | Partial | Forget token deletes the local session (`clear_token`). It is not labeled Log Out and it does not switch accounts. |

## Server settings

Lark has no server-settings sidebar. `src/ui/settings.ts` is account and app pages only. Emoji names are fetched for the picker (`emojis` in `rest.rs`) and never managed. Boost rows are read-only: show the level and perks, and link to Discord to buy a boost. Do not build a checkout.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Server Profile: name, icon, banner, icon color presets, traits, description, games, private profile, live preview | Missing | |
| Server Tag: 4-character tag, badge, colors, preview | Missing | Friend rows also lack a server tag. |
| Engagement: system message toggles and channel, activity feed, default notifications, inactive channel, timeout, widget | Missing | System join lines render as plain text. There is no toggle for them. |
| Boost Perks: progress bar, banner and invite backgrounds, custom invite link | Missing | Read-only perk display plus a link. No boost purchase. The custom invite field is the vanity URL, which is also missing. |
| Emoji: 50 slots, upload, bulk | Partial | `fetch_emojis` fills the picker. No slot count, upload, or bulk add. |
| Stickers: slots, upload | Missing | Incoming stickers render. No server sticker table. |
| Soundboard: upload, slots, table | Missing | Guild sounds are not fetched. Local WAV clips stay in Voice & Video. |
| Members: table with Member Since, Joined Discord, Join Method, Roles, Signals | Missing | The sidebar list is not this table. |
| Members: add roles, mod view, prune, sort | Missing | |
| Roles: @everyone default, create, reorder | Missing | Roles are read for colors and for `can_view_channel`. |
| Roles editor tabs: Display, Permissions, Links, Manage Members | Missing | |
| Permission list: General, Membership, Text, Voice, Apps, Events, Advanced, Administrator | Missing | |
| Invites: list, pause, create | Missing | Preview and accept exist (`invite_preview`, `accept_invite`). |
| Access: Invite Only, Apply to Join, Discoverable, age-restricted, rules editor | Missing | |
| Integrations: webhooks, followed channels, bots | Missing | |
| Safety Setup: verification level, 2FA for mods, prune restriction, content filter | Missing | |
| Audit Log: filter by user and action | Missing | |
| Bans | Missing | |
| AutoMod: mention spam, spam content, flagged words, custom words, with actions | Missing | |
| Enable Community | Missing | |
| Server Template | Missing | |
| Delete Server | Missing | |
| Boosts page with levels and perks | Missing | Read-only. Link out to buy. |

## Edit channel, create channel, and the invite modal

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Edit Channel overview: name, topic, slowmode, spoiler, age-restricted, hide after inactivity | Missing | Topic is shown in `paintHeader`. Nothing edits it. No `rate_limit_per_user` on the channel. |
| Voice overview: bitrate 8–96 kbps, video quality, user limit, region | Missing | Kind `2` joins a call. No channel editor. |
| Edit Channel permissions: sync with category, private, advanced overwrites | Missing | `can_view_channel` in `shell.rs` enforces overwrites. There is no editor. |
| Edit Channel invites | Missing | |
| Edit Channel integrations: webhooks | Missing | |
| Create Channel modal: Text, Voice, or Forum, plus private | Missing | |
| Invite modal: friend search, copy link, expiry, max uses, roles, temporary membership | Missing | The join card (`openInvite`) is the reverse direction. |

## Events, member menu, and inbox

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Events popout | Missing | No scheduled-event payload. |
| Events wizard: location (voice or elsewhere), topic, date, time, frequency, description, cover | Missing | |
| Member right-click: Profile, Mention, Per-server Profile, Apps, Roles, Mod View, Copy ID | Missing | `memberButton` opens the profile on click. No `contextmenu`. |
| Profile popout: pronouns, bio, roles | Done | `renderProfileCard` in `src/ui/profile.ts`. |
| Profile popout: server tag, badges, widgets | Missing | |
| Inbox: Unreads | Missing | |
| Inbox: Mentions | Missing | Rail badges are not an inbox. |
| Inbox: Bookmarks | Partial | Saved messages are a local list (`src/pack/bookmarks.ts`), opened from the header, not an inbox tab. |
| Inbox: Reminders | Partial | `src/reminders.ts` is a local list, not an inbox tab. |
| Inbox: Mark All Read | Missing | |
| Inbox: friend requests | Missing | Pending friends are not loaded. |

## Voice channel, voice panel, and call view

The sidebar voice panel is `voicePanel` in `src/ui/app.ts`. The call grid is `renderCallStage` in `src/ui/voice-view.ts`. Participant volume is `paintVoiceMenu`.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Voice channel right-click: Join Without Entrance Sound, Open Chat, Hide Names, Invite, Edit, Duplicate, Copy Link, Mute, Set channel status | Missing | A left click joins. Rows have no context menu. |
| Voice panel: ping and voice details | Partial | `signalMeter` shows connecting / connected / reconnecting bars. No millisecond ping and no voice-server details. |
| Voice panel: Krisp | Missing | RNNoise is a settings switch, not a Krisp control on this panel. |
| Voice panel: disconnect | Done | Hangup in `voicePanel`. |
| Voice panel: camera | Missing | Camera is on the call bar, and it only flips a flag. |
| Voice panel: screen share | Done | Share button in `voicePanel`. Go Live is real (`golive.rs`). |
| Voice panel: activity | Missing | |
| Voice panel: soundboard | Missing | The call bar opens local WAV clips. This panel does not. |
| Call view: show chat | Partial | `callChrome` keeps the current text channel on screen. There is no Show Chat toggle, and the chat is not the voice channel’s own chat. |
| Call view: invite | Missing | |
| Call view: mute | Done | Call bar mute. |
| Call view: mic options menu (devices, input profile, volumes, level meter) | Partial | `paintGear` has input, output, camera, sensitivity, and VAD or push to talk. No input profile, no separate volume sliders, no input level meter. |
| Call view: camera | Partial | Button only. No video is sent. |
| Call view: share screen | Done | |
| Call view: activity | Missing | The activity button opens the local soundboard. |
| Call view: soundboard | Partial | Local WAV clips (`soundboardPop`). Not guild sounds. |
| Call view: disconnect | Done | |
| Call view: More (grid view, show non-video participants, message previews, settings) | Missing | The grid is the split surface. There is no More menu. |
| Call view: pop out | Done | `popCallOut`. |
| Call view: full screen | Missing | |
| Participant right-click: per-user volume, local mute | Done | `paintVoiceMenu`. Local mute is not sent to Discord. |
| Participant right-click: profile, server mute, server deafen, pop out user, mod view, move to, disconnect | Missing | The menu is volume and “Mute for you” only. |
| Voice text chat side panel | Missing | `src/call-layout.ts` leaves the composer on the text channel you had open. |

## Entry points the inventory names, and the rest of that surface

These are the deeper gaps behind Threads, Polls, Events, Inbox, Search, Server Settings, and the voice grid. They were part of the original brief.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Voice grid, speaking rings, per-person volume, local mute | Done | `src/ui/voice-view.ts`, `src/voice.ts`, `src/call-layout.ts`. |
| Join, leave, Opus, DAVE, mic send, remote playback | Done | `voice_media.rs`, `voice_dave.rs`, `voice_link.rs`. |
| Go Live and watch a stream | Done | `src-tauri/src/golive.rs`, `crates/lark-core/src/discord/stream.rs`. |
| Stage channels | Partial | Kind `13` is stored as `"voice"` in `channel_kind_name` (`types.rs`). No audience, speakers, or raise hand. |
| Forum board, tags, create post, split view | Partial | Kind `15` opens `forumBoard`, a list of active thread names. |
| Media channels | Missing | Kind `16` falls through to `"text"`. |
| Thread create, archive, public vs private, member list | Missing | List and open work (`active_threads` in `rest.rs`). Kinds `10`, `11`, and `12` are all `"thread"`. |
| Poll create, vote, end, voters | Missing | |
| Scheduled events: list, create, RSVP, start | Missing | The wizard and popout are in the events section above. |
| Unpin, spoiler uploads, who reacted, system-message templates, role color on authors | Missing or partial | Role color is used in the member list (`src/members.ts`) and not on message authors (`colorFor` in `src/ui/dom.ts`). System lines are plain (`kind_name` in `types.rs`). |

## Lark-only extras

Leave these in place. Bookmark and Remind are listed above as Partial because Discord’s menu has those commands and Lark’s copies are local.

| Extra | Where it lives | What it does |
| --- | --- | --- |
| Theme gallery and CSS/JSON editor | `src/themes.ts`, `paneAppearance` | Separate from Light / Ash / Dark / Onyx. |
| Plugin pack | `src/plugins.ts`, `store/plugins/` | Off until enabled. No token. |
| Scheduled send | `src/pack/schedule.ts` | Device queue. Not a Discord API. |
| Encrypted drafts | `src/drafts.ts` | Keychain or Credential Manager. |
| Streamer mode | `src/privacy.ts` | Local redaction. |
| Game Mode and hardware status | `src/game.ts`, `src/hardware.ts` | Front-app detection and a custom-status line. |
| Voice HUD and performance strip | `src/voice-hud.ts` | Not Discord’s overlay. |
| Clip buffer | `src/clip.ts`, `src/clips.ts` | Local MP4. Not Discord clips. |
| Local soundboard | `crates/lark-core/src/soundboard.rs` | WAV mixed into the mic. |
| IRC density and two-channel split | `src/ui/messages.ts`, `toggleSplit` | Not forum split view. |
| Keyword highlights, auto away, now playing | `src/keywords.ts`, `src/pack/away.ts`, `src/pack/playing.ts` | Local. Now playing does not sign in to Spotify. |
| Sign-in extras | `src/ui/signin.ts` | In-app window, browser handoff, QR, token paste. |

## Workstreams

Every Partial and Missing row above is in exactly one stream. Done rows and Lark-only extras are out of scope. Nitro Home, Shop, Quests, Server Boost, Gift, and Billing are link-outs: no purchase, gift checkout, or payment method UI.

Shared files, and who may edit them:

- `src/ui/app.ts` is the shell. Do not reformat it. Each stream may edit only the methods named under that stream.
- `src/types.ts`: append fields. Do not rename existing channel kinds.
- `crates/lark-core/src/discord/types.rs`: stream B is the only editor of `channel_kind_name`. Other streams add structs at the bottom of the file.
- `crates/lark-core/src/discord/rest.rs` and `gateway.rs`: append methods and match arms. Do not reorder existing arms.
- `src-tauri/src/lib.rs`: append commands and register them beside the current list.
- `src/ui/settings.ts`: stream D owns `SETTINGS_SECTIONS` and `SETTING_ENTRIES`. Every other stream adds a page only through `registerSettingsSection`, `registerSettingEntries`, and `registerSettingsPane`.
- `src/ui/profile.ts`: stream C owns the card. Stream B does not edit it. C adds optional `ProfileActions` slots for later moderation.
- `src/ui/messages.ts`: stream A owns the hover bar and adds the right-click menu. Stream F does not edit this file. F implements `onCreateThread`.

`paintHeader` is shared by A, B, and F. Edit only your own control: A owns search and pins, B owns the title row and Help, F owns Threads and Inbox.

### A. Messaging and composer

Features (table rows):

- + menu, with Upload (already works as a file button; move it under the menu)
- + Create Thread (call F’s `onCreateThread` and do not implement threads)
- + Create Poll (call F and do not implement polls)
- + Use Apps (link-out; activities stay in E)
- Gift button (link to Discord’s Nitro page)
- GIF picker, including Shift-click to insert the URL
- Sticker picker (send a sticker the server already has; sticker admin stays in B)
- `:` emoji autocomplete
- Apps launcher button (the activities runtime is E)
- Slash menu, built-in and app commands (Lark’s command palette stays)
- Three quick reactions on hover, as the default bar, three emoji
- Forward
- More
- Copy Text
- Bookmark (the local Save list may remain, and the command has to sit on the Discord menu)
- Create Reminder (same for the local reminder list)
- Apps on the message menu
- Mark Unread
- Copy Link
- Speak Message
- Copy ID, shown when D’s Developer Mode is on
- Unpin a message (call the existing `unpin_message` command)
- Server search beyond a `content=` query, including search filters (`from:`, `mentions:`, `has:`, `before:`, `after:`, `in:`, `pinned:`)
- Who reacted
- Spoiler flag on uploads
- Role color on the author name
- System-message templates (calls, pins, boosts, joins)
- DM header search stays; this stream adds the filters

Main files:

- `src/ui/messages.ts`
- `src/render/content.ts`
- `src/render/message.ts`
- `src/compose.ts`
- `src/emoji.ts`
- `src/mentions.ts`
- `src/pack/bookmarks.ts` and `src/reminders.ts` only to hook the existing lists to the new menu
- `src/ui/app.ts`: `paintComposer`, `send`, `beginEdit`, `toggleReaction`, `pinMessage`, `paintSearch`, `paintPins`, `messageChrome`, and the search/pin buttons in `paintHeader`

New file this stream may add: `src/ui/composer-tools.ts`.

Shared files to coordinate:

- `src/types.ts` and the bottom of `types.rs` for message fields. Poll structs belong to F.
- `rest.rs` for send, reactions, pins, and the search query string.
- `src-tauri/src/lib.rs`: call `unpin_message`; do not reimplement it.
- `onCreateThread` and the poll opener are the contracts F implements.
- Developer Mode flag is D’s. Block set is C’s.

### B. Servers, channels, and server settings

Features (table rows):

- Favorites
- Folder menu: Mark As Read, Move to. Folder Settings already renames and recolors; leave that and add the missing commands.
- Add a Server modal with templates
- Join a Server from that modal (reuse `openInvite` / `accept_invite`)
- Discover (link out when a result cannot be rendered)
- Server right-click: Mark As Read, Invite, Mute Server, Notification Settings, Hide Muted Channels, Server Settings, Privacy Settings, Per-server Profile, Create Channel, Create Category, Create Event, Move to, Copy ID
- Server header dropdown, including Server Boost (read-only level plus a link) and App Directory (link-out)
- Server Boosts entry in the sidebar (link-out)
- Events entry in the sidebar (the row only; F owns event data)
- Categories: mute, notifications, edit, delete (collapse stays)
- Channel right-click: Mark Read, Favorite, Invite, Pin Channel to Top, Copy Link, Mute, Notifications, Move, Edit, Duplicate, Delete, Copy ID
- Private channels: lock on a channel you can see that is still restricted
- Notifications bell writes the level back to Discord (local config stays the offline copy)
- Help button in `paintHeader` (link to Discord’s help center)
- Create channel, create category, create invite, vanity URL
- Hide muted channels
- Role editor, permission overwrites, timeout, kick, ban, plus view as role
- Server Profile: name, icon, banner, icon color presets, traits, description, games, private profile, live preview
- Server Tag: 4-character tag, badge, colors, preview
- Engagement: system message toggles and channel, activity feed, default notifications, inactive channel, timeout, widget
- Boost Perks: progress bar, banner and invite backgrounds, custom invite link (read-only perks; link out to buy a boost)
- Emoji: 50 slots, upload, bulk (the picker fetch stays)
- Stickers: slots, upload
- Soundboard: upload, slots, table (guild sounds; the local WAV board stays with E)
- Members: table with Member Since, Joined Discord, Join Method, Roles, Signals
- Members: add roles, mod view, prune, sort
- Roles: @everyone default, create, reorder
- Roles editor tabs: Display, Permissions, Links, Manage Members
- Permission list: General, Membership, Text, Voice, Apps, Events, Advanced, Administrator
- Invites: list, pause, create
- Access: Invite Only, Apply to Join, Discoverable, age-restricted, rules editor
- Integrations: webhooks, followed channels, bots
- Safety Setup: verification level, 2FA for mods, prune restriction, content filter
- Audit Log: filter by user and action
- Bans
- AutoMod: mention spam, spam content, flagged words, custom words, with actions
- Enable Community
- Server Template
- Delete Server
- Boosts page with levels and perks (read-only; link out to buy)
- Edit Channel overview: name, topic, slowmode, spoiler, age-restricted, hide after inactivity
- Voice overview: bitrate 8–96 kbps, video quality, user limit, region
- Edit Channel permissions: sync with category, private, advanced overwrites
- Edit Channel invites
- Edit Channel integrations: webhooks
- Create Channel modal: Text, Voice, or Forum, plus private
- Invite modal: friend search, copy link, expiry, max uses, roles, temporary membership
- Map kind `13` to `"stage"` and kind `16` to `"media"`, then stop. E builds stage. F builds the media gallery.
- Quick switcher: people search, and paste an invite into the existing accept path
- Nitro Home page, Shop page, and Quests page as rail buttons (link-out only; D owns the settings rows)

Main files:

- `src/ui/app.ts`: `paintRail`, `paintChannels`, `channelButton`, `channelBlock`, `onRailContextMenu`, `openFolderMenu`, `openSwitcher`, `cycleNotify`, `canSeeChannel`, and the title row plus Help in `paintHeader`
- `src/folders.ts`
- `src/members.ts` for the sort menu on the member list
- `crates/lark-core/src/discord/shell.rs`
- `crates/lark-core/src/discord/types.rs` (`channel_kind_name` only)

New files this stream may add: `src/ui/guild-settings.ts` and `src/ui/channel-settings.ts`.

Shared files to coordinate:

- `channel_kind_name` is this stream’s. E and F consume `"stage"` and `"media"` and do not edit the function.
- `src/types.ts` channel fields (`nsfw`, private, `rate_limit_per_user` for A’s slowmode countdown).
- `rest.rs`, `gateway.rs`, and `src-tauri/src/lib.rs` are append-only.
- Do not edit `src/ui/profile.ts`. Per-server profile editing is C’s, opened from this menu.
- Create Event calls F. Invite accept stays `accept_invite`.

### C. DMs, friends, and profiles

Features (table rows):

- Friends tabs: Online, All, Pending with a badge, Add Friend
- Friend rows: Server Tag
- Friend rows: activity with elapsed time and rich presence (the one-line glance can stay as the fallback)
- Active Now column
- Active Now voice cards with LIVE / Watch Stream
- Active Now game activity with elapsed time and rich presence
- DM row voice indicator
- Group DMs with member count, plus create, rename, and add member
- Close button on a DM row
- DM header: voice call
- DM header: video call (call E’s `joinVoice` with a DM channel id; video sending stays in E)
- DM header: add to DM
- DM header: toggle profile panel
- Profile panel: badges
- Profile panel: join voice
- Profile panel: full profile
- Profile panel: add friend
- DM right-click menu: Mark As Read, Pin, Add to Favorites, Profile, Start a Call, Note, Friend Nickname, Close DM, Apps, Invite to Server, Remove Friend, Ignore, Block, Mute, Copy User ID, Copy Channel ID
- Note and Friend Nickname on that menu (the note field already syncs; add the nickname editor)
- Remove Friend, Ignore, Block, and expose the blocked-id set for A
- Custom status text, plus emoji and clear-after, on the status popout (the four presence dots already work)
- Member right-click: Profile, Mention, Per-server Profile, Apps, Roles, Mod View, Copy ID
- Profile popout: server tag, badges, widgets (pronouns, bio, and roles already render)
- Optional `ProfileActions` slots so B can attach moderation later without rewriting the card

Main files:

- `src/ui/profile.ts`
- `src/social.ts`
- `src/ui/app.ts`: `paintFriends`, `openDm`, `openProfile`, `setStatus`, and the DM branch of `channelButton` / `paintChannels`
- `crates/lark-core/src/discord/rest.rs` for relationship mutations
- `crates/lark-core/src/discord/types.rs` `activity_parts`, at the bottom, for elapsed time and rich presence fields

New file this stream may add: `src/ui/friends.ts`.

Shared files to coordinate:

- Do not edit `paintComposer`, `paintHeader`, or `joinVoice`.
- Presence payload in `gateway.rs`: extend it, do not replace `set_presence`.
- Favorites data is B’s list. This stream only adds “Add to Favorites” on the DM menu and calls B’s helper.
- Call buttons call E’s join helper. Copy ID reads D’s Developer Mode flag.
- Mod View is B’s screen. This stream only adds the menu item that opens it.

### D. User settings parity

Features (table rows):

- Account: username, email, phone (show them when Discord returns them)
- Account: password, MFA (link to Discord; do not collect the secrets)
- Account: devices
- Account: standing
- Account: disable or delete (link to Discord)
- Account switching (up to five sessions) in `src/ui/signin.ts`. Do not redesign the Discord login window, browser handoff, QR, or token paste.
- Data & Privacy toggles, plus a link-out for a data download
- Messaging Permissions: sensitive-content filters, spam filters, DM permissions, friend-request permissions
- Notifications: desktop, notify-me-when, sounds, unread badge, emails
- Nitro, Server Boost, Subscriptions, Gift Inventory (link-out rows)
- Billing (link-out only)
- Appearance: Light, Ash, Dark, Onyx
- Appearance: color themes stay the Lark gallery; do not remove it when adding the four modes
- Appearance: app icon
- Appearance: message media and embed toggles (store the embed flag where A can read it)
- Accessibility: text size 12–24
- Accessibility: underline links, UI density, group spacing, saturation, high contrast
- Accessibility: compact or cozy, kept distinct from IRC
- Keybinds matching Discord’s set (do not remove Lark’s binds)
- Language and time format
- Activity Privacy
- Connections (management; C displays them on the profile)
- Developer Mode
- Log Out (label the existing token clear as Log Out, and keep it on one account until the switcher exists)
- Settings search entries for every new row

Voice & Video rows in the inventory are stream E. Do not edit `paneVoice`.

Main files:

- `src/ui/settings.ts`
- `src/ui/app.ts`: `renderSettings` and the `pane*` methods for account, appearance, notifications, shortcuts, window, and privacy
- `src/privacy.ts`
- `src/ui/signin.ts`
- `src/config.ts` and `crates/lark-core/src/config.rs`

New file this stream may add: `src/ui/settings-pages.ts`.

Shared files to coordinate:

- Do not edit `paneVoice`, `paneClips`, or `paneGaming`.
- `src/ui/profile.ts` is C’s. The global profile editor is a settings pane that calls an update API.
- Theme files in `src/themes.ts` stay. Add the four Discord modes beside them.
- Flags other streams read: Developer Mode, show embeds, show spoiler content.

### E. Voice, video, and stage

Features (table rows):

- Mute and deafen on the user panel, including when no call is connected
- Device dropdowns on those buttons
- Voice & Video: mic test
- Voice & Video: input profiles
- Voice & Video: echo cancellation
- Voice & Video: automatic gain control
- Voice & Video: camera test, and actually sending camera video (the toggle only flips a flag today)
- Voice & Video: stream previews in settings
- Voice & Video: per-sound toggles
- Voice & Video: Krisp noise suppression stays unimplemented. Keep RNNoise and label it as Lark’s noise suppression.
- Text chat inside the voice channel
- DM and group calls: accept a DM channel id on `joinVoice` (C adds the buttons)
- Apps launcher activities and Watch Together
- Stage channels, after B maps kind `13` to `"stage"`: audience, speakers, request to speak, raise hand, stage topic, start stage, stage text
- Guild soundboard, disabled while deafened. Keep the local WAV mixer.
- Voice channel right-click: Join Without Entrance Sound, Open Chat, Hide Names, Invite, Edit, Duplicate, Copy Link, Mute, Set channel status
- Voice panel: ping and voice details (the connection bars stay; add latency and server details)
- Voice panel: Krisp (do not add Krisp; a panel shortcut may toggle the existing RNNoise switch)
- Voice panel: camera
- Voice panel: activity
- Voice panel: soundboard (guild sounds; local clips stay on the call bar)
- Call view: show chat (a toggle; the voice channel’s own chat is the side panel below)
- Call view: invite
- Call view: mic options menu (devices, input profile, volumes, level meter)
- Call view: camera (send video; the button already exists)
- Call view: activity
- Call view: soundboard (guild sounds in the call bar; local WAV popover stays)
- Call view: More (grid view, show non-video participants, message previews, settings)
- Call view: full screen
- Participant right-click: profile, server mute, server deafen, pop out user, mod view, move to, disconnect (volume and local mute already work)
- Voice text chat side panel

Main files:

- `src/ui/voice-view.ts`
- `src/voice.ts`
- `src/voice-stage.ts`
- `src/call-layout.ts`
- `src/ui/app.ts`: `joinVoice`, `leaveVoice`, `toggleMute`, `toggleDeafen`, `toggleCamera`, `voicePanel`, `paintGear`, `paneVoice`
- `crates/lark-core/src/discord/voice_media.rs`
- `crates/lark-core/src/discord/voice_io.rs`
- `crates/lark-core/src/discord/noise.rs`
- `src/soundboard.ts` for the guild-soundboard entry. Do not change local mixing except to add a second source.

New file this stream may add: `src/ui/stage-view.ts`.

Shared files to coordinate:

- Do not edit `channel_kind_name`. If kind `13` is still `"voice"`, branch on the raw type in this stream’s helper.
- `paneVoice` is this stream’s. D must not edit it.
- The resting user chip is drawn in `paintChannels`. Add the mute, deafen, and device controls in `voicePanel`’s resting state without taking over the status popout (C).
- Local clips, HUD, and Game Mode stay.

### F. Threads, forums, polls, events, and inbox

Features (table rows):

- Threads button in `paintHeader`
- Create Thread from the composer, via the hook A adds
- Public, private, and announcement threads (kinds 10, 11, 12). Do not edit `channel_kind_name`. Store the raw kind on the channel.
- Archive, thread member list, notification follow
- Forum board, tags, create post, split view (independent of the two-channel split), plus guidelines, sort, follow, and required tags
- Media channels, as a gallery for kind `"media"`
- Thread create, archive, public vs private, member list
- Poll create, vote, end, voters, from the composer hook A adds
- Scheduled events: list, create, RSVP, start
- Events popout
- Events wizard: location (voice or elsewhere), topic, date, time, frequency, description, cover
- Create Event on B’s server menu calls this stream
- Inbox: Mentions
- Inbox: Unreads
- Inbox: Bookmarks (read A’s saved-message list; do not rebuild it)
- Inbox: Reminders (read A’s reminder list; do not rebuild it)
- Inbox: Mark All Read
- Inbox: friend requests (read C’s pending count)
- Friend-request badge on the inbox, read from C’s pending count
- Inbox button in `paintHeader`

Main files:

- `src/ui/app.ts`: `forumBoard`, `threadsFor`, `loadThreads`, and the Threads and Inbox buttons in `paintHeader`
- `src/types.ts` for thread, poll, and event fields

New files this stream may add: `src/ui/threads-forums.ts`, `src/ui/inbox.ts`, `src/threads.ts` (`startThreadFromMessage`).

Shared files to coordinate:

- Do not edit `src/ui/messages.ts`. Use A’s hooks.
- Do not edit `channel_kind_name`.
- Poll structs go at the bottom of `types.rs`. A does not add them.
- `rest.rs`, `gateway.rs`, and `src-tauri/src/lib.rs` are append-only.
- Pending friend count is C’s. The sidebar Events row is B’s button.
