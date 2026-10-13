import { appSource } from "./app-source.dev";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SCOPE_REASON,
  CUSTOM_INSTALL_REASON,
  directoryMode,
  guildCountLabel,
  installChoice,
  mediaUrl,
  moreApps,
  permissionLabels,
  type DirectoryApp,
} from "./app-directory";

function app(patch: Partial<DirectoryApp> = {}): DirectoryApp {
  return {
    id: "100000000000000099",
    name: "Northbot",
    description: "Keeps the peace",
    iconUrl: "",
    bannerUrl: "",
    guildCount: 1200,
    permissions: "2048",
    scopes: ["bot", "applications.commands"],
    customInstallUrl: "",
    customInstallBlocked: false,
    categories: ["Moderation"],
    ...patch,
  };
}

describe("app directory", () => {
  it("installs a bot in-app and links out when the app wants its own page or account scopes", () => {
    const guild = "100000000000000010";
    const choice = installChoice(app(), guild);
    expect(choice.kind).toBe("authorize");
    if (choice.kind === "authorize") {
      expect(choice.scopes).toEqual(["bot", "applications.commands"]);
      expect(choice.permissions).toBe("2048");
      expect(choice.labels.length).toBeGreaterThan(0);
    }
    const custom = installChoice(app({ customInstallUrl: "https://example.com/install" }), guild);
    expect(custom).toMatchObject({ kind: "link", url: "https://example.com/install", reason: CUSTOM_INSTALL_REASON });
    const blocked = installChoice(app({ customInstallUrl: "http://example.com/install", customInstallBlocked: true }), guild);
    expect(blocked.kind).toBe("link");
    if (blocked.kind === "link") {
      expect(blocked.url).toBe("https://discord.com/application-directory/100000000000000099");
      expect(blocked.reason).toContain("not a safe link");
      expect(blocked.url).not.toContain("token");
    }
    const account = installChoice(app({ scopes: ["bot", "identify"] }), guild);
    expect(account.kind).toBe("link");
    if (account.kind === "link") {
      expect(account.url.startsWith("https://discord.com/oauth2/authorize?")).toBe(true);
      expect(account.url).not.toContain("token=");
      expect(account.reason).toBe(ACCOUNT_SCOPE_REASON);
    }
    expect(permissionLabels("8")).toEqual(["Administrator"]);
    expect(permissionLabels("0")).toEqual(["No extra permissions"]);
  });

  it("names browse, confirm, and empty states", () => {
    expect(directoryMode({ loading: true, error: "", confirm: false })).toBe("loading");
    expect(directoryMode({ loading: false, error: "Offline", confirm: false })).toBe("error");
    expect(directoryMode({ loading: false, error: "", confirm: true })).toBe("confirm");
    expect(directoryMode({ loading: false, error: "", confirm: false })).toBe("browse");
    expect(guildCountLabel(1200)).toBe("In 1.2K servers");
    expect(guildCountLabel(0)).toBe("New to servers");
    expect(moreApps(1, 3)).toBe(true);
    expect(moreApps(3, 3)).toBe(false);
    expect(mediaUrl("https://cdn.discordapp.com/app-assets/1/a.png")).toContain("cdn.discordapp.com");
    expect(mediaUrl("https://media.discordapp.net/attachments/1/a.png")).toContain("media.discordapp.net");
    expect(mediaUrl("https://evil.example/a.png")).toBe("");
  });

  it("loads the directory when server settings ask for it", () => {
    const appText = appSource();
    const pages = readFileSync("src/ui/guild-pages.ts", "utf8");
    expect(appText).not.toMatch(/from ["']\.\/app-directory-view["']/);
    expect(appText).toContain('import("./app-directory-view")');
    expect(pages).not.toMatch(/from ["']\.\/app-directory-view["']/);
    expect(pages).toContain('import("./app-directory-view")');
    expect(pages).not.toContain("discord.com/application-directory");
    const css = readFileSync("src/design-chrome.css", "utf8");
    expect(css).toContain(".lark-directory");
    expect(css).toContain("box-shadow: none");
  });
});
