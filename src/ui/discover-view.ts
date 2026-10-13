import {
  captchaNote,
  cdnImage,
  countLine,
  dedupeCards,
  discoverMode,
  emptyNote,
  moreGuilds,
  type DiscoverCard,
  type DiscoverCategory,
} from "../discover";
import { el } from "./dom";

export interface DiscoverHost {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  onJoined(guildId: string): void;
}

interface DiscoverPage {
  guilds?: DiscoverCard[];
  total?: number;
}

interface DiscoverJoin {
  kind?: string;
  guildId?: string;
  url?: string;
  reason?: string;
  message?: string;
}

const PAGE = 24;

export function openDiscover(host: DiscoverHost): HTMLElement {
  document.getElementById("lark-discover")?.remove();
  const layer = el("div", "lark-discover");
  layer.id = "lark-discover";
  layer.tabIndex = -1;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Discover");

  let categories: DiscoverCategory[] = [];
  let selected: number | null = null;
  let query = "";
  let cards: DiscoverCard[] = [];
  let total = 0;
  let lastPage = 0;
  let loading = true;
  let error = "";
  let preview: DiscoverCard | null = null;
  let joining = false;
  let note = "";
  let seq = 0;
  let timer = 0;

  const selectedName = () => categories.find((item) => item.id === selected)?.name ?? null;

  const paint = () => {
    const mode = discoverMode({ loading: loading && cards.length === 0, error: cards.length ? "" : error, preview: Boolean(preview) });
    layer.classList.toggle("is-preview", mode === "preview");
    layer.replaceChildren();
    const head = el("div", "discover-head");
    head.append(el("h2", "", mode === "preview" ? "Server preview" : "Discover"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => layer.remove());
    head.append(close);
    layer.append(head);

    if (mode === "preview" && preview) {
      paintPreview(preview);
      return;
    }

    const search = el("input");
    search.type = "search";
    search.placeholder = "Search servers";
    search.value = query;
    search.setAttribute("aria-label", "Search servers");
    search.addEventListener("input", () => {
      query = search.value.slice(0, 100);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => load(false), 280);
    });
    layer.append(search);

    const cats = el("div", "discover-cats");
    cats.append(chip("All", selected === null, () => {
      selected = null;
      load(false);
    }));
    for (const category of categories) {
      cats.append(chip(category.name, category.id === selected, () => {
        selected = category.id;
        load(false);
      }));
    }
    layer.append(cats);

    const grid = el("div", "discover-grid");
    if (mode === "loading") grid.append(el("p", "hint", "Loading servers…"));
    else if (mode === "error") grid.append(el("p", "empty", error || "Couldn't load Discovery."));
    else if (!cards.length) grid.append(el("p", "empty", emptyNote(query, selectedName())));
    else {
      for (const card of cards) grid.append(serverCard(card));
      if (moreGuilds(cards.length, total, lastPage, PAGE)) {
        const more = el("button", "ghost", "More servers");
        more.type = "button";
        more.addEventListener("click", () => load(true));
        grid.append(more);
      }
    }
    layer.append(grid);
  };

  const paintPreview = (card: DiscoverCard) => {
    const panel = el("div", "discover-preview");
    const back = el("button", "text-button", "Back");
    back.type = "button";
    back.addEventListener("click", () => {
      preview = null;
      note = "";
      joining = false;
      paint();
    });
    panel.append(back, banner(card), el("h3", "", card.name));
    if (card.description) panel.append(el("p", "", card.description));
    panel.append(el("p", "hint", countLine(card.members, card.online)));
    if (note) panel.append(el("p", "hint", note));
    const join = el("button", "primary", joining ? "Joining…" : "Join server");
    join.type = "button";
    join.disabled = joining;
    join.addEventListener("click", () => joinServer(card));
    panel.append(join);
    layer.append(panel);
  };

  const serverCard = (card: DiscoverCard) => {
    const button = el("button", "discover-card");
    button.type = "button";
    button.append(banner(card));
    const body = el("span", "discover-body");
    body.append(el("strong", "", card.name));
    if (card.description) body.append(el("span", "discover-copy", card.description));
    body.append(el("span", "hint", countLine(card.members, card.online)));
    button.append(body);
    button.addEventListener("click", () => openPreview(card));
    return button;
  };

  const load = (append: boolean) => {
    const ticket = ++seq;
    if (!append) {
      cards = [];
      total = 0;
      loading = true;
      error = "";
      preview = null;
      paint();
    }
    const offset = append ? cards.length : 0;
    void host.invoke<DiscoverPage>("discover_guilds", {
      query,
      categoryId: selected,
      offset,
    }).then((page) => {
      if (ticket !== seq) return;
      const next = (page.guilds ?? []).map(cleanCard);
      lastPage = next.length;
      cards = dedupeCards(append ? [...cards, ...next] : next);
      total = Number(page.total ?? cards.length);
      loading = false;
      error = "";
      paint();
    }).catch((err) => {
      if (ticket !== seq) return;
      loading = false;
      error = err instanceof Error ? err.message : "Couldn't load Discovery.";
      if (append && cards.length) host.toast("Discover", error);
      paint();
    });
  };

  const openPreview = (card: DiscoverCard) => {
    preview = card;
    note = "";
    paint();
    const id = card.id;
    void host.invoke<DiscoverCard>("discover_preview", { guildId: id }).then((fresh) => {
      if (!preview || preview.id !== id) return;
      preview = { ...card, ...cleanCard(fresh) };
      paint();
    }).catch(() => undefined);
  };

  const joinServer = (card: DiscoverCard) => {
    joining = true;
    note = "";
    paint();
    void host.invoke<DiscoverJoin>("join_discoverable", { guildId: card.id, vanity: card.vanity }).then((result) => {
      joining = false;
      if (result.kind === "joined") {
        host.toast("Joined", card.name);
        layer.remove();
        host.onJoined(result.guildId || card.id);
        return;
      }
      if (result.kind === "captcha") {
        note = result.reason || captchaNote();
        paint();
        const link = el("button", "ghost", "Continue on Discord");
        link.type = "button";
        const url = result.url && result.url.startsWith("https://discord.com/") ? result.url : "https://discord.com/discovery";
        link.addEventListener("click", () => window.open(url, "_blank", "noopener"));
        layer.querySelector(".discover-preview")?.append(link);
        return;
      }
      note = result.message || "Couldn't join that server.";
      paint();
    }).catch((err) => {
      joining = false;
      note = err instanceof Error ? err.message : "Couldn't join that server.";
      paint();
    });
  };

  void host.invoke<DiscoverCategory[]>("discover_categories").then((rows) => {
    categories = Array.isArray(rows) ? rows.filter((row) => row && row.name) : [];
    paint();
  }).catch(() => undefined);
  load(false);
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

function banner(card: DiscoverCard): HTMLElement {
  const url = cdnImage(card.bannerUrl);
  if (!url) return el("span", "discover-banner");
  const image = el("img", "discover-banner");
  image.src = url;
  image.alt = "";
  return image;
}

function cleanCard(card: DiscoverCard): DiscoverCard {
  return {
    id: card.id,
    name: card.name,
    description: card.description ?? "",
    bannerUrl: cdnImage(card.bannerUrl),
    iconUrl: cdnImage(card.iconUrl),
    members: Number(card.members) || 0,
    online: Number(card.online) || 0,
    vanity: card.vanity ?? "",
  };
}
