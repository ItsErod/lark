import { el } from "./dom";

export function renderWhois(card: HTMLElement, title: string, lines: readonly string[], x: number, y: number) {
  card.className = "whois-card";
  card.replaceChildren(el("strong", "", title));
  for (const line of lines) card.append(el("p", "", line));
  const width = 260;
  const height = 36 + lines.length * 22;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y + 14, window.innerHeight - height - 8));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}
