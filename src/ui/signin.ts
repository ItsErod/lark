import { signInCopy, signInErrorVisible, type SignInCopy } from "../signin";
import { clear, el } from "./dom";

export interface SignInState {
  error: string;
  qrSvg: string;
  qrStatus: string;
  store: string;
  busy: string;
}

export interface SignInActions {
  onDiscord: () => void;
  onWindow: () => void;
  onPreview: () => void;
  onSave: (token: string) => void;
}

export function renderSignIn(host: HTMLElement, state: SignInState, actions: SignInActions) {
  const copy = signInCopy();
  clear(host);
  const card = el("div", "gate-card");
  card.append(
    el("div", "mark", "L"),
    el("h1", "", "Lark"),
    el("p", "lede", "A small Discord client for one account, on macOS and Windows. Fast enough to leave open."),
  );
  const warning = el("div", "warning");
  warning.append(
    el("strong", "", "This can ban the account"),
    el("p", "", "Discord's terms don't allow third-party clients that sign in with a user token. Using Lark on your own account can get that account suspended. The token stays in the macOS Keychain or Windows Credential Manager and is sent only to Discord."),
  );
  card.append(warning);

  const discord = el("button", "primary signin-discord", copy.discordButton);
  discord.type = "button";
  discord.addEventListener("click", actions.onDiscord);
  const windowLogin = el("button", "ghost signin-window", copy.windowButton);
  windowLogin.type = "button";
  windowLogin.addEventListener("click", actions.onWindow);
  card.append(discord, windowLogin);

  card.append(renderQr(copy, state));

  const preview = el("button", "ghost", copy.previewButton);
  preview.type = "button";
  preview.addEventListener("click", actions.onPreview);
  const actionsRow = el("div", "gate-actions");
  actionsRow.append(preview);
  card.append(actionsRow);

  card.append(renderAdvanced(copy, actions));
  if (signInErrorVisible(state.error)) {
    const error = el("p", "gate-error", state.error);
    error.setAttribute("role", "alert");
    card.append(error);
  } else if (state.busy) {
    card.append(el("p", "gate-busy", state.busy));
  }
  card.append(
    el(
      "p",
      "gate-note",
      state.store
        ? `The token is stored in ${state.store}. Nothing is logged, and it is not sent anywhere except Discord.`
        : "Nothing is logged, and the token is not sent anywhere except Discord.",
    ),
    el("p", "gate-note session-note", copy.sessionNote),
    el("p", "gate-note oauth-note", copy.oauthNote),
  );
  host.append(card);
}

export function patchSignIn(host: HTMLElement, state: SignInState) {
  const slot = host.querySelector(".qr-slot");
  const svg = svgMarkup(state.qrSvg);
  if (slot && svg) slot.innerHTML = svg;
  const status = host.querySelector(".qr-status");
  if (status) status.textContent = state.qrStatus;
  let error = host.querySelector(".gate-card > .gate-error");
  if (signInErrorVisible(state.error)) {
    if (!error) {
      error = el("p", "gate-error", state.error);
      error.setAttribute("role", "alert");
      cardNote(host)?.before(error);
    } else {
      error.textContent = state.error;
    }
  } else if (error) {
    error.remove();
  }
  const busy = host.querySelector(".gate-card > .gate-busy");
  if (state.busy && !signInErrorVisible(state.error)) {
    if (busy) busy.textContent = state.busy;
    else {
      const node = el("p", "gate-busy", state.busy);
      cardNote(host)?.before(node);
    }
  } else if (busy) {
    busy.remove();
  }
}

function cardNote(host: HTMLElement): Element | null {
  return host.querySelector(".gate-card > .gate-note");
}

function renderQr(copy: SignInCopy, state: SignInState): HTMLElement {
  const block = el("section", "qr-block");
  block.append(el("h2", "", copy.qrCaption));
  const slot = el("div", "qr-slot");
  slot.setAttribute("role", "img");
  slot.setAttribute("aria-label", copy.qrCaption);
  const svg = svgMarkup(state.qrSvg);
  if (svg) slot.innerHTML = svg;
  block.append(slot, el("p", "qr-status", state.qrStatus));
  return block;
}

function renderAdvanced(copy: SignInCopy, actions: SignInActions): HTMLElement {
  const details = el("details", "advanced");
  if (copy.advancedOpen) details.open = true;
  const summary = el("summary", "", copy.advancedLabel);
  const label = el("label", "field");
  label.append(el("span", "", "Token"));
  const input = el("input", "token-input");
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Paste your token";
  input.setAttribute("aria-label", "Discord token");
  label.append(input);
  const save = el("button", "ghost", copy.saveButton);
  save.type = "button";
  save.addEventListener("click", () => actions.onSave(input.value));
  const hint = el("p", "gate-note", "Paste is the fallback. Quotes, line breaks, and an Authorization label are removed before the token is saved.");
  details.append(summary, label, save, hint);
  return details;
}

function svgMarkup(svg: string): string {
  const trimmed = svg.trim().replace(/^<\?xml[^>]*>/, "");
  const lower = trimmed.toLowerCase();
  if (!trimmed.startsWith("<svg") || lower.includes("<script") || lower.includes("onload") || lower.includes("javascript:")) {
    return "";
  }
  return trimmed;
}
