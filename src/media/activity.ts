import { playingLine } from "../pack/playing";

export type GameVisibility = "show" | "hide";
export type MediaSource = "game" | "spotify" | "either";

export function gameVisibility(value: string): GameVisibility {
  return value === "hide" ? "hide" : "show";
}

export function mediaSource(value: string): MediaSource {
  if (value === "game" || value === "spotify") return value;
  return "either";
}

/** Discord playing activity name. Empty hides it. */
export function gameActivityName(visibility: GameVisibility, game: string): string {
  if (visibility !== "show") return "";
  return game.trim().replace(/\s+/g, " ").slice(0, 128);
}

export function gameStatusLine(game: string): string {
  const name = game.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!name) return "";
  return `Playing ${name}`.slice(0, 128);
}

/** Custom status from a detected game, the system player, or whichever is present. */
export function mediaStatusLine(source: MediaSource, game: string, title: string, artist: string): string {
  const listening = playingLine(title, artist);
  const playing = gameStatusLine(game);
  if (source === "spotify") return listening;
  if (source === "game") return playing;
  return listening || playing;
}
