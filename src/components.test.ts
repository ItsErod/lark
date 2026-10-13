import { describe, expect, it } from "vitest";
import { componentInteraction, modalSubmit, parseComponentRows, parseModal, textInputProblem } from "./components";

const ids = { messageId: "100000000000000001", channelId: "100000000000000002", guildId: "100000000000000003", applicationId: "100000000000000004" };

describe("bot components", () => {
  it("parses buttons of every style and drops unsafe ones", () => {
    const rows = parseComponentRows([{ type: 1, components: [
      { type: 2, style: 1, label: "Go", custom_id: "go" },
      { type: 2, style: 3, label: "Yes", custom_id: "yes", emoji: { name: "✅" } },
      { type: 2, style: 4, label: "No", custom_id: "no", disabled: true },
      { type: 2, style: 5, label: "Docs", url: "https://example.com/docs" },
      { type: 2, style: 5, label: "Bad", url: "javascript:alert(1)" },
    ] }, { type: 1, components: [
      { type: 2, style: 6, sku_id: "1" },
      { type: 2, style: 2, label: "No id" },
    ] }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((c) => c.kind === "button" && c.style)).toEqual([1, 3, 4, 5]);
    expect(rows[0][2]).toMatchObject({ disabled: true });
    expect(rows[1]).toHaveLength(1);
    expect(rows[1][0]).toMatchObject({ style: 6, disabled: true });
    expect(rows[0][1]).toMatchObject({ emoji: "✅" });
  });

  it("parses string and entity selects with limits", () => {
    const rows = parseComponentRows([
      { type: 1, components: [{ type: 3, custom_id: "pick", min_values: 1, max_values: 5, options: [{ label: "A", value: "a" }, { label: "B", value: "b", default: true }] }] },
      { type: 1, components: [{ type: 8, custom_id: "where", channel_types: [0] }] },
      { type: 1, components: [{ type: 3, custom_id: "empty", options: [] }] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toMatchObject({ kind: "select", maxValues: 2, minValues: 1 });
    expect(rows[1][0]).toMatchObject({ kind: "select", type: 8, channelTypes: [0] });
  });

  it("builds component interactions", () => {
    const button = componentInteraction({ ...ids, messageFlags: 64 }, { customId: "go", type: 2 }, undefined, "9");
    expect(button).toEqual({ type: 3, nonce: "9", channel_id: ids.channelId, message_id: ids.messageId, message_flags: 64, application_id: ids.applicationId, guild_id: ids.guildId, data: { component_type: 2, custom_id: "go" } });
    const select = componentInteraction(ids, { customId: "pick", type: 3 }, ["a", "b"], "10");
    expect(select?.data).toEqual({ component_type: 3, custom_id: "pick", values: ["a", "b"] });
    expect(componentInteraction({ ...ids, applicationId: "x" }, { customId: "go", type: 2 })).toBeNull();
  });

  it("parses modals and builds a modal submit", () => {
    const modal = parseModal({ interactionId: "100000000000000009", customId: "feedback", title: "Feedback", applicationId: ids.applicationId, components: [
      { type: 1, components: [{ type: 4, custom_id: "name", label: "Name", style: 1, min_length: 2 }] },
      { type: 1, components: [{ type: 4, custom_id: "body", label: "Details", style: 2, required: false }] },
    ] });
    expect(modal?.rows.map((r) => r.customId)).toEqual(["name", "body"]);
    expect(textInputProblem(modal!.rows[0], "")).toBe("Required");
    expect(textInputProblem(modal!.rows[0], "a")).toContain("At least 2");
    expect(modalSubmit(modal!, { name: "a" }, ids)).toBeNull();
    const body = modalSubmit(modal!, { name: "Ethan", body: "" }, ids, "11");
    expect(body).toMatchObject({ type: 5, nonce: "11", application_id: ids.applicationId, guild_id: ids.guildId });
    expect(body?.data).toEqual({ id: "100000000000000009", custom_id: "feedback", components: [
      { type: 1, components: [{ type: 4, custom_id: "name", value: "Ethan" }] },
      { type: 1, components: [{ type: 4, custom_id: "body", value: "" }] },
    ] });
  });
});
