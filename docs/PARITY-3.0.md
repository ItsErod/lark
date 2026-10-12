# Lark 3.0 parity

Analysis only. This document compares Lark at `2516c7a` (2.4.5) with the official Discord web client as of 12 Oct 2026. It does not add features.

The attached inventory file `discord-audit.md` was not in the workspace. The rows below are the Discord web surface reconstructed from the client as shipped through the [6 Oct 2026 patch notes](https://discord.com/blog/discord-patch-notes-october-6-2026) and the [11 Aug 2026 settings reorganization](https://discord.com/blog/discord-update-august-11-2026-changelog), plus the areas named for this audit: voice channel UI, stage channels, forum channels, threads, polls, stickers, soundboard, server settings sub-pages, roles and permissions, invites, server discovery, member list, events, inbox, pins, search filters, user profile editing, status, and account switching.

Status values:

- **Done** — a person can use the feature the way Discord web does.
- **Partial** — some of the path works, and a named gap remains.
- **Missing** — there is no user-facing path.

Nitro purchasing, Shop purchasing, Quests purchasing, and billing payments are out of scope. Those surfaces are recorded as link-outs. Do not build a checkout.

`README.md` still says the microphone is not captured and other people are not played. That sentence is stale. Voice send and playback are implemented in `crates/lark-core/src/discord/voice_media.rs`.

## App shell and navigation

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Server rail with icons, unread pips, and mention counts | Done | `paintRail`, `appendServerButton`, `guildBadge` in `src/ui/app.ts`. |
| Server folders, expand/collapse, drag reorder, sync to Discord | Done | `src/folders.ts` (`applyFolderDrop`, `FolderSync`); `set_guild_folders` in `crates/lark-core/src/discord/rest.rs`. |
| Home button (DM list) | Done | `paintRail` selects no guild. |
| Quick switcher for channels, DMs, and people | Partial | `openSwitcher` in `src/ui/app.ts` and `commandCatalog` in `src/palette.ts` jump to channels, DMs, and Lark commands. People search and “paste an invite to join” (shipped May 2026) are absent. |
| Back and forward through channel history | Missing | No history stack. A channel re-click does not record a dead entry because there is no history at all. |
| Add a server / create or join from the rail | Missing | Rail has no add button. Join exists only after an invite link is already in hand (`openInvite`). |
| Server Discovery compass | Missing | `crates/lark-core/src/discord/page.rs` allows `/discovery` inside the login window only. |
| Student Hubs | Missing | No hub list or hub menu. |
| Shop entry | Missing | Link-out only. No Shop window. |
| Quests entry | Missing | Link-out only. No Quests window. |
| Nitro entry on the home screen | Missing | Link-out only. `premiumType` is read for upload limits in `src/clips.ts`, not shown as a Nitro tab. |
| Channel up/down and next-unread shortcuts | Done | `src/shortcuts.ts` and `SHORTCUT_COPY` in `src/ui/settings.ts`. |
| Narrow-window channel drawer | Done | `paintHeader` adds a Channels button when `this.narrow` is set. |

## Messages

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Grouped messages, day dividers, unread separator | Done | `shouldGroup` in `src/chat.ts`; `renderMessage` in `src/ui/messages.ts`. |
| Jump to present / new-messages bar | Done | `jumpToBottom` in `src/ui/app.ts`. |
| History paging and a virtualized list | Done | `src/history.ts`; `spanWindow` in `src/virtual.ts`. |
| Replies, including jump to the referenced message | Done | `message_reference` in `outgoing_payload` (`crates/lark-core/src/discord/rest.rs`); reply chip in `src/ui/messages.ts`. |
| Edit and delete your own messages | Done | `edit_message` / `delete_message` in `rest.rs`; hover actions in `src/ui/messages.ts`. |
| “(edited)” label | Done | `edited_timestamp` mapped in `crates/lark-core/src/discord/types.rs`. Discord does not show a public edit log. |
| Reactions (add, remove, counts) | Done | `toggle_reaction` in `rest.rs`; gateway `emit_reaction` in `gateway.rs`. |
| Who reacted | Missing | `RawReaction` in `src/types.ts` stores count and `me` only. |
| Embeds and attachments (image, video, audio, file) | Done | `renderEmbed` / `renderAttachment` in `src/ui/messages.ts`. |
| Text spoilers | Done | `parseContent` in `src/render/content.ts`. |
| Spoiler attachments and “show spoiler content” | Missing | Uploads do not send a spoiler flag. There is no setting to reveal spoilers by default. |
| Stickers on a message | Done | `sticker_items` mapped in `types.rs`; sticker block in `src/ui/messages.ts`. Sending stickers is in the composer table. |
| Polls on a message | Missing | No poll field on the message struct in `types.rs`. |
| Bot components (buttons, selects) | Missing | No `components` field. |
| Ephemeral / interaction responses | Missing | Not modeled. |
| Forward a message | Missing | No snapshot or forward action. |
| System messages (calls, pins, boosts, member joins) | Partial | `kind_name` in `types.rs` maps type 7 to `join` and other non-default types to `system`. `renderMessage` prints a plain system line, not Discord’s templates. |
| Role color on the author name | Partial | Member list uses `roleColor` in `src/members.ts`. Message authors use `colorFor` in `src/ui/dom.ts` (a hash of the user id). |
| Markdown subset, mentions, custom emoji, timestamps | Done | `src/render/content.ts`. Subtext, lists, headers, and `<t:` timestamps are included. |
| Link previews | Partial | Server embeds render. There is no client unfurl, and no Discord “show embeds” switch (the quiet-media plugin can hide cards locally). |
| Hover toolbar: react, reply, pin, edit, delete | Done | `src/ui/messages.ts` action row. |
| Copy message link, copy text, apps, mark unread | Missing | No message link builder and no mark-unread. Read state only moves forward via `ack_message`. |
| Create a thread from a message | Missing | Thread chips open an existing thread (`thread-chip` in `src/ui/messages.ts`). Nothing creates one. |
| Voice messages | Missing | Audio attachments use a plain `<audio>` element. No record button or waveform. |
| Pending / failed send state | Missing | `buildViewMessage` in `src/render/message.ts` always sets `pending` to false. |
| Blocked-user message collapse | Missing | Depends on a block list, which is also missing. |

## Composer

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Text box, Enter to send, Shift+Enter for a newline | Done | Composer key handler in `src/ui/app.ts`. |
| Reply banner and edit banner | Done | `paintComposer` / `send` / `beginEdit` in `src/ui/app.ts`. |
| File upload, paste, and drag-drop | Done | `takeFiles` in `src/ui/app.ts`. |
| Upload preview with thumbnails and a spoiler toggle | Partial | Filename chips only. `outgoing_payload` in `rest.rs` has no spoiler flag. |
| Emoji picker (Unicode and server emoji) | Done | `emojiPicker` in `src/ui/app.ts`; `emojis` in `rest.rs`. |
| `:` emoji autocomplete | Missing | `mentionQuery` in `src/mentions.ts` only handles `@` and `#`. |
| GIF picker (including Shift-click to insert the URL) | Missing | Received Tenor/Giphy embeds can loop. Nothing inserts a GIF. |
| Sticker picker | Missing | Display only. |
| Slash commands and argument autocomplete | Missing | The command palette is Lark commands, not Discord application commands. |
| Apps button | Missing | No app launcher on the composer. |
| Gift / Nitro button | Missing | Link-out only. Do not add a purchase button. |
| Mention autocomplete for users, roles, and channels | Done | `src/mentions.ts`. |
| Character count and 2000-character limit | Done | `outgoingError` in `src/compose.ts`. |
| Slowmode countdown | Missing | No `rate_limit_per_user` on the channel model. |
| Typing send and receive | Done | `typing` in `rest.rs`; `TYPING_START` in `gateway.rs`; `typingLine` in `src/chat.ts`. |
| Voice-message record | Missing | No hold-to-record control. |
| Per-channel drafts | Done | `src/drafts.ts`. This is local and encrypted; Discord’s own draft behavior is the box simply keeping text. |

## Search and pins

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Search this server by message text | Partial | `search_guild` in `rest.rs` sends `content=` only. `paintSearch` in `src/ui/app.ts`. |
| Search filters (`from:`, `mentions:`, `has:`, `before:`, `after:`, `during:`, `in:`, `pinned:`) | Missing | No parser and no extra query parameters. |
| Search inside one channel | Missing | Results are guild-wide, or a local substring over cached pages (`localSearch`). |
| Pins panel | Done | `paintPins` loads `fetch_pins`. |
| Pin a message | Done | `pinMessage` → `set_pin` in `rest.rs`. |
| Unpin a message | Missing | `unpin_message` exists in `src-tauri/src/lib.rs` and is never called from the UI. |

## Servers, channels, and the member list

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Categories, collapse, and Discord-synced collapse | Done | `toggleCategory` in `src/ui/app.ts`; `set_channel_collapsed` in `rest.rs`. |
| Text channels | Done | Kind `0` in `channel_kind_name` (`crates/lark-core/src/discord/types.rs`). |
| Announcement channels | Partial | Kind `5` is mapped to `"text"`, so the announcement bell in `channelButton` never applies. No Follow or Publish. |
| Voice channels with members nested underneath | Done | `channelBlock` / `voiceUserRow` in `src/ui/app.ts`. |
| Stage channels in the sidebar | Partial | Kind `13` is mapped to `"voice"`. See the stage table. |
| Forum channels in the sidebar | Done | Kind `15` → `"forum"`. The board itself is partial; see forums. |
| Media channels | Missing | Kind `16` falls through to `"text"`. |
| Threads nested under a parent | Done | `paintChannels` lists active threads. Creating them is separate. |
| Channel topic in the header | Done | `paintHeader`. |
| NSFW / age-restricted gate | Missing | No `nsfw` field on `DiscordChannel`. |
| Create channel or category | Missing | No REST method and no menu. |
| Mute a channel or server, synced to Discord | Partial | `cycleNotify` writes `config.notifications` on this device. Gateway `guildNotify` is read in `applyNotify`. The level is not PATCHed back. |
| Hide muted channels | Missing | Muted rows stay in the list with an `is-muted` class. |
| Server name menu (invite, settings, notifications, privacy, edit server profile, hide muted, leave) | Missing | `channel-head` is a plain title. |
| Server context menu (mute, invite, leave, mark read) | Partial | Right-click on the rail only opens the folder menu (`onRailContextMenu`). |
| Leave a server | Missing | No `leave_guild` command. |
| Channel header: search, pins, members, notification bell | Done | `paintHeader`. The bell cycles a local level; it is not the inbox. |
| Member list sidebar | Done | `paintMembers` in `src/ui/app.ts`; `groupMembers` in `src/members.ts`; gateway member-list op 14. |
| Member list groups (hoisted roles, online, offline) | Done | `src/members.ts`. |
| Presence, custom status, and activity subtitle | Done | `src/roster.ts`, `memberSubtitle`. |
| Click a member to open a profile | Done | `memberButton` → `openProfile`. |
| Member-list sort and activity overflow menus | Missing | No sort/signals menu on the sidebar. |

## Roles, permissions, invites, and server settings

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| See a channel only when permissions allow it | Done | `can_view_channel` in `crates/lark-core/src/discord/shell.rs`; `canSeeChannel` in `src/ui/app.ts`. |
| Role pills and role colors on profiles | Done | `profileRoles` in `src/ui/app.ts`; `renderProfileCard` in `src/ui/profile.ts`. |
| Role editor | Missing | `roles` in `rest.rs` is a read for colors and grouping. |
| Channel permission overwrites UI | Missing | Overwrites are parsed for visibility math only. |
| View as role | Missing | No impersonation of a role’s overrides. |
| Timeout, kick, ban, and assign roles | Missing | No moderation commands. |
| Mod View | Missing | No mod panel. |
| Invite preview and accept | Done | `invite_preview` / `accept_invite` in `rest.rs`; `openInvite` in `src/ui/app.ts`; `inviteCode` in `src/shell.ts`. |
| Create an invite | Missing | No `POST /channels/{id}/invites`. |
| Vanity URL | Missing | No guild vanity field. |
| Server settings: Overview | Missing | User settings in `src/ui/settings.ts` are account and app pages only. |
| Server settings: Members | Missing | Sidebar list is not the admin members table (sort, join method, prune). |
| Server settings: Roles | Missing | |
| Server settings: Emoji | Partial | `fetch_emojis` feeds the picker. No upload or delete. |
| Server settings: Stickers | Missing | |
| Server settings: Soundboard | Missing | The Voice page soundboard is local WAV clips, not guild sounds. |
| Server settings: Widget, template, custom invite link | Missing | |
| Server settings: Integrations, webhooks, bots | Missing | |
| Server settings: Safety setup, AutoMod, audit log, bans | Missing | |
| Server settings: Community, onboarding, server guide | Missing | |
| Server settings: Discovery and insights | Missing | |
| Server settings: Server theme (boost perk, member can opt out) | Missing | Lark’s accent picker is a local color, not Discord’s server theme. |
| Server boost status | Missing | Link-out only. No boost level on the server header. |
| Enable Community / rules screening / membership gating | Missing | |

## Direct messages, friends, and profiles

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| DM list with unread state and a preview | Done | `paintChannels` DM rows; `dmPreviewLabel`. |
| Group DM display | Partial | Kind `3` maps to `"group"` and the row renders. No create, add-member, rename, or leave. |
| Open a DM from a profile | Done | `open_dm` in `rest.rs`; Message on the profile card. |
| New DM picker and new group DM | Missing | No recipient picker. |
| Close a DM | Missing | No hide/close on the row. |
| DM voice and video buttons | Missing | Header has no call controls. Guild voice join is separate. |
| Friends: Online, All, Pending, Blocked | Partial | `paintFriends` groups by online, idle, do not disturb, and offline. No Pending or Blocked tabs. |
| Add Friend | Missing | No username/friend-code request UI. |
| Accept, ignore, or cancel a friend request | Missing | `friends_from_relationships` in `types.rs` keeps type `1` only. |
| Remove friend or block | Missing | No relationship mutation in `rest.rs`. |
| Active Now column | Partial | `friendGlance` is a strip on the friends board, not the home-screen column. |
| Message requests | Missing | No filtered DM queue. |
| Profile popout (banner, avatar, bio, pronouns, roles, mutuals, note, message) | Done | `src/ui/profile.ts`; `user_profile` in `rest.rs`; notes via `set_user_note`. |
| Full profile modal (tabs, mutual servers listed by name, activity cards) | Partial | One card. Mutual guilds are counted more than they are browsed. |
| Avatar decoration, profile effect, nameplate | Missing | Not on `WireProfile`. |
| Badges | Missing | |
| Server tag on the profile | Missing | |
| Connected accounts on the profile | Missing | |
| Per-server nickname (read) | Done | `WireProfile.nick`. |
| Edit server profile (nick, server avatar, server bio) | Missing | No editor. The server menu that would open it is also missing. |
| Edit your global profile (avatar, banner, display name, pronouns, about me) | Missing | `paneAccount` states that Lark does not edit the profile. |

## Status and accounts

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Online, idle, do not disturb, invisible | Done | `setStatus` → `set_presence` from the profile chip. |
| Custom status text | Partial | A plain 128-character string is sent as activity type 4. |
| Custom status emoji and clear-after | Missing | `GatewayCommand::Presence` has no emoji and no expiry. |
| Account switcher (up to five signed-in accounts) | Missing | One token. `forgetToken` / `clear_token` signs out. `src/ui/signin.ts`. |
| Sign out | Done | My Account → Forget token. |

## User settings

Discord’s 2026 settings sidebar is the target: My Account, profile, Messaging Permissions, Family Center, Authorized Apps, Devices, Connections, Data & Privacy, Activity Privacy, Games & Apps, then Appearance, Accessibility, Voice & Video, notifications, keybinds, language, OS, and Developer. Billing pages are link-outs.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| My Account: username, email, phone, password, 2FA, backup codes, delete account | Missing | `paneAccount` shows avatar, name, masked id, and where the token is stored. Security changes should link to Discord rather than collect a password in Lark. |
| Profile customization page | Missing | Same gap as “edit your global profile”. |
| Messaging Permissions (DM privacy, friend requests, message requests, per-server overrides) | Missing | No privacy REST. |
| Family Center | Missing | |
| Authorized Apps | Missing | |
| Devices (session list, log out other sessions) | Missing | |
| Connections (Spotify, Xbox, and the rest) | Missing | |
| Data & Privacy | Missing | Link-out is enough for data requests. |
| Activity Privacy | Missing | |
| Games & Apps (registered games, activity status) | Partial | `paneGaming` detects the front app and can publish a hardware/game custom status. That is not Discord’s game registry or “display current activity” switch. |
| Nitro, Server Boost, Subscriptions, Gift Inventory | Missing | Link-out only. `nitroLabel` / `uploadLimitBytes` in `src/clips.ts` mention the tier. |
| Billing and payment methods | Missing | Link-out only. Do not build a payment form. |
| Appearance: Light, Dark, Midnight, sync with device, dark sidebar | Partial | `paneAppearance` applies Lark theme files (`src/themes.ts`). It does not sync Discord’s four theme modes. |
| UI density (compact / default / spacious) separate from message density | Missing | Density in Appearance is cozy, compact, or IRC, and it changes message rows (`src/ui/messages.ts`). |
| Chat message display (default vs compact) | Partial | Cozy and compact exist. They are not Discord’s separate message-spacing control. |
| Accessibility: text size, saturation, contrast, reduced motion, TTS, role colors, sticker animation, display-name styles, show spoiler content | Partial | Font size is a slider. Reduced motion is read only for the speaking ring (`speakingMotion` in `src/voice-stage.ts`). No Accessibility page. |
| Voice & Video settings page | Partial | Devices, input mode, sensitivity, RNNoise, ring color, and share defaults live in `paneVoice`. Echo cancellation, camera transmit, and attenuation are absent. Call behavior is in the voice table. |
| Chat and media toggles (embeds, uploads, link preview, emoji reactions, stickers) | Missing | Quiet-media is a local plugin (`plugins/quiet-media.js`), not this settings page. |
| Notifications matrix (desktop, sounds, suppress @everyone, per-server overrides) | Partial | `paneNotifications`: default level, a test notification, and highlight keywords. Not Discord’s matrix. |
| Keybinds matching Discord’s set | Partial | `paneShortcuts` rebinds Lark’s own list (`SHORTCUT_COPY`). |
| Language and timestamps locale | Missing | |
| OS settings: hardware acceleration, start at login, minimize to tray | Partial | `paneWindow` has tray, open at login, and a frame-rate cap. No hardware-acceleration switch. |
| Streamer mode | Partial | `panePrivacy` and `src/privacy.ts` redact this screen. Discord’s streamer mode also changes notification content and overlay behavior. |
| Developer mode (copy ids) | Missing | |
| Settings search | Done | `searchSettings` in `src/ui/settings.ts`. The index only covers Lark’s pages. |

## Voice, video, and screen share

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Join and leave a voice channel | Done | `joinVoice` / `leaveVoice` in `src/ui/app.ts`; `maintain_voice` in `src-tauri/src/lib.rs`. |
| Mute, deafen, push to talk, voice activity | Done | `toggleMute`, `toggleDeafen`, `pushTransmit`; VAD in `produce_frame` (`voice_media.rs`). |
| Input and output devices | Done | `voice_io.rs`. |
| Noise suppression | Done | RNNoise in `crates/lark-core/src/discord/noise.rs`. |
| Echo cancellation and noise suppression advanced modes | Missing | Settings copy says echo cancellation stays off. |
| Opus, transport encryption, and DAVE | Done | `voice.rs`, `voice_dave.rs`, `voice_link.rs`. |
| Microphone send and remote playback | Done | `produce_frame` and `handle_packet` in `voice_media.rs`. |
| Speaking indicators | Done | Gateway speaking events; rings from `speakWrap` in `src/ui/voice-view.ts`. |
| Participant grid, call strip, split beside the text channel | Done | `src/call-layout.ts`, `renderCallStage`, `renderCallStrip`. |
| Per-person volume and local mute | Done | `set_voice_volume`; `playbackVolume` in `src/voice.ts`. Local mute is not sent to Discord. |
| Camera / video tiles | Partial | `toggleCamera` flips a local flag. No video is sent. Settings say video calls are not sent yet. |
| Go Live (screen or window, resolution, frame rate) | Done | `src/ui/share-view.ts`; `src-tauri/src/golive.rs`; `crates/lark-core/src/discord/stream.rs`. |
| Share application audio | Done | `share_app_audio` through `golive.rs` on macOS and Windows. |
| Watch someone else’s stream | Done | `watch_stream`; H.264 preview in `src/ui/share-view.ts`. |
| Picture-in-picture and call popout | Done | `paintPip`, `popCallOut`, `src/ui/call-popout.ts`. |
| Text chat inside the voice channel | Missing | The composer stays on the text channel you had open (`src/call-layout.ts`). |
| DM and group calls | Missing | No call button, and no separate call session for a DM. |
| Activities and Watch Together | Missing | The activity icon on the call bar opens the local soundboard. |
| Video background and priority speaker | Missing | |
| Discord clips of a stream | Missing | Lark’s clip buffer is a different feature; see extras. |
| In-game overlay (Discord’s) | Missing | Lark’s voice HUD is not the Discord overlay. |

## Stage channels

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Stage as its own channel type | Partial | Kind `13` is stored as `"voice"` in `channel_kind_name`. Joining uses the voice path. |
| Audience and speakers | Missing | No stage request state. |
| Request to speak / raise hand | Missing | |
| Stage topic and start stage | Missing | |
| Text-in-voice on a stage, including after a request-to-speak line | Missing | October 2026 fixed scrolling that chat; Lark has no such pane. |
| Stage video with picture-in-picture at the same time as text | Missing | Generic call PiP exists and is not stage-aware. |

## Threads, forums, and media channels

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| List and open active threads | Done | `active_threads` in `rest.rs`; `loadThreads` and `threadsFor` in `src/ui/app.ts`. Gateway `THREAD_CREATE` / `THREAD_UPDATE`. |
| Public, private, and announcement threads as distinct types | Partial | Kinds `10`, `11`, and `12` all become `"thread"`. |
| Create a thread, name it, and archive it | Missing | Empty forums tell you to start a post from Discord (`forumBoard`). |
| Thread member list and notification follow | Missing | |
| Thread starter footer (“N messages”) on the parent | Partial | A chip opens the thread. It does not show the reply count bar. |
| Forum board: tags, guidelines, sort, follow, required tags | Missing | `forumBoard` is a button list of active thread names. |
| Create a forum post (title, tags, media prompt) | Missing | |
| Forum split view | Missing | Lark’s split view is two text channels (`toggleSplit`), not a forum thread beside the board. |
| Media channel gallery | Missing | Kind `16` is not mapped. |

## Polls, stickers, and soundboard

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Create a poll (question, answers, duration, multi-select) | Missing | |
| Vote, change vote, end a poll, see voters | Missing | |
| Render a poll card, including in announcement channels | Missing | |
| Sticker picker and sticker packs | Missing | Incoming stickers render. |
| Guild soundboard (sounds uploaded to the server, played into the channel) | Missing | |
| Soundboard disabled while deafened | Missing | No guild soundboard control to disable. |
| Local WAV clips mixed into the mic | Done | This is a Lark extra, not the guild soundboard. `crates/lark-core/src/soundboard.rs`; `play_soundboard` in `src-tauri/src/lib.rs`. |

## Events and inbox

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Scheduled events list in the channel sidebar | Missing | No `GUILD_SCHEDULED_EVENT` handler. |
| Create an event (voice, stage, or somewhere else) | Missing | |
| RSVP / interested | Missing | |
| Start an event and event invite embeds | Missing | |
| Inbox: Mentions | Missing | Mention badges on the rail are not an inbox. |
| Inbox: Unreads | Missing | |
| Inbox: For You | Missing | |
| Friend-request badge on the inbox | Missing | No pending-request count. |
| Desktop notifications for mentions | Done | `src/notify.ts`. This is not the in-app inbox. |

## Nitro, Shop, Quests, and billing

These rows stay link-outs. The work is a button or a settings row that opens Discord. No SKU grid, no gift checkout, no payment method, no purchase recovery.

| Discord feature | Lark status | Notes and file pointers |
| --- | --- | --- |
| Nitro page (plan, perks) | Missing | Link to Discord’s Nitro settings. Tier is already known as `premiumType`. |
| Shop | Missing | Link out. Do not render a store. |
| Quests | Missing | Link out. Do not render quest progress or claim rewards. |
| Server Boost purchase | Missing | A read-only “this server is level N” line may link to Discord. No boost checkout. |
| Subscriptions, gifts, billing, transaction history | Missing | Link out. |

## Lark-only extras

These are not Discord gaps. Later parity work should leave them in place.

| Extra | Where it lives | What it does |
| --- | --- | --- |
| Theme gallery and CSS/JSON theme editor | `src/themes.ts`, `paneAppearance`, `THEMES.md` | More than Discord’s Light / Dark / Midnight / device sync. |
| Plugin pack | `src/plugins.ts`, `plugins/`, `PLUGINS.md` | Local scripts. Off until Settings enables them. They never receive the token. |
| Saved messages | `src/pack/bookmarks.ts`, `paintBookmarks` | Device bookmarks. Opening one jumps to the channel, not the message. Discord pins are untouched. |
| Reminders | `src/reminders.ts` | One local notification at a chosen time. |
| Scheduled send | `src/pack/schedule.ts` | Device queue, text only, 15 seconds to 7 days. Not a Discord scheduled-message API. |
| Encrypted composer drafts | `src/drafts.ts` | Key in the macOS Keychain or Windows Credential Manager. |
| Streamer mode | `src/privacy.ts` | Local redaction, optional while sharing or recording. |
| Game Mode and per-game profiles | `src/game.ts`, `paneGaming` | Slows paints and polls while a game is in front. |
| Hardware custom status | `src/hardware.ts` | GPU, CPU temperature, and the current game as a custom status. |
| Voice HUD and performance strip | `src/voice-hud.ts`, `src/ui/hud.ts` | Always-on-top roster plus RAM, CPU, and FPS. |
| Clip buffer and clip library | `src/clip.ts`, `src/clips.ts`, `src-tauri/src/clip_rec.rs` | Local MP4 of the main display. Not Discord clips. |
| Local soundboard | `crates/lark-core/src/soundboard.rs` | WAV mixed into the outgoing voice frame. |
| IRC density | `src/ui/messages.ts` | One line per message. |
| Two-channel split | `toggleSplit` in `src/ui/app.ts` | Side-by-side text channels. |
| Highlight keywords | `src/keywords.ts` | Local highlight and, on a mentions-only channel, a desktop notification. |
| Auto away and Now playing | `src/pack/away.ts`, `src/pack/playing.ts` | Presence helpers. Now playing does not sign in to Spotify. |
| Silent typing | `plugins/silent-typing.js` | Stops outgoing typing events. |
| Hide muted people | `src/pack/hidden.ts` | Local author filter. Does not block on Discord. |
| Message translate | `src/pack/translate.ts` | Local phrase book. |
| Quick reactions | `plugins/quick-react.js` | 👍 ❤️ 😂 🎉 👀 on the hover bar. |
| Sign-in extras | `src/ui/signin.ts` | In-app Discord window, system-browser handoff, QR, and an advanced token paste. |
| Voice diagnostics copy | `paneVoice` | Handshake and packet counters for a call. |
| Per-server accent | `paneAppearance` | Local color. Not a boosted server theme. |
| Command palette extras | `src/palette.ts` | HUD, Game Mode, clips, IRC, streamer mode, reminders. |

## Workstreams

Every Partial and Missing row above is in exactly one stream. Done rows and Lark-only extras are out of scope. Nitro, Shop, Quests, Server Boost, and Billing are link-outs: no purchase, gift checkout, or payment method UI.

Shared files, and who may edit them:

- `src/ui/app.ts` is the shell. Do not reformat it. Each stream may edit only the methods named under that stream.
- `src/types.ts`: append fields. Do not rename existing channel kinds.
- `crates/lark-core/src/discord/types.rs`: stream B is the only editor of `channel_kind_name`. Other streams add structs at the bottom of the file.
- `crates/lark-core/src/discord/rest.rs` and `gateway.rs`: append methods and match arms. Do not reorder existing arms.
- `src-tauri/src/lib.rs`: append commands and register them beside the current list.
- `src/ui/settings.ts`: stream D owns `SETTINGS_SECTIONS` and `SETTING_ENTRIES`. Every other stream adds a page only through `registerSettingsSection`, `registerSettingEntries`, and `registerSettingsPane`.
- `src/ui/profile.ts`: stream C owns the card. Stream B may add optional callbacks on `ProfileActions` only by asking C to land that type change first; until then B should not edit this file.
- `src/ui/messages.ts`: stream A owns the action bar. Stream F calls an optional `onCreateThread` that A adds, and does not edit this file.

`paintHeader` is the one function three streams touch. Edit only your own button, and leave the existing array order otherwise: A may change the search and pin buttons, B may insert the server menu into the title row, F may append an inbox button after the bell.

### A. Messaging and composer

Features (table rows):

- System messages (calls, pins, boosts, member joins)
- Who reacted
- Spoiler attachments and “show spoiler content” (read the setting stream D stores; do not build the settings page)
- Role color on the author name
- Link previews (keep rendering embeds; honor a show/hide flag from D; no new unfurl service)
- Forward a message
- Copy message link, copy text, apps, mark unread
- Create a thread from a message — add optional `onCreateThread` only; stream F implements creation
- Bot components (buttons, selects)
- Ephemeral / interaction responses
- Voice messages
- Voice-message record
- Pending / failed send state
- Blocked-user message collapse (read the block set from C; do not own the block API)
- Upload preview with thumbnails and a spoiler toggle
- `:` emoji autocomplete
- GIF picker (including Shift-click to insert the URL)
- Sticker picker and sticker packs (send a sticker the server already has; sticker admin stays in B)
- Slash commands and argument autocomplete (Lark’s command palette stays)
- Apps button (link to the app directory; embedded activities stay in E)
- Slowmode countdown (read `rate_limit_per_user` after B adds it)
- Gift / Nitro button (link to Discord’s Nitro page, not a checkout)
- Search this server by message text
- Search filters (`from:`, `mentions:`, `has:`, `before:`, `after:`, `during:`, `in:`, `pinned:`)
- Search inside one channel
- Unpin a message (call the existing `unpin_message` command; do not reimplement it)

Main files:

- `src/ui/messages.ts`
- `src/render/content.ts`
- `src/render/message.ts`
- `src/compose.ts`
- `src/emoji.ts`
- `src/mentions.ts`
- `src/ui/app.ts`: `paintComposer`, `send`, `beginEdit`, `toggleReaction`, `pinMessage`, `paintSearch`, `paintPins`, `messageChrome`, `appendMessages`, and the search/pin buttons in `paintHeader`

New file this stream may add: `src/ui/composer-tools.ts` for the GIF, sticker, slash, and apps popovers.

Shared files to coordinate:

- `src/types.ts` and `crates/lark-core/src/discord/types.rs` for message fields (polls stay with F; A only reads a poll if F has added it).
- `crates/lark-core/src/discord/rest.rs`: message send, reactions, pins, search query string.
- `src-tauri/src/lib.rs`: call the existing `unpin_message`; do not reimplement it.
- `src/ui/messages.ts` `onCreateThread` is the contract F implements.
- Block-id set is C’s. Embed-visibility and spoiler-default flags are D’s. `rate_limit_per_user` is B’s.

### B. Servers, channels, and server settings

Features (table rows):

- Quick switcher for channels, DMs, and people (add people, and paste an invite into the existing accept path)
- Back and forward through channel history
- Add a server / create or join from the rail (join reuses `openInvite`)
- Server Discovery compass (link out when a result cannot be rendered; no custom ranking)
- Student Hubs (same link-out rule)
- Shop entry, Quests entry, and Nitro entry on the home screen (link-out buttons only)
- Announcement channels (kind `5` stays distinct: sidebar bell, Follow, Publish)
- Stage channels in the sidebar: map kind `13` to `"stage"` and stop. Stream E builds the stage UI.
- Media channels: map kind `16` to `"media"` and stop. Stream F builds the gallery.
- NSFW / age-restricted gate
- Create channel or category
- Slowmode field `rate_limit_per_user` on the channel, for stream A’s countdown
- Mute a channel or server, synced to Discord (local config remains the offline copy)
- Hide muted channels
- Server name menu (invite, settings, notifications, privacy, edit server profile, hide muted, leave)
- Server context menu (mute, invite, leave, mark read). Folder rename stays.
- Leave a server
- Create an invite
- Vanity URL
- Member-list sort and activity overflow menus (the list itself stays)
- Role editor
- Channel permission overwrites UI
- View as role
- Timeout, kick, ban, and assign roles (on a server-settings member row until C adds a `ProfileActions` slot)
- Mod View
- Server settings: Overview
- Server settings: Members
- Server settings: Roles
- Server settings: Emoji (upload and delete on top of the existing fetch)
- Server settings: Stickers
- Server settings: Soundboard (guild sounds; the local WAV board stays with E)
- Server settings: Widget, template, custom invite link
- Server settings: Integrations, webhooks, bots
- Server settings: Safety setup, AutoMod, audit log, bans
- Server settings: Community, onboarding, server guide
- Server settings: Discovery and insights
- Server settings: Server theme (boost perk, member can opt out). Do not replace the Lark theme gallery.
- Server boost status (read-only level plus a link; no checkout)
- Enable Community / rules screening / membership gating (no payment step)

Main files:

- `src/ui/app.ts`: `paintRail`, `paintChannels`, `channelButton`, `channelBlock`, `onRailContextMenu`, `openSwitcher`, `cycleNotify`, `applyNotify`, `canSeeChannel`, and the title row of `paintHeader`
- `src/guilds.ts`
- `src/folders.ts` (only if the add-server button must sit beside folders)
- `src/members.ts` for the sort menu
- `crates/lark-core/src/discord/shell.rs`
- `crates/lark-core/src/discord/types.rs` (`channel_kind_name` only)

New file this stream may add: `src/ui/guild-settings.ts`.

Shared files to coordinate:

- `channel_kind_name` is this stream’s. E and F must consume `"stage"` and `"media"` and must not edit the function.
- `src/types.ts` channel fields (`nsfw`, `rate_limit_per_user`).
- `rest.rs` / `gateway.rs` / `src-tauri/src/lib.rs` append-only.
- `src/ui/profile.ts` is C’s. Do not edit it in this stream.
- Invite accept stays `accept_invite`. Call it; do not fork it.

### C. DMs, friends, and profiles

Features (table rows):

- Group DM display (rows already render; add create, members, rename, and leave)
- New DM picker and new group DM
- Close a DM
- DM voice and video buttons (call stream E’s existing join/leave with a DM channel id; video and stage stay in E)
- Friends: Online, All, Pending, Blocked
- Add Friend
- Accept, ignore, or cancel a friend request
- Remove friend or block (expose the blocked-id set for stream A)
- Active Now column
- Message requests
- Full profile modal (tabs, mutual servers listed by name, activity cards)
- Avatar decoration, profile effect, nameplate
- Badges
- Server tag on the profile
- Connected accounts on the profile (read-only; stream D manages the connections)
- Edit server profile (nick, server avatar, server bio), opened from the menu stream B adds
- Custom status text, and custom status emoji and clear-after (online / idle / dnd / invisible already work)
- Optional moderation slots on `ProfileActions` so B can attach timeout, kick, ban, and roles without rewriting the card

Main files:

- `src/ui/profile.ts`
- `src/social.ts`
- `src/ui/app.ts`: `paintFriends`, `openDm`, `openProfile`, `setStatus`, and the DM branch of `paintChannels`
- `crates/lark-core/src/discord/rest.rs`: relationship and profile reads already here; append mutations

New file this stream may add: `src/ui/friends.ts`.

Shared files to coordinate:

- `src/ui/app.ts` methods listed above only. Do not edit `paintComposer`, `paintHeader`, or voice methods.
- Presence payload in `gateway.rs`: extend it, do not replace `set_presence`.
- Block set consumed by A. Connection management consumed by D. Call buttons call E’s existing join helper.

### D. User settings parity

Features (table rows):

- Account switcher (up to five signed-in accounts)
- My Account: username, email, phone, password, 2FA, backup codes, delete account (show username, email, and phone when Discord returns them; password, 2FA, backup codes, and delete account link to Discord; do not collect those secrets)
- Profile customization page, which is also “edit your global profile” (avatar, banner, display name, pronouns, about me). Server nick and avatar stay in C.
- Messaging Permissions (DM privacy, friend requests, message requests, per-server overrides)
- Family Center
- Authorized Apps
- Devices (session list, log out other sessions)
- Connections (Spotify, Xbox, and the rest) — management only; C displays them on the profile
- Data & Privacy (data download links out)
- Activity Privacy
- Games & Apps (registered games, activity status). Leave Game Mode, hardware status, and per-game voice profiles on the existing Gaming page.
- Nitro, Server Boost, Subscriptions, Gift Inventory
- Nitro page (plan, perks)
- Shop
- Quests
- Server Boost purchase
- Subscriptions, gifts, billing, transaction history
- Billing and payment methods
- The seven rows above are link-outs. No catalog, quest claim, gift checkout, or payment form. Rail buttons for Shop, Quests, and Nitro are stream B.

- Appearance: Light, Dark, Midnight, sync with device, dark sidebar (keep the Lark theme gallery)
- UI density (compact / default / spacious) separate from message density
- Chat message display (default vs compact), kept distinct from cozy / compact / IRC
- Accessibility: text size, saturation, contrast, reduced motion, TTS, role colors, sticker animation, display-name styles, show spoiler content (store the spoiler and embed flags where A can read them)
- Chat and media toggles (embeds, uploads, link preview, emoji reactions, stickers)
- Notifications matrix (desktop, sounds, suppress @everyone, per-server overrides)
- Keybinds matching Discord’s set (do not remove Lark’s binds)
- Language and timestamps locale
- OS settings: hardware acceleration, start at login, minimize to tray (tray and login already exist; add hardware acceleration)
- Streamer mode (keep local redaction; add Discord’s notification behavior)
- Developer mode (copy ids)
- Settings search entries for every new row

Main files:

- `src/ui/settings.ts`
- `src/ui/app.ts`: `renderSettings` and the `pane*` methods for account, appearance, notifications, shortcuts, window, and privacy
- `src/privacy.ts`
- `src/ui/signin.ts` (account switcher only; do not redesign the Discord login window, browser handoff, QR, or token paste)
- `src/config.ts` and `crates/lark-core/src/config.rs` for new preference fields

New file this stream may add: `src/ui/settings-pages.ts` for the Discord pages that do not exist yet.

Shared files to coordinate:

- Do not edit `paneVoice` or `paneClips`. Voice and clip controls stay with E. Register any extra voice preference through `registerSettingsPane` only if E has not already added it.
- `src/ui/profile.ts` is C’s. The profile editor can be a settings pane that calls a profile update API, not a rewrite of the popout.
- Theme files in `src/themes.ts` stay. Add Discord’s four modes beside them.
- Flags A reads: show embeds, show spoiler content.

### E. Voice, video, and stage

Features (table rows):

- Voice & Video settings page: echo cancellation, attenuation, and the advanced section on `paneVoice` (devices, input mode, RNNoise, and share defaults stay)
- Echo cancellation and noise suppression advanced modes
- Camera / video tiles (the camera toggle only flips a flag today; send video and show remote tiles)
- Text chat inside the voice channel
- DM and group calls (C adds the buttons; this stream accepts a DM channel id on `joinVoice`)
- Activities and Watch Together (the local soundboard button stays)
- Video background and priority speaker
- Discord clips of a stream, as a separate action from the local clip buffer. Do not change `src/clips.ts`.
- In-game overlay (Discord’s): do not replace the voice HUD. A settings note that the HUD is not Discord’s overlay is enough.
- Stage as its own channel type, after B maps kind `13` to `"stage"`
- Audience and speakers
- Request to speak / raise hand
- Stage topic and start stage
- Text-in-voice on a stage, including after a request-to-speak line
- Stage video with picture-in-picture at the same time as text
- Guild soundboard (sounds uploaded to the server, played into the channel)
- Soundboard disabled while deafened
- Keep the local WAV mixer in `crates/lark-core/src/soundboard.rs`

Main files:

- `src/ui/voice-view.ts`
- `src/ui/share-view.ts`
- `src/voice.ts`
- `src/voice-stage.ts`
- `src/call-layout.ts`
- `src/ui/app.ts`: `joinVoice`, `leaveVoice`, `toggleMute`, `toggleDeafen`, `toggleCamera`, `paintVoice`, `callStageHandlers`, `openCallSplit`, `paneVoice`
- `crates/lark-core/src/discord/voice.rs`
- `crates/lark-core/src/discord/voice_media.rs`
- `crates/lark-core/src/discord/voice_io.rs`
- `crates/lark-core/src/discord/noise.rs`
- `src/soundboard.ts` only for the guild-soundboard entry point; do not change local clip mixing in `crates/lark-core/src/soundboard.rs` except to add a second mix source

New file this stream may add: `src/ui/stage-view.ts`.

Shared files to coordinate:

- Do not edit `channel_kind_name`. Treat kind `"stage"` as B’s contract; if it is still `"voice"`, branch on the raw Discord type inside this stream’s own helper.
- `paneVoice` is this stream’s. D must not edit it.
- DM call buttons are C’s. This stream only extends `joinVoice` so a null guild id still connects.
- Local clips, HUD, and Game Mode stay.

### F. Threads, forums, polls, events, and inbox

Features (table rows):

- Public, private, and announcement threads as distinct types (kinds 10, 11, and 12). Do not edit `channel_kind_name`. Store the raw kind on the channel if it is not already there.
- Create a thread, name it, and archive it, including “create a thread from a message” through A’s `onCreateThread`
- Thread member list and notification follow
- Thread starter footer (“N messages”) on the parent (pass the count through the existing thread chip; do not edit `src/ui/messages.ts`)
- Forum board: tags, guidelines, sort, follow, required tags
- Create a forum post (title, tags, media prompt)
- Forum split view (independent of the two-channel split)
- Media channel gallery
- Polls on a message
- Create a poll (question, answers, duration, multi-select)
- Vote, change vote, end a poll, see voters
- Render a poll card, including in announcement channels
- Scheduled events list in the channel sidebar
- Create an event (voice, stage, or somewhere else)
- RSVP / interested
- Start an event and event invite embeds (a normal embed still renders in A; this stream owns the event card)
- Inbox: Mentions
- Inbox: Unreads
- Inbox: For You
- Friend-request badge on the inbox (read C’s pending count; do not implement friend actions)
- Inbox button in `paintHeader`, after the bell

Main files:

- `src/ui/app.ts`: `forumBoard`, `threadsFor`, `loadThreads`, and the inbox button in `paintHeader`
- `src/types.ts` for thread, poll, and event fields

New files this stream may add: `src/ui/threads-forums.ts`, `src/ui/inbox.ts`, `src/threads.ts` (`startThreadFromMessage` for A’s hook).

Shared files to coordinate:

- Do not edit `src/ui/messages.ts`. Use `onCreateThread` and the existing thread chip.
- Do not edit `channel_kind_name`.
- Poll structs go at the bottom of `types.rs`. A does not add them.
- `rest.rs` / `gateway.rs` / `src-tauri/src/lib.rs` append-only.
- Pending friend count is C’s data. This stream only displays it.
