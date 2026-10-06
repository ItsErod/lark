import { describe, expect, it } from "vitest";
import { applyMention, mentionHits, mentionQuery, plainPreview } from "./mentions";

const ctx = {
  users: { "42": "Ethan", "7": "Maya Chen" },
  roles: { "3": "Design" },
  channels: { "8": "design-crit" },
};

describe("mention autocomplete", () => {
  it("reads the token at the caret", () => {
    expect(mentionQuery("hey @eth", 8)).toEqual({ kind: "@", query: "eth", start: 4 });
    expect(mentionQuery("see #des", 8)).toEqual({ kind: "#", query: "des", start: 4 });
    expect(mentionQuery("email a@b.com", 13)).toBeNull();
    expect(mentionQuery("nope", 4)).toBeNull();
  });

  it("offers users, roles, channels, and broad mentions", () => {
    const users = mentionHits({ kind: "@", query: "may", start: 0 }, ctx);
    expect(users[0]).toMatchObject({ token: "<@7>", label: "@Maya Chen" });
    const roles = mentionHits({ kind: "@", query: "des", start: 0 }, ctx);
    expect(roles.some((hit) => hit.token === "<@&3>")).toBe(true);
    const channels = mentionHits({ kind: "#", query: "design", start: 0 }, ctx);
    expect(channels[0].token).toBe("<#8>");
    const broad = mentionHits({ kind: "@", query: "every", start: 0 }, ctx);
    expect(broad.some((hit) => hit.token === "@everyone")).toBe(true);
  });

  it("inserts the token and leaves a space", () => {
    const next = applyMention("hey @eth there", 4, 8, "<@42>");
    expect(next.text).toBe("hey <@42>  there");
    expect(next.caret).toBe(10);
  });
});

describe("plain preview", () => {
  it("replaces mention and emoji tokens with names", () => {
    expect(plainPreview("hey <@42> see <#8> <@&3> <:lark:99>", ctx)).toBe("hey @Ethan see #design-crit @Design :lark:");
    expect(plainPreview("hey <@99>", ctx)).toBe("hey @someone");
    expect(plainPreview("x".repeat(20), ctx, 8)).toBe("xxxxxxxx…");
  });
});
