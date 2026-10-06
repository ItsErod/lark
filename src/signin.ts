/** Copy and state for the sign-in screen. The desktop shell does the real login. */

import { PREVIEW_QR_SVG } from "./preview-qr";

export function previewQr(): string {
  return PREVIEW_QR_SVG;
}

export const DISCORD_BUTTON = "Sign in with Discord";
export const QR_CAPTION = "Scan with the Discord mobile app";
export const ADVANCED_LABEL = "Advanced";
export const PREVIEW_BUTTON = "Preview with sample data";
export const SAVE_BUTTON = "Save and connect";

export const OAUTH_NOTE =
  "Discord's OAuth2 consent screen cannot grant the user session a full client needs for reading and sending messages. Lark uses Discord's own login page and the mobile QR code instead.";

export interface SignInCopy {
  discordButton: string;
  qrCaption: string;
  advancedLabel: string;
  previewButton: string;
  saveButton: string;
  oauthNote: string;
  advancedOpen: boolean;
}

export function signInCopy(): SignInCopy {
  return {
    discordButton: DISCORD_BUTTON,
    qrCaption: QR_CAPTION,
    advancedLabel: ADVANCED_LABEL,
    previewButton: PREVIEW_BUTTON,
    saveButton: SAVE_BUTTON,
    oauthNote: OAUTH_NOTE,
    advancedOpen: false,
  };
}

export function signInErrorVisible(error: string): boolean {
  return error.trim().length > 0;
}

/** Tauri command failures reject with a string, not an Error. */
export function commandError(err: unknown, fallback: string): string {
  if (typeof err === "string") {
    const text = err.trim();
    if (text) return text;
  }
  if (err instanceof Error) {
    const text = err.message.trim();
    if (text) return text;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

/** A fixed preview code. It is not a live Discord session. */
export const PREVIEW_QR_URL = "https://discord.com/ra/preview-not-a-session";
