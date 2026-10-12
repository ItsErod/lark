export interface ClipboardSinks {
  writeText?: (text: string) => Promise<void>;
  pluginWrite?: (text: string) => Promise<void>;
  execCopy?: (text: string) => boolean;
}

/** Browser clipboard, then the Tauri clipboard plugin, then a textarea copy. */
export async function copyWithSinks(text: string, sinks: ClipboardSinks): Promise<boolean> {
  if (sinks.writeText) {
    try {
      await sinks.writeText(text);
      return true;
    } catch {
      /* The webview often rejects navigator.clipboard without a permission. */
    }
  }
  if (sinks.pluginWrite) {
    try {
      await sinks.pluginWrite(text);
      return true;
    } catch {
      /* The plugin is missing until the desktop shell allows clipboard-manager. */
    }
  }
  return sinks.execCopy?.(text) ?? false;
}

export function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export async function writeClipboard(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  return copyWithSinks(text, {
    writeText: clipboard?.writeText ? (value) => clipboard.writeText(value) : undefined,
    pluginWrite: async (value) => {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(value);
    },
    execCopy: copyWithExecCommand,
  });
}
