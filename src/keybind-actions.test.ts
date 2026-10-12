import { describe, expect, it } from "vitest";
import { callKeyAction } from "./keybind-actions";

const dm = { id: "10", kind: "dm" };
const text = { id: "20", kind: "text" };
const dmVoice = { channelId: "10", guildId: null };
const guildVoice = { channelId: "30", guildId: "99" };

describe("call keybinds", () => {
  it("starts a call only from a direct message or group", () => {
    expect(callKeyAction("start_call", dm, null)).toEqual({ op: "join", channelId: "10" });
    expect(callKeyAction("start_call", { id: "11", kind: "group" }, null)).toEqual({ op: "join", channelId: "11" });
    expect(callKeyAction("start_call", text, null)?.op).toBe("toast");
    expect(callKeyAction("start_call", null, null)?.op).toBe("toast");
  });

  it("answers by focusing a DM call, or joining the open DM", () => {
    expect(callKeyAction("answer_call", text, dmVoice)).toEqual({ op: "focus", channelId: "10" });
    expect(callKeyAction("answer_call", dm, null)).toEqual({ op: "join", channelId: "10" });
    expect(callKeyAction("answer_call", text, guildVoice)?.op).toBe("toast");
  });

  it("declines only a DM or group call", () => {
    expect(callKeyAction("decline_call", dm, dmVoice)).toEqual({ op: "leave" });
    expect(callKeyAction("decline_call", text, guildVoice)?.op).toBe("toast");
    expect(callKeyAction("decline_call", dm, null)?.op).toBe("toast");
  });

  it("leaves other keybinds alone", () => {
    expect(callKeyAction("toggle_inbox", dm, dmVoice)).toBeNull();
  });
});
