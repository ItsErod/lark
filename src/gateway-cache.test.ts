import { describe, expect, it } from "vitest";
import { latestGateway, readyShape, redactValue, rememberGateway, resetGatewayCache } from "./gateway-cache";

describe("gateway cache", () => {
  it("drops tokens, auth headers, and bearer secrets", () => {
    resetGatewayCache();
    const snap = rememberGateway({
      kind: "ready",
      token: "secret-token",
      authorization: "Bearer abc",
      user: { id: "1", name: "Ada", password: "nope" },
      note: "Bearer xyz",
    });
    expect(snap?.payload).toEqual({
      kind: "ready",
      user: { id: "1", name: "Ada" },
      note: "",
    });
    expect(JSON.stringify(snap)).not.toMatch(/secret-token|Bearer|nope/i);
    expect(latestGateway("ready")?.shape).toBe(readyShape({ kind: "ready" }));
  });

  it("treats the same guild and channel ids as one ready shape", () => {
    const first = { guilds: [{ id: "g" }], dms: [{ id: "d" }], guildChannels: [{ guildId: "g", channels: [{ id: "c" }] }] };
    const again = { guilds: [{ id: "g", name: "North" }], dms: [{ id: "d" }], guildChannels: [{ guildId: "g", channels: [{ id: "c" }] }] };
    expect(readyShape(first)).toBe(readyShape(again));
    expect(readyShape({ guilds: [{ id: "other" }] })).not.toBe(readyShape(first));
  });
});
