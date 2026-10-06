import type { AppConfig, NotifyLevel } from "./types";

export function effectiveLevel(config: AppConfig, guildId: string | null, channelId: string): NotifyLevel {
  const channel = config.notifications.channels[channelId];
  if (channel?.muted) return "mute";
  if (channel?.level) return channel.level;
  if (guildId) {
    const guild = config.notifications.guilds[guildId];
    if (guild?.muted) return "mute";
    if (guild?.level) return guild.level;
  }
  return config.notifications.default;
}

export function bumpsUnread(level: NotifyLevel, mentionsMe: boolean): boolean {
  if (level === "mute") return false;
  if (level === "mentions") return mentionsMe;
  return true;
}

export function shouldDesktopNotify(input: {
  level: NotifyLevel;
  mentionsMe: boolean;
  fromMe: boolean;
  windowFocused: boolean;
  channelId: string;
  activeChannelId: string | null;
}): boolean {
  if (input.fromMe) return false;
  if (!bumpsUnread(input.level, input.mentionsMe)) return false;
  if (input.windowFocused && input.channelId === input.activeChannelId) return false;
  return true;
}
