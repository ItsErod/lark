import { PACK_IDS } from "../pack/state";
import { validPluginId } from "../plugins";
import {
  acceptBytes,
  APP_VERSION,
  browseStore,
  categoryLabel,
  entryUrl,
  findStoreItem, larkVersionOk,
  newerVersion,
  parseInstallUrl,
  parseStoreIndex,
  readLocalStore,
  sha256Hex,
  STORE_INDEX_URL,
  STORE_LOCAL_KEY,
  STORE_PAGE_URL,
  writeLocalStore,
  type InstalledRecord, type StoreItem
} from "../store";
import { storeSwatches } from "./store-swatches";
import {
  parseThemeCss, validateThemeCss
} from "../themes";
import { beginThemePreview, revertThemePreview, swapThemePreview } from "../theme-preview";
import { commandError } from "../signin";
import { el } from "./dom";
import {
  applyUserChrome
} from "../user-settings";
import { isTauri, invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const storeMethods = defineMethods({
  panePlugins(): HTMLElement {
    const wrap = el("div", "settings-stack");
    const head = this.late!.settingHead("Plugins and Themes", "Install from the store list, then turn an item on. Lark still runs with none installed.");
    const browse = el("button", "text-button", "Browse");
    browse.type = "button";
    browse.addEventListener("click", () => void this.openStorePage());
    head.append(browse);
    wrap.append(head);
    const card = this.late!.settingCard("Plugins");
    card.dataset.setting = "plugins.list";
    card.append(el("p", "setting-help", "Reading tools stay on this device. They never receive the token."));
    const pack = new Set<string>(PACK_IDS);
    const plugins = this.installed.filter((item) => item.kind === "plugin");
    const themes = this.installed.filter((item) => item.kind === "theme");
    const samples = plugins.filter((item) => !pack.has(item.id));
    const packed = plugins.filter((item) => pack.has(item.id));
    const paintPlugin = (item: InstalledRecord) => {
      const enabled = this.config.plugins.enabled.includes(item.id);
      card.append(this.switchRow(`plugin.${item.id}`, item.name || item.id, this.storeBlurb(item), enabled, (value) => this.setPluginEnabled(item.id, value)));
      card.append(this.storeActions(item));
      if (enabled) this.appendPluginPanel(card, item.id);
    };
    for (const item of samples) paintPlugin(item);
    if (packed.length) card.append(el("h3", "", "Pack"));
    for (const item of packed) paintPlugin(item);
    if (!plugins.length) card.append(el("p", "setting-help", "No plugins installed. Browse the store to add one."));
    const themeCard = this.late!.settingCard("Themes");
    themeCard.append(el("p", "setting-help", "One theme can be on. Turning it off keeps the built-in colours."));
    for (const item of themes) {
      const on = !this.preferBuiltin && this.config.appearance.theme === item.id;
      themeCard.append(this.switchRow(`theme.${item.id}`, item.name || item.id, this.storeBlurb(item), on, (value) => this.setThemeEnabled(item.id, value)));
      themeCard.append(this.storeActions(item));
    }
    if (!themes.length) themeCard.append(el("p", "setting-help", "No themes installed. The built-in colours stay on."));
    wrap.append(this.storeCatalogCard(), card, themeCard);
    return wrap;
  },
  storeCatalogCard(): HTMLElement {
    const card = this.late!.settingCard("Store");
    card.dataset.setting = "plugins.store";
    if (!this.storeIndex) {
      card.append(el("p", "setting-help", this.storeIndexTried ? "The store could not be reached." : "Loading the store…"));
      return card;
    }
    const index = this.storeIndex;
    const search = el("input", "store-search");
    search.type = "search";
    search.placeholder = "Search the store";
    search.setAttribute("aria-label", "Search the store");
    search.value = this.storeQuery;
    const chips = el("div", "store-chips");
    chips.setAttribute("role", "toolbar");
    chips.setAttribute("aria-label", "Store filters");
    const results = el("div", "store-results");
    const paint = () => {
      const browsed = browseStore(index, this.installed, {
        query: this.storeQuery,
        kind: this.storeKind,
        category: this.storeCategory,
      });
      if (this.storeCategory && !browsed.categories.includes(this.storeCategory)) this.storeCategory = "";
      chips.replaceChildren();
      for (const kind of ["all", "plugin", "theme"] as const) {
        const label = kind === "all" ? "All" : kind === "plugin" ? "Plugins" : "Themes";
        const button = el("button", "store-chip", label);
        button.type = "button";
        button.setAttribute("aria-pressed", this.storeKind === kind ? "true" : "false");
        button.addEventListener("click", () => {
          this.storeKind = kind;
          paint();
        });
        chips.append(button);
      }
      for (const category of browsed.categories) {
        const button = el("button", "store-chip", categoryLabel(category));
        button.type = "button";
        button.setAttribute("aria-pressed", this.storeCategory === category ? "true" : "false");
        button.addEventListener("click", () => {
          this.storeCategory = this.storeCategory === category ? "" : category;
          paint();
        });
        chips.append(button);
      }
      results.replaceChildren();
      if (this.themePreview) {
        const name = index.themes.find((item) => item.id === this.themePreview?.id)?.name ?? this.themePreview.id;
        const bar = el("div", "store-preview");
        bar.append(el("span", "", `Previewing ${name}. Nothing is installed.`));
        const revert = el("button", "text-button", "Revert");
        revert.type = "button";
        revert.addEventListener("click", () => this.revertStoreTheme());
        bar.append(revert);
        results.append(bar);
      }
      const empty = !browsed.plugins.length && !browsed.themes.length;
      const unfiltered = browseStore(index, this.installed, { query: "", kind: "all", category: "" });
      if (empty && !unfiltered.plugins.length && !unfiltered.themes.length) {
        results.append(el("p", "setting-help", "Everything in the store is installed."));
        return;
      }
      if (empty) {
        results.append(el("p", "setting-help", "Nothing matches."));
        return;
      }
      const paintItem = (item: StoreItem, theme = false) => {
        const busy = this.storeInstalling === item.id;
        const controls = el("div", "store-row-actions");
        if (theme) {
          const previewing = this.themePreview?.id === item.id;
          const preview = el("button", "text-button", previewing ? "Revert" : "Preview");
          preview.type = "button";
          preview.disabled = this.storeInstalling !== "";
          preview.addEventListener("click", () => void this.toggleStoreThemePreview(item));
          controls.append(preview);
        }
        const install = el("button", "text-button", busy ? "Installing…" : "Install");
        install.type = "button";
        install.disabled = this.storeInstalling !== "";
        install.addEventListener("click", () => void this.installFromCatalog(item.id));
        controls.append(install);
        const needs = larkVersionOk(item.minLark, APP_VERSION) ? "" : ` · Needs Lark ${item.minLark}`;
        const note = item.changelog ? ` · ${item.changelog}` : "";
        const row = this.late!.settingRow(`store.${item.id}`, item.name, `${item.description} · v${item.version}${needs}${note}`, controls);
        const swatches = storeSwatches(item.swatches);
        if (swatches) row.querySelector(".setting-copy")?.append(swatches);
        results.append(row);
      };
      if (browsed.plugins.length) results.append(el("h3", "", "Plugins"));
      for (const item of browsed.plugins) paintItem(item);
      if (browsed.themes.length) results.append(el("h3", "", "Themes"));
      for (const item of browsed.themes) paintItem(item, true);
    };
    search.addEventListener("input", () => {
      this.storeQuery = search.value;
      paint();
    });
    card.append(search, chips, results);
    paint();
    return card;
  },
  async installFromCatalog(id: string) {
    if (this.storeInstalling) return;
    if (this.themePreview?.id === id) this.revertStoreTheme();
    this.storeInstalling = id;
    if (this.settings && this.section === "plugins") this.renderSettings();
    const name = await this.installStoreItem(id);
    this.storeInstalling = "";
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  },
  storeBlurb(item: InstalledRecord): string {
    const remote = this.storeIndex ? findStoreItem(this.storeIndex, item.id) : null;
    const update = remote && newerVersion(item.version, remote.item.version) ? " · Update available" : "";
    const description = item.description ? `${item.description} · ` : "";
    return `${description}v${item.version}${update}`;
  },
  storeActions(item: InstalledRecord): HTMLElement {
    const row = el("div", "store-actions");
    const remote = this.storeIndex ? findStoreItem(this.storeIndex, item.id) : null;
    if (remote && newerVersion(item.version, remote.item.version)) {
      const update = el("button", "text-button", "Update");
      update.type = "button";
      update.addEventListener("click", () => void this.updateStoreItem(item.id));
      row.append(update);
    }
    const remove = el("button", "text-button", "Uninstall");
    remove.type = "button";
    remove.addEventListener("click", () => void this.uninstallStoreItem(item.id));
    row.append(remove);
    return row;
  },
  async refreshPluginsPane() {
    if (this.storeRefreshing) return;
    this.storeRefreshing = true;
    const before = this.installed.map((item) => `${item.kind}:${item.id}:${item.version}`).join();
    const indexBefore = this.storeIndex ? `${this.storeIndex.plugins.length}:${this.storeIndex.themes.length}` : "";
    const triedBefore = this.storeIndexTried;
    try {
      await this.refreshStore();
    } finally {
      this.storeRefreshing = false;
      this.storeIndexTried = true;
    }
    const after = this.installed.map((item) => `${item.kind}:${item.id}:${item.version}`).join();
    const indexAfter = this.storeIndex ? `${this.storeIndex.plugins.length}:${this.storeIndex.themes.length}` : "";
    if ((before !== after || indexBefore !== indexAfter || !triedBefore) && this.settings && this.section === "plugins") this.renderSettings();
  },
  async openStorePage() {
    if (isTauri()) {
      try {
        await invoke("open_store_page");
      } catch (err) {
        this.toast("Store", commandError(err, "Couldn't open the store."));
      }
      return;
    }
    window.open(STORE_PAGE_URL, "_blank", "noopener");
  },
  async refreshStore() {
    if (isTauri()) {
      try {
        this.installed = await invoke<InstalledRecord[]>("installed_store");
      } catch {
        this.installed = [];
      }
      try {
        const parsed = parseStoreIndex(await invoke<string>("store_index"));
        if (parsed) this.storeIndex = parsed;
      } catch {
        /* Installed items still show when the store is offline. */
      }
    } else {
      const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
      this.installed = [
        ...Object.entries(local.plugins).map(([id, item]) => ({
          id,
          kind: "plugin" as const,
          name: item.name,
          description: item.description,
          version: item.version,
          sha256: item.sha256,
        })),
        ...Object.entries(local.themes).map(([id, item]) => ({
          id,
          kind: "theme" as const,
          name: item.name,
          description: item.description,
          version: item.version,
          sha256: item.sha256,
        })),
      ].sort((a, b) => a.id.localeCompare(b.id));
      try {
        const res = await fetch(STORE_INDEX_URL, { cache: "no-store" });
        if (res.ok) {
          const parsed = parseStoreIndex(await res.json());
          if (parsed) this.storeIndex = parsed;
        }
      } catch {
        /* The preview still shows what is already installed. */
      }
    }
    this.catalog = this.installed
      .filter((item) => item.kind === "plugin")
      .map((item) => ({ id: item.id, name: item.name || item.id, description: item.description }));
  },
  async installStoreItem(id: string): Promise<string | null> {
    if (!validPluginId(id)) return null;
    try {
      if (isTauri()) {
        const record = await invoke<InstalledRecord>("install_store_item", { id });
        await this.refreshStore();
        return record.name || id;
      }
      if (!this.storeIndex) {
        const res = await fetch(STORE_INDEX_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("The store could not be reached.");
        this.storeIndex = parseStoreIndex(await res.json());
      }
      const found = this.storeIndex ? findStoreItem(this.storeIndex, id) : null;
      if (!found) throw new Error(`"${id}" is not in the store.`);
      if (!larkVersionOk(found.item.minLark, APP_VERSION)) throw new Error(`"${id}" needs Lark ${found.item.minLark} or newer.`);
      const url = entryUrl(found.item);
      if (!url) throw new Error("The store path was refused.");
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("The download failed.");
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const problem = acceptBytes(found.item, bytes, hash);
      if (problem) throw new Error(problem);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
      if (found.kind === "theme") {
        const issue = validateThemeCss(text);
        if (issue) throw new Error(issue);
        local.themes[id] = { version: found.item.version, sha256: hash, css: text, name: found.item.name, description: found.item.description };
      } else {
        local.plugins[id] = { version: found.item.version, sha256: hash, source: text, name: found.item.name, description: found.item.description };
      }
      localStorage.setItem(STORE_LOCAL_KEY, writeLocalStore(local));
      await this.refreshStore();
      return found.item.name;
    } catch (err) {
      this.toast("Store", err instanceof Error ? err.message : "Couldn't install that.");
      return null;
    }
  },
  async updateStoreItem(id: string) {
    const name = await this.installStoreItem(id);
    if (!name) return;
    this.loaded.delete(id);
    this.themeCache.delete(id);
    if (this.config.plugins.enabled.includes(id)) await this.ensurePlugin(id);
    if (this.config.appearance.theme === id && !this.preferBuiltin) await this.applyTheme();
    this.toast("Store", `${name} is up to date.`);
    if (this.settings && this.section === "plugins") this.renderSettings();
  },
  async uninstallStoreItem(id: string) {
    try {
      if (isTauri()) await invoke("uninstall_store_item", { id });
      else {
        const local = readLocalStore(localStorage.getItem(STORE_LOCAL_KEY));
        delete local.plugins[id];
        delete local.themes[id];
        localStorage.setItem(STORE_LOCAL_KEY, writeLocalStore(local));
      }
    } catch (err) {
      this.toast("Store", commandError(err, "Couldn't uninstall that."));
      return;
    }
    this.loaded.delete(id);
    this.themeCache.delete(id);
    if (this.config.plugins.enabled.includes(id)) {
      this.config.plugins.enabled = this.config.plugins.enabled.filter((item) => item !== id);
      this.persist();
    }
    if (this.config.appearance.theme === id) {
      this.preferBuiltin = true;
      localStorage.setItem("lark.theme.builtin", "1");
      await this.applyTheme();
    }
    await this.refreshStore();
    this.msgSig = "";
    if (this.settings) this.renderSettings();
    else this.paint();
  },
  setThemeEnabled(id: string, enabled: boolean) {
    if (enabled) {
      this.selectTheme(id);
      return;
    }
    this.themePreview = null;
    if (this.config.appearance.theme !== id) return;
    this.preferBuiltin = true;
    localStorage.setItem("lark.theme.builtin", "1");
    void this.applyTheme();
    if (this.settings && this.section === "appearance") this.paintThemeGallery();
  },
  showThemeCss(css: string | null, theme: string, builtin: boolean) {
    if (builtin || !css) {
      document.getElementById("lark-theme")?.remove();
      delete document.documentElement.dataset.theme;
      this.syncMaterial("none");
      applyUserChrome(this.root, this.config);
      return;
    }
    let style = document.getElementById("lark-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "lark-theme";
      document.head.append(style);
    }
    style.textContent = css;
    document.documentElement.dataset.theme = theme;
    this.syncMaterial(parseThemeCss(css).material);
    applyUserChrome(this.root, this.config);
  },
  async toggleStoreThemePreview(item: StoreItem) {
    if (this.themePreview?.id === item.id) {
      this.revertStoreTheme();
      return;
    }
    try {
      const css = await this.fetchStoreThemeCss(item);
      const issue = validateThemeCss(css);
      if (issue) throw new Error(issue);
      if (this.themePreview) {
        const next = swapThemePreview(this.themePreview, { id: item.id, css });
        if (!next) return;
        this.themePreview = next;
      } else {
        const node = document.getElementById("lark-theme");
        const session = beginThemePreview({
          css: node?.textContent ?? null,
          theme: this.config.appearance.theme,
          builtin: this.preferBuiltin || !node,
        }, { id: item.id, css });
        if (!session) return;
        this.themePreview = session;
      }
      this.showThemeCss(css, item.id, false);
      if (this.settings && this.section === "plugins") this.renderSettings();
    } catch (err) {
      this.toast("Store", err instanceof Error ? err.message : "Couldn't preview that theme.");
    }
  },
  revertStoreTheme() {
    const session = this.themePreview;
    if (!session) return;
    this.themePreview = null;
    const previous = revertThemePreview(session);
    this.showThemeCss(previous.css, previous.theme, previous.builtin);
    if (this.settings && this.section === "plugins") this.renderSettings();
  },
  async fetchStoreThemeCss(item: StoreItem): Promise<string> {
    if (isTauri()) return invoke<string>("preview_store_theme", { id: item.id });
    const url = entryUrl(item);
    if (!url) throw new Error("The store path was refused.");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("The download failed.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = await sha256Hex(bytes);
    const problem = acceptBytes(item, bytes, hash);
    if (problem) throw new Error(problem);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const issue = validateThemeCss(text);
    if (issue) throw new Error(issue);
    return text;
  },
  async installFromLink(id: string) {
    const name = await this.installStoreItem(id);
    this.section = "plugins";
    this.openSettings();
    if (name) this.toast("Store", `${name} is installed. Turn it on when you want it.`);
  },
  async listenForStoreLinks() {
    if (!isTauri() || this.storeListening) return;
    this.storeListening = true;
    try {
      const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const handle = (urls: string[]) => {
        for (const url of urls) {
          const id = parseInstallUrl(url);
          if (id) void this.installFromLink(id);
        }
      };
      const current = await getCurrent();
      if (current?.length) handle(current);
      await onOpenUrl(handle);
    } catch {
      /* The desktop scheme is unavailable in this session. */
    }
  },
});
