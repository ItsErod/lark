import type { CallCommand, CallFrame } from "../call-window";
import { callBus } from "../call-window";
import { el, icon, paths } from "./dom";
import { renderCallStage } from "./voice-view";

/** The call grid in its own window. The main window keeps the text channel. */
export function mountCallPopout(root: HTMLElement): void {
  root.className = "call-popout";
  root.replaceChildren();
  const bar = el("header", "call-popout-bar");
  const title = el("strong", "call-split-name", "Call");
  const dock = el("button", "text-button", "Dock");
  dock.type = "button";
  dock.title = "Show the call above the text channel";
  const back = el("button", "icon-button");
  back.type = "button";
  back.setAttribute("aria-label", "Back to chat");
  back.title = "Back to chat (Esc)";
  back.append(icon(paths.close));
  const actions = el("div", "call-split-actions");
  actions.append(dock, back);
  bar.append(title, actions);
  const stage = el("section", "voice-stage");
  stage.setAttribute("aria-label", "Voice call");
  stage.append(el("p", "voice-empty", "Waiting for the call."));
  root.append(bar, stage);

  const bus = callBus();
  const send = (command: CallCommand) => bus?.postMessage({ type: "command", command });
  dock.addEventListener("click", () => send({ type: "dock" }));
  back.addEventListener("click", () => {
    send({ type: "close" });
    window.close();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    send({ type: "close" });
    window.close();
  });
  window.addEventListener("pagehide", () => send({ type: "close" }));

  const paint = (frame: CallFrame) => {
    title.textContent = frame.channel || "Call";
    document.documentElement.style.setProperty("--speak", frame.speakColor);
    renderCallStage(stage, frame.tiles, frame.motion, {
      cameraOn: frame.cameraOn,
      shareOn: frame.shareOn,
      muted: frame.muted,
      deafened: frame.deafened,
      activitiesOpen: frame.activitiesOpen,
      clips: frame.clips,
      onCamera: () => send({ type: "camera" }),
      onShare: () => send({ type: "share" }),
      onActivities: () => send({ type: "activities" }),
      onMute: () => send({ type: "mute" }),
      onDeafen: () => send({ type: "deafen" }),
      onLeave: () => send({ type: "leave" }),
      onPlay: (id) => send({ type: "play", id }),
      onMenu: () => undefined,
    });
  };

  if (!bus) return;
  bus.onmessage = (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "frame") paint(data.frame as CallFrame);
    if (data.type === "bye") window.close();
  };
  bus.postMessage({ type: "hello" });
}
