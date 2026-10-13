import { emptyPerfSample, perfRows } from "../perf";
import { hudLinkLine, hudStatus, type VoiceHudView } from "../voice-hud";
import { colorFor, el, icon, initials, paths } from "./dom";

export function renderVoiceHud(host: HTMLElement, view: VoiceHudView): void {
  host.dataset.clickThrough = view.clickThrough ? "on" : "off";
  host.style.setProperty("--hud-opacity", String(view.opacity));
  if (!view.enabled && !view.perf) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren(hudCard(view));
}

function hudCard(view: VoiceHudView): HTMLElement {
  const card = el("section", "voice-hud");
  card.setAttribute("aria-label", view.enabled ? "Voice HUD" : "Performance");
  const bar = el("header", "voice-hud-bar");
  bar.setAttribute("data-tauri-drag-region", "");
  const title = view.enabled ? (view.inCall ? view.channel || "Voice" : "Voice HUD") : "Performance";
  bar.append(el("strong", "voice-hud-channel", title));
  if (view.enabled) {
    const muted = view.selfDeafened || view.selfMuted;
    bar.append(el("span", `voice-hud-state${muted ? " is-muted" : ""}`, hudStatus(view)));
  }
  card.append(bar);
  const meta = metaLine(view);
  if (meta) card.append(meta);
  if (view.enabled && view.inCall) card.append(peopleList(view));
  if (view.perf) card.append(perfBlock(view));
  return card;
}

function metaLine(view: VoiceHudView): HTMLElement | null {
  const link = view.enabled && view.inCall ? hudLinkLine(view.pingMs) : { text: "", quality: "" as const };
  const game = (view.game ?? "").replace(/\s+/g, " ").trim();
  if (!link.text && !game) return null;
  const row = el("p", "voice-hud-meta");
  if (link.text) {
    const quality = link.quality ? ` is-${link.quality.toLowerCase()}` : "";
    row.append(el("span", `voice-hud-link${quality}`, link.text));
  }
  if (game) row.append(el("span", "voice-hud-game", game));
  return row;
}

function peopleList(view: VoiceHudView): HTMLElement {
  const list = el("ul", "voice-hud-people");
  if (!view.people.length) {
    list.append(el("li", "voice-hud-empty", "Waiting for people…"));
  }
  for (const person of view.people) {
    const row = el("li", `voice-hud-person${person.speaking ? " is-speaking" : ""}${person.muted ? " is-muted" : ""}`);
    row.dataset.voiceUser = person.userId;
    row.append(avatar(person.name, person.userId, person.avatarUrl));
    row.append(el("span", "voice-hud-name", person.name));
    const flags = el("span", "voice-hud-flags");
    if (person.deafened) flags.append(icon(paths.headphonesOff));
    if (person.muted) flags.append(icon(paths.micOff));
    if (flags.childElementCount) row.append(flags);
    list.append(row);
  }
  if (view.extra > 0) list.append(el("li", "voice-hud-more", `+${view.extra} more`));
  return list;
}

function perfBlock(view: VoiceHudView): HTMLElement {
  const list = el("dl", "perf-hud");
  list.setAttribute("aria-label", "Performance");
  for (const row of perfRows(view.stats ?? emptyPerfSample())) {
    list.append(el("dt", "", row.label), el("dd", "", row.value));
  }
  return list;
}

function avatar(name: string, id: string, avatarUrl: string | null): HTMLElement {
  const node = el("span", "voice-hud-avatar");
  const url = avatarUrl?.trim();
  if (!url) {
    node.textContent = initials(name);
    node.style.background = colorFor(id);
    return node;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.width = 22;
  img.height = 22;
  img.src = url;
  img.addEventListener("error", () => {
    img.remove();
    node.textContent = initials(name);
    node.style.background = colorFor(id);
  });
  node.append(img);
  return node;
}
