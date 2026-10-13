export interface CommandItem {
  id: string;
  label: string;
  hint: string;
  keywords: string;
}

export function commandCatalog(): CommandItem[] {
  return [
    { id: "settings", label: "Open settings", hint: "Appearance, voice, plugins", keywords: "settings preferences" },
    { id: "search", label: "Search messages", hint: "This server", keywords: "search find" },
    { id: "local-search", label: "Search loaded messages", hint: "On this device, across servers", keywords: "search find offline local history index" },
    { id: "split", label: "Toggle split view", hint: "Two channels side by side", keywords: "split pane columns" },
    { id: "theme", label: "Theme editor", hint: "Live colour preview", keywords: "theme color accent editor" },
    { id: "themes", label: "Theme gallery", hint: "Preview and apply a theme", keywords: "theme discord blurple nord dracula catppuccin oled appearance gallery warm" },
    { id: "mute", label: "Toggle mute", hint: "Microphone", keywords: "mute mic voice" },
    { id: "deafen", label: "Toggle deafen", hint: "Speakers", keywords: "deafen headset voice" },
    { id: "leave-voice", label: "Leave voice", hint: "Disconnect the call", keywords: "voice hangup leave" },
    { id: "call", label: "Toggle call view", hint: "Open the call grid, or return to the text channel", keywords: "voice call grid split popout" },
    { id: "voice-hud", label: "Toggle voice HUD", hint: "Who is talking, on top of a game", keywords: "voice hud overlay speaking mute game" },
    { id: "perf-overlay", label: "Toggle performance overlay", hint: "RAM, CPU, and FPS on the voice HUD", keywords: "performance overlay fps cpu ram stats game" },
    { id: "game-mode", label: "Toggle Game Mode", hint: "Pause animations and ease polling", keywords: "game mode performance battery overlay" },
    { id: "members", label: "Toggle member list", hint: "People in this server", keywords: "members users" },
    { id: "irc", label: "Toggle IRC layout", hint: "One line per message", keywords: "irc compact density" },
    { id: "pins", label: "Pinned messages", hint: "This channel", keywords: "pins saved" },
    { id: "clips", label: "Clips", hint: "Saved 30 second clips", keywords: "clips clip library video replay trim compress send" },
    { id: "saved", label: "Saved messages", hint: "Bookmarks on this device", keywords: "saved bookmarks save messages" },
    { id: "reminders", label: "Reminders", hint: "Messages to come back to", keywords: "remind reminder later messages" },
    { id: "scheduled", label: "Scheduled messages", hint: "Send later queue", keywords: "schedule scheduled send later queue" },
    { id: "streamer", label: "Toggle streamer mode", hint: "Hide emails, tokens, DM previews, and personal info", keywords: "streamer privacy hide email token dm" },
    { id: "status", label: "Set a status", hint: "Online, idle, or a custom line", keywords: "status presence custom" },
  ];
}

export function matchCommands(query: string, items: CommandItem[]): CommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(needle));
}
