import { el } from "../ui/dom";
import { gameVisibility, mediaSource } from "./activity";
import { registerMediaPanel, type MediaHost } from "./registry";

registerMediaPanel(["game-activity", "media-status"], (wrap, id, host) => {
  if (id === "game-activity") {
    wrap.append(gameCard(host));
    return true;
  }
  if (id === "media-status") {
    wrap.append(statusCard(host));
    return true;
  }
  return false;
});

function gameCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Playing"));
  card.append(host.choice(["show", "hide"], host.pack.gameActivity, (value) => {
    host.pack.gameActivity = gameVisibility(value);
    host.savePack();
    host.resendPresence();
  }, { show: "Show", hide: "Hide" }));
  card.append(el("p", "hint", "Show puts the detected game on your profile as what you are playing. Hide takes it off. It is not written into your custom status."));
  return card;
}

function statusCard(host: MediaHost): HTMLElement {
  const card = el("div", "plugin-card");
  card.append(el("div", "hint", "Source"));
  card.append(host.choice(["either", "game", "spotify"], host.pack.mediaStatusSource, (value) => {
    host.pack.mediaStatusSource = mediaSource(value);
    host.savePack();
  }, { either: "Game or player", game: "Current game", spotify: "System player" }));
  card.append(el("div", "hint", "Custom status"));
  card.append(host.choice(["keep", "replace"], host.pack.mediaStatusReplace ? "replace" : "keep", (value) => {
    host.pack.mediaStatusReplace = value === "replace";
    host.savePack();
  }, { keep: "Keep a status you wrote", replace: "Replace it" }));
  card.append(el("p", "hint", "The system player is whatever this computer is playing, including Spotify. Lark does not sign in. A game reads as Playing, and a track reads as Listening to."));
  return card;
}
