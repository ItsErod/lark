import type { PackState } from "../pack/state";

/** Narrow host the media plugin panels use. The app keeps the Discord calls. */
export interface MediaHost {
  pack: PackState;
  savePack(): void;
  choice(values: string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement;
  resendVoiceMix(): void;
}

type Panel = (wrap: HTMLElement, id: string, host: MediaHost) => boolean;

const panels: Panel[] = [];
const claimed = new Set<string>();

export function registerMediaPanel(ids: readonly string[], panel: Panel) {
  if (ids.every((id) => claimed.has(id))) return;
  for (const id of ids) claimed.add(id);
  panels.push(panel);
}

export function renderMediaPanel(wrap: HTMLElement, id: string, host: MediaHost): boolean {
  return panels.some((panel) => panel(wrap, id, host));
}
