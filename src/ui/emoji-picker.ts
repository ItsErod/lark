import { emojiCdnUrl } from "../render/content";
import { clear, el } from "./dom";
import { statusEmojiCells, type ServerEmoji } from "./status-emoji";

export interface EmojiPickerOptions {
  query: string;
  unicode: readonly string[];
  recent: readonly string[];
  server: readonly ServerEmoji[];
  allowServer: boolean;
  onQuery: (value: string) => void;
  onPick: (emoji: string, emojiId?: string | null, animated?: boolean, name?: string) => void;
}

/** The composer and custom-status grids. Server emoji render only when `allowServer` is set. */
export function renderEmojiPicker(options: EmojiPickerOptions): HTMLElement {
  const picker = el("div", "picker");
  const input = el("input");
  input.placeholder = "Find emoji";
  input.setAttribute("aria-label", "Find emoji");
  input.value = options.query;
  const row = el("div", "picker-row");
  const paint = (query: string) => {
    clear(row);
    const cells = statusEmojiCells({
      unicode: options.unicode,
      recent: options.recent,
      server: options.server,
      allowServer: options.allowServer,
      query,
    });
    for (const cell of cells) {
      const button = el("button", "icon-button");
      button.type = "button";
      if (cell.id) {
        button.title = `:${cell.name}:`;
        const url = emojiCdnUrl(cell.id, cell.animated);
        if (url) {
          const img = el("img", "emoji");
          img.alt = cell.name;
          img.src = url;
          button.append(img);
        } else button.textContent = cell.name;
      } else {
        button.textContent = cell.label;
      }
      button.addEventListener("click", () => options.onPick(cell.name, cell.id, cell.animated, cell.name));
      row.append(button);
    }
  };
  input.addEventListener("input", () => {
    options.onQuery(input.value);
    paint(input.value);
  });
  paint(options.query);
  picker.append(input, row);
  return picker;
}
