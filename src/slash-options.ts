/**
 * Slash command option model for the options form: parsing Discord option
 * metadata, validating form values, and building interaction payloads.
 */

export const OPTION = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
} as const;

export interface FormChoice {
  name: string;
  value: string | number;
}

export interface FormOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
  choices?: FormChoice[];
  autocomplete?: boolean;
  options?: FormOption[];
  channelTypes?: number[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface FormCommand {
  id: string;
  applicationId: string;
  name: string;
  type: number;
  version: string;
  options: FormOption[];
}

export type FormValues = Record<string, string | number | boolean>;

const SNOWFLAKE = /^\d{5,22}$/;

function num(record: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const value = record[camel] ?? record[snake];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Parse option metadata (camelCase from the desktop shell, or Discord's snake_case). */
export function parseFormOptions(list: unknown, depth = 0): FormOption[] {
  if (!Array.isArray(list)) return [];
  const out: FormOption[] = [];
  for (const item of list.slice(0, 25)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name) continue;
    const type = typeof row.type === "number" ? row.type : typeof row.typeId === "number" ? row.typeId : OPTION.STRING;
    const option: FormOption = {
      name,
      description: typeof row.description === "string" ? row.description : "",
      type,
      required: row.required === true,
    };
    const choices = Array.isArray(row.choices) ? row.choices.flatMap((choice): FormChoice[] => {
      if (!choice || typeof choice !== "object") return [];
      const c = choice as Record<string, unknown>;
      if (typeof c.name !== "string") return [];
      if (typeof c.value !== "string" && typeof c.value !== "number") return [];
      return [{ name: c.name, value: c.value }];
    }).slice(0, 25) : [];
    if (choices.length) option.choices = choices;
    if (row.autocomplete === true) option.autocomplete = true;
    if ((type === OPTION.SUB_COMMAND || type === OPTION.SUB_COMMAND_GROUP) && depth < 2) {
      const children = parseFormOptions(row.options, depth + 1);
      if (children.length) option.options = children;
    }
    const channelTypes = row.channelTypes ?? row.channel_types;
    if (Array.isArray(channelTypes)) {
      const types = channelTypes.filter((t): t is number => typeof t === "number");
      if (types.length) option.channelTypes = types;
    }
    const minValue = num(row, "minValue", "min_value");
    const maxValue = num(row, "maxValue", "max_value");
    const minLength = num(row, "minLength", "min_length");
    const maxLength = num(row, "maxLength", "max_length");
    if (minValue !== undefined) option.minValue = minValue;
    if (maxValue !== undefined) option.maxValue = maxValue;
    if (minLength !== undefined) option.minLength = minLength;
    if (maxLength !== undefined) option.maxLength = maxLength;
    out.push(option);
  }
  return out;
}

/** Subcommand paths a command offers, e.g. [["make"], ["admin", "reset"]]. Empty when it has none. */
export function subcommandPaths(command: FormCommand): string[][] {
  const paths: string[][] = [];
  for (const option of command.options) {
    if (option.type === OPTION.SUB_COMMAND) paths.push([option.name]);
    if (option.type === OPTION.SUB_COMMAND_GROUP) {
      for (const child of option.options ?? []) {
        if (child.type === OPTION.SUB_COMMAND) paths.push([option.name, child.name]);
      }
    }
  }
  return paths;
}

/** The value fields shown for a subcommand path (or the command itself). */
export function fieldsFor(command: FormCommand, path: string[]): FormOption[] {
  let list = command.options;
  for (const step of path) {
    const next = list.find((option) => option.name === step && (option.type === OPTION.SUB_COMMAND || option.type === OPTION.SUB_COMMAND_GROUP));
    if (!next) return [];
    list = next.options ?? [];
  }
  return list.filter((option) => option.type !== OPTION.SUB_COMMAND && option.type !== OPTION.SUB_COMMAND_GROUP);
}

/** True when running the command needs the form (subcommands or any required field). */
export function needsForm(command: FormCommand): boolean {
  if (subcommandPaths(command).length) return true;
  return command.options.some((option) => option.required);
}

/** Convert one raw form value to the wire value. null means invalid. */
export function coerceFormValue(option: FormOption, raw: string | number | boolean): string | number | boolean | null {
  switch (option.type) {
    case OPTION.BOOLEAN:
      if (typeof raw === "boolean") return raw;
      if (/^(true|yes|1)$/i.test(String(raw))) return true;
      if (/^(false|no|0)$/i.test(String(raw))) return false;
      return null;
    case OPTION.INTEGER:
    case OPTION.NUMBER: {
      const value = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(value) || String(raw).trim() === "") return null;
      if (option.type === OPTION.INTEGER && !Number.isInteger(value)) return null;
      if (option.minValue !== undefined && value < option.minValue) return null;
      if (option.maxValue !== undefined && value > option.maxValue) return null;
      return value;
    }
    case OPTION.USER:
    case OPTION.CHANNEL:
    case OPTION.ROLE:
    case OPTION.MENTIONABLE: {
      const id = String(raw).trim().replace(/^<[@#]?[!&]?(\d+)>$/, "$1");
      return SNOWFLAKE.test(id) ? id : null;
    }
    case OPTION.ATTACHMENT:
      return null;
    default: {
      const text = String(raw);
      if (option.choices?.length) {
        const hit = option.choices.find((choice) => String(choice.value) === text);
        return hit ? hit.value : null;
      }
      if (option.minLength !== undefined && text.length < option.minLength) return null;
      if (option.maxLength !== undefined && text.length > option.maxLength) return null;
      return text;
    }
  }
}

/** Plain-language problem with one field, or "" when it is fine. */
export function fieldProblem(option: FormOption, raw: string | number | boolean | undefined): string {
  const empty = raw === undefined || raw === "";
  if (option.type === OPTION.ATTACHMENT) return option.required ? "Attachments aren't supported yet. Run this one in Discord." : "";
  if (empty) return option.required ? "Required" : "";
  if (coerceFormValue(option, raw) !== null) return "";
  if (option.type === OPTION.INTEGER) return "Enter a whole number" + range(option);
  if (option.type === OPTION.NUMBER) return "Enter a number" + range(option);
  if (option.type === OPTION.USER || option.type === OPTION.MENTIONABLE) return "Pick someone";
  if (option.type === OPTION.CHANNEL) return "Pick a channel";
  if (option.type === OPTION.ROLE) return "Pick a role";
  if (option.choices?.length) return "Pick one of the choices";
  if (option.minLength !== undefined || option.maxLength !== undefined) return `Use ${option.minLength ?? 0}–${option.maxLength ?? 6000} characters`;
  return "Check this value";
}

function range(option: FormOption): string {
  if (option.minValue !== undefined && option.maxValue !== undefined) return ` from ${option.minValue} to ${option.maxValue}`;
  if (option.minValue !== undefined) return ` of at least ${option.minValue}`;
  if (option.maxValue !== undefined) return ` up to ${option.maxValue}`;
  return "";
}

/** Every field problem, keyed by option name. Empty object means the form can be sent. */
export function formProblems(fields: FormOption[], values: FormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const problem = fieldProblem(field, values[field.name]);
    if (problem) out[field.name] = problem;
  }
  return out;
}

function wrapPath(command: FormCommand, path: string[], leaf: Record<string, unknown>[]): Record<string, unknown>[] {
  let options = leaf;
  let list = command.options;
  const steps: { name: string; type: number }[] = [];
  for (const step of path) {
    const next = list.find((option) => option.name === step);
    if (!next) break;
    steps.push({ name: next.name, type: next.type });
    list = next.options ?? [];
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) options = [{ type: steps[i].type, name: steps[i].name, options }];
  return options;
}

function nonce(): string {
  return ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();
}

interface Target {
  channelId: string;
  guildId?: string | null;
}

function envelope(type: number, command: FormCommand, target: Target, options: Record<string, unknown>[], id: string) {
  const data: Record<string, unknown> = { id: command.id, name: command.name, type: command.type || 1, options };
  if (command.version) data.version = command.version;
  const body: Record<string, unknown> = { type, application_id: command.applicationId, channel_id: target.channelId, data, nonce: id };
  if (target.guildId && SNOWFLAKE.test(target.guildId)) body.guild_id = target.guildId;
  return body;
}

/** Application command (type 2) payload from form values, or null when a field is invalid. */
export function formInteractionBody(command: FormCommand, path: string[], values: FormValues, target: Target): Record<string, unknown> | null {
  if (!command.id || !command.applicationId || !target.channelId) return null;
  const fields = fieldsFor(command, path);
  if (Object.keys(formProblems(fields, values)).length) return null;
  const leaf: Record<string, unknown>[] = [];
  for (const field of fields) {
    const raw = values[field.name];
    if (raw === undefined || raw === "") continue;
    const value = coerceFormValue(field, raw);
    if (value === null) return null;
    leaf.push({ type: field.type, name: field.name, value });
  }
  return envelope(2, command, target, wrapPath(command, path, leaf), nonce());
}

/** Autocomplete (type 4) payload: current values plus the focused field as typed text. */
export function autocompleteBody(command: FormCommand, path: string[], values: FormValues, focused: string, target: Target, id = nonce()): Record<string, unknown> | null {
  if (!command.id || !command.applicationId || !target.channelId) return null;
  const fields = fieldsFor(command, path);
  const leaf: Record<string, unknown>[] = [];
  for (const field of fields) {
    const raw = values[field.name];
    if (field.name === focused) {
      leaf.push({ type: field.type, name: field.name, value: String(raw ?? ""), focused: true });
      continue;
    }
    if (raw === undefined || raw === "") continue;
    const value = coerceFormValue({ ...field, autocomplete: false, choices: undefined }, raw);
    if (value !== null) leaf.push({ type: field.type, name: field.name, value });
  }
  return envelope(4, command, target, wrapPath(command, path, leaf), id);
}

/** Choices from an autocomplete response, capped at 25. */
export function autocompleteChoices(raw: unknown): FormChoice[] {
  return parseFormOptions([{ name: "x", choices: raw }])[0]?.choices ?? [];
}
