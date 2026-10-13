import {
  captchaNote,
  directoryMode,
  guildCountLabel,
  installChoice,
  mediaUrl,
  moreApps,
  type DirectoryApp,
  type InstallChoice,
} from "../app-directory";
import { el } from "./dom";

export interface DirectoryHost {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  guildId: string;
  guildName: string;
  onInstalled(): void;
}

interface DirectoryCategory {
  id: number;
  name: string;
}

interface DirectoryPayload {
  apps?: DirectoryApp[];
  page?: number;
  pages?: number;
}

interface InstallPayload {
  kind?: string;
  url?: string;
  reason?: string;
  message?: string;
}

export function openAppDirectory(host: DirectoryHost): HTMLElement {
  document.getElementById("lark-directory")?.remove();
  const layer = el("div", "lark-directory");
  layer.id = "lark-directory";
  layer.tabIndex = -1;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "App Directory");

  let categories: DirectoryCategory[] = [];
  let selected: number | null = null;
  let query = "";
  let apps: DirectoryApp[] = [];
  let page = 1;
  let pages = 1;
  let loading = true;
  let error = "";
  let confirm: DirectoryApp | null = null;
  let busy = false;
  let note = "";
  let seq = 0;
  let timer = 0;

  const paint = () => {
    const mode = directoryMode({ loading: loading && apps.length === 0, error: apps.length ? "" : error, confirm: Boolean(confirm) });
    layer.classList.toggle("is-confirm", mode === "confirm");
    layer.replaceChildren();
    const head = el("div", "directory-head");
    head.append(el("h2", "", mode === "confirm" ? "Add app" : "App Directory"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => layer.remove());
    head.append(close);
    layer.append(head);
    if (mode === "confirm" && confirm) {
      paintConfirm(confirm);
      return;
    }
    layer.append(el("p", "hint", `Install into ${host.guildName}.`));
    const search = el("input");
    search.type = "search";
    search.placeholder = "Search apps";
    search.value = query;
    search.setAttribute("aria-label", "Search apps");
    search.addEventListener("input", () => {
      query = search.value.slice(0, 100);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => load(1), 280);
    });
    layer.append(search);
    const cats = el("div", "directory-cats");
    cats.append(chip("All", selected === null, () => {
      selected = null;
      load(1);
    }));
    for (const category of categories) {
      cats.append(chip(category.name, category.id === selected, () => {
        selected = category.id;
        load(1);
      }));
    }
    layer.append(cats);
    const grid = el("div", "directory-grid");
    if (mode === "loading") grid.append(el("p", "hint", "Loading apps…"));
    else if (mode === "error") grid.append(el("p", "empty", error || "Couldn't load the App Directory."));
    else if (!apps.length) grid.append(el("p", "empty", query.trim() ? "No apps match that search." : "No apps in this category."));
    else {
      for (const item of apps) grid.append(appCard(item));
      if (moreApps(page, pages)) {
        const more = el("button", "ghost", "More apps");
        more.type = "button";
        more.addEventListener("click", () => load(page + 1));
        grid.append(more);
      }
    }
    layer.append(grid);
  };

  const paintConfirm = (item: DirectoryApp) => {
    const choice = installChoice(cleanApp(item), host.guildId);
    const panel = el("div", "directory-preview");
    const back = el("button", "text-button", "Back");
    back.type = "button";
    back.addEventListener("click", () => {
      confirm = null;
      note = "";
      busy = false;
      paint();
    });
    panel.append(back, el("h3", "", item.name));
    if (item.description) panel.append(el("p", "", item.description));
    panel.append(el("p", "hint", guildCountLabel(item.guildCount)));
    if (choice.kind === "authorize") {
      panel.append(el("p", "", `Permissions: ${choice.labels.join(", ")}`));
      panel.append(el("p", "hint", `Scopes: ${choice.scopes.join(", ")}`));
      const install = el("button", "primary", busy ? "Installing…" : `Add to ${host.guildName}`);
      install.type = "button";
      install.disabled = busy;
      install.addEventListener("click", () => installApp(item, choice));
      panel.append(install);
    } else {
      panel.append(el("p", "", choice.reason));
      panel.append(linkButton("Continue on Discord", choice.url));
    }
    if (note) panel.append(el("p", "hint", note));
    layer.append(panel);
  };

  const appCard = (item: DirectoryApp) => {
    const button = el("button", "directory-card");
    button.type = "button";
    const art = mediaUrl(item.bannerUrl) || mediaUrl(item.iconUrl);
    if (art) {
      const image = el("img", "directory-banner");
      image.src = art;
      image.alt = "";
      button.append(image);
    } else button.append(el("span", "directory-banner"));
    const body = el("span", "directory-body");
    body.append(el("strong", "", item.name));
    if (item.description) body.append(el("span", "directory-copy", item.description));
    body.append(el("span", "hint", guildCountLabel(item.guildCount)));
    button.append(body);
    button.addEventListener("click", () => {
      confirm = item;
      note = "";
      paint();
    });
    return button;
  };

  const load = (nextPage: number) => {
    const ticket = ++seq;
    loading = nextPage === 1;
    if (nextPage === 1) {
      apps = [];
      error = "";
      confirm = null;
    }
    paint();
    void host.invoke<DirectoryPayload>("directory_search", {
      query,
      categoryId: selected,
      guildId: host.guildId,
      page: nextPage,
    }).then((payload) => {
      if (ticket !== seq) return;
      apps = (payload.apps ?? []).map(cleanApp);
      page = Number(payload.page ?? nextPage) || nextPage;
      pages = Number(payload.pages ?? 1) || 1;
      loading = false;
      error = "";
      paint();
    }).catch((err) => {
      if (ticket !== seq) return;
      loading = false;
      error = err instanceof Error ? err.message : "Couldn't load the App Directory.";
      if (apps.length) host.toast("App Directory", error);
      paint();
    });
  };

  const installApp = (item: DirectoryApp, choice: InstallChoice) => {
    if (choice.kind !== "authorize") return;
    busy = true;
    note = "";
    paint();
    void host.invoke<InstallPayload>("install_application", {
      applicationId: item.id,
      guildId: host.guildId,
      permissions: choice.permissions,
      scopes: choice.scopes,
      customInstallUrl: item.customInstallUrl,
      customInstallBlocked: item.customInstallBlocked,
    }).then((result) => {
      busy = false;
      if (result.kind === "installed") {
        host.toast("Installed", item.name);
        host.onInstalled();
        layer.remove();
        return;
      }
      if (result.kind === "link") {
        note = result.reason || captchaNote();
        paint();
        layer.querySelector(".directory-preview")?.append(linkButton("Continue on Discord", result.url || ""));
        return;
      }
      note = result.message || "Couldn't install that app.";
      paint();
    }).catch((err) => {
      busy = false;
      note = err instanceof Error ? err.message : "Couldn't install that app.";
      paint();
    });
  };

  void host.invoke<DirectoryCategory[]>("directory_categories").then((rows) => {
    categories = Array.isArray(rows) ? rows.filter((row) => row && row.name) : [];
    paint();
  }).catch(() => undefined);
  load(1);
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") layer.remove();
  });
  document.body.append(layer);
  layer.focus();
  return layer;
}

function chip(label: string, on: boolean, pick: () => void): HTMLButtonElement {
  const button = el("button", `ghost${on ? " is-on" : ""}`, label);
  button.type = "button";
  button.addEventListener("click", pick);
  return button;
}

function linkButton(label: string, url: string): HTMLButtonElement {
  const button = el("button", "ghost", label);
  button.type = "button";
  button.addEventListener("click", () => {
    if (url.startsWith("https://")) window.open(url, "_blank", "noopener");
  });
  return button;
}

function cleanApp(app: DirectoryApp): DirectoryApp {
  return {
    id: app.id,
    name: app.name,
    description: app.description ?? "",
    iconUrl: mediaUrl(app.iconUrl),
    bannerUrl: mediaUrl(app.bannerUrl),
    guildCount: Number(app.guildCount) || 0,
    permissions: app.permissions ?? "0",
    scopes: Array.isArray(app.scopes) ? app.scopes : [],
    customInstallUrl: app.customInstallUrl ?? "",
    customInstallBlocked: app.customInstallBlocked === true,
    categories: Array.isArray(app.categories) ? app.categories : [],
  };
}
