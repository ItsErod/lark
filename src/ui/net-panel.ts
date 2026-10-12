import { el } from "./dom";
import {
  clearTraffic,
  exportTraffic,
  filterTraffic,
  setTrafficPaused,
  trafficPaused,
  trafficSnapshot,
  type GatewayRow,
} from "../net/traffic";

export interface NetPanel {
  close: () => void;
}

export function mountNetPanel(onClose: () => void, download: (name: string, body: string) => void): NetPanel {
  const root = el("aside", "net-panel");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Network");
  const search = el("input") as HTMLInputElement;
  search.type = "search";
  search.placeholder = "Search";
  search.setAttribute("aria-label", "Search network traffic");
  const event = el("input") as HTMLInputElement;
  event.type = "search";
  event.placeholder = "Event";
  event.setAttribute("aria-label", "Filter gateway events");
  const pause = el("button", "text-button", "Pause");
  pause.type = "button";
  const clear = el("button", "text-button", "Clear");
  clear.type = "button";
  const save = el("button", "text-button", "Export");
  save.type = "button";
  const close = el("button", "text-button", "Close");
  close.type = "button";
  const bar = el("div", "net-bar");
  bar.append(el("strong", "", "Network"), search, event, pause, clear, save, close);
  const rest = el("section", "net-col");
  const gateway = el("section", "net-col");
  const voice = el("section", "net-col");
  const cols = el("div", "net-cols");
  cols.append(rest, gateway, voice);
  const payload = el("pre", "net-payload");
  payload.textContent = "Select a gateway event.";
  root.append(bar, cols, payload);
  document.body.append(root);

  let selected: GatewayRow | null = null;
  const paint = () => {
    const dump = filterTraffic(trafficSnapshot(), search.value, event.value);
    rest.replaceChildren(el("h3", "", "REST"), ...dump.rest.slice(-40).reverse().map((row) => {
      const line = el("button", "net-row", `${row.method} ${row.route}  ${row.status}  ${row.ms} ms  ${row.bytes} B`);
      line.type = "button";
      return line;
    }));
    gateway.replaceChildren(el("h3", "", "Gateway"), ...dump.gateway.slice(-40).reverse().map((row) => {
      const line = el("button", "net-row", `op ${row.op}  ${row.t}`);
      line.type = "button";
      line.addEventListener("click", () => {
        selected = row;
        payload.textContent = JSON.stringify(row.payload, null, 2).slice(0, 8000);
      });
      return line;
    }));
    const stats = dump.voice;
    voice.replaceChildren(
      el("h3", "", "Voice"),
      el("p", "", `packets ${stats.packets}`),
      el("p", "", `bitrate ${stats.bitrate}`),
      el("p", "", `loss ${stats.loss}`),
      el("p", "", `jitter ${stats.jitter} ms`),
      el("p", "", `ping ${stats.ping} ms`),
    );
    pause.textContent = trafficPaused() ? "Resume" : "Pause";
    if (selected && !dump.gateway.some((row) => row.id === selected?.id)) {
      payload.textContent = "Select a gateway event.";
    }
  };
  const timer = window.setInterval(paint, 250);
  search.addEventListener("input", paint);
  event.addEventListener("input", paint);
  pause.addEventListener("click", () => {
    setTrafficPaused(!trafficPaused());
    paint();
  });
  clear.addEventListener("click", () => {
    clearTraffic();
    selected = null;
    payload.textContent = "Select a gateway event.";
    paint();
  });
  save.addEventListener("click", () => {
    download(`lark-network-${Date.now()}.json`, exportTraffic(search.value, event.value));
  });
  let closed = false;
  const shutdown = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(timer);
    root.remove();
    onClose();
  };
  close.addEventListener("click", shutdown);
  paint();
  return { close: shutdown };
}
