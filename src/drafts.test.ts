import { describe, expect, it } from "vitest";
import { DRAFTS_PLAIN_KEY, DRAFTS_SEALED_KEY, parseDraftMap, planDraftLoad } from "./drafts";

describe("encrypted drafts", () => {
  it("keeps channel drafts and drops anything else", () => {
    expect(parseDraftMap({
      "100000000000000023": "  hello",
      "not-a-channel": "nope",
      "100000000000000024": "",
      "100000000000000025": "x".repeat(2500),
    })).toEqual({
      "100000000000000023": "  hello",
      "100000000000000025": "x".repeat(2000),
    });
    expect(parseDraftMap(null)).toEqual({});
  });

  it("prefers a sealed blob and otherwise migrates leftover plaintext once", () => {
    expect(DRAFTS_SEALED_KEY).not.toBe(DRAFTS_PLAIN_KEY);
    const sealed = planDraftLoad("lark1.abc", '{"100000000000000023":"old"}');
    expect(sealed).toEqual({ kind: "sealed", sealed: "lark1.abc" });
    const legacy = planDraftLoad(null, '{"100000000000000023":"rail","bad":1}');
    expect(legacy).toEqual({ kind: "migrate", plain: { "100000000000000023": "rail" } });
    expect(planDraftLoad("", "not json")).toEqual({ kind: "empty" });
    expect(planDraftLoad(null, "{}")).toEqual({ kind: "empty" });
  });
});
