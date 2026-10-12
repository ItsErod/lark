export interface SpotifyTrack {
  title: string;
  artist: string;
  url: string;
}

const LINK = /(?:https?:\/\/open\.spotify\.com\/(track|album|playlist)\/|spotify:(track|album|playlist):)([A-Za-z0-9]+)/;

export function trackFromActivity(activity: string): SpotifyTrack | null {
  const match = /^Listening to\s+(.+)$/i.exec(activity.trim());
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return null;
  const parts = body.split(/\s+[—–-]\s+/);
  const title = parts[0]?.trim().slice(0, 120) ?? "";
  if (!title) return null;
  return { title, artist: parts.slice(1).join(" — ").trim().slice(0, 120), url: "" };
}

export function trackFromText(text: string): SpotifyTrack | null {
  const match = LINK.exec(text);
  if (!match) return null;
  const kind = match[1] || match[2];
  const id = match[3];
  const url = `https://open.spotify.com/${kind}/${id}`;
  const title = kind === "track" ? "Spotify track" : `Spotify ${kind}`;
  return { title, artist: "", url };
}

export function latestLink(contents: readonly string[]): SpotifyTrack | null {
  let found: SpotifyTrack | null = null;
  for (const text of contents) {
    const track = trackFromText(text);
    if (track) found = track;
  }
  return found;
}

export function playerTrack(activity: string, contents: readonly string[], usePresence: boolean, useLinks: boolean): SpotifyTrack | null {
  const listening = usePresence ? trackFromActivity(activity) : null;
  const link = useLinks ? latestLink(contents) : null;
  if (listening && link) return { ...listening, url: link.url };
  return listening ?? link;
}

export function openTarget(track: SpotifyTrack): string {
  if (track.url.startsWith("https://open.spotify.com/")) return track.url;
  const query = [track.title, track.artist].filter(Boolean).join(" ").slice(0, 160);
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}
