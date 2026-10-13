import { el } from "./dom";

const ROOT_ID = "lark-call-ring";
const STYLE_ID = "lark-call-ring-style";

const CSS = `
#lark-call-ring {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 36;
  width: min(420px, calc(100vw - 24px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #09090b;
  color: #fafafa;
  border: 1px solid #27272a;
  border-radius: 6px;
  box-shadow: none;
  pointer-events: auto;
}
#lark-call-ring .call-ring-copy { min-width: 0; flex: 1; }
#lark-call-ring strong { display: block; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
#lark-call-ring p { margin: 2px 0 0; color: #a1a1aa; font-size: 12px; }
#lark-call-ring .call-ring-actions { display: flex; gap: 8px; flex: none; }
#lark-call-ring button {
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: none;
  transition: background 120ms linear, color 120ms linear, border-color 120ms linear;
}
#lark-call-ring .call-ring-decline {
  background: transparent;
  color: #fafafa;
  border-color: #3f3f46;
}
#lark-call-ring .call-ring-decline:hover { background: #18181b; }
#lark-call-ring .call-ring-answer {
  background: #fafafa;
  color: #09090b;
}
#lark-call-ring .call-ring-answer:hover { background: #e4e4e7; }
`;

export function renderCallRing(
  ring: { callerName: string; video: boolean } | null,
  handlers: { onAnswer: () => void; onDecline: () => void },
): void {
  const current = document.getElementById(ROOT_ID);
  if (!ring) {
    current?.remove();
    return;
  }
  ensureStyle();
  const sig = `${ring.callerName}|${ring.video ? "1" : "0"}`;
  if (current?.dataset.sig === sig) return;
  current?.remove();
  const root = el("div");
  root.id = ROOT_ID;
  root.dataset.sig = sig;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", ring.video ? "Incoming video call" : "Incoming call");
  const copy = el("div", "call-ring-copy");
  copy.append(el("strong", "", ring.callerName), el("p", "", ring.video ? "Incoming video call" : "Incoming voice call"));
  const actions = el("div", "call-ring-actions");
  const decline = el("button", "call-ring-decline", "Decline");
  decline.type = "button";
  decline.addEventListener("click", handlers.onDecline);
  const answer = el("button", "call-ring-answer", "Answer");
  answer.type = "button";
  answer.addEventListener("click", handlers.onAnswer);
  actions.append(decline, answer);
  root.append(copy, actions);
  document.body.append(root);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}
