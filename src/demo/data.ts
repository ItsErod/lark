import type { Channel, Guild, Person, RawMessage } from "../types";

export const ME = "100000000000000001";

export const people: Person[] = [
  { id: ME, name: "Ethan Park", status: "online" },
  { id: "100000000000000002", name: "Maya Chen", status: "online" },
  { id: "100000000000000003", name: "Jonah Adler", status: "idle" },
  { id: "100000000000000004", name: "Priya Shah", status: "dnd" },
  { id: "100000000000000005", name: "Leo Martins", status: "offline" },
];

const byName = Object.fromEntries(people.map((person) => [person.name, person.id]));

export const guilds: Guild[] = [
  { id: "100000000000000010", name: "Northwind", initials: "N" },
  { id: "100000000000000011", name: "Night Market", initials: "NM", mentions: 1 },
];

export const channels: Record<string, Channel[]> = {
  "100000000000000010": [
    { id: "100000000000000020", name: "Studio", kind: "category", position: 0 },
    { id: "100000000000000021", name: "welcome", kind: "text", parentId: "100000000000000020", position: 1, topic: "How Northwind uses this place" },
    { id: "100000000000000022", name: "general", kind: "text", parentId: "100000000000000020", position: 2, topic: "Day to day", unread: 2 },
    { id: "100000000000000023", name: "design-crit", kind: "text", parentId: "100000000000000020", position: 3, topic: "Frames, type, and the apricot mark", unread: 3 },
    { id: "100000000000000024", name: "ship-room", kind: "text", parentId: "100000000000000020", position: 4, topic: "Quiet on purpose" },
    { id: "100000000000000025", name: "random", kind: "text", parentId: "100000000000000020", position: 5, topic: "Muted" },
    { id: "100000000000000028", name: "Voice", kind: "category", position: 6 },
    { id: "100000000000000026", name: "Studio booth", kind: "voice", parentId: "100000000000000028", position: 7 },
    { id: "100000000000000027", name: "archive", kind: "text", parentId: "100000000000000020", position: 8, topic: "This one fails to load, so the error state is reachable" },
  ],
  "100000000000000011": [
    { id: "100000000000000031", name: "vendors", kind: "text", position: 0 },
    { id: "100000000000000032", name: "music", kind: "text", position: 1 },
    { id: "100000000000000033", name: "late-night", kind: "text", position: 2, unread: 1, mentions: 1 },
  ],
};

export const dms: Channel[] = [
  { id: "100000000000000041", name: "Maya Chen", kind: "dm", position: 0, recipientIds: ["100000000000000002"], unread: 1 },
  { id: "100000000000000042", name: "Jonah Adler", kind: "dm", position: 1, recipientIds: ["100000000000000003"] },
  { id: "100000000000000043", name: "Ridge trail", kind: "group", position: 2, recipientIds: ["100000000000000002", "100000000000000003", "100000000000000004"] },
];

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function msg(id: string, channelId: string, author: string, content: string, minutes: number, extra: Partial<RawMessage> = {}): RawMessage {
  const person = people.find((item) => item.id === (byName[author] ?? author)) ?? people[0];
  return {
    id,
    channelId,
    authorId: person.id,
    authorName: person.name,
    content,
    timestamp: ago(minutes),
    ...extra,
  };
}

const routine: [string, string][] = [
  ["Maya Chen", "Pulling the rail in by four pixels. The mark was colliding with the unread bar."],
  ["Jonah Adler", "I can live with that. The compact density still needs a timestamp gutter."],
  ["Priya Shah", "Crit stays at four. Drop frames in <#100000000000000023> before then."],
  ["Leo Martins", "The night photos are in the shared folder whenever you want them."],
  ["Ethan Park", "I'll take the type ramp after lunch."],
  ["Maya Chen", "Serif for the wordmark, Inter everywhere else. Same on Windows, so it doesn't fall back to a surprise face."],
  ["Jonah Adler", "Rate limit headers are in. A 429 now waits instead of retrying in a tight loop."],
  ["Priya Shah", "Please don't bulk-delete anything while you're testing that."],
  ["Maya Chen", "No mass actions. One channel, one person, ordinary pacing."],
  ["Leo Martins", "The daylight theme is warm paper, not stark white. Easier in a bright room."],
  ["Ethan Park", "Shortcuts stay as mod+K. Command on the Mac, Ctrl on Windows."],
  ["Jonah Adler", "Credential Manager path is in the settings copy too."],
  ["Maya Chen", "Member list can hide. I keep it open during crit and closed while writing."],
  ["Priya Shah", "Ship room stays empty until Friday. That's intentional."],
  ["Leo Martins", "If the archive channel errors, the retry button should be the whole recovery."],
  ["Maya Chen", "Image previews stay lazy. Don't fetch the full frame until it's on screen."],
  ["Jonah Adler", "Typing indicator is one request every eight seconds, not a stream."],
  ["Ethan Park", "Plugins are local files. They can highlight or hide a message. They never see the token."],
];

function routineMessages(channelId: string, start: number): RawMessage[] {
  return routine.map((line, index) =>
    msg(`${channelId}${String(index + 1).padStart(2, "0")}`, channelId, line[0], line[1], start - index * 18),
  );
}

const crit = "100000000000000023";
const critRich: RawMessage[] = [
  msg("100000000000000230", crit, "Priya Shah", "Crit is at four. **Maya**, can you walk the compact rail before then?", 46, {
    mentionIds: ["100000000000000002"],
  }),
  msg("100000000000000231", crit, "Maya Chen", "Frames are up. The mark sits on ink, and the unread bar is the only apricot in the chrome.", 34, {
    kind: "reply",
    reply: { id: "100000000000000230", authorName: "Priya Shah", preview: "Crit is at four." },
    attachments: [
      {
        id: "att-frame",
        name: "wordmark-study.svg",
        url: "/media/frame.svg",
        contentType: "image/svg+xml",
        size: 1840,
        width: 800,
        height: 480,
      },
    ],
  }),
  msg("100000000000000232", crit, "Jonah Adler", "Compact gutter, if you want the CSS that matched:\n```css\n.message.is-compact {\n  grid-template-columns: 4.5rem minmax(0, 1fr);\n}\n```", 28),
  msg("100000000000000233", crit, "Leo Martins", "Link preview from the file handoff.", 22, {
    embeds: [
      {
        color: "#e2a15a",
        author: "Northwind files",
        title: "Wordmark v3",
        url: "https://example.com/northwind/wordmark",
        description: "Apricot on ink, with the compact rail and the daylight paper theme beside it.",
        fields: [
          { name: "Status", value: "Ready for crit", inline: true },
          { name: "Type", value: "Inter + a serif mark", inline: true },
        ],
        footer: "example.com",
      },
    ],
  }),
  msg("100000000000000234", crit, "Maya Chen", "The spoiler is staying: ||the wordmark does not get an outline||. Also <:lark:100000000000000099> once the custom set is in.", 12, {
    mentionIds: [ME],
    content: "Ethan, the spoiler is staying: ||the wordmark does not get an outline||. Also <:lark:100000000000000099> once the custom set is in. <@100000000000000001>",
  }),
  msg("100000000000000235", crit, "Ethan Park", "Shipping the compact density after this pass. Reactions welcome.", 4, {
    reactions: [
      { emoji: "👍", count: 4, me: true },
      { emoji: "🔥", count: 2, me: false },
    ],
  }),
];

export const history: Record<string, RawMessage[]> = {
  [crit]: [...routineMessages(crit, 400), ...critRich],
  "100000000000000021": [
    msg("100000000000000210", "100000000000000021", "Priya Shah", "Northwind is a four-person studio. Channels are for the work, DMs are for the rest.", 8000),
  ],
  "100000000000000022": [
    msg("100000000000000220", "100000000000000022", "Maya Chen", "Maya joined the server", 5000, { kind: "join", content: "" }),
    msg("100000000000000221", "100000000000000022", "Jonah Adler", "Build machine is free if you want a Windows installer pass.", 90),
    msg("100000000000000222", "100000000000000022", "Priya Shah", "I'll read the release notes after crit.", 40),
  ],
  "100000000000000024": [],
  "100000000000000025": [
    msg("100000000000000250", "100000000000000025", "Leo Martins", "This channel is muted. It should not badge.", 300),
  ],
  "100000000000000031": [
    msg("100000000000000310", "100000000000000031", "Leo Martins", "Saturday stall is confirmed.", 2400),
  ],
  "100000000000000033": [
    msg("100000000000000330", "100000000000000033", "Maya Chen", "Ethan, the late set is up. <@100000000000000001>", 80, { mentionIds: [ME] }),
  ],
  "100000000000000041": [
    msg("100000000000000410", "100000000000000041", "Maya Chen", "Can you look at the rail spacing when you're back?", 15),
  ],
  "100000000000000042": [
    msg("100000000000000420", "100000000000000042", "Jonah Adler", "Pushed the rate limiter tests.", 120),
    msg("100000000000000421", "100000000000000042", "Ethan Park", "I'll read them before the Windows build.", 110),
  ],
  "100000000000000043": [
    msg("100000000000000430", "100000000000000043", "Priya Shah", "Saturday still good for the ridge?", 200),
    msg("100000000000000431", "100000000000000043", "Jonah Adler", "I'm in if we leave before eight.", 180),
  ],
};

export const ARCHIVE = "100000000000000027";
export const CRIT = crit;
export const NORTHWIND = "100000000000000010";

export function pageMessages(all: RawMessage[], before?: string, limit = 20): { messages: RawMessage[]; hasMore: boolean } {
  let end = all.length;
  if (before) {
    const index = all.findIndex((message) => message.id === before);
    end = index < 0 ? 0 : index;
  }
  const start = Math.max(0, end - limit);
  return { messages: all.slice(start, end), hasMore: start > 0 };
}
