/** Text a person can copy from the crash screen. */
export function formatCrash(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack?.trim() ?? "";
    if (stack.includes(error.message)) return stack;
    const head = `${error.name}: ${error.message}`;
    return stack ? `${head}\n${stack}` : head;
  }
  if (typeof error === "string") return error.trim();
  if (error == null || typeof error === "number" || typeof error === "boolean") return String(error);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isBenign(text: string): boolean {
  return text.includes("ResizeObserver loop");
}

let shown = "";

/**
 * Paint a full-window error instead of leaving the webview blank.
 * Repeated reports for the same failure do not stack another screen.
 */
export function reportCrash(error: unknown, source?: string): void {
  const text = formatCrash(error).trim();
  if (!text || isBenign(text)) return;
  const line = source ? `${source}\n${text}` : text;
  if (shown.includes(line)) return;
  shown = shown ? `${shown}\n\n${line}` : line;
  console.error("[lark] crash\n" + shown);
  if (typeof document === "undefined") return;
  showCrash(shown);
}

export function showCrash(text: string): void {
  const existing = document.querySelector(".crash");
  let screen: HTMLElement;
  if (existing instanceof HTMLElement) {
    screen = existing;
  } else {
    screen = document.createElement("section");
    screen.className = "crash";
    screen.setAttribute("role", "alert");
    screen.style.position = "fixed";
    screen.style.inset = "0";
    screen.style.zIndex = "80";
    screen.style.display = "grid";
    screen.style.placeItems = "center";
    screen.style.background = "#1e1f22";
    screen.style.color = "#f2f3f5";
    screen.style.padding = "24px";

    const card = document.createElement("div");
    card.className = "crash-card";
    card.style.width = "min(520px, 100%)";
    card.style.display = "grid";
    card.style.justifyItems = "start";
    card.style.gap = "8px";

    const mark = document.createElement("div");
    mark.className = "mark";
    mark.textContent = "L";

    const title = document.createElement("h1");
    title.textContent = "Lark hit a problem";
    title.style.margin = "8px 0 0";
    title.style.fontSize = "28px";

    const note = document.createElement("p");
    note.textContent = "The window failed while drawing. Reloading usually clears it.";
    note.style.margin = "0 0 8px";
    note.style.color = "#b5bac1";

    const box = document.createElement("textarea");
    box.className = "crash-error";
    box.readOnly = true;
    box.spellcheck = false;
    box.setAttribute("aria-label", "Error details");
    box.style.width = "100%";
    box.style.minHeight = "140px";
    box.style.resize = "vertical";
    box.style.boxSizing = "border-box";
    box.style.padding = "10px 12px";
    box.style.borderRadius = "8px";
    box.style.border = "1px solid #3f4147";
    box.style.background = "#111214";
    box.style.color = "#f2f3f5";
    box.style.font = "13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    const actions = document.createElement("div");
    actions.className = "crash-actions";
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "8px";

    const reload = document.createElement("button");
    reload.type = "button";
    reload.className = "primary";
    reload.textContent = "Reload";
    reload.style.background = "#5865f2";
    reload.style.color = "#fff";
    reload.style.border = "0";
    reload.style.borderRadius = "4px";
    reload.style.padding = "8px 16px";
    reload.style.fontWeight = "600";
    reload.addEventListener("click", () => location.reload());

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "ghost";
    copy.textContent = "Copy error";
    copy.style.background = "transparent";
    copy.style.color = "#f2f3f5";
    copy.style.border = "1px solid #3f4147";
    copy.style.borderRadius = "4px";
    copy.style.padding = "8px 16px";
    copy.addEventListener("click", () => {
      box.focus();
      box.select();
      const value = box.value;
      const mark = () => {
        copy.textContent = "Copied";
      };
      try {
        if (document.execCommand("copy")) {
          mark();
          return;
        }
      } catch {
        /* The async clipboard API is the fallback. */
      }
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value).then(mark).catch(() => undefined);
      }
    });

    actions.append(reload, copy);
    card.append(mark, title, note, box, actions);
    screen.append(card);
    document.body.append(screen);
  }
  const box = screen.querySelector("textarea");
  if (box instanceof HTMLTextAreaElement) box.value = text;
}

/** Last-resort hook for errors the render boundary did not catch. */
export function installCrashHandlers(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    const where = source ? `${source}:${lineno}:${colno}` : "";
    reportCrash(error ?? message, where ? `window.onerror ${where}` : "window.onerror");
    return false;
  };
  window.onunhandledrejection = (event) => {
    reportCrash(event.reason, "unhandledrejection");
  };
}
