import { afterEach, describe, expect, it } from "vitest";
import {
  clearSettingsExtensions,
  groupedSections,
  normalizeHex,
  registerSettingEntries,
  registerSettingsSection,
  searchSettings,
  sectionsForQuery,
  SETTINGS_GROUPS,
  settingsSections,
} from "./settings";

afterEach(() => {
  clearSettingsExtensions();
});

describe("settings catalog", () => {
  it("groups pages into User Settings, App Settings, and Lark", () => {
    const groups = groupedSections();
    expect(groups.map((group) => group.label)).toEqual(SETTINGS_GROUPS.map((group) => group.label));
    const lark = groups.find((group) => group.id === "lark");
    expect(lark?.sections.map((section) => section.label)).toEqual([
      "Voice & Video",
      "Messages",
      "Privacy",
      "Clips",
      "Gaming",
      "Plugins and Themes",
    ]);
    expect(groups.find((group) => group.id === "user")?.sections.map((section) => section.id)).toEqual([
      "account",
      "messaging",
      "data",
      "connections",
      "activity",
      "notifications",
      "nitro",
    ]);
    const app = groups.find((group) => group.id === "app")?.sections.map((section) => section.id) ?? [];
    expect(app).toEqual(["appearance", "accessibility", "shortcuts", "language", "window", "advanced", "updates"]);
    expect(app).not.toContain("notifications");
  });

  it("searches across section names and individual options", () => {
    const noise = searchSettings("noise suppression");
    expect(noise[0]?.id).toBe("voice.noise");
    expect(noise[0]?.section).toBe("voice");

    const streamer = searchSettings("streamer");
    expect(streamer.some((hit) => hit.id === "privacy.streamer")).toBe(true);

    const clips = sectionsForQuery("game mode capture");
    expect(clips.map((section) => section.id)).toContain("clips");

    expect(sectionsForQuery("").map((section) => section.id)).toEqual(settingsSections().map((section) => section.id));
    expect(searchSettings("   ")).toEqual([]);
    expect(sectionsForQuery("zzzz-not-a-setting")).toEqual([]);
  });

  it("finds keybinds, the accent colour, and window options", () => {
    expect(searchSettings("escape").some((hit) => hit.id === "shortcut.mark_read")).toBe(true);
    expect(searchSettings("push to talk").some((hit) => hit.section === "shortcuts" || hit.section === "voice" || hit.section === "gaming")).toBe(true);
    expect(searchSettings("accent").some((hit) => hit.id === "appearance.accent")).toBe(true);
    expect(searchSettings("tray").some((hit) => hit.id === "window.tray")).toBe(true);
    expect(searchSettings("speaking ring").some((hit) => hit.id === "voice.speak")).toBe(true);
    expect(searchSettings("diagnostics").some((hit) => hit.id === "voice.diagnostics")).toBe(true);
    expect(searchSettings("compress").some((hit) => hit.id === "clips.compress")).toBe(true);
    expect(searchSettings("clip library").some((hit) => hit.id === "clips.library")).toBe(true);
    expect(searchSettings("1440").some((hit) => hit.id === "clips.resolution")).toBe(true);
    expect(searchSettings("240 fps").some((hit) => hit.id === "clips.fps")).toBe(true);
    expect(searchSettings("developer mode").some((hit) => hit.id === "advanced.developer")).toBe(true);
    expect(searchSettings("billing").some((hit) => hit.id === "nitro.billing")).toBe(true);
    expect(searchSettings("gift").some((hit) => hit.id === "nitro.gifts")).toBe(true);
    expect(searchSettings("ash").some((hit) => hit.id === "appearance.mode")).toBe(true);
    expect(searchSettings("spoiler").some((hit) => hit.id === "appearance.spoilers")).toBe(true);
    expect(searchSettings("log out").some((hit) => hit.id === "account.logout")).toBe(true);
    expect(searchSettings("automatically install").some((hit) => hit.id === "updates.auto")).toBe(true);
    expect(searchSettings("check now").some((hit) => hit.section === "updates")).toBe(true);
expect(searchSettings("check for updates").some((hit) => hit.id === "updates.check")).toBe(true);
    expect(searchSettings("canary").some((hit) => hit.id === "updates.channel")).toBe(true);
    expect(searchSettings("built-in").some((hit) => hit.id === "updates.reset")).toBe(true);
    expect(searchSettings("uninstall").some((hit) => hit.id === "plugins.store")).toBe(true);
    expect(searchSettings("quiet hours").some((hit) => hit.id === "notifications.quiet")).toBe(true);
    expect(searchSettings("missed").some((hit) => hit.id === "notifications.missed")).toBe(true);
  });

  it("accepts a later section without dropping the built-in pages", () => {
    registerSettingsSection({
      id: "folders",
      label: "Server folders",
      group: "lark",
      description: "How folders sit on the server rail.",
    });
    registerSettingEntries([
      { id: "folders.color", section: "folders", label: "Folder colour", description: "Tint for a server folder.", keywords: "color picker" },
    ]);
    registerSettingsSection({
      id: "folders",
      label: "Duplicate",
      group: "lark",
      description: "Ignored.",
    });
    registerSettingsSection({
      id: "nope",
      label: "Nope",
      group: "billing" as "lark",
      description: "Unknown groups are ignored.",
    });

    const ids = settingsSections().map((section) => section.id);
    expect(ids.filter((id) => id === "folders")).toEqual(["folders"]);
    expect(ids).toContain("voice");
    expect(ids).not.toContain("nope");
    expect(groupedSections().find((group) => group.id === "lark")?.sections.some((section) => section.id === "folders")).toBe(true);
    expect(searchSettings("folder colour").some((hit) => hit.id === "folders.color")).toBe(true);
  });

  it("normalises hex colours for the picker", () => {
    expect(normalizeHex("#5865F2")).toBe("#5865f2");
    expect(normalizeHex("e2a15a")).toBe("#e2a15a");
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });
});
