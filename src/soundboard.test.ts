import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import { clipForHotkey, playableClipIds, playableGuildSounds, sanitizeClips, sanitizeGuildSounds, sanitizeSoundToggles, soundHotkeyIsGlobal } from "./soundboard";

describe("soundboard", () => {
  it("keeps a short list of wav clips and drops a duplicate hotkey", () => {
    const clips = sanitizeClips([
      { id: "horn", name: "Horn", path: "/tmp/horn.wav", hotkey: "mod+shift+1", volume: 120 },
      { id: "horn", name: "Again", path: "/tmp/other.wav", hotkey: "mod+shift+2", volume: 100 },
      { id: "bell", name: "Bell", path: "/tmp/bell.wav", hotkey: "mod+shift+1", volume: 400 },
      { id: "nope", name: "Nope", path: "", hotkey: "", volume: 100 },
    ]);
    expect(clips.map((clip) => clip.id)).toEqual(["horn", "bell"]);
    expect(clips[0].volume).toBe(120);
    expect(clips[1].hotkey).toBe("");
    expect(clips[1].volume).toBe(200);
  });

  it("matches a hotkey and knows which ones can be global", () => {
    const clips = sanitizeClips([{ id: "horn", name: "Horn", path: "/tmp/horn.wav", hotkey: "mod+shift+1", volume: 100 }]);
    const event = { key: "1", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false };
    expect(clipForHotkey(clips, event, "windows")?.id).toBe("horn");
    expect(clipForHotkey(clips, event, "macos")).toBeNull();
    expect(soundHotkeyIsGlobal("mod+shift+1")).toBe(true);
    expect(soundHotkeyIsGlobal("f5")).toBe(true);
    expect(soundHotkeyIsGlobal("1")).toBe(false);
  });

  it("round-trips clips and per-user mix through config", () => {
    const config = sanitizeConfig({
      voice: { levels: { "100000000000000002": { volume: 80, muted: true }, nope: { volume: 10, muted: false } } },
      soundboard: { clips: [{ id: "horn", name: "Horn", path: "/tmp/horn.wav", hotkey: "mod+shift+1", volume: 90 }] },
    });
    expect(config.voice.levels["100000000000000002"]).toEqual({ volume: 80, muted: true });
    expect(config.voice.levels.nope).toBeUndefined();
    expect(config.soundboard.clips[0].name).toBe("Horn");
    expect(config.voice.noise_suppression).toBe(true);
  });

  it("gates guild sounds while deafened and honors a per-sound toggle", () => {
    const sounds = sanitizeGuildSounds([
      { sound_id: "100000000000000201", name: "Horn", volume: 1, emoji_name: "📯", available: true },
      { sound_id: "100000000000000202", name: "Off", volume: 1, available: false },
      { name: "Missing" },
    ], "100000000000000010");
    expect(sounds.map((sound) => sound.name)).toEqual(["Horn", "Off"]);
    const toggles = sanitizeSoundToggles({ "100000000000000201": false, horn: true, nope: true });
    expect(toggles["100000000000000201"]).toBe(false);
    expect(playableGuildSounds(sounds, toggles, false)).toEqual([]);
    expect(playableGuildSounds(sounds, { "100000000000000201": true }, false).map((sound) => sound.id)).toEqual(["100000000000000201"]);
    expect(playableGuildSounds(sounds, {}, true)).toEqual([]);
    expect(playableClipIds([{ id: "horn" }, { id: "bell" }], { bell: false })).toEqual(["horn"]);
  });
});