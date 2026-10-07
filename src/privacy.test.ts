import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./config";
import { dmPreview, personalLine, redactBlocks, redactSensitive, streamerActive } from "./privacy";

describe("streamer mode", () => {
  it("turns on manually, or automatically while a capture is running", () => {
    expect(streamerActive(false, false, true)).toBe(false);
    expect(streamerActive(true, false, false)).toBe(true);
    expect(streamerActive(false, true, false)).toBe(false);
    expect(streamerActive(false, true, true)).toBe(true);
  });

  it("hides emails and tokens and leaves the rest of the sentence", () => {
    const token = "mfa.abcdefghijklmnopqrstuvwxyz012345";
    const text = `mail ada@example.com about ${token} in #design`;
    const cleaned = redactSensitive(text);
    expect(cleaned).not.toContain("ada@example.com");
    expect(cleaned).not.toContain(token);
    expect(cleaned).toContain("[email hidden]");
    expect(cleaned).toContain("[token hidden]");
    expect(cleaned).toContain("#design");
  });

  it("drops DM previews and personal lines while streaming", () => {
    expect(dmPreview("  Can you look   at the rail?  ", false)).toBe("Can you look at the rail?");
    expect(dmPreview("Can you look at the rail?", true)).toBe("");
    expect(dmPreview("   ", false)).toBe("");
    expect(personalLine("100000000000000001", false)).toBe("100000000000000001");
    expect(personalLine("100000000000000001", true)).toBe("Hidden");
  });

  it("redacts emails inside message text and code", () => {
    const blocks = redactBlocks([
      { t: "p", c: [{ t: "text", v: "see ada@example.com" }] },
      { t: "pre", lang: null, v: "token mfa.abcdefghijklmnopqrstuvwxyz012345" },
    ]);
    expect(blocks[0]).toEqual({ t: "p", c: [{ t: "text", v: "see [email hidden]" }] });
    expect(JSON.stringify(blocks[1])).not.toContain("mfa.");
  });

  it("keeps streamer mode off until settings turn it on", () => {
    expect(sanitizeConfig({}).privacy).toEqual({ streamer: false, streamer_auto: false });
    expect(sanitizeConfig({ privacy: { streamer: true, streamer_auto: false } }).privacy.streamer).toBe(true);
    expect(sanitizeConfig({ privacy: { streamer: "yes" } }).privacy.streamer).toBe(false);
  });
});
