import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import {
  MAX_ACCOUNTS,
  clampFontSize,
  colorModeCss,
  connectionIdOk,
  defaultKeybinds,
  discordUrl,
  keybindConflicts,
  parseAccountOverview,
  rememberSession,
  sanitizeKeybinds,
  sanitizePreferences,
  sanitizeSessions,
  sessionName,
  standingLabel,
} from "./user-settings";

describe("user settings", () => {
  it("keeps five accounts and never stores a token-shaped name", () => {
    let sessions: { id: string; name: string }[] = [];
    let dropped: string[] = [];
    for (let index = 1; index <= MAX_ACCOUNTS + 1; index += 1) {
      const next = rememberSession(sessions, { id: `10000000000000000${index}`, name: `Account ${index}` });
      sessions = next.sessions;
      dropped = next.dropped;
    }
    expect(sessions).toHaveLength(MAX_ACCOUNTS);
    expect(sessions[0]?.id).toBe("100000000000000006");
    expect(dropped).toEqual(["100000000000000001"]);
    expect(sessionName("mfa.abcdefghijklmnopqrstuvwxyz", "100000000000000002")).toBe("Account 0002");
    expect(sanitizeSessions([{ id: "12", name: "short" }, { id: "100000000000000003", name: "Ada", token: "secret" }])).toEqual([
      { id: "100000000000000003", name: "Ada" },
    ]);
  });

  it("falls back when preferences, keybinds, or colour modes are missing or unknown", () => {
    const prefs = sanitizePreferences({ color_mode: "ash", saturation: 200, extra: true });
    expect(prefs.color_mode).toBe("ash");
    expect(prefs.saturation).toBe(100);
    expect(prefs.desktop_notifications).toBe(true);
    expect(sanitizePreferences(null).language).toBe("en");
    expect(sanitizePreferences(null).show_media).toBe(true);
    const binds = sanitizeKeybinds({ search: "", scroll_chat_up: "not a key", mark_server_read: "shift+escape" });
    expect(binds.search).toBe("");
    expect(binds.scroll_chat_up).toBe("pageup");
    expect(binds.mark_server_read).toBe("shift+escape");
    expect(clampFontSize(99)).toBe(24);
    expect(clampFontSize(8)).toBe(12);
  });

  it("paints the four Discord modes and leaves the gallery for an empty mode", () => {
    expect(colorModeCss("light")).toContain("#fbfbfb");
    expect(colorModeCss("ash")).toContain("#2e2e34");
    expect(colorModeCss("dark")).toContain("#1a1a1e");
    expect(colorModeCss("onyx")).toContain("#070709");
    expect(colorModeCss("")).toBe("");
    expect(colorModeCss("midnight")).toBe("");
  });

  it("does not collide with Lark shortcuts and only links to discord.com", () => {
    expect(keybindConflicts(defaultConfig().shortcuts, defaultKeybinds())).toEqual([]);
    for (const kind of ["account", "password", "mfa", "disable", "delete", "data", "nitro", "boost", "subscriptions", "gifts", "billing", "connections", "emails", "servers"] as const) {
      expect(discordUrl(kind).startsWith("https://discord.com/")).toBe(true);
    }
  });

  it("reads account fields Discord returns and drops secrets", () => {
    const overview = parseAccountOverview({
      me: {
        id: "100000000000000009",
        username: "ada",
        global_name: "Ada",
        email: "ada@example.com",
        phone: "+1 555 0100",
        mfa_enabled: true,
        password: "nope",
        token: "secret",
        totp: "123456",
      },
      standing: { account_standing: "all_good" },
      connections: [
        { type: "youtube", id: "abc", name: "Ada", verified: true },
        { type: "../me", id: "nope", name: "bad" },
      ],
    });
    expect(overview.account).toMatchObject({ username: "ada", email: "ada@example.com", phone: "+1 555 0100", mfaEnabled: true });
    expect(JSON.stringify(overview)).not.toContain("nope");
    expect(JSON.stringify(overview)).not.toContain("secret");
    expect(overview.standing).toBe("All good");
    expect(overview.connections).toEqual([{ id: "abc", type: "youtube", name: "Ada", verified: true }]);
    expect(standingLabel({ standing: "limited" })).toBe("Limited");
    expect(connectionIdOk("a/b")).toBe(false);
    expect(connectionIdOk("../me")).toBe(false);
  });
});
