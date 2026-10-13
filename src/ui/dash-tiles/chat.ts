import { el } from "../dom";
import type { BoardHandlers, BoardSnapshot, TileHandle } from "../dashboard-view";

export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let sig = "";
  const paint = (snapshot: BoardSnapshot) => {
    const next = `${snapshot.channelName}\n${snapshot.chat.map((line) => `${line.id}|${line.author}|${line.text}|${line.mine ? 1 : 0}`).join("\n")}`;
    if (next === sig && host.childElementCount) return;
    sig = next;
    host.replaceChildren();
    if (snapshot.channelName) host.append(el("div", "dash-kicker", snapshot.channelName));
    if (!snapshot.chat.length) {
      host.append(el("p", "dash-tile-empty", "Nothing in this channel yet."));
    } else {
      const log = el("div", "dash-chat-log");
      for (const line of snapshot.chat) {
        const row = el("div", `dash-line${line.mine ? " is-mine" : ""}`);
        row.append(el("strong", "", line.author), el("span", "", line.text));
        log.append(row);
      }
      host.append(log);
    }
    const write = el("button", "dash-text", "Write");
    write.type = "button";
    write.style.marginTop = "8px";
    write.addEventListener("click", () => handlers.onWrite());
    host.append(write);
    host.scrollTop = host.scrollHeight;
  };
  return {
    update: paint,
    pause() {},
    resume() { sig = ""; },
    destroy() { sig = ""; host.replaceChildren(); },
  };
}
