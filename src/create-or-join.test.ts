import { appSource } from "./app-source.dev";
import { describe, expect, it } from "vitest";
import { DISCORD_KEYBINDS } from "./user-settings";

describe("create or join shortcut", () => {
  it("keeps Ctrl+Shift+N as the default and describes the in-app window", () => {
    const row = DISCORD_KEYBINDS.find((item) => item.id === "create_or_join_server");
    expect(row?.default).toBe("mod+shift+n");
    expect(row?.description).toBe("Open the in-app Add Server window.");
  });

  it("opens the Add Server modal instead of Discord's site", () => {
    const source = appSource();
    const start = source.indexOf('id === "create_or_join_server"');
    const block = source.slice(start, source.indexOf('id === "toggle_inbox"', start));
    expect(block).toContain("this.openAddServer()");
    expect(block).not.toContain("discord.com");
    expect(block).not.toContain("openDiscord");
  });
});
