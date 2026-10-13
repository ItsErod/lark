/**
 * Renders bot message components (buttons, select menus) under a message and
 * opens bot modals. Sends component and modal-submit interactions.
 */
import {
  COMPONENT,
  componentInteraction,
  interactionNonce,
  modalSubmit,
  parseComponentRows,
  parseModal,
  textInputProblem,
  type ButtonModel,
  type ComponentTarget,
  type ModalModel,
  type SelectModel,
} from "../components";
import { el } from "./dom";

export interface ComponentContext {
  demo: boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, body: string): void;
  openUrl(url: string): void;
  people(): { id: string; name: string }[];
  channels(): { id: string; name: string; kind: string }[];
  roles(): { id: string; name: string }[];
}

let provider: (() => ComponentContext | null) | null = null;
const pending = new Map<string, { done: (ok: boolean) => void; channelId: string; guildId: string | null }>();

export function bindComponentContext(fn: (() => ComponentContext | null) | null) {
  provider = fn;
}

const KIND_TYPE: Record<string, number> = { text: 0, dm: 1, voice: 2, group: 3, category: 4, announcement: 5, thread: 11, stage: 13, forum: 15, media: 16 };

function ensureStyle() {
  if (document.getElementById("lark-components-style")) return;
  const style = document.createElement("style");
  style.id = "lark-components-style";
  style.textContent = `
    .bot-components { display: grid; gap: 6px; margin-top: 6px; }
    .bot-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .bot-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px; border-radius: 4px;
      border: 1px solid #27272a; background: #18181b; color: #fafafa; font: inherit; font-size: 13px; cursor: pointer; box-shadow: none;
      transition: background 120ms ease, opacity 120ms ease; }
    .bot-btn:hover:not(:disabled) { background: #27272a; }
    .bot-btn.is-primary { background: #fafafa; color: #09090b; border-color: #fafafa; }
    .bot-btn.is-primary:hover:not(:disabled) { background: #e4e4e7; }
    .bot-btn.is-success { color: #4ade80; }
    .bot-btn.is-danger { color: #f87171; }
    .bot-btn.is-link::after { content: "↗"; font-size: 11px; color: #a1a1aa; }
    .bot-btn:disabled { opacity: 0.4; cursor: default; }
    .bot-btn.is-busy { opacity: 0.6; cursor: progress; }
    .bot-select { display: flex; gap: 6px; width: min(100%, 420px); }
    .bot-select select { flex: 1; min-height: 30px; padding: 4px 8px; border-radius: 4px; border: 1px solid #27272a; background: #18181b;
      color: #fafafa; font: inherit; font-size: 13px; transition: border-color 120ms ease; }
    .bot-select select:focus { outline: none; border-color: #fafafa; }
    .bot-select select:disabled { opacity: 0.4; }
    #lark-bot-modal { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(9, 9, 11, 0.72); }
    #lark-bot-modal form { width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 48px); overflow: auto; padding: 16px;
      background: #09090b; color: #fafafa; border: 1px solid #27272a; border-radius: 6px; box-shadow: none; display: grid; gap: 10px; }
    #lark-bot-modal h2 { margin: 0; font-size: 15px; }
    #lark-bot-modal label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; }
    #lark-bot-modal label .req { color: #fafafa; }
    #lark-bot-modal input, #lark-bot-modal textarea { padding: 6px 8px; border-radius: 4px; border: 1px solid #27272a; background: #18181b;
      color: #fafafa; font: inherit; font-size: 13px; font-weight: 400; transition: border-color 120ms ease; }
    #lark-bot-modal textarea { min-height: 84px; resize: vertical; }
    #lark-bot-modal input:focus, #lark-bot-modal textarea:focus { outline: none; border-color: #fafafa; }
    #lark-bot-modal .problem { color: #f87171; font-size: 11px; font-weight: 400; }
    #lark-bot-modal footer { display: flex; justify-content: flex-end; gap: 8px; }
  `;
  document.head.append(style);
}

export interface ComponentMessage {
  id: string;
  channelId: string;
  guildId?: string | null;
  authorId: string;
  applicationId?: string | null;
  messageFlags?: number;
  components?: unknown;
}

/** Append rendered components to a message body. No-op without components. */
export function appendBotComponents(host: Element | null, message: ComponentMessage) {
  if (!host || !message.components || typeof document === "undefined") return;
  const rows = parseComponentRows(message.components);
  if (!rows.length) return;
  ensureStyle();
  const target: ComponentTarget = {
    messageId: message.id,
    channelId: message.channelId,
    guildId: message.guildId ?? null,
    applicationId: message.applicationId || message.authorId,
    messageFlags: message.messageFlags ?? 0,
  };
  const wrap = el("div", "bot-components");
  for (const row of rows) {
    const line = el("div", "bot-row");
    for (const item of row) {
      if (item.kind === "button") line.append(buttonFor(item, target));
      else if (item.kind === "select") line.append(selectFor(item, target));
    }
    if (line.childElementCount) wrap.append(line);
  }
  if (wrap.childElementCount) host.append(wrap);
}

const STYLE_CLASS: Record<number, string> = { 1: "is-primary", 2: "is-secondary", 3: "is-success", 4: "is-danger", 5: "is-link", 6: "is-premium" };

function buttonFor(model: ButtonModel, target: ComponentTarget): HTMLButtonElement {
  const button = el("button", `bot-btn ${STYLE_CLASS[model.style] ?? "is-secondary"}`);
  button.type = "button";
  const text = [model.emoji, model.label].filter(Boolean).join(" ");
  button.textContent = text || (model.style === 6 ? "Premium" : "Button");
  button.disabled = model.disabled;
  if (model.style === 6) button.title = "Purchases open in Discord.";
  if (model.style === 5) {
    button.title = model.url;
    button.addEventListener("click", () => provider?.()?.openUrl(model.url));
    return button;
  }
  button.addEventListener("click", () => {
    send(componentInteraction(target, { customId: model.customId, type: COMPONENT.BUTTON }, undefined), target, button);
  });
  return button;
}

function selectFor(model: SelectModel, target: ComponentTarget): HTMLElement {
  const wrap = el("div", "bot-select");
  const select = el("select");
  select.disabled = model.disabled;
  select.multiple = model.maxValues > 1;
  if (select.multiple) select.size = Math.min(6, Math.max(3, model.options.length || 4));
  select.setAttribute("aria-label", model.placeholder || "Choose");
  if (!select.multiple) {
    const blank = el("option", "", model.placeholder || "Make a selection");
    blank.value = "";
    blank.disabled = true;
    blank.selected = !model.options.some((o) => o.default);
    select.append(blank);
  }
  const ctx = provider?.();
  const options = model.type === COMPONENT.STRING_SELECT
    ? model.options.map((o) => ({ value: o.value, label: [o.emoji, o.label].filter(Boolean).join(" "), title: o.description, selected: o.default }))
    : choicesFor(model, ctx);
  for (const item of options) {
    const option = el("option", "", item.label);
    option.value = item.value;
    if (item.title) option.title = item.title;
    option.selected = Boolean(item.selected);
    select.append(option);
  }
  const submit = () => {
    const values = [...select.selectedOptions].map((o) => o.value).filter(Boolean);
    if (values.length < model.minValues || values.length > model.maxValues) {
      provider?.()?.toast("Bot", model.minValues === model.maxValues ? `Pick ${model.minValues}.` : `Pick ${model.minValues}–${model.maxValues}.`);
      return;
    }
    send(componentInteraction(target, { customId: model.customId, type: model.type }, values), target, select);
  };
  wrap.append(select);
  if (select.multiple) {
    const done = el("button", "bot-btn is-primary", "Done");
    done.type = "button";
    done.disabled = model.disabled;
    done.addEventListener("click", submit);
    wrap.append(done);
  } else {
    select.addEventListener("change", submit);
  }
  return wrap;
}

function choicesFor(model: SelectModel, ctx: ComponentContext | null | undefined) {
  if (!ctx) return [];
  const people = ctx.people().map((p) => ({ value: p.id, label: p.name, title: "", selected: false }));
  const roles = ctx.roles().map((r) => ({ value: r.id, label: `@${r.name}`, title: "", selected: false }));
  if (model.type === COMPONENT.USER_SELECT) return people;
  if (model.type === COMPONENT.ROLE_SELECT) return roles;
  if (model.type === COMPONENT.MENTIONABLE_SELECT) return [...people, ...roles];
  return ctx.channels()
    .filter((c) => !model.channelTypes.length || model.channelTypes.includes(KIND_TYPE[c.kind] ?? -1))
    .map((c) => ({ value: c.id, label: `#${c.name}`, title: "", selected: false }));
}

function send(payload: Record<string, unknown> | null, target: ComponentTarget, control: HTMLButtonElement | HTMLSelectElement) {
  const ctx = provider?.();
  if (!ctx || !payload) return;
  if (ctx.demo) {
    ctx.toast("Bot", "Demo mode doesn't talk to bots.");
    return;
  }
  const nonce = String(payload.nonce);
  control.disabled = true;
  control.classList.add("is-busy");
  const finish = (ok: boolean) => {
    pending.delete(nonce);
    control.disabled = false;
    control.classList.remove("is-busy");
    if (!ok) ctx.toast("Bot", "This interaction failed.");
  };
  pending.set(nonce, { done: finish, channelId: target.channelId, guildId: target.guildId ?? null });
  window.setTimeout(() => pending.get(nonce)?.done(true), 3000);
  void ctx.invoke("invoke_command", { payload }).catch((error) => {
    pending.delete(nonce);
    control.disabled = false;
    control.classList.remove("is-busy");
    ctx.toast("Bot", error instanceof Error ? error.message : "Discord refused that.");
  });
}

/** Gateway INTERACTION_SUCCESS / FAILURE. */
export function deliverInteractionResult(nonce: string, ok: boolean): boolean {
  const hit = pending.get(nonce);
  if (!hit) return false;
  hit.done(ok);
  return true;
}

/** Gateway INTERACTION_MODAL_CREATE. Opens only for interactions Lark sent. */
export function deliverModal(event: { nonce?: string } & Record<string, unknown>, fallback: { channelId: string | null; guildId: string | null }): boolean {
  const modal = parseModal(event);
  if (!modal) return false;
  const sent = event.nonce ? pending.get(event.nonce) : undefined;
  if (event.nonce && sent) sent.done(true);
  const target = sent ? { channelId: sent.channelId, guildId: sent.guildId } : fallback;
  if (!target.channelId) return false;
  openModal(modal, { channelId: target.channelId, guildId: target.guildId });
  return true;
}

export function openModal(modal: ModalModel, target: { channelId: string; guildId: string | null }) {
  if (typeof document === "undefined") return;
  ensureStyle();
  document.getElementById("lark-bot-modal")?.remove();
  const layer = el("div");
  layer.id = "lark-bot-modal";
  const form = el("form");
  form.noValidate = true;
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-label", modal.title);
  form.append(el("h2", "", modal.title));
  const values: Record<string, string> = {};
  const problems = new Map<string, HTMLElement>();
  const submit = el("button", "bot-btn is-primary", "Submit");
  submit.type = "submit";
  const check = (touched?: string) => {
    let ok = true;
    for (const input of modal.rows) {
      const problem = textInputProblem(input, values[input.customId] ?? "");
      if (problem) ok = false;
      const node = problems.get(input.customId);
      if (node && (input.customId === touched || node.dataset.shown)) {
        node.textContent = problem;
        node.dataset.shown = "1";
      }
    }
    submit.disabled = !ok;
  };
  for (const input of modal.rows) {
    values[input.customId] = input.value;
    const label = el("label");
    const title = el("span", "", input.label);
    if (input.required) title.append(el("span", "req", " *"));
    const field = input.style === 2 ? el("textarea") : el("input");
    field.value = input.value;
    field.placeholder = input.placeholder;
    field.maxLength = input.maxLength;
    field.addEventListener("input", () => {
      values[input.customId] = field.value;
      check(input.customId);
    });
    const problem = el("span", "problem");
    problems.set(input.customId, problem);
    label.append(title, field, problem);
    form.append(label);
  }
  const close = () => layer.remove();
  const cancel = el("button", "bot-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", close);
  const foot = el("footer");
  foot.append(cancel, submit);
  form.append(foot);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ctx = provider?.();
    const payload = modalSubmit(modal, values, target, interactionNonce());
    if (!ctx || !payload) {
      for (const node of problems.values()) node.dataset.shown = "1";
      check();
      return;
    }
    submit.disabled = true;
    void ctx.invoke("invoke_command", { payload }).then(close).catch((error) => {
      submit.disabled = false;
      ctx.toast("Bot", error instanceof Error ? error.message : "Discord refused that form.");
    });
  });
  layer.addEventListener("click", (event) => {
    if (event.target === layer) close();
  });
  layer.append(form);
  document.body.append(layer);
  check();
  form.querySelector<HTMLElement>("input, textarea")?.focus();
}
