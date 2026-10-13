import { el } from "../dom";
import type { BoardHandlers, TileHandle } from "../dashboard-view";

export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let sig = "";
  return {
    update(snapshot) {
      const share = snapshot.share;
      const next = share ? `${share.userId}|${share.name}|${share.label}|${share.self ? 1 : 0}|${share.paused ? 1 : 0}|${share.watching ? 1 : 0}|${snapshot.inCall ? 1 : 0}` : "";
      if (next === sig && host.childElementCount) return;
      sig = next;
      host.replaceChildren();
      if (!share) {
        host.append(el("p", "dash-tile-empty", "No one is sharing."));
        return;
      }
      if (snapshot.inCall) {
        const stage = el("div", "dash-stage is-live");
        stage.dataset.streamHost = share.userId;
        stage.dataset.streamSlot = share.userId;
        stage.setAttribute("aria-label", `${share.name} is sharing`);
        host.append(stage);
        handlers.onShareHost();
        return;
      }
      const stage = el("div", "dash-stage", share.paused ? "Paused" : "Live");
      const who = el("p", "dash-kicker", `${share.name} · ${share.label}`);
      const actions = el("div", "dash-share-actions");
      const watch = el("button", "dash-mini", "Watch");
      watch.type = "button";
      watch.addEventListener("click", () => handlers.onWatch(share.userId));
      actions.append(watch);
      host.append(stage, who, actions);
    },
    pause() { sig = ""; host.replaceChildren(); },
    resume() { sig = ""; },
    destroy() { sig = ""; host.replaceChildren(); },
  };
}
