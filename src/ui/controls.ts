import { el } from "./dom";

/** Segmented choice used by settings and the privacy panels. */
export function segmentControl(values: readonly string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
  const row = el("div", "segment");
  row.setAttribute("role", "radiogroup");
  for (const value of values) {
    const button = el("button", value === current ? "is-on" : "", labels?.[value] ?? value);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", value === current ? "true" : "false");
    button.addEventListener("click", () => onPick(value));
    row.append(button);
  }
  return row;
}
