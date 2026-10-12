import { el } from "../ui/dom";
import { registerMediaPanel, type MediaHost } from "./registry";
import { callTimerFrom, callTimerStyle } from "./call-timer";
import { volumeCapChoice } from "./volume";

registerMediaPanel(["call-timer", "volume-booster"], (wrap, id, host) => {
  if (id === "call-timer") {
    wrap.append(callTimerCard(host));
    return true;
  }
  if (id === "volume-booster") {
    wrap.append(volumeCard(host));
    return true;
  }
  return false;
});

function callTimerCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Count from"));
  card.append(host.choice(["connected", "join"], host.pack.callTimerFrom, (value) => {
    host.pack.callTimerFrom = callTimerFrom(value);
    host.savePack();
  }, { connected: "Connected", join: "Join" }));
  card.append(el("div", "hint", "Clock"));
  card.append(host.choice(["auto", "clock"], host.pack.callTimerStyle, (value) => {
    host.pack.callTimerStyle = callTimerStyle(value);
    host.savePack();
  }, { auto: "Hours when needed", clock: "Always show hours" }));
  card.append(el("p", "hint", "The time sits in the voice panel. It stays on this device."));
  return card;
}

function volumeCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Per-user ceiling"));
  card.append(host.choice(["200", "300", "400"], String(host.pack.volumeCap), (value) => {
    host.pack.volumeCap = volumeCapChoice(value);
    host.savePack();
    host.resendVoiceMix();
  }, { "200": "200%", "300": "300%", "400": "400%" }));
  card.append(el("p", "hint", "The slider in a person's volume menu stops at this ceiling. Mute for you still silences them. Turning this off returns playback to 200% and keeps the higher level for later."));
  return card;
}
