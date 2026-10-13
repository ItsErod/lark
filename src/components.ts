/**
 * Bot message components (action rows, buttons, select menus, text inputs):
 * parsing Discord's component JSON and building component (type 3) and
 * modal-submit (type 5) interaction payloads.
 */

export const COMPONENT = {
  ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
} as const;

export interface ButtonModel {
  kind: "button";
  style: number;
  label: string;
  emoji: string;
  customId: string;
  url: string;
  disabled: boolean;
}

export interface SelectModel {
  kind: "select";
  type: number;
  customId: string;
  placeholder: string;
  minValues: number;
  maxValues: number;
  disabled: boolean;
  options: { label: string; value: string; description: string; emoji: string; default: boolean }[];
  channelTypes: number[];
}

export interface TextInputModel {
  kind: "text";
  customId: string;
  label: string;
  style: number;
  placeholder: string;
  value: string;
  required: boolean;
  minLength: number;
  maxLength: number;
}

export type ComponentModel = ButtonModel | SelectModel | TextInputModel;

const SNOWFLAKE = /^\d{5,22}$/;

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function int(row: Record<string, unknown>, key: string, fallback: number): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function emojiText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const emoji = raw as Record<string, unknown>;
  if (typeof emoji.id === "string" && emoji.id) return typeof emoji.name === "string" ? `:${emoji.name}:` : "";
  return typeof emoji.name === "string" ? emoji.name : "";
}

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "discord:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function parseOne(raw: unknown): ComponentModel | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = int(row, "type", 0);
  if (type === COMPONENT.BUTTON) {
    const style = int(row, "style", 2);
    const url = style === 5 ? safeUrl(str(row, "url")) : "";
    const customId = str(row, "custom_id");
    if (style === 5 && !url) return null;
    if (style !== 5 && style !== 6 && !customId) return null;
    return {
      kind: "button",
      style,
      label: str(row, "label"),
      emoji: emojiText(row.emoji),
      customId,
      url,
      disabled: row.disabled === true || style === 6,
    };
  }
  if (type === COMPONENT.STRING_SELECT || (type >= COMPONENT.USER_SELECT && type <= COMPONENT.CHANNEL_SELECT)) {
    const customId = str(row, "custom_id");
    if (!customId) return null;
    const options = Array.isArray(row.options) ? row.options.slice(0, 25).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const o = item as Record<string, unknown>;
      const value = str(o, "value");
      if (!value) return [];
      return [{ label: str(o, "label") || value, value, description: str(o, "description"), emoji: emojiText(o.emoji), default: o.default === true }];
    }) : [];
    if (type === COMPONENT.STRING_SELECT && !options.length) return null;
    const minValues = Math.max(0, Math.min(25, int(row, "min_values", 1)));
    const maxValues = Math.max(1, Math.min(25, int(row, "max_values", 1), type === COMPONENT.STRING_SELECT ? options.length : 25));
    return {
      kind: "select",
      type,
      customId,
      placeholder: str(row, "placeholder"),
      minValues: Math.min(minValues, maxValues),
      maxValues,
      disabled: row.disabled === true,
      options,
      channelTypes: Array.isArray(row.channel_types) ? row.channel_types.filter((t): t is number => typeof t === "number") : [],
    };
  }
  if (type === COMPONENT.TEXT_INPUT) {
    const customId = str(row, "custom_id");
    if (!customId) return null;
    return {
      kind: "text",
      customId,
      label: str(row, "label") || customId,
      style: int(row, "style", 1),
      placeholder: str(row, "placeholder"),
      value: str(row, "value"),
      required: row.required !== false,
      minLength: Math.max(0, int(row, "min_length", 0)),
      maxLength: Math.min(4000, int(row, "max_length", 4000)),
    };
  }
  return null;
}

/** Rows of components a message or modal carries. Unknown component types are skipped. */
export function parseComponentRows(raw: unknown): ComponentModel[][] {
  if (!Array.isArray(raw)) return [];
  const rows: ComponentModel[][] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (int(row, "type", 0) !== COMPONENT.ROW) {
      const single = parseOne(item);
      if (single) rows.push([single]);
      continue;
    }
    const children = Array.isArray(row.components) ? row.components.slice(0, 5).map(parseOne).filter((c): c is ComponentModel => c !== null) : [];
    if (children.length) rows.push(children);
  }
  return rows;
}

export interface ComponentTarget {
  messageId: string;
  channelId: string;
  guildId?: string | null;
  applicationId: string;
  messageFlags?: number;
}

export function interactionNonce(): string {
  return ((BigInt(Date.now()) - 1420070400000n) << 22n | BigInt(Math.floor(Math.random() * 4096))).toString();
}

/** Component interaction (type 3). values only for select menus. */
export function componentInteraction(target: ComponentTarget, component: { customId: string; type: number }, values?: string[], nonce = interactionNonce()): Record<string, unknown> | null {
  if (!SNOWFLAKE.test(target.messageId) || !SNOWFLAKE.test(target.channelId) || !SNOWFLAKE.test(target.applicationId) || !component.customId) return null;
  const data: Record<string, unknown> = { component_type: component.type, custom_id: component.customId };
  if (component.type !== COMPONENT.BUTTON) data.values = (values ?? []).slice(0, 25);
  const body: Record<string, unknown> = {
    type: 3,
    nonce,
    channel_id: target.channelId,
    message_id: target.messageId,
    message_flags: target.messageFlags ?? 0,
    application_id: target.applicationId,
    data,
  };
  if (target.guildId && SNOWFLAKE.test(target.guildId)) body.guild_id = target.guildId;
  return body;
}

export interface ModalModel {
  interactionId: string;
  customId: string;
  title: string;
  applicationId: string;
  rows: TextInputModel[];
}

export function parseModal(raw: unknown): ModalModel | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const customId = str(row, "customId") || str(row, "custom_id");
  const interactionId = str(row, "interactionId") || str(row, "id");
  const applicationId = str(row, "applicationId") || str(row, "application_id");
  if (!customId || !SNOWFLAKE.test(interactionId) || !SNOWFLAKE.test(applicationId)) return null;
  const inputs = parseComponentRows(row.components).flat().filter((c): c is TextInputModel => c.kind === "text");
  if (!inputs.length) return null;
  return { interactionId, customId, title: str(row, "title") || "Form", applicationId, rows: inputs.slice(0, 5) };
}

/** Problem with one text input value, or "". */
export function textInputProblem(input: TextInputModel, value: string): string {
  if (!value) return input.required ? "Required" : "";
  if (value.length < input.minLength) return `At least ${input.minLength} characters`;
  if (value.length > input.maxLength) return `At most ${input.maxLength} characters`;
  return "";
}

/** Modal submit (type 5), or null when a value is invalid. */
export function modalSubmit(modal: ModalModel, values: Record<string, string>, target: { channelId: string; guildId?: string | null }, nonce = interactionNonce()): Record<string, unknown> | null {
  if (!SNOWFLAKE.test(target.channelId)) return null;
  if (modal.rows.some((input) => textInputProblem(input, values[input.customId] ?? ""))) return null;
  const body: Record<string, unknown> = {
    type: 5,
    nonce,
    application_id: modal.applicationId,
    channel_id: target.channelId,
    data: {
      id: modal.interactionId,
      custom_id: modal.customId,
      components: modal.rows.map((input) => ({ type: COMPONENT.ROW, components: [{ type: COMPONENT.TEXT_INPUT, custom_id: input.customId, value: values[input.customId] ?? "" }] })),
    },
  };
  if (target.guildId && SNOWFLAKE.test(target.guildId)) body.guild_id = target.guildId;
  return body;
}
