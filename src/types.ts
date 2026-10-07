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
  save_clip: string;
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
  };
  desktop: { minimize_to_tray: boolean; autostart: boolean; frame_cap: number; hardware_status: boolean };
  clips: { game_capture: boolean };
  accents: Record<string, string>;
}

export interface RawAttachment {
  id: string;
  name: string;
  url: string;
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
  kind: "text" | "voice" | "category" | "forum" | "dm" | "group" | "announcement" | "thread";
  parentId?: string | null;
  position: number;
  topic?: string | null;
  recipientIds?: string[];
  recipients?: ChannelRecipient[];
  lastMessageId?: string | null;
  unread?: number;
  mentions?: number;
  overwrites?: { id: string; kind: number; allow: string; deny: string }[];
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
