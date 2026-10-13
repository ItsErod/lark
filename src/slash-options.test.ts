import { describe, expect, it } from "vitest";
import { autocompleteBody, autocompleteChoices, fieldProblem, fieldsFor, formInteractionBody, formProblems, needsForm, parseFormOptions, subcommandPaths, type FormCommand } from "./slash-options";

const base = { id: "100000000000000010", applicationId: "100000000000000020", name: "poll", type: 1, version: "7" };
const target = { channelId: "100000000000000030", guildId: "100000000000000040" };

const flat: FormCommand = {
  ...base,
  options: parseFormOptions([
    { type: 3, name: "question", required: true, max_length: 20 },
    { type: 4, name: "hours", minValue: 1, maxValue: 24 },
    { type: 5, name: "anon" },
    { type: 6, name: "who" },
    { type: 7, name: "where", channelTypes: [0] },
    { type: 8, name: "role" },
    { type: 3, name: "kind", choices: [{ name: "Yes/No", value: "yn" }, { name: "Bad", value: {} }] },
    { type: 10, name: "weight" },
  ]),
};

const nested: FormCommand = {
  ...base,
  options: parseFormOptions([
    { type: 1, name: "make", options: [{ type: 3, name: "topic", required: true, autocomplete: true }] },
    { type: 2, name: "admin", options: [{ type: 1, name: "reset", options: [{ type: 11, name: "file" }] }] },
  ]),
};

describe("slash options form model", () => {
  it("keeps choices, limits, and drops bad choices", () => {
    expect(flat.options[0].maxLength).toBe(20);
    expect(flat.options[1].maxValue).toBe(24);
    expect(flat.options[4].channelTypes).toEqual([0]);
    expect(flat.options[6].choices).toEqual([{ name: "Yes/No", value: "yn" }]);
    expect(needsForm(flat)).toBe(true);
    expect(needsForm({ ...base, options: parseFormOptions([{ type: 3, name: "opt" }]) })).toBe(false);
  });

  it("builds a type 2 interaction with typed values", () => {
    const body = formInteractionBody(flat, [], { question: "Lunch?", hours: "3", anon: true, who: "<@!100000000000000050>", where: "100000000000000060", role: "100000000000000070", kind: "yn", weight: "1.5" }, target);
    expect(body).toMatchObject({ type: 2, application_id: base.applicationId, channel_id: target.channelId, guild_id: target.guildId });
    const data = body!.data as { id: string; version: string; options: { name: string; type: number; value: unknown }[] };
    expect(data.version).toBe("7");
    expect(data.options).toEqual([
      { type: 3, name: "question", value: "Lunch?" },
      { type: 4, name: "hours", value: 3 },
      { type: 5, name: "anon", value: true },
      { type: 6, name: "who", value: "100000000000000050" },
      { type: 7, name: "where", value: "100000000000000060" },
      { type: 8, name: "role", value: "100000000000000070" },
      { type: 3, name: "kind", value: "yn" },
      { type: 10, name: "weight", value: 1.5 },
    ]);
  });

  it("honours required fields and limits", () => {
    expect(formInteractionBody(flat, [], {}, target)).toBeNull();
    expect(formProblems(flat.options, { question: "ok" })).toEqual({});
    expect(fieldProblem(flat.options[1], "30")).toContain("from 1 to 24");
    expect(fieldProblem(flat.options[1], "2.5")).toContain("whole number");
    expect(fieldProblem(flat.options[0], "x".repeat(21))).toContain("characters");
    expect(fieldProblem(flat.options[6], "nope")).toContain("choices");
    expect(fieldProblem(flat.options[0], "")).toBe("Required");
  });

  it("wraps subcommands and groups", () => {
    expect(subcommandPaths(nested)).toEqual([["make"], ["admin", "reset"]]);
    expect(needsForm(nested)).toBe(true);
    expect(fieldsFor(nested, ["make"]).map((o) => o.name)).toEqual(["topic"]);
    const body = formInteractionBody(nested, ["make"], { topic: "games" }, target);
    expect((body!.data as { options: unknown }).options).toEqual([{ type: 1, name: "make", options: [{ type: 3, name: "topic", value: "games" }] }]);
    const group = formInteractionBody(nested, ["admin", "reset"], {}, target);
    expect((group!.data as { options: unknown }).options).toEqual([{ type: 2, name: "admin", options: [{ type: 1, name: "reset", options: [] }] }]);
  });

  it("refuses required attachments with a clear reason", () => {
    const cmd: FormCommand = { ...base, options: parseFormOptions([{ type: 11, name: "file", required: true }]) };
    expect(fieldProblem(cmd.options[0], undefined)).toContain("Attachments");
    expect(formInteractionBody(cmd, [], {}, target)).toBeNull();
  });

  it("builds autocomplete payloads with the focused field", () => {
    const body = autocompleteBody(nested, ["make"], { topic: "ga" }, "topic", target, "123");
    expect(body).toMatchObject({ type: 4, nonce: "123" });
    expect((body!.data as { options: unknown }).options).toEqual([{ type: 1, name: "make", options: [{ type: 3, name: "topic", value: "ga", focused: true }] }]);
    expect(autocompleteChoices([{ name: "Games", value: "games" }, { name: 1 }])).toEqual([{ name: "Games", value: "games" }]);
  });
});
