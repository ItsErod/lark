import type { VoiceHudView } from "../voice-hud";
import { colorFor, el, icon, initials, paths } from "./dom";

export function renderVoiceHud(host: HTMLElement, view: VoiceHudView): void {
  host.dataset.clickThrough = view.clickThrough ? "on" : "off";
  host.style.setProperty("--hud-opacity", String(view.opacity));
  host.replaceChildren(hudCard(view));
}

function hudCard(view: VoiceHudView): HTMLElement {
  const card = el("section", "voice-hud");
  card.setAttribute("aria-label", "Voice HUD");
  const bar = el("header", "voice-hud-bar");
  bar.setAttribute("data-tauri-drag-region", "");
  const title = view.inCall ? view.channel || "Voice" : "Voice HUD";
  bar.append(el("strong", "voice-hud-channel", title));
  bar.append(el("span", `voice-hud-state${view.selfMuted ? " is-muted" : ""}`, statusLine(view)));
  card.append(bar);
  if (!view.inCall) return card;
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
  card.append(list);
  return card;
}

function statusLine(view: VoiceHudView): string {
  if (!view.inCall) return "Not in a call";
  if (view.status === "connecting") return "Connecting";
  if (view.status === "reconnecting") return "Reconnecting";
  if (view.selfMuted) return "Muted";
  return "Live";
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
  img.src = url;
  img.alt = "";
  img.draggable = false;
  img.addEventListener("error", () => {
    img.remove();
    node.textContent = initials(name);
    node.style.background = colorFor(id);
  });
  node.append(img);
  return node;
}
