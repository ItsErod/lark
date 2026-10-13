import { el } from "./dom";
import { emptyQuery, parseLocalQuery, type LocalHit, type LocalPage, type LocalQuery } from "../local-search";

export interface LocalSearchHost {
  query(query: LocalQuery): Promise<LocalPage>;
  present(hit: LocalHit): { author: string; where: string; preview: string };
  jump(channelId: string, messageId: string): void;
  close(): void;
}

export function openLocalSearchPanel(parent: HTMLElement, host: LocalSearchHost): { destroy(): void } {
  const overlay = el("div", "overlay");
  overlay.id = "lark-local-search";
  const card = el("div", "switcher-card local-search-card");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search loaded messages";
  input.setAttribute("aria-label", "Search loaded messages");
  input.autocomplete = "off";
  input.spellcheck = false;
  const filters = el("div", "local-search-filters");
  const guild = el("select");
  const channel = el("select");
  const author = el("select");
  guild.setAttribute("aria-label", "Server");
  channel.setAttribute("aria-label", "Channel");
  author.setAttribute("aria-label", "From");
  filters.append(guild, channel, author);
  const results = el("div", "switcher-results");
  const foot = el("div", "switcher-foot", "On this device. Message text is not sent to Discord.");
  card.append(input, filters, results, foot);
  overlay.append(card);
  parent.append(overlay);

  let hits: LocalHit[] = [];
  let active = 0;
  let token = 0;
  let timer = 0;
  let destroyed = false;

  const paintHits = () => {
    results.replaceChildren();
    if (!hits.length) return;
    hits.forEach((hit, index) => {
      const button = el("button", `switcher-hit local-hit${index === active ? " is-active" : ""}`);
      button.type = "button";
      const view = host.present(hit);
      button.append(
        el("strong", "", view.author),
        el("span", "local-where", view.where),
        el("span", "local-preview", view.preview),
      );
      button.addEventListener("click", () => host.jump(hit.channelId, hit.id));
      results.append(button);
    });
    const current = results.children[active];
    if (current instanceof HTMLElement) current.scrollIntoView({ block: "nearest" });
  };

  const showNote = (text: string) => {
    results.replaceChildren(el("div", "empty", text));
  };

  const run = () => {
    if (destroyed) return;
    const current = ++token;
    const parsed = parseLocalQuery(input.value);
    const query: LocalQuery = {
      ...emptyQuery(),
      text: parsed.text,
      guildId: guild.value,
      channelId: channel.value,
      authorId: author.value,
      guild: parsed.guild,
      channel: parsed.channel,
      author: parsed.author,
    };
    void host.query(query).then((page) => {
      if (destroyed || current !== token) return;
      fillSelect(guild, "All servers", page.facets.guilds.map((item) => ({ value: item.id, label: item.name })));
      const server = guild.value;
      const channels = page.facets.channels.filter((item) => {
        if (!server) return true;
        if (server === "@dm") return !item.guildId;
        return item.guildId === server;
      });
      fillSelect(channel, "All channels", channels.map((item) => ({
        value: item.id,
        label: item.guildId ? `#${item.name}` : item.name,
      })));
      fillSelect(author, "Anyone", page.facets.authors.map((item) => ({ value: item.id, label: item.name })));
      hits = page.hits;
      active = 0;
      const typed = Boolean(query.text || query.guildId || query.channelId || query.authorId || query.guild || query.channel || query.author);
      if (!hits.length) {
        showNote(page.count
          ? (typed ? "No matches in loaded messages." : "Type to search messages already on this device.")
          : "No loaded messages yet. Open a channel, then search.");
      } else paintHits();
      foot.textContent = page.count
        ? `${page.count} loaded · on this device · not sent to Discord`
        : "On this device. Message text is not sent to Discord.";
    }).catch(() => {
      if (destroyed || current !== token) return;
      hits = [];
      showNote("Couldn't search loaded messages.");
    });
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 32);
  };

  input.addEventListener("input", schedule);
  guild.addEventListener("change", () => {
    channel.value = "";
    run();
  });
  channel.addEventListener("change", run);
  author.addEventListener("change", run);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      active = hits.length ? (active + 1) % hits.length : 0;
      paintHits();
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      active = hits.length ? (active - 1 + hits.length) % hits.length : 0;
      paintHits();
      event.preventDefault();
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) host.jump(hit.channelId, hit.id);
      event.preventDefault();
    } else if (event.key === "Escape") {
      host.close();
      event.preventDefault();
      event.stopPropagation();
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) host.close();
  });
  run();
  input.focus();

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(timer);
      overlay.remove();
    },
  };
}

function fillSelect(select: HTMLSelectElement, blank: string, options: { value: string; label: string }[]): void {
  const sig = `${blank}\n${options.map((item) => `${item.value}\t${item.label}`).join("\n")}`;
  const current = select.value;
  if (select.dataset.sig === sig) return;
  select.dataset.sig = sig;
  select.replaceChildren();
  const all = el("option", "", blank);
  all.value = "";
  select.append(all);
  for (const option of options) {
    const node = el("option", "", option.label);
    node.value = option.value;
    select.append(node);
  }
  if ([...select.options].some((item) => item.value === current)) select.value = current;
}
