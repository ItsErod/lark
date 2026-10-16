import { describe, expect, it } from "vitest";
import { catalogSize, ensurePhrases, hasPhrase, localizeTree, setLocale, t } from "./i18n";
import { phrases } from "./i18n-phrases";
import { cjkPhrases } from "./i18n-cjk";
import { LANGUAGES } from "./user-settings";

class FakeLabel {
  dataset: Record<string, string> = {};
  children: FakeLabel[];
  childNodes: { nodeType: number; textContent: string }[] = [];
  attrs: Record<string, string> = {};
  private text: string;

  constructor(text: string, children: FakeLabel[] = []) {
    this.text = text;
    this.children = children;
    if (text && children.length === 0) this.childNodes = [{ nodeType: 3, textContent: text }];
  }

  get childElementCount() {
    return this.children.length;
  }

  get textContent() {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
    this.childNodes = [{ nodeType: 3, textContent: value }];
  }

  getAttribute(name: string) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
}

function fakeLabel(text: string, children: FakeLabel[] = []) {
  return new FakeLabel(text, children);
}

describe("i18n", () => {
  it("keeps English and switches the same source live", async () => {
    await ensurePhrases();
    setLocale("en");
    expect(t("Friends")).toBe("Friends");
    expect(t("Not a chrome string")).toBe("Not a chrome string");
    setLocale("fr");
    expect(t("Friends")).toBe("Amis");
    expect(t("Inbox")).toBe("Boîte de réception");
    setLocale("es");
    expect(t("Friends")).toBe("Amigos");
    setLocale("de");
    expect(t("Friends")).toBe("Freunde");
    setLocale("pt-BR");
    expect(t("Friends")).toBe("Amigos");
    expect(t("Kick")).toBe("Expulsar");
    setLocale("en-GB");
    expect(t("Friends")).toBe("Friends");
    expect(catalogSize("fr")).toBeGreaterThan(80);
    expect(catalogSize("es")).toBe(catalogSize("fr"));
    expect(catalogSize("de")).toBe(catalogSize("fr"));
    expect(catalogSize("pt-BR")).toBe(catalogSize("fr"));
    expect(catalogSize("fr")).toBeGreaterThan(400);
    for (const row of Object.values(phrases)) {
      expect(row).toHaveLength(4);
      for (const cell of row) expect(cell.length).toBeGreaterThan(0);
    }
    setLocale("de");
    expect(t("No direct messages yet.")).toBe("Noch keine Direktnachrichten.");
    setLocale("en");
  });

  it("ships a catalog for every listed language", async () => {
    await ensurePhrases();
    for (const { id } of LANGUAGES) {
      if (id === "en" || id === "en-GB") continue;
      expect(catalogSize(id), id).toBeGreaterThan(300);
    }
    setLocale("ja");
    expect(t("Friends")).toBe("フレンド");
    setLocale("ko");
    expect(t("Settings")).toBe("설정");
    setLocale("zh-CN");
    expect(t("Search")).toBe("搜索");
    setLocale("en");
    for (const row of Object.values(cjkPhrases)) for (const cell of row) expect(cell.length).toBeGreaterThan(0);
  });

  it("rewrites a painted label without rebuilding the node", () => {
    const button = fakeLabel("Friends");
    const span = fakeLabel("Inbox");
    span.dataset.i18n = "Inbox";
    const root = fakeLabel("", [button, span]);
    setLocale("de");
    localizeTree(root as unknown as ParentNode);
    expect(button.textContent).toBe("Freunde");
    expect(span.textContent).toBe("Posteingang");
    setLocale("en");
    localizeTree(root as unknown as ParentNode);
    expect(button.textContent).toBe("Friends");
    expect(hasPhrase("Friends")).toBe(false);
  });
});
