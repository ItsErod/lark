/**
 * Inline options form for slash commands that take options. Opens above the
 * composer, sends an application-command interaction, and asks the bot for
 * autocomplete choices where the option supports it.
 */
import {
  OPTION,
  autocompleteBody,
  autocompleteChoices,
  fieldsFor,
  formInteractionBody,
  formProblems,
  subcommandPaths,
  type FormChoice,
  type FormCommand,
  type FormOption,
  type FormValues,
} from "../slash-options";
import { el } from "./dom";

export interface SlashFormContext {
  channelId: string | null;
  guildId: string | null;
  demo: boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, body: string): void;
  people(): { id: string; name: string }[];
  channels(): { id: string; name: string; kind: string; type?: number }[];
  roles(): { id: string; name: string }[];
}

let provider: (() => SlashFormContext | null) | null = null;
const waiting = new Map<string, (choices: FormChoice[]) => void>();

export function bindSlashFormContext(fn: (() => SlashFormContext | null) | null) {
  provider = fn;
}

/** Gateway autocomplete response. Returns true when a field was waiting for it. */
export function deliverAutocomplete(nonce: string, choices: unknown): boolean {
  const done = waiting.get(nonce);
  if (!done) return false;
  waiting.delete(nonce);
  done(autocompleteChoices(choices));
  return true;
}

const KIND_TYPE: Record<string, number> = { text: 0, dm: 1, voice: 2, group: 3, category: 4, announcement: 5, thread: 11, stage: 13, forum: 15, media: 16 };

function ensureStyle() {
  if (document.getElementById("lark-slash-form-style")) return;
  const style = document.createElement("style");
  style.id = "lark-slash-form-style";
  style.textContent = `
    #lark-slash-form { position: fixed; z-index: 45; left: 50%; bottom: 84px; transform: translateX(-50%);
      width: min(520px, calc(100vw - 24px)); max-height: min(560px, calc(100vh - 120px)); overflow: auto;
      padding: 12px; color: #fafafa; background: #09090b; border: 1px solid #27272a; border-radius: 6px; box-shadow: none;
      font-size: 13px; transition: opacity 120ms ease; }
    #lark-slash-form header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    #lark-slash-form header strong { font-size: 14px; }
    #lark-slash-form header span { color: #a1a1aa; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #lark-slash-form .sf-field { display: grid; gap: 4px; margin: 0 0 10px; }
    #lark-slash-form label { display: flex; gap: 6px; align-items: baseline; font-weight: 600; }
    #lark-slash-form label small { font-weight: 400; color: #a1a1aa; }
    #lark-slash-form .sf-req { color: #fafafa; }
    #lark-slash-form .sf-opt { color: #71717a; font-weight: 400; font-size: 11px; }
    #lark-slash-form input, #lark-slash-form select { width: 100%; box-sizing: border-box; padding: 6px 8px; color: #fafafa;
      background: #18181b; border: 1px solid #27272a; border-radius: 4px; font: inherit; transition: border-color 120ms ease; }
    #lark-slash-form input:focus, #lark-slash-form select:focus { outline: none; border-color: #fafafa; }
    #lark-slash-form input[type="checkbox"] { width: auto; }
    #lark-slash-form .sf-problem { color: #f87171; font-size: 11px; min-height: 0; }
    #lark-slash-form .sf-choices { display: grid; gap: 2px; }
    #lark-slash-form .sf-choices button { text-align: left; padding: 4px 8px; border: 0; border-radius: 4px; background: #18181b; color: #fafafa; cursor: pointer; }
    #lark-slash-form .sf-choices button:hover { background: #27272a; }
    #lark-slash-form footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    #lark-slash-form footer button { padding: 6px 12px; border-radius: 4px; border: 1px solid #27272a; background: transparent; color: #fafafa; cursor: pointer; transition: background 120ms ease; }
    #lark-slash-form footer .sf-send { background: #fafafa; color: #09090b; border-color: #fafafa; }
    #lark-slash-form footer .sf-send:disabled { opacity: 0.4; cursor: default; }
  `;
  document.head.append(style);
}

export function closeSlashForm() {
  document.getElementById("lark-slash-form")?.remove();
}

/** Open the options form for a command in the current channel. */
export function openSlashForm(command: FormCommand, channelId?: string | null) {
  if (typeof document === "undefined") return;
  const ctx = provider?.();
  if (!ctx) return;
  const target = { channelId: channelId ?? ctx.channelId ?? "", guildId: ctx.guildId };
  if (!target.channelId) {
    ctx.toast("Apps", "Open a channel first.");
    return;
  }
  ensureStyle();
  closeSlashForm();
  const panel = el("form");
  panel.id = "lark-slash-form";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `/${command.name} options`);
  panel.noValidate = true;
  const paths = subcommandPaths(command);
  let path = paths[0] ?? [];
  const values: FormValues = {};
  const body = el("div");
  const send = el("button", "sf-send", "Send");
  send.type = "submit";
  const head = el("header");
  head.append(el("strong", "", `/${command.name}`));
  const describe = el("span", "", "");
  head.append(describe);
  panel.append(head);
  if (paths.length) {
    const pick = el("select");
    pick.setAttribute("aria-label", "Subcommand");
    for (const item of paths) {
      const option = el("option", "", item.join(" "));
      option.value = item.join(" ");
      pick.append(option);
    }
    pick.addEventListener("change", () => {
      path = pick.value.split(" ");
      for (const key of Object.keys(values)) delete values[key];
      paint();
    });
    const wrap = el("div", "sf-field");
    wrap.append(pick);
    panel.append(wrap);
  }
  panel.append(body);
  const foot = el("footer");
  const cancel = el("button", "", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", closeSlashForm);
  foot.append(cancel, send);
  panel.append(foot);
  const problems = new Map<string, HTMLElement>();

  const refresh = (touched?: string) => {
    const fields = fieldsFor(command, path);
    const found = formProblems(fields, values);
    for (const [name, node] of problems) {
      const problem = found[name] ?? "";
      const show = name === touched || node.dataset.shown === "1" || (problem && problem !== "Required");
      node.textContent = show ? problem : "";
      if (name === touched) node.dataset.shown = "1";
    }
    send.disabled = Object.keys(found).length > 0;
  };

  const paint = () => {
    body.replaceChildren();
    problems.clear();
    const sub = path.length ? findSub(command, path) : null;
    describe.textContent = sub?.description ?? "";
    const fields = fieldsFor(command, path);
    if (!fields.length) body.append(el("p", "sf-opt", "No options. Send runs it."));
    for (const field of fields) body.append(fieldRow(field));
    refresh();
    body.querySelector<HTMLElement>("input, select")?.focus();
  };

  const fieldRow = (field: FormOption) => {
    const row = el("div", "sf-field");
    const label = el("label");
    const id = `sf-${field.name}`;
    label.htmlFor = id;
    label.append(document.createTextNode(field.name));
    label.append(field.required ? el("span", "sf-req", "*") : el("span", "sf-opt", "optional"));
    if (field.description) label.append(el("small", "", field.description));
    row.append(label);
    const problem = el("div", "sf-problem");
    problems.set(field.name, problem);
    const set = (value: string | number | boolean) => {
      if (value === "") delete values[field.name];
      else values[field.name] = value;
      refresh(field.name);
    };
    const control = controlFor(field, ctx, set, (input, list) => autocomplete(field, input, list));
    const focusable = control.matches("input, select") ? control : control.querySelector("input, select");
    if (focusable) focusable.id = id;
    row.append(control, problem);
    return row;
  };

  let acTimer = 0;
  const autocomplete = (field: FormOption, input: HTMLInputElement, list: HTMLElement) => {
    window.clearTimeout(acTimer);
    acTimer = window.setTimeout(() => {
      if (ctx.demo) return;
      const nonce = ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();
      const payload = autocompleteBody(command, path, values, field.name, target, nonce);
      if (!payload) return;
      waiting.set(nonce, (choices) => {
        list.replaceChildren();
        for (const choice of choices) {
          const button = el("button", "", choice.name);
          button.type = "button";
          button.addEventListener("click", () => {
            input.value = String(choice.value);
            values[field.name] = choice.value;
            list.replaceChildren();
            refresh(field.name);
          });
          list.append(button);
        }
      });
      window.setTimeout(() => waiting.delete(nonce), 5000);
      void ctx.invoke("invoke_command", { payload }).catch(() => waiting.delete(nonce));
    }, 250);
  };

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSlashForm();
    }
  });
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    for (const node of problems.values()) node.dataset.shown = "1";
    refresh();
    const payload = formInteractionBody(command, path, values, target);
    if (!payload) return;
    if (ctx.demo) {
      ctx.toast("Apps", "Demo mode doesn't run Discord apps.");
      return;
    }
    send.disabled = true;
    void ctx.invoke("invoke_command", { payload }).then(() => {
      ctx.toast("Apps", `/${[command.name, ...path].join(" ")} sent.`);
      closeSlashForm();
    }).catch((error) => {
      send.disabled = false;
      ctx.toast("Apps", error instanceof Error ? error.message : "Discord refused the command.");
    });
  });
  document.body.append(panel);
  paint();
}

function findSub(command: FormCommand, path: string[]): FormOption | null {
  let list = command.options;
  let hit: FormOption | null = null;
  for (const step of path) {
    hit = list.find((option) => option.name === step) ?? null;
    if (!hit) return null;
    list = hit.options ?? [];
  }
  return hit;
}

function selectOf(items: { value: string; label: string }[], set: (value: string) => void, required: boolean): HTMLSelectElement {
  const select = el("select");
  const blank = el("option", "", required ? "Choose…" : "None");
  blank.value = "";
  select.append(blank);
  for (const item of items) {
    const option = el("option", "", item.label);
    option.value = item.value;
    select.append(option);
  }
  select.addEventListener("change", () => set(select.value));
  return select;
}

function controlFor(
  field: FormOption,
  ctx: SlashFormContext,
  set: (value: string | number | boolean) => void,
  suggest: (input: HTMLInputElement, list: HTMLElement) => void,
): HTMLElement {
  if (field.choices?.length) {
    return selectOf(field.choices.map((choice) => ({ value: String(choice.value), label: choice.name })), (value) => {
      const hit = field.choices?.find((choice) => String(choice.value) === value);
      set(hit ? hit.value : "");
    }, field.required);
  }
  switch (field.type) {
    case OPTION.BOOLEAN:
      return selectOf([{ value: "true", label: "True" }, { value: "false", label: "False" }], (value) => set(value === "" ? "" : value === "true"), field.required);
    case OPTION.USER:
      return selectOf(ctx.people().map((p) => ({ value: p.id, label: p.name })), set, field.required);
    case OPTION.ROLE:
      return selectOf(ctx.roles().map((r) => ({ value: r.id, label: `@${r.name}` })), set, field.required);
    case OPTION.MENTIONABLE:
      return selectOf([
        ...ctx.people().map((p) => ({ value: p.id, label: p.name })),
        ...ctx.roles().map((r) => ({ value: r.id, label: `@${r.name}` })),
      ], set, field.required);
    case OPTION.CHANNEL: {
      const allowed = field.channelTypes;
      const list = ctx.channels().filter((c) => c.kind !== "category" || allowed?.includes(4)).filter((c) => {
        if (!allowed?.length) return true;
        const type = c.type ?? KIND_TYPE[c.kind];
        return type !== undefined && allowed.includes(type);
      });
      return selectOf(list.map((c) => ({ value: c.id, label: `#${c.name}` })), set, field.required);
    }
    case OPTION.ATTACHMENT: {
      const note = el("p", "sf-opt", "Attachments aren't supported in Lark yet. Run this command in Discord to attach a file.");
      return note;
    }
    default: {
      const wrap = el("div");
      const input = el("input");
      input.type = field.type === OPTION.INTEGER || field.type === OPTION.NUMBER ? "number" : "text";
      if (field.type === OPTION.INTEGER) input.step = "1";
      if (field.type === OPTION.NUMBER) input.step = "any";
      if (field.minValue !== undefined) input.min = String(field.minValue);
      if (field.maxValue !== undefined) input.max = String(field.maxValue);
      if (field.maxLength !== undefined) input.maxLength = field.maxLength;
      input.autocomplete = "off";
      const list = el("div", "sf-choices");
      input.addEventListener("input", () => {
        set(input.value);
        if (field.autocomplete) suggest(input, list);
      });
      if (field.autocomplete) input.addEventListener("focus", () => suggest(input, list));
      wrap.append(input, list);
      return wrap;
    }
  }
}
