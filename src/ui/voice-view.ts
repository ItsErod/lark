import type { RingMotion, StageTile, VoiceLinkStatus } from "../voice-stage";
import { signalBars, signalLabel } from "../voice-stage";
import { clear, el, icon, portrait, paths } from "./dom";

export interface CallClip {
  id: string;
  name: string;
}

export interface CallStageHandlers {
  cameraOn: boolean;
  shareOn: boolean;
  muted: boolean;
  deafened: boolean;
  activitiesOpen: boolean;
  clips: CallClip[];
  onCamera: () => void;
  onShare: () => void;
  onActivities: () => void;
  onMute: () => void;
  onDeafen: () => void;
  onLeave: () => void;
  onPlay: (id: string) => void;
  onMenu: (userId: string, x: number, y: number) => void;
}

export function speakWrap(avatar: HTMLElement, motion: RingMotion, large = false): HTMLElement {
  const wrap = el("span", `speak-ring${large ? " is-lg" : ""} is-${motion}`);
  const spin = el("span", "speak-ring-spin");
  spin.setAttribute("aria-hidden", "true");
  wrap.append(spin, avatar);
  return wrap;
}

export function signalMeter(status: VoiceLinkStatus): HTMLElement {
  const bars = signalBars(status);
  const meter = el("span", `voice-signal is-${bars}`);
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-label", signalLabel(bars));
  for (let index = 0; index < 3; index += 1) meter.append(el("i"));
  return meter;
}

export function renderCallStage(host: HTMLElement, tiles: StageTile[], motion: RingMotion, handlers: CallStageHandlers): void {
  clear(host);
  host.className = "voice-stage";
  host.setAttribute("aria-label", "Voice call");
  const grid = el("div", "voice-grid");
  grid.setAttribute("role", "list");
  if (!tiles.length) grid.append(el("p", "voice-empty", "Nobody is in this channel yet."));
  for (const tile of tiles) grid.append(tileView(tile, motion, handlers.onMenu));
  host.append(grid, controlBar(handlers));
}

function tileView(tile: StageTile, motion: RingMotion, onMenu: CallStageHandlers["onMenu"]): HTMLElement {
  const node = el("article", `voice-tile is-${tile.kind}${tile.speaking ? " is-speaking" : ""}${tile.localMuted ? " is-local-muted" : ""}`);
  node.dataset.voiceUser = tile.userId;
  node.setAttribute("role", "listitem");
  if (tile.kind !== "avatar") {
    const media = el("div", "voice-media");
    media.append(icon(tile.kind === "screen" ? paths.monitor : paths.camera), el("span", "", tile.kind === "screen" ? "Screen" : "Camera"));
    node.append(media);
  }
  const avatar = portrait(tile.name, tile.userId, tile.avatarUrl, tile.kind !== "avatar");
  node.append(speakWrap(avatar, motion, tile.kind === "avatar"));
  node.append(el("span", "voice-tile-name", tile.name));
  const flags = el("span", "voice-tile-badges");
  if (tile.deafened) flags.append(icon(paths.headphonesOff));
  if (tile.muted) flags.append(icon(paths.micOff));
  if (tile.localMuted) flags.title = "Muted for you";
  if (flags.childElementCount) node.append(flags);
  if (tile.mixable) {
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      onMenu(tile.userId, event.clientX, event.clientY);
    });
  }
  return node;
}

function controlBar(handlers: CallStageHandlers): HTMLElement {
  const bar = el("div", "voice-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Call controls");
  bar.append(callButton(handlers.cameraOn ? "Turn off camera" : "Turn on camera", handlers.cameraOn ? paths.camera : paths.cameraOff, handlers.onCamera, { live: handlers.cameraOn }));
  bar.append(callButton(handlers.shareOn ? "Stop sharing" : "Share your screen", handlers.shareOn ? paths.monitor : paths.monitor, handlers.onShare, { live: handlers.shareOn }));
  const slot = el("div", "voice-slot");
  slot.append(callButton(handlers.activitiesOpen ? "Close soundboard" : "Soundboard", paths.activity, handlers.onActivities, { live: handlers.activitiesOpen }));
  if (handlers.activitiesOpen) slot.append(soundboardPop(handlers));
  bar.append(slot);
  bar.append(el("span", "voice-bar-gap"));
  bar.append(callButton(handlers.muted ? "Unmute" : "Mute", handlers.muted ? paths.micOff : paths.mic, handlers.onMute, { hot: handlers.muted }));
  bar.append(callButton(handlers.deafened ? "Undeafen" : "Deafen", handlers.deafened ? paths.headphonesOff : paths.headphones, handlers.onDeafen, { hot: handlers.deafened }));
  bar.append(callButton("Disconnect", paths.hangup, handlers.onLeave, { disconnect: true }));
  return bar;
}

function soundboardPop(handlers: CallStageHandlers): HTMLElement {
  const pop = el("div", "voice-pop");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Soundboard");
  pop.append(el("strong", "", "Soundboard"));
  if (!handlers.clips.length) pop.append(el("p", "hint", "Add clips in Voice & Video."));
  for (const clip of handlers.clips) {
    const button = el("button", "text-button", clip.name);
    button.type = "button";
    button.addEventListener("click", () => handlers.onPlay(clip.id));
    pop.append(button);
  }
  return pop;
}

function callButton(
  label: string,
  path: string,
  onClick: () => void,
  flags: { hot?: boolean; live?: boolean; disconnect?: boolean },
): HTMLButtonElement {
  const classes = ["call-button"];
  if (flags.hot) classes.push("is-hot");
  if (flags.live) classes.push("is-live");
  if (flags.disconnect) classes.push("is-disconnect");
  const button = el("button", classes.join(" "));
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(path));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}
