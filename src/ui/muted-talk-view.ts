import { el } from "./dom";

const ROOT_ID = "lark-muted-talk";
const STYLE_ID = "lark-muted-talk-style";

const CSS = `
#lark-muted-talk {
  position: fixed;
  bottom: 88px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 28;
  margin: 0;
  padding: 8px 12px;
  background: #09090b;
  color: #fafafa;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  box-shadow: none;
  pointer-events: none;
  font-size: 13px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
`;

/** Banner sits on document.body so a chat repaint cannot remove it. Clicks pass through. */
export function renderMutedTalk(show: boolean): void {
  const current = document.getElementById(ROOT_ID);
  if (!show) {
    current?.remove();
    return;
  }
  if (current) return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = el("p", "", "You're talking while muted");
  root.id = ROOT_ID;
  root.setAttribute("role", "status");
  document.body.append(root);
}
