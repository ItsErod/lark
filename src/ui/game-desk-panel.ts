import {
  activeStatKind,
  buildText,
  calloutChoices,
  crewText,
  displayName,
  lfgText,
  type DeskSettings,
  type GameCatalog,
  type StatKind,
} from "../pack/game-desk";
import { el } from "./dom";
import { segmentControl, settingRow, switchControl } from "./settings";

export interface GameDeskController {
  catalog: GameCatalog;
  settings: DeskSettings;
  clock: string;
  save: (next: DeskSettings, repaint: boolean) => void;
  toggleSession: () => void;
  insert: (text: string) => void;
  lookup: () => void;
}

/** Settings for one game desk. The card uses the same rows as the rest of Settings. */
export function mountGameDesk(wrap: HTMLElement, host: GameDeskController): void {
  const draft: DeskSettings = { ...host.settings, slots: [...host.settings.slots] };
  const save = (repaint: boolean) => host.save({ ...draft, slots: [...draft.slots] }, repaint);
  const card = el("div", "plugin-card");
  const name = displayName(host.catalog, draft);
  card.append(el("p", "hint", `${name}. Nothing here reads the game, and nothing is sent until you send it.`));
  if (host.catalog.nameEditable) {
    card.append(el("div", "hint", "Name"));
    card.append(field("Game name", draft.gameName, "Session", (value) => {
      draft.gameName = value;
      save(false);
    }));
  }
  if (host.catalog.tools.includes("session")) card.append(sessionBlock(host, draft, save, name));
  if (host.catalog.tools.includes("lfg")) card.append(lfgBlock(host, draft, save));
  if (host.catalog.tools.includes("build")) card.append(buildBlock(host, draft, save));
  if (host.catalog.tools.includes("callouts")) card.append(calloutBlock(host, draft, save));
  if (host.catalog.tools.includes("crew")) card.append(crewBlock(host, draft, save));
  if (host.catalog.tools.includes("stats") && host.catalog.stats) card.append(statsBlock(host, draft, save));
  wrap.append(card);
}

function sessionBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void, name: string): HTMLElement {
  const block = el("div", "");
  const running = Boolean(draft.sessionStart);
  const button = el("button", "text-button", running ? "Stop session" : "Start session");
  button.type = "button";
  button.addEventListener("click", () => host.toggleSession());
  block.append(button);
  if (host.clock) block.append(el("p", "hint", `${name} · ${host.clock}`));
  block.append(flag("Show on my status", "The line is your custom status, updated about once a minute.", draft.presence, (value) => {
    draft.presence = value;
    save(true);
  }));
  block.append(flag("Replace a custom status", "Off leaves a status you wrote alone.", draft.presenceReplace, (value) => {
    draft.presenceReplace = value;
    save(true);
  }));
  return block;
}

function lfgBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void): HTMLElement {
  const block = el("div", "");
  block.append(el("div", "hint", "Looking for group"));
  if (host.catalog.roles.length) {
    block.append(pick(host.catalog.roles, draft.role, (value) => {
      draft.role = value;
      save(true);
    }));
  }
  if (host.catalog.modes.length) {
    block.append(pick(host.catalog.modes, draft.mode, (value) => {
      draft.mode = value;
      save(true);
    }));
  }
  const sizes = host.catalog.sizes.length ? host.catalog.sizes : ["2", "3", "4", "5"];
  block.append(pick(sizes, draft.size, (value) => {
    draft.size = value;
    save(true);
  }));
  block.append(field("Note", draft.note, "When you can play", (value) => {
    draft.note = value;
    save(false);
  }));
  const post = el("button", "text-button", "Put LFG in the composer");
  post.type = "button";
  post.addEventListener("click", () => host.insert(lfgText(displayName(host.catalog, draft), draft)));
  block.append(post);
  return block;
}

function buildBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void): HTMLElement {
  const block = el("div", "");
  block.append(el("div", "hint", "Build"));
  host.catalog.slots.forEach((slot, index) => {
    block.append(field(slot, draft.slots[index] ?? "", slot, (value) => {
      const slots = host.catalog.slots.map((_, slotIndex) => draft.slots[slotIndex] ?? "");
      slots[index] = value;
      draft.slots = slots;
      save(false);
    }));
  });
  const post = el("button", "text-button", "Put build in the composer");
  post.type = "button";
  post.addEventListener("click", () => {
    const text = buildText(displayName(host.catalog, draft), host.catalog.slots, draft);
    if (text) host.insert(text);
  });
  block.append(post);
  return block;
}

function calloutBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void): HTMLElement {
  const block = el("div", "");
  block.append(el("div", "hint", "Callouts"));
  for (const line of calloutChoices(host.catalog, draft)) {
    const button = el("button", "text-button", line);
    button.type = "button";
    button.addEventListener("click", () => host.insert(line));
    block.append(button);
  }
  block.append(linesField("Extra callouts", draft.callouts, "One line each", (value) => {
    draft.callouts = value;
    save(false);
  }));
  return block;
}

function crewBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void): HTMLElement {
  const block = el("div", "");
  block.append(el("div", "hint", "Crew"));
  const sample = host.catalog.roles.length ? host.catalog.roles.map((role) => `${role}: `).join("\n") : "Name";
  block.append(linesField("Crew", draft.crew, sample, (value) => {
    draft.crew = value;
    save(false);
  }));
  const post = el("button", "text-button", "Put crew check in the composer");
  post.type = "button";
  post.addEventListener("click", () => {
    const text = crewText(displayName(host.catalog, draft), draft);
    if (text) host.insert(text);
  });
  block.append(post);
  return block;
}

function statsBlock(host: GameDeskController, draft: DeskSettings, save: (repaint: boolean) => void): HTMLElement {
  const stats = host.catalog.stats;
  if (!stats) return el("div", "");
  const block = el("div", "");
  const kind = activeStatKind(host.catalog, draft);
  block.append(el("div", "hint", stats.label));
  if (stats.kinds.length > 1) {
    block.append(pick(stats.kinds, kind, (value) => {
      draft.statKind = value as StatKind;
      save(true);
    }, {
      steam: "Steam",
      overwatch: "Career link",
      card: "Card",
    }));
  }
  block.append(field("Profile", draft.statId, stats.placeholder, (value) => {
    draft.statId = value;
    save(false);
  }));
  const placeholder = stats.fields.length ? stats.fields.map((fieldName) => `${fieldName}: `).join("\n") : "Note";
  block.append(linesField("Lines", draft.statLines, placeholder, (value) => {
    draft.statLines = value;
    save(false);
  }));
  const button = el("button", "text-button", kind === "card" ? "Put card in the composer" : "Look up");
  button.type = "button";
  button.addEventListener("click", () => host.lookup());
  block.append(button, el("p", "hint", stats.hint));
  return block;
}

function flag(label: string, description: string, on: boolean, change: (value: boolean) => void): HTMLElement {
  const button = switchControl(on, label);
  button.addEventListener("click", () => change(!on));
  return settingRow(label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, description, button);
}

function pick(values: string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
  return segmentControl(values, current, onPick, labels);
}

function field(label: string, value: string, placeholder: string, onInput: (value: string) => void): HTMLInputElement {
  const input = el("input");
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function linesField(label: string, value: string, placeholder: string, onInput: (value: string) => void): HTMLTextAreaElement {
  const input = el("textarea");
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onInput(input.value));
  return input;
}
