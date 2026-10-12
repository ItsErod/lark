import { el } from "./dom";
import {
  DISCORD_LINKS,
  SERVER_TEMPLATES,
  guildCreateBody,
  type MenuEntry,
} from "../server-model";

export function mountMenu(x: number, y: number, items: MenuEntry[], onPick: (id: string) => void): HTMLElement {
  const menu = el("div", "ctx-menu");
  menu.setAttribute("role", "menu");
  menu.tabIndex = -1;
  fillMenu(menu, items, onPick);
  document.body.append(menu);
  const width = 240;
  const height = Math.min(window.innerHeight - 16, items.length * 34 + 12);
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  return menu;
}

function fillMenu(menu: HTMLElement, items: MenuEntry[], onPick: (id: string) => void) {
  for (const item of items) {
    const row = el("button", `ctx-item${item.danger ? " is-danger" : ""}`);
    row.type = "button";
    row.setAttribute("role", "menuitem");
    row.append(el("span", "", item.label));
    if (item.hint) row.append(el("span", "ctx-hint", item.hint));
    if (item.children?.length) {
      row.append(el("span", "ctx-more", "▸"));
      const sub = el("div", "ctx-sub");
      fillMenu(sub, item.children, onPick);
      row.append(sub);
    } else {
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onPick(item.id);
      });
    }
    menu.append(row);
  }
}

export interface AddServerHost {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  openInvite(code: string): void;
  onCreated(guildId: string): void;
}

export function mountAddServer(host: AddServerHost): HTMLElement {
  const layer = el("div", "modal-layer");
  const card = el("div", "modal-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Add a Server");
  let mode: "pick" | "create" | "join" = "pick";
  let template = "blank";

  const paint = () => {
    card.replaceChildren();
    card.append(el("h2", "", mode === "join" ? "Join a Server" : mode === "create" ? "Create a Server" : "Add a Server"));
    if (mode === "pick") {
      card.append(el("p", "hint", "Create your own, start from a template, or join with an invite."));
      const create = el("button", "primary", "Create My Own");
      create.type = "button";
      create.addEventListener("click", () => {
        mode = "create";
        paint();
      });
      const join = el("button", "ghost", "Join a Server");
      join.type = "button";
      join.addEventListener("click", () => {
        mode = "join";
        paint();
      });
      const discover = el("button", "ghost", "Discover");
      discover.type = "button";
      discover.addEventListener("click", () => {
        window.open(DISCORD_LINKS.discovery, "_blank", "noopener");
      });
      const row = el("div", "choice-row");
      row.append(create, join, discover);
      card.append(row);
      return;
    }
    if (mode === "join") {
      const input = el("input");
      input.placeholder = "discord.gg/invite";
      input.setAttribute("aria-label", "Invite link");
      const go = el("button", "primary", "Join");
      go.type = "button";
      go.addEventListener("click", () => {
        const code = input.value.trim();
        if (!code) return;
        layer.remove();
        host.openInvite(code);
      });
      card.append(input, go);
    } else {
      const templates = el("div", "template-grid");
      for (const item of SERVER_TEMPLATES) {
        const button = el("button", `template-card${item.id === template ? " is-on" : ""}`);
        button.type = "button";
        button.append(el("strong", "", item.label), el("span", "hint", item.detail));
        button.addEventListener("click", () => {
          template = item.id;
          paint();
        });
        templates.append(button);
      }
      const name = el("input");
      name.placeholder = "Server name";
      name.maxLength = 100;
      name.setAttribute("aria-label", "Server name");
      const go = el("button", "primary", "Create");
      go.type = "button";
      go.addEventListener("click", () => {
        const body = guildCreateBody(name.value, template);
        if (!body) {
          host.toast("Server", "Give the server a name.");
          return;
        }
        go.disabled = true;
        void host
          .invoke<{ id?: string }>("guild_admin", { request: { op: "create_guild", body } })
          .then((guild) => {
            layer.remove();
            host.toast("Server created", String(body.name));
            if (guild?.id) host.onCreated(guild.id);
          })
          .catch((err) => {
            go.disabled = false;
            host.toast("Couldn't create the server", err instanceof Error ? err.message : "Discord refused the request.");
          });
      });
      card.append(templates, name, go);
    }
    const back = el("button", "text-button", "Back");
    back.type = "button";
    back.addEventListener("click", () => {
      mode = "pick";
      paint();
    });
    card.append(back);
  };
  paint();
  layer.append(card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
  return layer;
}

export function externalLink(url: string) {
  window.open(url, "_blank", "noopener");
}
