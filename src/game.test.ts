import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import {
  GAME_CHANNEL_PX,
  GAME_RAIL_PX,
  SHELL_CHANNEL_PX,
  SHELL_RAIL_PX,
  compactGameChrome,
  gameShellWidths,
  pollInterval,
  profileFromBase,
  resolveGame,
  sanitizeGames,
  shouldPreload,
  type GameBase,
} from "./game";

const base = (): GameBase => ({
  voiceMode: "vad",
  pttKey: "backquote",
  voiceOverlay: false,
  perfOverlay: false,
  gameMode: false,
});

describe("game mode", () => {
  it("slows the existing polls and stops prefetch while it is on", () => {
    expect(pollInterval("plugins", false)).toBe(5_000);
    expect(pollInterval("clock", false)).toBe(30_000);
    expect(pollInterval("hardware", false)).toBe(60_000);
    expect(pollInterval("detect", false)).toBe(5_000);
    expect(pollInterval("plugins", true)).toBeGreaterThan(pollInterval("plugins", false));
    expect(pollInterval("clock", true)).toBeGreaterThan(pollInterval("clock", false));
    expect(pollInterval("hardware", true)).toBeGreaterThan(pollInterval("hardware", false));
    expect(pollInterval("theme", true)).toBeGreaterThan(pollInterval("theme", false));
    expect(pollInterval("detect", true)).toBeGreaterThan(pollInterval("detect", false));
    expect(shouldPreload(false)).toBe(true);
    expect(shouldPreload(true)).toBe(false);
  });

  it("only stretches UI polls, so voice and gateway heartbeats stay off this clock", () => {
    const kinds = ["theme", "plugins", "clock", "hardware", "detect"] as const;
    expect(kinds).toHaveLength(5);
    for (const kind of kinds) {
      expect(pollInterval(kind, true)).toBeGreaterThan(pollInterval(kind, false));
    }
  });

  it("turns game mode on for a detected game and leaves voice on the usual settings", () => {
    const resolved = resolveGame("Hades", {}, base());
    expect(resolved).toMatchObject({
      game: "Hades",
      gameMode: true,
      voiceMode: "vad",
      pttKey: "backquote",
      voiceOverlay: false,
      perfOverlay: false,
      profile: false,
    });
  });

  it("applies a profile's push-to-talk, key, game mode, and overlays", () => {
    const profiles = {
      Hades: {
        ptt: true,
        ptt_key: "v",
        game_mode: false,
        voice_overlay: true,
        perf_overlay: true,
      },
    };
    const resolved = resolveGame("Hades", profiles, { ...base(), gameMode: true, voiceOverlay: false });
    expect(resolved).toMatchObject({
      game: "Hades",
      gameMode: false,
      voiceMode: "ptt",
      pttKey: "v",
      voiceOverlay: true,
      perfOverlay: true,
      profile: true,
    });
  });

  it("uses the manual switch only when no game is detected", () => {
    expect(resolveGame(null, {}, { ...base(), gameMode: true }).gameMode).toBe(true);
    expect(resolveGame(null, {}, base()).gameMode).toBe(false);
    expect(resolveGame("  Celeste  ", {}, { ...base(), gameMode: false }).gameMode).toBe(true);
    expect(resolveGame("Celeste", {}, base()).voiceMode).toBe("vad");
  });

  it("restores the usual settings when the game is gone", () => {
    const profiles = {
      Hades: profileFromBase(base(), { ptt: true, ptt_key: "c", voice_overlay: true, perf_overlay: true, game_mode: true }),
    };
    const playing = resolveGame("Hades", profiles, base());
    expect(playing.profile).toBe(true);
    expect(playing.voiceMode).toBe("ptt");
    const idle = resolveGame(null, profiles, base());
    expect(idle).toMatchObject({
      game: null,
      gameMode: false,
      voiceMode: "vad",
      pttKey: "backquote",
      voiceOverlay: false,
      perfOverlay: false,
      profile: false,
    });
  });

  it("keeps saved profiles and leaves the new switches off until settings says so", () => {
    const config = sanitizeConfig({
      games: {
        "  Hades  ": { ptt: true, ptt_key: "v", game_mode: false, voice_overlay: true, perf_overlay: false },
        "": { ptt: true },
        "mod+": { ptt_key: "mod+" },
      },
    });
    expect(config.desktop.perf_overlay).toBe(false);
    expect(config.desktop.game_mode).toBe(false);
    expect(config.desktop.detect_games).toBe(true);
    expect(config.shortcuts.toggle_perf_overlay).toBe("mod+shift+p");
    expect(config.shortcuts.toggle_game_mode).toBe("mod+shift+g");
    expect(config.voice.overlay_click_through).toBe(true);
    expect(config.games.Hades).toEqual({
      ptt: true,
      ptt_key: "v",
      game_mode: false,
      voice_overlay: true,
      perf_overlay: false,
    });
    expect(config.games[""]).toBeUndefined();
    expect(sanitizeGames(null)).toEqual({});
    expect(sanitizeConfig({ desktop: { detect_games: false, perf_overlay: true, game_mode: true } }).desktop).toMatchObject({
      detect_games: false,
      perf_overlay: true,
      game_mode: true,
    });
  });

  it("tucks chrome during a call or a detected game, and leaves it alone otherwise", () => {
    expect(compactGameChrome({ gameMode: false, inCall: true, gameDetected: true })).toBe(false);
    expect(compactGameChrome({ gameMode: true, inCall: false, gameDetected: false })).toBe(false);
    expect(compactGameChrome({ gameMode: true, inCall: true, gameDetected: false })).toBe(true);
    expect(compactGameChrome({ gameMode: true, inCall: false, gameDetected: true })).toBe(true);
    expect(gameShellWidths({ compact: false, showRail: true, channelHidden: false, membersPx: 240 })).toEqual({
      railPx: SHELL_RAIL_PX,
      channelPx: SHELL_CHANNEL_PX,
      membersPx: 240,
    });
    expect(gameShellWidths({ compact: true, showRail: true, channelHidden: false, membersPx: 320 })).toEqual({
      railPx: GAME_RAIL_PX,
      channelPx: GAME_CHANNEL_PX,
      membersPx: 0,
    });
    expect(gameShellWidths({ compact: true, showRail: false, channelHidden: true, membersPx: 240 })).toEqual({
      railPx: 0,
      channelPx: 0,
      membersPx: 0,
    });
  });
});
