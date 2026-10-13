import { el, portrait } from "../dom";
import type { BoardHandlers, TileHandle } from "../dashboard-view";

export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let sig = "";
  return {
    update(snapshot) {
      const next = snapshot.dms.map((row) => `${row.id}|${row.name}|${row.preview}|${row.unread}`).join("\n");
      if (next === sig && host.childElementCount) return;
      sig = next;
      host.replaceChildren();
      if (!snapshot.dms.length) {
        host.append(el("p", "dash-tile-empty", "No direct messages."));
        return;
      }
      const list = el("div", "dash-list");
      for (const row of snapshot.dms) {
        const button = el("button", "dash-dm");
        button.type = "button";
        const copy = el("span", "dash-voice-copy");
        copy.append(el("strong", "", row.name), el("span", "", row.preview || "Direct message"));
        button.append(portrait(row.name, row.id, null, true), copy);
        if (row.unread) button.append(el("span", "dash-unread", String(row.unread)));
        button.addEventListener("click", () => handlers.onOpenDm(row.id));
        list.append(button);
      }
      host.append(list);
    },
    pause() {},
    resume() { sig = ""; },
    destroy() { sig = ""; host.replaceChildren(); },
  };
}
