import { effectiveLevel as discordAwareLevel, type DiscordNotify } from "./shell";
import type { AppConfig, NotifyLevel } from "./types";

export function effectiveLevel(
  config: AppConfig,
  guildId: string | null,
  channelId: string,
  discord?: DiscordNotify | null,
): NotifyLevel {
  return discordAwareLevel(config, guildId, channelId, discord);
}

export function bumpsUnread(level: NotifyLevel, mentionsMe: boolean, direct = false): boolean {
  if (level === "mute") return false;
  if (direct) return true;
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
  direct?: boolean;
}): boolean {
  if (input.fromMe) return false;
  if (!bumpsUnread(input.level, input.mentionsMe, input.direct)) return false;
  if (input.windowFocused && input.channelId === input.activeChannelId) return false;
  return true;
}
