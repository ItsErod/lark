export type Density = "cozy" | "compact" | "irc";
export type FontFamily = "inter" | "system" | "serif" | "mono";
export type ChannelList = "left" | "right" | "hidden";
export type NotifyLevel = "all" | "mentions" | "mute";
export type OsName = "macos" | "windows" | "linux" | "other";

export interface NotifyOverride {
  level?: NotifyLevel;
  muted?: boolean;
}

export interface Shortcuts {
  quick_switcher: string;
  open_settings: string;
  toggle_members: string;
  toggle_channels: string;
  focus_composer: string;
  next_unread: string;
  previous_channel: string;
  next_channel: string;
  edit_last: string;
  toggle_mute: string;
  toggle_deafen: string;
  push_to_talk: string;
  toggle_voice_overlay: string;
  toggle_perf_overlay: string;
  toggle_game_mode: string;
  save_clip: string;
  toggle_call: string;
}

export interface GameProfile {
  ptt: boolean;
  ptt_key: string;
  game_mode: boolean;
  voice_overlay: boolean;
  perf_overlay: boolean;
}

export interface UserMix {
  volume: number;
  muted: boolean;
}

export interface SoundClip {
  id: string;
  name: string;
  path: string;
  hotkey: string;
  volume: number;
}

export interface AppConfig {
  appearance: {
    theme: string;
    density: Density;
    font_family: FontFamily;
    font_size: number;
    channel_list: ChannelList;
    show_member_list: boolean;
    show_server_rail: boolean;
  };
  shortcuts: Shortcuts;
  notifications: {
    default: NotifyLevel;
    guilds: Record<string, NotifyOverride>;
    channels: Record<string, NotifyOverride>;
    keywords: string[];
  };
  plugins: { enabled: string[] };
  voice: {
    mode: "vad" | "ptt";
    sensitivity: number;
    noise_suppression: boolean;
    input_device: string;
    output_device: string;
    video_device: string;
    overlay: boolean;
    overlay_opacity: number;
    overlay_click_through: boolean;
    /** Hex color for the speaking ring. Discord green when unset. */
    speak_color: string;
    levels: Record<string, UserMix>;
    /** 720, 1080, 1440, 2160, or source. */
    share_resolution: string;
    share_fps: number;
    share_app_audio: boolean;
    /** auto, nvenc, amf, qsv, videotoolbox, or media-foundation. */
    share_encoder: string;
  };
  soundboard: { clips: SoundClip[] };
  desktop: {
    minimize_to_tray: boolean;
    autostart: boolean;
    frame_cap: number;
    hardware_status: boolean;
    perf_overlay: boolean;
    detect_games: boolean;
    game_mode: boolean;
  };
  clips: { game_capture: boolean; compress: "always" | "ask" | "never"; fps: number; resolution: number };
  games: Record<string, GameProfile>;
  privacy: { streamer: boolean; streamer_auto: boolean };
  accents: Record<string, string>;
  /** Developer Mode, embeds, and spoiler reveal. Other streams read these. */
  display: {
    developer_mode: boolean;
    show_embeds: boolean;
    show_spoilers: boolean;
  };
  preferences: UserPreferences;
  keybinds: DiscordKeybinds;
  /** Account switcher metadata. Tokens stay in the credential store. */
  sessions: SavedSession[];
}

export interface SavedSession {
  id: string;
  name: string;
}

export interface UserPreferences {
  color_mode: string;
  app_icon: string;
  show_media: boolean;
  underline_links: boolean;
  ui_density: string;
  message_density: string;
  group_spacing: number;
  saturation: number;
  high_contrast: boolean;
  explicit_filter: string;
  spam_filter: string;
  dm_permission: string;
  friend_requests: string;
  improve_discord: boolean;
  personalize: boolean;
  desktop_notifications: boolean;
  message_sound: boolean;
  call_sound: boolean;
  unread_badge: boolean;
  email_notifications: boolean;
  share_activity: boolean;
  activity_status: boolean;
  language: string;
  time_format: string;
}

export interface DiscordKeybinds {
  mark_server_read: string;
  toggle_hotkeys: string;
  return_previous_text: string;
  return_previous_audio: string;
  toggle_pins: string;
  toggle_inbox: string;
  toggle_emoji_picker: string;
  toggle_gif_picker: string;
  toggle_sticker_picker: string;
  scroll_chat_up: string;
  scroll_chat_down: string;
  create_or_join_server: string;
  answer_call: string;
  decline_call: string;
  create_group: string;
  start_call: string;
  upload_file: string;
  search: string;
  push_to_mute: string;
}

export interface RawAttachment {
  id: string;
  name: string;
  url: string;
  /** Discord media proxy. Preferred when it still carries the expiry query. */
  proxyUrl?: string | null;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface RawEmbed {
  color?: string | null;
  author?: string | null;
  title?: string | null;
  url?: string | null;
  description?: string | null;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  video?: string | null;
  provider?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
}

export interface RawMention {
  id: string;
  name: string;
}

export interface RawReaction {
  emoji: string;
  emojiId?: string | null;
  animated?: boolean;
  count: number;
  me: boolean;
}

export interface RawMessage {
  id: string;
  /** Matches the optimistic row to MESSAGE_CREATE. Discord echoes this on the send. */
  nonce?: string | null;
  channelId: string;
  authorId: string;
  authorName: string;
  authorBot?: boolean;
  authorAvatar?: string | null;
  content: string;
  timestamp: string;
  edited?: boolean;
  attachments?: RawAttachment[];
  embeds?: RawEmbed[];
  reactions?: RawReaction[];
  mentionIds?: string[];
  mentionUsers?: RawMention[];
  mentionRoleIds?: string[];
  mentionRoles?: string[];
  mentionEveryone?: boolean;
  guildId?: string | null;
  reply?: { id: string; authorName: string; preview: string } | null;
  kind?: "default" | "reply" | "join" | "system";
  stickers?: { id?: string; name: string; url?: string | null }[];
  thread?: { id: string; name: string; count: number } | null;
  /** Discord message type. 0 is a normal message. */
  messageType?: number;
  pinned?: boolean;
  authorRoleIds?: string[];
  /** ISO timestamp from a call's `ended_timestamp`, when the message is a call. */
  callEnded?: string | null;
  forwarded?: { id: string; authorName: string; preview: string } | null;
  poll?: unknown;
}

export interface Person {
  id: string;
  name: string;
  bot?: boolean;
  status?: "online" | "idle" | "dnd" | "offline" | "invisible";
  custom?: string;
  activity?: string;
  color?: string;
  avatarUrl?: string | null;
  roleIds?: string[];
  /** Friend nickname from the relationship, shown in place of the display name when set. */
  friendNick?: string | null;
  /** Clan / server tag. Up to four characters. */
  serverTag?: { tag: string; guildId?: string; badgeUrl?: string | null } | null;
  /** Rich presence. The activity string stays the one-line fallback. */
  rich?: {
    name: string;
    type: number;
    details?: string;
    state?: string;
    startedAt?: number | null;
    endsAt?: number | null;
    largeImage?: string | null;
    largeText?: string;
    smallImage?: string | null;
    smallText?: string;
    party?: string;
    buttons?: string[];
    live?: boolean;
    applicationId?: string;
  } | null;
  statusEmoji?: string;
  statusClearAt?: number | null;
}

export interface ChannelRecipient {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  kind: "text" | "voice" | "category" | "forum" | "dm" | "group" | "announcement" | "thread" | "stage" | "media";
  parentId?: string | null;
  position: number;
  topic?: string | null;
  recipientIds?: string[];
  recipients?: ChannelRecipient[];
  lastMessageId?: string | null;
  unread?: number;
  mentions?: number;
  overwrites?: { id: string; kind: number; allow: string; deny: string }[];
  nsfw?: boolean;
  /** Discord `rate_limit_per_user`, in seconds. The composer countdown reads this. */
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  videoQualityMode?: number;
  rtcRegion?: string | null;
  defaultAutoArchiveDuration?: number;
  /** Discord channel type. Threads are 10, 11, or 12. Media is 16. */
  rawKind?: number;
  archived?: boolean;
  locked?: boolean;
  invitable?: boolean;
  autoArchiveDuration?: number;
  messageCount?: number;
  memberCount?: number;
  ownerId?: string | null;
  threadFlags?: number;
  appliedTags?: string[];
  availableTags?: ForumTag[];
  defaultSortOrder?: number | null;
  defaultForumLayout?: number | null;
  /** Channel flags. Bit 4 (16) is REQUIRE_TAG. */
  flags?: number;
  followed?: boolean;
  starterContent?: string | null;
  starterImage?: string | null;
}

export interface Guild {
  id: string;
  name: string;
  initials: string;
  accent?: string;
  iconUrl?: string | null;
  unread?: number;
  mentions?: number;
}

export interface ForumTag {
  id: string;
  name: string;
  moderated?: boolean;
  emojiId?: string | null;
  emojiName?: string | null;
}

export interface ThreadMember {
  id: string;
  userId: string;
  joinTimestamp?: string;
  flags: number;
  name?: string;
  avatarUrl?: string | null;
}

export interface PollAnswer {
  answerId: number;
  text: string;
  emojiName?: string | null;
  emojiId?: string | null;
  count: number;
  meVoted: boolean;
}

export interface Poll {
  messageId: string;
  channelId: string;
  question: string;
  answers: PollAnswer[];
  expiry: string | null;
  allowMultiselect: boolean;
  layoutType: number;
  finalized: boolean;
}

export interface EventRecurrence {
  start: string;
  frequency: number;
  interval: number;
  byWeekday?: number[] | null;
}

export interface ScheduledEvent {
  id: string;
  guildId: string;
  name: string;
  description: string;
  channelId: string | null;
  creatorId?: string | null;
  scheduledStartTime: string;
  scheduledEndTime: string | null;
  privacyLevel: number;
  status: number;
  entityType: number;
  location?: string | null;
  image?: string | null;
  userCount?: number;
  interested?: boolean;
  recurrenceRule?: EventRecurrence | null;
}

export interface FriendRequest {
  id: string;
  name: string;
  incoming: boolean;
  avatarUrl?: string | null;
}
