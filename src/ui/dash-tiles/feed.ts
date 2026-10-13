import { dashboardFeed, dashboardSig, renderDashboard } from "../dashboard";
import type { BoardHandlers, BoardSnapshot, TileHandle } from "../dashboard-view";

/** The activity list from the Home feed. The clock pauses while this tile is hidden. */
export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let sig = "";
  let timer = 0;
  let ticking = false;
  let latest: BoardSnapshot | null = null;

  const stop = () => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
  };

  const paint = () => {
    if (!latest) return;
    const model = dashboardFeed({ ...latest.feed, now: Date.now() });
    const masked = {
      ...model,
      rows: model.rows.map((row) => ({ ...row })),
    };
    const next = dashboardSig(masked);
    ticking = masked.ticking;
    if (next !== sig || !host.querySelector(".dash-feed")) {
      sig = next;
      renderDashboard(host, masked, handlers.feed, false);
    }
    stop();
    if (!ticking || document.hidden) return;
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
