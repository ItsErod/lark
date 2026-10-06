import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const USER = "MTIzNDU2Nzg5.QUJDREVGR0g.a1b2c3d4e5f6g7h8";
const MFA = "mfa.abcdefghijklmnopqrstuvwxyz0123456789";

type Store = {
  length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  [key: string]: unknown;
};

function store(data: Record<string, string>, getItem?: (key: string) => string | null): Store {
  const keys = Object.keys(data);
  const box: Store = {
    length: keys.length,
    key: (index) => keys[index] ?? null,
    getItem: getItem ?? ((key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null)),
  };
  for (const [key, value] of Object.entries(data)) box[key] = value;
  return box;
}

function reader(): (env: Record<string, unknown>) => string {
  const source = readFileSync("crates/lark-core/src/discord/read_session.js", "utf8");
  return new Function(`${source}\nreturn readLarkSession;`)() as (env: Record<string, unknown>) => string;
}

function read(env: Record<string, unknown>): { token: string; href: string } {
  return JSON.parse(reader()(env)) as { token: string; href: string };
}

describe("discord login session reader", () => {
  it("reads a token hidden from the main window getItem", () => {
    const data = { token: `"${USER}"` };
    const parent = store({}, () => null);
    parent.length = 1;
    parent.key = (index: number) => (index === 0 ? "token" : null);
    Object.assign(parent, { __data: data });
    const proto = {
      getItem(this: { __data?: Record<string, string> }, key: string) {
        return this.__data?.[key] ?? null;
      },
      key(this: { __data?: Record<string, string> }, index: number) {
        return Object.keys(this.__data ?? {})[index] ?? null;
      },
    };
    const result = read({
      href: () => "https://discord.com/channels/@me",
      openFrame: () => ({
        localStorage: store({}),
        sessionStorage: store({}),
        prototype: proto,
        parentLocal: parent,
        parentSession: store({}),
        close() {},
      }),
      frames: () => [],
      ownLocal: () => parent,
      ownSession: () => store({}),
      webpackRequire: () => null,
    });
    expect(result.token).toBe(`"${USER}"`);
    expect(result.href).toContain("/channels/@me");
  });

  it("reads an mfa token stored under another sessionStorage key", () => {
    const session = store({ discord_session: MFA });
    const result = read({
      href: () => "https://discord.com/login",
      openFrame: () => ({
        localStorage: store({}),
        sessionStorage: session,
        prototype: null,
        parentLocal: store({}),
        parentSession: store({}),
        close() {},
      }),
      frames: () => [],
      ownLocal: () => store({}),
      ownSession: () => store({}),
      webpackRequire: () => null,
    });
    expect(result.token).toBe(MFA);
  });

  it("reads getToken from the app bundle when storage is empty", () => {
    const empty = {
      href: () => "https://discord.com/app",
      openFrame: () => null,
      frames: () => [],
      ownLocal: () => store({}),
      ownSession: () => store({}),
    };
    expect(
      read({
        ...empty,
        webpackRequire: () => ({ c: { 1: { exports: { default: { getToken: () => USER } } } } }),
      }).token,
    ).toBe(USER);
    expect(
      read({
        ...empty,
        webpackRequire: () => ({ c: { 2: { exports: { Z: { getToken: () => USER } } } } }),
      }).token,
    ).toBe(USER);
    expect(
      read({
        ...empty,
        webpackRequire: () => ({ c: { 3: { exports: { ZP: { getToken: () => MFA } } } } }),
      }).token,
    ).toBe(MFA);
  });

  it("returns the later app url while the token is still missing", () => {
    const result = read({
      href: () => "https://discord.com/channels/@me",
      openFrame: () => null,
      frames: () => [],
      ownLocal: () => store({ locale: "en-US" }),
      ownSession: () => store({}),
      webpackRequire: () => ({ c: { 1: { exports: { default: { getToken: () => "" } } } } }),
    });
    expect(result.token).toBe("");
    expect(result.href).toBe("https://discord.com/channels/@me");
  });

  it("reads a same-origin frame when the top window storage is empty", () => {
    const result = read({
      href: () => "https://discord.com/login",
      openFrame: () => null,
      frames: () => [{ localStorage: store({ token: USER }), sessionStorage: store({}), prototype: null }],
      ownLocal: () => store({}),
      ownSession: () => store({}),
      webpackRequire: () => null,
    });
    expect(result.token).toBe(USER);
  });
});
