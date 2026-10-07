export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement) {
  node.replaceChildren();
}

const SVG = "http://www.w3.org/2000/svg";

export function icon(path: string): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

export const paths = {
  hash: "M9 4 7 20M17 4l-2 16M4 9h16M4 15h16",
  volume: "M4 10v4h3l5 4V6L7 10H4",
  users: "M16 20v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 20v-1a3 3 0 0 0-2.2-2.9M16 6.1a3 3 0 0 1 0 5.8",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  reply: "M9 17 4 12l5-5M4 12h10a6 6 0 0 1 6 6v1",
  pencil: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13",
  plus: "M12 5v14M5 12h14",
  pin: "M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10zM12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  close: "M6 6l12 12M18 6 6 18",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 19a2 2 0 0 0 4 0",
  paperclip: "M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8 8a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  panels: "M4 5h16v14H4zM9 5v14M15 5v14",
  message: "M5 6h14v9H8l-3 3V6z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6",
  micOff: "M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V6a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 11M12 18v3M9 21h6M3 3l18 18",
  headphones: "M4 13a8 8 0 0 1 16 0M4 13v6a2 2 0 0 0 2 2h2v-8H6a2 2 0 0 0-2 2zM20 13v6a2 2 0 0 1-2 2h-2v-8h2a2 2 0 0 1 2 2z",
  headphonesOff: "M4 13a8 8 0 0 1 12.3-6.7M20 13v6a2 2 0 0 1-2 2h-2v-8h2M4 13v6a2 2 0 0 0 2 2h2v-8H6M3 3l18 18",
  hangup: "M10.7 13.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2v2.1a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7 2 2 0 0 1 2-2.2H8a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L9.1 12",
  camera: "M3 8h11v10H3zM14 12l6-3.5v7L14 12",
  cameraOff: "M3 8h7M14 12l6-3.5v7L16 13M3 18h11V12M2 2l20 20",
  monitor: "M4 5h16v11H4zM8 20h8M12 16v4",
  activity: "M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4",
};

export function colorFor(id: string): string {
  const palette = ["#d37b5b", "#c4843c", "#3f8f7a", "#3d7ea6", "#7b6bb3", "#b85b78", "#6a8f3f", "#b56a3c"];
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function portrait(name: string, id: string, avatarUrl?: string | null, small = false): HTMLElement {
  const node = el("div", small ? "avatar sm" : "avatar");
  const url = avatarUrl?.trim();
  const letters = () => {
    node.classList.remove("has-image");
    node.textContent = initials(name);
    node.style.background = colorFor(id);
  };
  if (!url) {
    letters();
    return node;
  }
  node.classList.add("has-image");
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.loading = "lazy";
  img.src = url;
  img.addEventListener("error", () => {
    img.remove();
    letters();
  });
  node.append(img);
  return node;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
