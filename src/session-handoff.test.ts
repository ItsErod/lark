import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const USER = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";
const MFA = "mfa.abcdefghijklmnopqrstuvwxyz0123456789";

type Handoff = {
  consider: (url: string, body: string) => Promise<boolean>;
  endpoint: string;
};

function install(env: Record<string, unknown>): Handoff {
  const source = readFileSync("crates/lark-core/src/discord/session_handoff.js", "utf8");
  const factory = new Function(`${source}\nreturn installLarkSessionHandoff;`)() as (
    env: Record<string, unknown>,
  ) => Handoff;
  return factory(env);
}

describe("discord session handoff", () => {
  it("posts an auth-response token once and ignores storage", () => {
    const source = readFileSync("crates/lark-core/src/discord/session_handoff.js", "utf8").toLowerCase();
    expect(source).not.toContain("localstorage");
    expect(source).not.toContain("sessionstorage");
    expect(source).not.toContain("setinterval");
    expect(source).not.toContain("console.");
    const posts: Array<{ endpoint: string; body: string }> = [];
    const handoff = install({
      port: 43123,
      state: "state-1",
      pageHost: "discord.com",
      retryMs: 0,
      root: {},
      post(message: { endpoint: string; body: string }) {
        posts.push(message);
        return true;
      },
    });
    return handoff.consider("https://discord.com/api/v9/auth/login", JSON.stringify({ token: USER, user_id: "1" })).then((ok) => {
      expect(ok).toBe(true);
      expect(posts).toHaveLength(1);
      expect(posts[0].endpoint).toBe("http://127.0.0.1:43123/session");
      expect(posts[0].endpoint).not.toContain(USER);
      const body = JSON.parse(posts[0].body) as { state: string; token: string };
      expect(body.state).toBe("state-1");
      expect(body.token).toBe(USER);
      return handoff.consider("https://discord.com/api/v9/auth/login", JSON.stringify({ token: USER }));
    }).then((again) => {
      expect(again).toBe(false);
      expect(posts).toHaveLength(1);
    });
  });

  it("waits through an mfa challenge and then posts the mfa token", async () => {
    const posts: string[] = [];
    const handoff = install({
      port: 9,
      state: "s",
      pageHost: "ptb.discord.com",
      retryMs: 0,
      root: {},
      post(message: { body: string }) {
        posts.push(message.body);
        return true;
      },
    });
    expect(await handoff.consider("https://discord.com/api/v9/auth/login", JSON.stringify({ mfa: true, ticket: "ticket" }))).toBe(false);
    expect(await handoff.consider("https://discord.com/api/v9/users/@me", JSON.stringify({ token: USER }))).toBe(false);
    expect(await handoff.consider("https://evil.example/api/v9/auth/login", JSON.stringify({ token: USER }))).toBe(false);
    expect(await handoff.consider("/api/v9/auth/mfa/totp", JSON.stringify({ token: MFA }))).toBe(true);
    expect(JSON.parse(posts[0]).token).toBe(MFA);
  });

  it("wraps fetch and posts the auth response", async () => {
    const posts: string[] = [];
    const root: { fetch: (input: string) => Promise<{ ok: boolean; url: string; clone: () => { text: () => Promise<string> } }> } = {
      fetch(input) {
        return Promise.resolve({
          ok: true,
          url: String(input),
          clone() {
            return { text: () => Promise.resolve(JSON.stringify({ token: USER })) };
          },
        });
      },
    };
    install({
      port: 5,
      state: "s",
      pageHost: "discord.com",
      retryMs: 0,
      root,
      post(message: { endpoint: string; body: string }) {
        expect(message.endpoint).toBe("http://127.0.0.1:5/session");
        posts.push(message.body);
        return true;
      },
    });
    await root.fetch("https://discord.com/api/v9/auth/login");
    await Promise.resolve();
    await Promise.resolve();
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]).token).toBe(USER);
  });

  it("retries a failed post without putting the token in the url", async () => {
    let attempts = 0;
    const handoff = install({
      port: 12,
      state: "s",
      pageHost: "discord.com",
      retryMs: 0,
      root: {},
      post(message: { endpoint: string; body: string }) {
        attempts += 1;
        expect(message.endpoint).not.toContain(USER);
        expect(message.body).toContain(USER);
        return attempts >= 2;
      },
    });
    expect(await handoff.consider("https://discord.com/api/v9/auth/login", JSON.stringify({ token: USER }))).toBe(true);
    expect(attempts).toBe(2);
  });
});
