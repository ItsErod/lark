import { el } from "../ui/dom";
import { downloadScope, originalAction } from "./files";
import { registerMediaPanel, type MediaHost } from "./registry";

registerMediaPanel(["voice-download", "original-image"], (wrap, id, host) => {
  if (id === "voice-download") {
    wrap.append(downloadCard(host));
    return true;
  }
  if (id === "original-image") {
    wrap.append(originalCard(host));
    return true;
  }
  return false;
});

function downloadCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Download button"));
  card.append(host.choice(["voice", "all"], host.pack.voiceDownloadScope, (value) => {
    host.pack.voiceDownloadScope = downloadScope(value);
    host.savePack();
    host.refreshMessages();
  }, { voice: "Voice messages", all: "Every attachment" }));
  card.append(el("p", "hint", "Voice messages get a Download button. Every attachment adds the same button to images, video, and other files. The file stays where Discord hosted it."));
  return card;
}

function originalCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "One click"));
  card.append(host.choice(["both", "open", "download"], host.pack.originalImageAction, (value) => {
    host.pack.originalImageAction = originalAction(value);
    host.savePack();
    host.refreshMessages();
  }, { both: "Open and download", open: "Open full size", download: "Download" }));
  card.append(el("p", "hint", "Works on images in the message and in embeds. The preview size is dropped so the link is the full image. The expiry on a Discord link is kept."));
  return card;
}
