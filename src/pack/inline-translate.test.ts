import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlugin } from "../plugins";
import { memoryUrl, readMemory, translateInline } from "./inline-translate";
import { sanitizePack } from "./state";

const ok = (payload: unknown) => async () => ({ ok: true, json: async () => payload });

describe("inline translate", () => {
  it("uses the free endpoint, then the local phrase book", async () => {
    const remote = await translateInline({
      text: "hello there",
      source: "en",
      target: "es",
      glossary: [],
      prefer: "remote",
      fetchImpl: ok({ responseStatus: 200, responseData: { translatedText: "hola" } }),
    });
    expect(remote).toEqual({ text: "hola", via: "remote" });
    expect(memoryUrl("hello there", "en", "es")).toContain("langpair=en|es");
    expect(readMemory({ responseStatus: 200, responseData: { translatedText: "MYMEMORY WARNING: quota" } }, "hello")).toBeNull();

    const local = await translateInline({
      text: "thank you",
      source: "en",
      target: "es",
      glossary: [],
      prefer: "remote",
      fetchImpl: async () => { throw new Error("offline"); },
    });
    expect(local.via).toBe("local");
    expect(local.text.toLowerCase()).toContain("gracias");

    const missed = await translateInline({
      text: "an unlisted sentence about the booth",
      source: "en",
      target: "de",
      glossary: [],
      prefer: "local",
      fetchImpl: ok({ responseStatus: 429, responseData: { translatedText: "nein" } }),
    });
    expect(missed.via).toBe("original");
  });

  it("declares the hook and keeps language options", () => {
    const plugin = describePlugin(readFileSync("store/plugins/inline-translate/plugin.js", "utf8"), "inline-translate");
    expect(plugin.hooks.inlineTranslate).toBe(true);
    expect(plugin.run.toString()).not.toMatch(/fetch\s*\(/);
    const pack = sanitizePack({ inlineLang: "ja", inlineSource: "en", inlinePrefer: "local" });
    expect(pack.inlineLang).toBe("ja");
    expect(pack.inlineSource).toBe("en");
    expect(pack.inlinePrefer).toBe("local");
    expect(sanitizePack({ inlinePrefer: "paid" }).inlinePrefer).toBe("remote");
  });
});
