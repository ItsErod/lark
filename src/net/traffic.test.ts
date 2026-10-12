import { describe, expect, it } from "vitest";
import {
  clearTraffic,
  exportTraffic,
  filterTraffic,
  noteGateway,
  noteRest,
  noteVoiceDiagnostics,
  setTrafficArmed,
  setTrafficPaused,
  trafficSnapshot,
} from "./traffic";

describe("network traffic", () => {
  it("records nothing while the panel is closed", () => {
    clearTraffic();
    setTrafficArmed(false);
    noteRest({ command: "fetch_messages", ok: true, ms: 4, body: { token: "secret" } });
    noteGateway({ kind: "ready", token: "secret", user: { id: "1" } });
    expect(trafficSnapshot().rest).toEqual([]);
    expect(trafficSnapshot().gateway).toEqual([]);
  });

  it("redacts tokens before they are stored or exported", () => {
    clearTraffic();
    setTrafficArmed(true);
    noteGateway({
      kind: "voiceServer",
      token: "voice-token",
      authorization: "Bearer abc",
      endpoint: "c-1.discord.gg",
    });
    noteRest({
      command: "fetch_messages",
      args: { channelId: "42", token: "nope" },
      ok: true,
      ms: 3,
      body: { authorization: "Bearer abc", messages: 1 },
    });
    const dump = trafficSnapshot();
    const exported = exportTraffic();
    expect(dump.rest[0]).toMatchObject({ method: "GET", route: "/channels/42/messages", status: 200 });
    expect(dump.gateway[0]).toMatchObject({ op: 0, t: "VOICE_SERVER_UPDATE" });
    expect(exported).not.toMatch(/voice-token|Bearer|nope/);
    expect(JSON.parse(exported).gateway[0].payload).toEqual({
      kind: "voiceServer",
      endpoint: "c-1.discord.gg",
    });
    setTrafficArmed(false);
  });

  it("filters gateway events by name", () => {
    clearTraffic();
    setTrafficArmed(true);
    noteGateway({ kind: "ready", user: { id: "1" } });
    noteGateway({ kind: "message", id: "9" });
    const filtered = filterTraffic(trafficSnapshot(), "", "message");
    expect(filtered.gateway.map((row) => row.t)).toEqual(["MESSAGE_CREATE"]);
    setTrafficArmed(false);
  });

  it("drops events while paused and reads voice diagnostics", () => {
    clearTraffic();
    setTrafficArmed(true);
    setTrafficPaused(true);
    noteRest({ command: "typing", args: { channelId: "7" }, ok: true, ms: 1 });
    expect(trafficSnapshot().rest).toEqual([]);
    setTrafficPaused(false);
    noteVoiceDiagnostics("packets: 9\nbitrate: 64000\nloss: 1\njitter_ms: 2.5\nping_ms: 28\n");
    expect(trafficSnapshot().voice).toMatchObject({ packets: 9, bitrate: 64000, loss: 1, jitter: 2.5, ping: 28 });
    const exported = exportTraffic("", "MESSAGE");
    expect(JSON.parse(exported).gateway).toEqual([]);
    setTrafficArmed(false);
  });
});
