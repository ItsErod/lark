import type { RingMotion, StageMember, StageTile } from "../voice-stage";
import { focusLayout } from "../voice-stage";
import { clear, el, icon, portrait, paths } from "./dom";
import { signalMeter, speakWrap } from "./voice-bits";

export { signalMeter, speakWrap };

/**
 * Call tiles are generic. A screen tile is the stream / Go Live slot: the same
 * node is used in the grid and in picture-in-picture. `.voice-media` is the
 * slot a stream preview attaches to. This file does not capture or encode.
 */

export interface CallClip {
  id: string;
  name: string;
}

export interface DeviceChoice {
  id: string;
  label: string;
}

export interface CallProfile {
  id: string;
  name: string;
}

export interface CallSound {
  id: string;
  name: string;
  enabled: boolean;
}

export interface CallActivity {
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
  showChat?: boolean;
  fullScreen?: boolean;
  gridView?: boolean;
  showNonVideo?: boolean;
  messagePreviews?: boolean;
  micMenuOpen?: boolean;
  moreOpen?: boolean;
  soundboardOpen?: boolean;
  inputLevel?: number;
  profiles?: CallProfile[];
  profileId?: string;
  inputVolume?: number;
  outputVolume?: number;
  inputs?: DeviceChoice[];
  outputs?: DeviceChoice[];
  inputDevice?: string;
  outputDevice?: string;
  guildSounds?: CallSound[];
  activities?: CallActivity[];
  watchUrl?: string;
  onShowChat?: () => void;
  onInvite?: () => void;
  onFullScreen?: () => void;
  onMicMenu?: () => void;
  onMore?: () => void;
  onSoundboard?: () => void;
  onMoreAction?: (action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") => void;
  onInput?: (id: string) => void;
  onOutput?: (id: string) => void;
  onProfile?: (id: string) => void;
  onInputVolume?: (value: number) => void;
  onOutputVolume?: (value: number) => void;
  onGuildSound?: (id: string) => void;
  onActivity?: (id: string) => void;
  onWatch?: (url: string) => void;
}

export interface StripPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
}

export function renderCallStrip(
  host: HTMLElement,
  people: { shown: StripPerson[]; extra: number },
  motion: RingMotion,
  handlers: { onOpen: () => void; onHide: () => void },
): void {
  clear(host);
  host.className = "call-strip";
  const open = el("button", "call-strip-open");
  open.type = "button";
  const names = people.shown.map((person) => person.name);
  open.setAttribute("aria-label", names.length ? `Open call view, ${names.join(", ")}` : "Open call view");
  const row = el("span", "call-strip-people");
  for (const person of people.shown) {
    const item = el("span", `call-strip-person${person.speaking ? " is-speaking" : ""}`);
    item.title = person.name;
    item.append(speakWrap(portrait(person.name, person.id, person.avatarUrl, true), motion));
    row.append(item);
  }
  if (people.extra > 0) row.append(el("span", "call-strip-more", `+${people.extra}`));
  open.append(row);
  open.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onOpen();
  });
  const hide = el("button", "icon-button call-strip-hide");
  hide.type = "button";
  hide.setAttribute("aria-label", "Hide call strip");
  hide.title = "Hide call strip";
  hide.append(icon(paths.chevronUp));
  hide.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onHide();
  });
  host.append(open, hide);
}

/** One media tile. The host is positioned by the picture-in-picture layout. */
export function renderPipTile(host: HTMLElement, tile: StageTile, motion: RingMotion): void {
  clear(host);
  host.append(tileView(tile, motion, () => undefined));
}

export function renderCallStage(
  host: HTMLElement,
  tiles: StageTile[],
  motion: RingMotion,
  handlers: CallStageHandlers,
  chat?: HTMLElement | null,
): void {
  clear(host);
  host.className = `voice-stage${handlers.gridView === false ? " is-focus" : ""}`;
  host.setAttribute("aria-label", "Voice call");
  const row = el("div", "voice-stage-row");
  const grid = el("div", "voice-grid");
  grid.dataset.callGrid = "";
  grid.setAttribute("role", "list");
  if (!tiles.length) grid.append(el("p", "voice-empty", "Nobody is in this channel yet."));
  for (const tile of tiles) grid.append(tileView(tile, motion, handlers.onMenu));
  row.append(grid);
  if (chat) row.append(chat);
  host.append(row, controlBar(handlers));
}

/** Share and the person speaking share a short band. Everyone else is a caption. The bar stays in the band. */
export function renderFocusStage(
  host: HTMLElement,
  members: StageMember[],
  motion: RingMotion,
  handlers: CallStageHandlers,
): void {
  clear(host);
  host.className = "voice-stage is-focus-band";
  host.setAttribute("aria-label", "Voice call");
  const layout = focusLayout(members);
  const band = el("div", `focus${layout.speaker ? "" : " is-solo"}`);
  const primary = el("div", "focus-primary");
  primary.dataset.callGrid = "";
  if (!layout.primary) primary.append(el("p", "voice-empty", "Nobody is in this channel yet."));
  else if (layout.primary.kind === "avatar") primary.append(speakerPane(layout.primary, handlers.onMenu));
  else primary.append(tileView(layout.primary, motion, handlers.onMenu));
  band.append(primary);
  if (layout.speaker) band.append(speakerPane(layout.speaker, handlers.onMenu));
  const foot = el("div", "focus-foot");
  const captions = el("div", "focus-captions");
  captions.setAttribute("aria-label", "Also in this call");
  for (const caption of layout.captions) {
    const item = el("span", "focus-caption", caption.label);
    item.dataset.voiceUser = caption.userId;
    captions.append(item);
  }
  foot.append(captions, compactBar(handlers));
  host.append(band, foot);
}

function speakerPane(tile: StageTile, onMenu: CallStageHandlers["onMenu"]): HTMLElement {
  const node = el("div", `focus-speaker${tile.speaking ? " is-speaking" : ""}`);
  node.dataset.voiceUser = tile.userId;
  const copy = el("span", "focus-copy");
  copy.append(el("strong", "focus-name", tile.name));
  copy.append(el("span", "focus-note", tile.speaking ? "Speaking" : tile.self ? "You" : "Quiet"));
  node.append(portrait(tile.name, tile.userId, tile.avatarUrl), copy);
  if (tile.mixable) {
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      onMenu(tile.userId, event.clientX, event.clientY);
    });
  }
  return node;
}

function compactBar(handlers: CallStageHandlers): HTMLElement {
  const bar = el("div", "voice-bar is-compact");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Call controls");
  bar.append(callButton(handlers.muted ? "Unmute" : "Mute", handlers.muted ? paths.micOff : paths.mic, handlers.onMute, { hot: handlers.muted }));
  bar.append(callButton(handlers.deafened ? "Undeafen" : "Deafen", handlers.deafened ? paths.headphonesOff : paths.headphones, handlers.onDeafen, { hot: handlers.deafened }));
  bar.append(callButton(handlers.cameraOn ? "Turn off camera" : "Turn on camera", handlers.cameraOn ? paths.camera : paths.cameraOff, handlers.onCamera, { live: handlers.cameraOn }));
  bar.append(callButton(handlers.shareOn ? "Stop sharing" : "Share your screen", handlers.shareOn ? paths.monitor : paths.monitor, handlers.onShare, { live: handlers.shareOn }));
  if (handlers.onMore) {
    const more = el("div", "voice-slot");
    more.append(callButton(handlers.moreOpen ? "Close more" : "More", paths.panels, handlers.onMore, { live: Boolean(handlers.moreOpen) }));
    if (handlers.moreOpen) more.append(moreMenu(handlers));
    bar.append(more);
  }
  const leave = el("button", "focus-leave", "Leave");
  leave.type = "button";
  leave.setAttribute("aria-label", "Disconnect");
  leave.title = "Leave";
  leave.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onLeave();
  });
  bar.append(leave);
  return bar;
}

function tileView(tile: StageTile, motion: RingMotion, onMenu: CallStageHandlers["onMenu"]): HTMLElement {
  const node = el("article", `voice-tile is-${tile.kind}${tile.speaking ? " is-speaking" : ""}${tile.localMuted ? " is-local-muted" : ""}`);
  node.dataset.voiceUser = tile.userId;
  node.dataset.kind = tile.kind;
  node.setAttribute("role", "listitem");
  if (tile.kind !== "avatar") {
    const media = el("div", "voice-media");
    media.dataset.media = tile.kind;
    if (tile.kind === "screen") {
      node.dataset.streamHost = tile.userId;
      const slot = el("div", "stream-slot");
      slot.dataset.streamSlot = "";
      slot.append(icon(paths.monitor), el("span", "", "Screen"));
      media.append(slot);
    } else {
      const canvas = el("canvas", "voice-camera");
      canvas.width = 320;
      canvas.height = 176;
      canvas.dataset.cameraUser = tile.userId;
      media.append(canvas, icon(paths.camera), el("span", "", "Camera"));
    }
    node.append(media);
  }
  if (tile.badge) node.append(el("span", "voice-tile-live", tile.badge));
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

export function appendCallControls(host: HTMLElement, handlers: CallStageHandlers): void {
  host.append(controlBar(handlers));
}

function controlBar(handlers: CallStageHandlers): HTMLElement {
  const bar = el("div", "voice-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Call controls");
  bar.append(callButton(handlers.cameraOn ? "Turn off camera" : "Turn on camera", handlers.cameraOn ? paths.camera : paths.cameraOff, handlers.onCamera, { live: handlers.cameraOn }));
  bar.append(callButton(handlers.shareOn ? "Stop sharing" : "Share your screen", handlers.shareOn ? paths.monitor : paths.monitor, handlers.onShare, { live: handlers.shareOn }));
  const legacySounds = !handlers.onSoundboard;
  const activity = el("div", "voice-slot");
  activity.append(callButton(
    handlers.activitiesOpen ? (legacySounds ? "Close soundboard" : "Close activities") : (legacySounds ? "Soundboard" : "Activity"),
    legacySounds ? paths.volume : paths.activity,
    handlers.onActivities,
    { live: handlers.activitiesOpen },
  ));
  if (handlers.activitiesOpen) activity.append(legacySounds ? soundboardPop(handlers) : activityPop(handlers));
  bar.append(activity);
  if (!legacySounds) {
    const sounds = el("div", "voice-slot");
    sounds.append(callButton(handlers.soundboardOpen ? "Close soundboard" : "Soundboard", paths.volume, handlers.onSoundboard!, { live: Boolean(handlers.soundboardOpen) }));
    if (handlers.soundboardOpen) sounds.append(soundboardPop(handlers));
    bar.append(sounds);
  }
  bar.append(el("span", "voice-bar-gap"));
  if (handlers.onShowChat) bar.append(callButton(handlers.showChat ? "Hide chat" : "Show chat", paths.message, handlers.onShowChat, { live: Boolean(handlers.showChat) }));
  if (handlers.onInvite) bar.append(callButton("Invite", paths.users, handlers.onInvite, {}));
  const mic = el("div", "voice-slot");
  mic.append(callButton(handlers.muted ? "Unmute" : "Mute", handlers.muted ? paths.micOff : paths.mic, handlers.onMute, { hot: handlers.muted }));
  if (handlers.onMicMenu) mic.append(callButton(handlers.micMenuOpen ? "Close microphone options" : "Microphone options", paths.chevronUp, handlers.onMicMenu, { live: Boolean(handlers.micMenuOpen) }));
  if (handlers.micMenuOpen) mic.append(micMenu(handlers));
  bar.append(mic);
  bar.append(callButton(handlers.deafened ? "Undeafen" : "Deafen", handlers.deafened ? paths.headphonesOff : paths.headphones, handlers.onDeafen, { hot: handlers.deafened }));
  bar.append(callButton("Disconnect", paths.hangup, handlers.onLeave, { disconnect: true }));
  if (handlers.onMore) {
    const more = el("div", "voice-slot");
    more.append(callButton(handlers.moreOpen ? "Close more" : "More", paths.panels, handlers.onMore, { live: Boolean(handlers.moreOpen) }));
    if (handlers.moreOpen) more.append(moreMenu(handlers));
    bar.append(more);
  }
  if (handlers.onFullScreen) bar.append(callButton(handlers.fullScreen ? "Exit full screen" : "Full screen", paths.monitor, handlers.onFullScreen, { live: Boolean(handlers.fullScreen) }));
  return bar;
}

function micMenu(handlers: CallStageHandlers): HTMLElement {
  const pop = el("div", "voice-pop voice-mic-menu");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Microphone options");
  pop.append(el("strong", "", "Microphone"));
  const meter = el("div", "mic-meter");
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.setAttribute("aria-valuenow", String(handlers.inputLevel ?? 0));
  meter.setAttribute("aria-label", "Input level");
  const fill = el("span", "mic-meter-fill");
  fill.style.width = `${Math.min(100, Math.max(0, handlers.inputLevel ?? 0))}%`;
  meter.append(fill);
  pop.append(meter);
  if (handlers.onInput) pop.append(deviceSelect("Input device", handlers.inputDevice ?? "", handlers.inputs ?? [], handlers.onInput));
  if (handlers.onOutput) pop.append(deviceSelect("Output device", handlers.outputDevice ?? "", handlers.outputs ?? [], handlers.onOutput));
  if (handlers.onProfile && handlers.profiles?.length) {
    pop.append(deviceSelect("Input profile", handlers.profileId ?? "", handlers.profiles.map((profile) => ({ id: profile.id, label: profile.name })), handlers.onProfile));
  }
  if (handlers.onInputVolume) pop.append(volumeRow("Input volume", handlers.inputVolume ?? 100, handlers.onInputVolume));
  if (handlers.onOutputVolume) pop.append(volumeRow("Output volume", handlers.outputVolume ?? 100, handlers.onOutputVolume));
  return pop;
}

function moreMenu(handlers: CallStageHandlers): HTMLElement {
  const pop = el("div", "voice-pop");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "More");
  pop.append(el("strong", "", "More"));
  const row = (label: string, on: boolean, action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") => {
    const button = el("button", on ? "text-button is-on" : "text-button", label);
    button.type = "button";
    button.addEventListener("click", () => handlers.onMoreAction?.(action));
    return button;
  };
  pop.append(row(handlers.gridView === false ? "Grid view" : "Focus view", handlers.gridView !== false, "grid"));
  pop.append(row("Show non-video participants", handlers.showNonVideo !== false, "non-video"));
  pop.append(row("Message previews", Boolean(handlers.messagePreviews), "previews"));
  pop.append(row(handlers.fullScreen ? "Exit full screen" : "Full screen", Boolean(handlers.fullScreen), "fullscreen"));
  pop.append(row("Voice & Video settings", false, "settings"));
  return pop;
}

function activityPop(handlers: CallStageHandlers): HTMLElement {
  const pop = el("div", "voice-pop voice-activity-pop");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Activities");
  pop.append(el("strong", "", "Activities"));
  const activities = handlers.activities ?? [];
  if (!activities.length) pop.append(el("p", "hint", "No activities on this call."));
  for (const activity of activities) {
    const button = el("button", "text-button", activity.name);
    button.type = "button";
    button.addEventListener("click", () => handlers.onActivity?.(activity.id));
    pop.append(button);
  }
  if (handlers.onWatch) {
    const form = el("form", "watch-together");
    const input = el("input");
    input.type = "url";
    input.placeholder = "YouTube link";
    input.value = handlers.watchUrl ?? "";
    input.setAttribute("aria-label", "Watch Together link");
    const go = el("button", "text-button", "Watch");
    go.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.onWatch?.(input.value);
    });
    form.append(input, go);
    pop.append(form);
  }
  return pop;
}

function deviceSelect(label: string, current: string, options: DeviceChoice[], onChange: (id: string) => void): HTMLElement {
  const wrap = el("label", "device", label);
  const select = el("select");
  select.setAttribute("aria-label", label);
  const blank = el("option", "", "Default");
  blank.value = "";
  select.append(blank);
  for (const option of options) {
    const node = el("option", "", option.label || option.id || "Device");
    node.value = option.id;
    select.append(node);
  }
  select.value = options.some((option) => option.id === current) ? current : "";
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function volumeRow(label: string, value: number, onInput: (value: number) => void): HTMLElement {
  const wrap = el("label", "device", label);
  const input = el("input");
  input.type = "range";
  input.min = "0";
  input.max = "200";
  input.value = String(value);
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onInput(Number(input.value)));
  wrap.append(input);
  return wrap;
}

function soundboardPop(handlers: CallStageHandlers): HTMLElement {
  const pop = el("div", "voice-pop");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", "Soundboard");
  pop.append(el("strong", "", "Soundboard"));
  const guild = handlers.guildSounds ?? [];
  if (handlers.deafened) pop.append(el("p", "hint", "Soundboard is off while you are deafened."));
  else if (guild.length) {
    pop.append(el("span", "hint", "Server sounds"));
    for (const sound of guild) {
      const button = el("button", sound.enabled ? "text-button" : "text-button is-off", sound.name);
      button.type = "button";
      button.disabled = !sound.enabled;
      button.addEventListener("click", () => handlers.onGuildSound?.(sound.id));
      pop.append(button);
    }
  }
  pop.append(el("span", "hint", "This device"));
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
