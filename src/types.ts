export type Density = "cozy" | "compact";
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
  };
  plugins: { enabled: string[] };
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
  content: string;
  timestamp: string;
  edited?: boolean;
  attachments?: RawAttachment[];
  embeds?: RawEmbed[];
  reactions?: RawReaction[];
  mentionIds?: string[];
  mentionEveryone?: boolean;
  reply?: { id: string; authorName: string; preview: string } | null;
  kind?: "default" | "reply" | "join" | "system";
}

export interface Person {
  id: string;
  name: string;
  bot?: boolean;
  status?: "online" | "idle" | "dnd" | "offline";
  color?: string;
}

export interface Channel {
  id: string;
  name: string;
  kind: "text" | "voice" | "category" | "forum" | "dm" | "group" | "announcement";
  parentId?: string | null;
  position: number;
  topic?: string | null;
  recipientIds?: string[];
  unread?: number;
  mentions?: number;
}

export interface Guild {
  id: string;
  name: string;
  initials: string;
  iconUrl?: string | null;
  unread?: number;
  mentions?: number;
}
