/**
 * Flags other streams read. Import this module; do not parse config by hand.
 *
 * Missing fields use the defaults. Unknown fields are ignored.
 * Developer Mode is off until Settings turns it on.
 * Embeds stay visible unless the user hides them.
 * Spoiler content stays hidden until the user shows it.
 */

export interface DisplayFlags {
  developer_mode: boolean;
  show_embeds: boolean;
  show_spoilers: boolean;
}

export const DEFAULT_DISPLAY_FLAGS: DisplayFlags = {
  developer_mode: false,
  show_embeds: true,
  show_spoilers: false,
};

export type DisplaySource = { display?: Partial<DisplayFlags> | null } | null | undefined;

export function readDisplayFlags(config: DisplaySource): DisplayFlags {
  const display = config?.display;
  return {
    developer_mode: display?.developer_mode === true,
    show_embeds: display?.show_embeds !== false,
    show_spoilers: display?.show_spoilers === true,
  };
}

/** Copy ID and other developer rows. Off when the field is missing. */
export function developerMode(config: DisplaySource): boolean {
  return readDisplayFlags(config).developer_mode;
}

/** Message embeds and link previews. On when the field is missing. */
export function showEmbeds(config: DisplaySource): boolean {
  return readDisplayFlags(config).show_embeds;
}

/** Reveal spoiler text without a click. Off when the field is missing. */
export function showSpoilers(config: DisplaySource): boolean {
  return readDisplayFlags(config).show_spoilers;
}
