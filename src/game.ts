import type { GameProfile } from "./types";

export type PollKind = "theme" | "plugins" | "clock" | "hardware" | "detect";

const BASE_MS: Record<PollKind, number> = {
  theme: 1_000,
  plugins: 5_000,
  clock: 30_000,
  hardware: 60_000,
  detect: 5_000,
};

const GAME_MS: Record<PollKind, number> = {
  theme: 10_000,
  plugins: 20_000,
  clock: 120_000,
  hardware: 180_000,
  detect: 15_000,
};

export interface GameBase {
  voiceMode: "vad" | "ptt";
  pttKey: string;
  voiceOverlay: boolean;
  perfOverlay: boolean;
  /** Manual Game Mode while no game is detected. */
  gameMode: boolean;
}

export interface ResolvedGame {
  game: string | null;
  gameMode: boolean;
  voiceMode: "vad" | "ptt";
  pttKey: string;
  voiceOverlay: boolean;
  perfOverlay: boolean;
  /** A saved profile is driving the voice and overlay switches. */
  profile: boolean;
}

/** How often a repeating UI task should run. Game Mode stretches these clocks only.
 *  Voice and Discord gateway heartbeats stay on the interval from Hello.
 *  Go Live capture and its stream socket keep their own clocks too. */
export function pollInterval(kind: PollKind, gameMode: boolean): number {
  return gameMode ? GAME_MS[kind] : BASE_MS[kind];
}

/** Channel and split prefetch stay off for the whole time Game Mode is on. */
export function shouldPreload(gameMode: boolean): boolean {
  return !gameMode;
}

/** Usual shell columns. Game Mode only narrows these while chrome is tucked. */
export const SHELL_RAIL_PX = 56;
export const SHELL_CHANNEL_PX = 240;
/** Icon rail. Still wide enough to hit a server. */
export const GAME_RAIL_PX = 40;
/** Channel names and the voice panel. Mute stays on the wrapped row. */
export const GAME_CHANNEL_PX = 200;

/**
 * Tuck the member list and narrow the rail and channel list only while Game
 * Mode is on and a call is up or a game is in front. Idle Game Mode keeps
 * the usual columns. Chat stays the flexible column either way.
 */
export function compactGameChrome(input: { gameMode: boolean; inCall: boolean; gameDetected: boolean }): boolean {
  return input.gameMode && (input.inCall || input.gameDetected);
}

export function gameShellWidths(input: {
  compact: boolean;
  showRail: boolean;
  channelHidden: boolean;
  membersPx: number;
}): { railPx: number; channelPx: number; membersPx: number } {
  return {
    railPx: input.showRail ? (input.compact ? GAME_RAIL_PX : SHELL_RAIL_PX) : 0,
    channelPx: input.channelHidden ? 0 : (input.compact ? GAME_CHANNEL_PX : SHELL_CHANNEL_PX),
    membersPx: input.compact ? 0 : Math.max(0, input.membersPx),
  };
}

export function cleanGameName(name: string): string | null {
  let out = "";
  let pending = false;
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (/\s/u.test(ch)) {
      pending = out.length > 0;
      continue;
    }
    if (pending) {
      out += " ";
      pending = false;
    }
    out += ch;
    if ([...out].length >= 80) break;
  }
  const text = out.trim();
  return text ? text : null;
}

function usableShortcut(value: string): boolean {
  const text = value.trim();
  return text.length > 0 && text.length <= 64 && !/\s/.test(text) && !text.endsWith("+") && !text.startsWith("+");
}

export function profileFromBase(base: GameBase, patch: Partial<GameProfile> = {}): GameProfile {
  const key = typeof patch.ptt_key === "string" && usableShortcut(patch.ptt_key) ? patch.ptt_key.trim() : base.pttKey;
  return {
    ptt: patch.ptt ?? base.voiceMode === "ptt",
    ptt_key: usableShortcut(key) ? key : "backquote",
    game_mode: patch.game_mode ?? true,
    voice_overlay: patch.voice_overlay ?? base.voiceOverlay,
    perf_overlay: patch.perf_overlay ?? base.perfOverlay,
  };
}

/**
 * A detected game turns Game Mode on unless that game's profile says otherwise.
 * The manual switch applies only while nothing is detected.
 * A profile, when present, also owns push-to-talk and the overlay switches.
 */
export function resolveGame(
  detected: string | null,
  profiles: Readonly<Record<string, GameProfile>>,
  base: GameBase,
): ResolvedGame {
  const game = detected ? cleanGameName(detected) : null;
  const profile = game ? profiles[game] : undefined;
  if (game && profile) {
    return {
      game,
      gameMode: profile.game_mode,
      voiceMode: profile.ptt ? "ptt" : "vad",
      pttKey: usableShortcut(profile.ptt_key) ? profile.ptt_key : base.pttKey,
      voiceOverlay: profile.voice_overlay,
      perfOverlay: profile.perf_overlay,
      profile: true,
    };
  }
  if (game) {
    return {
      game,
      gameMode: true,
      voiceMode: base.voiceMode,
      pttKey: base.pttKey,
      voiceOverlay: base.voiceOverlay,
      perfOverlay: base.perfOverlay,
      profile: false,
    };
  }
  return {
    game: null,
    gameMode: base.gameMode,
    voiceMode: base.voiceMode,
    pttKey: base.pttKey,
    voiceOverlay: base.voiceOverlay,
    perfOverlay: base.perfOverlay,
    profile: false,
  };
}

export function sanitizeGames(input: unknown): Record<string, GameProfile> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, GameProfile> = {};
  const names = Object.keys(input).sort((a, b) => a.localeCompare(b));
  for (const rawName of names) {
    if (Object.keys(out).length >= 40) break;
    const name = cleanGameName(rawName);
    const value = (input as Record<string, unknown>)[rawName];
    if (!name || !value || typeof value !== "object") continue;
    const record = value as Partial<GameProfile>;
    const key = typeof record.ptt_key === "string" ? record.ptt_key.trim() : "backquote";
    out[name] = {
      ptt: record.ptt === true,
      ptt_key: usableShortcut(key) ? key : "backquote",
      game_mode: record.game_mode !== false,
      voice_overlay: record.voice_overlay === true,
      perf_overlay: record.perf_overlay === true,
    };
  }
  return out;
}
