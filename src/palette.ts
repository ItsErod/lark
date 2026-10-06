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
    { id: "split", label: "Toggle split view", hint: "Two channels side by side", keywords: "split pane columns" },
    { id: "theme", label: "Theme editor", hint: "Live colour preview", keywords: "theme color accent editor" },
    { id: "mute", label: "Toggle mute", hint: "Microphone", keywords: "mute mic voice" },
    { id: "deafen", label: "Toggle deafen", hint: "Speakers", keywords: "deafen headset voice" },
    { id: "leave-voice", label: "Leave voice", hint: "Disconnect the call", keywords: "voice hangup leave" },
    { id: "members", label: "Toggle member list", hint: "People in this server", keywords: "members users" },
    { id: "irc", label: "Toggle IRC layout", hint: "One line per message", keywords: "irc compact density" },
    { id: "pins", label: "Pinned messages", hint: "This channel", keywords: "pins saved" },
    { id: "status", label: "Set a status", hint: "Online, idle, or a custom line", keywords: "status presence custom" },
  ];
}

export function matchCommands(query: string, items: CommandItem[]): CommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(needle));
}
