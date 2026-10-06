import { describe, expect, it } from "vitest";
import { configDirHint, credentialStoreLabel, detectOs, fontStack, notificationNote } from "./platform";

describe("platform", () => {
  it("detects macOS and Windows from the user agent", () => {
    expect(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel")).toBe("macos");
    expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")).toBe("windows");
    expect(detectOs("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")).toBe("linux");
  });

  it("names the credential store for each desktop", () => {
    expect(credentialStoreLabel("macos")).toBe("macOS Keychain");
    expect(credentialStoreLabel("windows")).toBe("Windows Credential Manager");
    expect(credentialStoreLabel("linux")).toContain("Keychain");
    expect(credentialStoreLabel("linux")).toContain("Credential Manager");
  });

  it("uses each platform's config path convention", () => {
    expect(configDirHint("macos")).toContain("Library/Application Support");
    expect(configDirHint("windows")).toContain("%APPDATA%");
    expect(configDirHint("windows")).toContain("\\");
  });

  it("describes notifications for each OS", () => {
    expect(notificationNote("macos")).toContain("Notification Center");
    expect(notificationNote("windows")).toContain("Action Center");
  });

  it("ships a shared font and native fallbacks", () => {
    expect(fontStack("inter")).toContain("Inter");
    expect(fontStack("inter")).toContain("Segoe UI");
    expect(fontStack("system")).toContain("Segoe UI");
    expect(fontStack("mono")).toContain("Cascadia Mono");
    expect(fontStack("mono")).toContain("Consolas");
  });
});
