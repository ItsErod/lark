import { describe, expect, it } from "vitest";
import { nextMutedTalk, speechGate, type MutedTalkState } from "./muted-talk";

const quiet = { selfMuted: true, level: 4, sensitivity: 45 };
const idle: MutedTalkState = { show: false, heldMs: 0 };

describe("talking while muted", () => {
  it("uses the same gate as voice activity", () => {
    expect(speechGate(45)).toBe(2);
    expect(speechGate(100)).toBe(1);
    expect(speechGate(0)).toBe(4);
    expect(speechGate(Number.NaN)).toBe(2);
  });

  it("shows after a short hold and hides the moment the mic goes quiet", () => {
    const early = nextMutedTalk(idle, quiet, 200);
    expect(early).toEqual({ show: false, heldMs: 200 });
    const shown = nextMutedTalk(early, quiet, 80);
    expect(shown.show).toBe(true);
    expect(nextMutedTalk(shown, { ...quiet, level: 0 }, 80)).toEqual(idle);
    expect(nextMutedTalk(shown, { ...quiet, selfMuted: false }, 80)).toEqual(idle);
  });

  it("ignores room tone under the gate", () => {
    let state = idle;
    for (let step = 0; step < 20; step += 1) {
      state = nextMutedTalk(state, { selfMuted: true, level: 0, sensitivity: 45 }, 80);
    }
    expect(state).toEqual(idle);
  });
});
