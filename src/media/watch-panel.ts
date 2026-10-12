import { el } from "../ui/dom";
import { registerMediaPanel, type MediaHost } from "./registry";
import { CLIP_SHARE_KEYS, clipShareKey, pipSize, pipStart } from "./watch";

registerMediaPanel(["youtube-pip", "clip-share"], (wrap, id, host) => {
  if (id === "youtube-pip") {
    wrap.append(youtubeCard(host));
    return true;
  }
  if (id === "clip-share") {
    wrap.append(clipCard(host));
    return true;
  }
  return false;
});

function youtubeCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Player size"));
  card.append(host.choice(["small", "medium"], host.pack.youtubePipSize, (value) => {
    host.pack.youtubePipSize = pipSize(value);
    host.savePack();
  }, { small: "Small", medium: "Medium" }));
  card.append(el("div", "hint", "Start"));
  card.append(host.choice(["muted", "sound"], host.pack.youtubePipStart, (value) => {
    host.pack.youtubePipStart = pipStart(value);
    host.savePack();
  }, { muted: "Muted", sound: "With sound" }));
  card.append(el("p", "hint", "Pop out sits on a YouTube embed. The player loads when you click it, not when the message arrives."));
  return card;
}

function clipCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Hotkey"));
  const labels: Record<string, string> = {
    "mod+shift+x": "Ctrl/Cmd Shift X",
    "mod+shift+k": "Ctrl/Cmd Shift K",
    "mod+alt+x": "Ctrl/Cmd Alt X",
  };
  card.append(host.choice([...CLIP_SHARE_KEYS], host.pack.clipShareKey, (value) => {
    host.pack.clipShareKey = clipShareKey(value);
    host.savePack();
  }, labels));
  card.append(el("p", "hint", "Sends the newest clip in the clips folder to the channel you have open. A clip over the upload limit uses the Clips compression setting."));
  return card;
}
