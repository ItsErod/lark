/** A store theme applied on screen, without writing it into the installed set. */

export interface InstalledLook {
  css: string | null;
  theme: string;
  builtin: boolean;
}

export interface ThemePreviewSession {
  id: string;
  css: string;
  previous: InstalledLook;
}

export function beginThemePreview(current: InstalledLook, next: { id: string; css: string }): ThemePreviewSession | null {
  const id = next.id.trim();
  const css = next.css;
  if (!id || !css.trim()) return null;
  return { id, css, previous: { css: current.css, theme: current.theme, builtin: current.builtin } };
}

/** Switch the previewed file. Revert still restores the look from before the first preview. */
export function swapThemePreview(session: ThemePreviewSession, next: { id: string; css: string }): ThemePreviewSession | null {
  const id = next.id.trim();
  if (!id || !next.css.trim()) return null;
  return { id, css: next.css, previous: session.previous };
}

export function revertThemePreview(session: ThemePreviewSession): InstalledLook {
  return {
    css: session.previous.css,
    theme: session.previous.theme,
    builtin: session.previous.builtin,
  };
}
