import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { sanitizePack } from "./state";
import { openTarget, playerTrack, trackFromActivity, trackFromText } from "./spotify";

describe("spotify controls", () => {
  it("reads a listening line and a Spotify link without a secret", () => {
    expect(trackFromActivity("Listening to Apricot — Maya")).toEqual({ title: "Apricot", artist: "Maya", url: "" });
    expect(trackFromActivity("Playing a game")).toBeNull();
    const link = trackFromText("hear this https://open.spotify.com/track/abc123?si=1");
    expect(link).toEqual({ title: "Spotify track", artist: "", url: "https://open.spotify.com/track/abc123" });
    const merged = playerTrack("Listening to Apricot — Maya", ["https://open.spotify.com/track/abc123"], true, true);
    expect(merged).toEqual({ title: "Apricot", artist: "Maya", url: "https://open.spotify.com/track/abc123" });
    expect(openTarget(merged!)).toBe("https://open.spotify.com/track/abc123");
    expect(openTarget({ title: "Apricot", artist: "Maya", url: "" })).toContain("open.spotify.com/search/Apricot");
    expect(playerTrack("Listening to Apricot", [], false, true)).toBeNull();
    const source = readFileSync("store/plugins/spotify-controls/plugin.js", "utf8");
    expect(source).not.toMatch(/client_secret|spotify_secret|Authorization/i);
  });

  it("declares the hook and the two toggles", () => {
    const plugin = describePlugin(readFileSync("store/plugins/spotify-controls/plugin.js", "utf8"), "spotify-controls");
    expect(plugin.hooks.spotify).toBe(true);
    const pack = sanitizePack({ spotifyPresence: false, spotifyLinks: true });
    expect(pack.spotifyPresence).toBe(false);
    expect(pack.spotifyLinks).toBe(true);
    expect(sanitizePack({}).spotifyLinks).toBe(true);
  });
});
