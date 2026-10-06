import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commandError, OAUTH_NOTE, PREVIEW_QR_URL, signInCopy, signInErrorVisible } from "./signin";

describe("sign-in screen", () => {
  it("keeps manual paste under Advanced and does not offer OAuth", () => {
    const copy = signInCopy();
    expect(copy.advancedOpen).toBe(false);
    expect(copy.advancedLabel).toBe("Advanced");
    expect(copy.discordButton).toBe("Sign in with Discord");
    expect(copy.qrCaption).toBe("Scan with the Discord mobile app");
    expect(copy.saveButton).toBe("Save and connect");
    expect(copy.oauthNote.toLowerCase()).toContain("oauth2");
    expect(copy.oauthNote.toLowerCase()).toContain("cannot grant");
    expect(OAUTH_NOTE).not.toMatch(/authorize app/i);
    expect(PREVIEW_QR_URL.startsWith("https://discord.com/ra/")).toBe(true);
    expect(PREVIEW_QR_URL).not.toContain("token");
  });

  it("shows a specific error and hides an empty one", () => {
    expect(signInErrorVisible("")).toBe(false);
    expect(signInErrorVisible("   ")).toBe(false);
    const message = "Discord rejected the token (HTTP 401). Lark sent it only to discord.com.";
    expect(signInErrorVisible(message)).toBe(true);
    expect(message).toContain("HTTP 401");
    expect(message).not.toContain("mfa.");
  });

  it("keeps a string command error instead of a generic fallback", () => {
    const keychain = "macOS Keychain could not show its permission prompt (error -25308).";
    expect(commandError(keychain, "Couldn't save the token.")).toBe(keychain);
    expect(commandError(new Error("Discord rejected the token (HTTP 401)."), "Couldn't save the token.")).toContain("HTTP 401");
    expect(commandError({ message: "Discord closed the gateway (close 4004)." }, "fallback")).toContain("4004");
    expect(commandError("", "Couldn't save the token.")).toBe("Couldn't save the token.");
    expect(commandError(undefined, "Couldn't save the token.")).toBe("Couldn't save the token.");
  });
});

describe("credential store dependency", () => {
  it("builds keyring with the real macOS and Windows stores", () => {
    const manifest = readFileSync("src-tauri/Cargo.toml", "utf8");
    expect(manifest).toContain('features = ["apple-native", "windows-native"]');
    expect(manifest).not.toMatch(/^keyring = "3"$/m);
  });
});

describe("production CSP", () => {
  it("is an object so Tauri can nonce the IPC script", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
      app: { security: { csp: unknown } };
    };
    const csp = config.app.security.csp;
    expect(typeof csp).toBe("object");
    expect(csp).not.toBeNull();
    const policy = csp as Record<string, string>;
    expect(policy["script-src"]).toContain("'self'");
    expect(policy["connect-src"]).toContain("ipc:");
    expect(policy["connect-src"]).toContain("http://ipc.localhost");
    expect(policy["connect-src"]).not.toContain("discord.com");
    expect(policy["img-src"]).toContain("https://cdn.discordapp.com");
  });
});
