import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { formatShortcut, matchShortcut, shortcutConflicts } from "./shortcuts";

const down = { key: "ArrowDown", ctrlKey: false, altKey: true, shiftKey: true, metaKey: false };

describe("shortcuts", () => {
  it("treats mod as Command on macOS and Ctrl on Windows", () => {
    const event = { key: "k", ctrlKey: false, altKey: false, shiftKey: false, metaKey: true };
    expect(matchShortcut(event, "mod+k", "macos")).toBe(true);
    expect(matchShortcut(event, "mod+k", "windows")).toBe(false);
    const windows = { ...event, ctrlKey: true, metaKey: false };
    expect(matchShortcut(windows, "mod+k", "windows")).toBe(true);
    expect(matchShortcut(windows, "mod+k", "macos")).toBe(false);
    expect(matchShortcut(event, "cmd+k", "windows")).toBe(true);
    expect(matchShortcut(windows, "ctrl+k", "macos")).toBe(true);
    expect(formatShortcut("cmd+k", "windows")).toBe("Cmd+K");
  });

  it("formats the quick switcher for each platform", () => {
    expect(formatShortcut("mod+k", "macos")).toBe("⌘K");
    expect(formatShortcut("mod+k", "windows")).toBe("Ctrl+K");
    expect(formatShortcut("mod+comma", "macos")).toBe("⌘,");
    expect(formatShortcut("alt+shift+down", "windows")).toBe("Alt+Shift+↓");
  });

  it("matches aliased arrow keys", () => {
    expect(matchShortcut(down, "alt+shift+down", "windows")).toBe(true);
    expect(matchShortcut(down, "alt+shift+arrowdown", "macos")).toBe(true);
  });

  it("ships defaults that use mod, not a hardcoded modifier", () => {
    const shortcuts = defaultConfig().shortcuts;
    expect(shortcuts.quick_switcher).toBe("mod+k");
    expect(shortcuts.open_settings.startsWith("mod+")).toBe(true);
    expect(shortcutConflicts(shortcuts)).toEqual([]);
    shortcuts.next_channel = shortcuts.previous_channel;
    expect(shortcutConflicts(shortcuts).length).toBe(1);
  });
});
