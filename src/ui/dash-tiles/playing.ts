import { friendGames } from "../dashboard";
import { el, portrait } from "../dom";
import type { BoardHandlers, BoardSnapshot, TileHandle } from "../dashboard-view";

export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let sig = "";
  let timer = 0;
  let latest: BoardSnapshot | null = null;

  const stop = () => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
  };

  const paint = () => {
    if (!latest) return;
    const rows = friendGames(latest.people, latest.meId, Date.now());
    const next = rows.map((row) => `${row.id}|${row.name}|${row.game}|${row.clock}`).join("\n");
    if (next !== sig || !host.childElementCount) {
      sig = next;
      host.replaceChildren();
      if (!rows.length) {
        host.append(el("p", "dash-tile-empty", "No friends are in a game."));
      } else {
        const list = el("div", "dash-list");
        for (const row of rows) {
          const button = el("button", "dash-play");
          button.type = "button";
          const copy = el("span", "dash-voice-copy");
          copy.append(el("strong", "", row.name), el("span", "", row.game));
          button.append(portrait(row.name, row.id, row.avatarUrl, true), copy);
          if (row.clock) button.append(el("span", "dash-tag", row.clock));
          button.addEventListener("click", () => handlers.onOpenUser(row.id));
          list.append(button);
        }
        host.append(list);
      }
    }
    stop();
    if (!rows.some((row) => row.clock) || document.hidden) return;
    timer = window.setTimeout(() => {
      timer = 0;
      paint();
    }, 1000);
  };

  return {
    update(snapshot) {
      latest = snapshot;
      paint();
    },
    pause() { stop(); },
    resume() { if (latest) paint(); },
    destroy() { stop(); latest = null; sig = ""; host.replaceChildren(); },
  };
}
