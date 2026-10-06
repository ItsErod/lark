import { describe, expect, it } from "vitest";
import { CHANNEL_GATEWAY_GRACE_MS, channelRestDelay } from "./guilds";

describe("channelRestDelay", () => {
  it("waits out the connect grace so GUILD_CREATE can arrive", () => {
    expect(channelRestDelay(1_000, 1_000)).toBe(CHANNEL_GATEWAY_GRACE_MS);
    expect(channelRestDelay(2_000, 1_000)).toBe(CHANNEL_GATEWAY_GRACE_MS - 1_000);
  });

  it("allows one fallback once the grace has passed", () => {
    expect(channelRestDelay(1_000 + CHANNEL_GATEWAY_GRACE_MS, 1_000)).toBe(0);
    expect(channelRestDelay(9_000, 1_000)).toBe(0);
  });

  it("waits the full grace before the gateway is ready", () => {
    expect(channelRestDelay(5_000, 0)).toBe(CHANNEL_GATEWAY_GRACE_MS);
  });
});
