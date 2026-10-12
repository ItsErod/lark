import type { Channel } from "../types";
import { el } from "./dom";
import {
  INVITE_EXPIRY,
  INVITE_USES,
  SLOWMODE_SECONDS,
  clampChannelName,
  createChannelBody,
  inviteBody,
  roleOverwrite,
  searchPeople,
  textChannelPatch,
} from "../server-model";

export interface ChannelHost {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  guildId: string;
  userId: string;
  channels: Channel[];
  friends: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  copy(text: string): Promise<void>;
  onChannel(channel: Channel): void;
}

export function mountCreateChannel(host: ChannelHost, kind: "text" | "voice" | "forum" | "category"): HTMLElement {
  const layer = el("div", "modal-layer");
  const card = el("div", "modal-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", kind === "category" ? "Create Category" : "Create Channel");
  card.append(el("h2", "", kind === "category" ? "Create Category" : "Create Channel"));
  let picked: "text" | "voice" | "forum" | "category" = kind;
  if (kind !== "category") {
    const kinds = el("div", "choice-row");
    for (const option of [
      ["text", "Text"],
      ["voice", "Voice"],
      ["forum", "Forum"],
    ] as const) {
      const button = el("button", `ghost${picked === option[0] ? " is-on" : ""}`, option[1]);
      button.type = "button";
      button.addEventListener("click", () => {
        picked = option[0];
        for (const node of kinds.querySelectorAll("button")) node.classList.toggle("is-on", node === button);
      });
      kinds.append(button);
    }
    card.append(kinds);
  }
  const name = el("input");
  name.placeholder = kind === "category" ? "Category name" : "Channel name";
  name.maxLength = 100;
  name.setAttribute("aria-label", "Name");
  const parent = el("select");
  parent.setAttribute("aria-label", "Category");
  parent.append(new Option("No category", ""));
  for (const channel of host.channels.filter((item) => item.kind === "category")) {
    parent.append(new Option(channel.name, channel.id));
  }
  const privacy = el("label", "check-row");
  const box = el("input");
  box.type = "checkbox";
  privacy.append(box, el("span", "", "Private channel"));
  const save = el("button", "primary", "Create");
  save.type = "button";
  save.addEventListener("click", () => {
    const body = createChannelBody({
      name: name.value,
      kind: picked,
      parentId: parent.value || null,
      isPrivate: box.checked,
      guildId: host.guildId,
      userId: host.userId,
    });
    if (!body) {
      host.toast("Channel", "Give it a name.");
      return;
    }
    save.disabled = true;
    void host
      .invoke<Channel>("guild_admin", { request: { op: "create_channel", guildId: host.guildId, body } })
      .then((channel) => {
        layer.remove();
        host.toast("Channel created", clampChannelName(name.value, picked));
        if (channel?.id) host.onChannel({ ...channel, kind: channel.kind || picked });
      })
      .catch((err) => {
        save.disabled = false;
        host.toast("Couldn't create the channel", err instanceof Error ? err.message : "Discord refused the request.");
      });
  });
  const cancel = el("button", "ghost", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => layer.remove());
  const actions = el("div", "choice-row");
  actions.append(save, cancel);
  card.append(name);
  if (kind !== "category") card.append(parent, privacy);
  card.append(actions);
  layer.append(card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
  name.focus();
  return layer;
}

export function mountInviteModal(host: ChannelHost, channelId: string): HTMLElement {
  const layer = el("div", "modal-layer");
  const card = el("div", "modal-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Invite");
  card.append(el("h2", "", "Invite friends"), el("p", "hint", "Search friends, or copy a link with an expiry and a use limit."));
  const search = el("input");
  search.placeholder = "Search friends";
  search.setAttribute("aria-label", "Search friends");
  const results = el("div", "invite-friends");
  const paintFriends = () => {
    results.replaceChildren();
    const hits = searchPeople(host.friends, search.value);
    if (!hits.length) results.append(el("p", "empty", "No friends match."));
    for (const friend of hits) {
      const row = el("button", "ctx-item", friend.name);
      row.type = "button";
      row.addEventListener("click", () => {
        void create({ targetUserId: friend.id }).then((code) => {
          if (code) void host.copy(`https://discord.gg/${code}`);
        });
      });
      results.append(row);
    }
  };
  search.addEventListener("input", paintFriends);
  const expiry = el("select");
  expiry.setAttribute("aria-label", "Expire after");
  for (const option of INVITE_EXPIRY) expiry.append(new Option(option.label, String(option.maxAge)));
  expiry.value = "86400";
  const uses = el("select");
  uses.setAttribute("aria-label", "Max number of uses");
  for (const option of INVITE_USES) uses.append(new Option(option.label, String(option.maxUses)));
  const temporary = el("label", "check-row");
  const tempBox = el("input");
  tempBox.type = "checkbox";
  temporary.append(tempBox, el("span", "", "Grant temporary membership"));
  const roleBox = el("div", "role-picks");
  roleBox.append(el("p", "folder-menu-label", "Roles"));
  const selected = new Set<string>();
  for (const role of host.roles.filter((role) => role.id !== host.guildId)) {
    const label = el("label", "check-row");
    const box = el("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      if (box.checked) selected.add(role.id);
      else selected.delete(role.id);
    });
    label.append(box, el("span", "", role.name));
    roleBox.append(label);
  }
  const link = el("p", "hint", "The invite link appears here.");
  const create = async (extra?: { targetUserId?: string }) => {
    for (const roleId of selected) {
      const overwrite = roleOverwrite(roleId, true);
      await host.invoke("guild_admin", {
        request: {
          op: "put_overwrite",
          channelId,
          extra: roleId,
          body: { type: overwrite.kind, allow: overwrite.allow, deny: overwrite.deny },
        },
      });
    }
    const body = inviteBody({
      maxAge: Number(expiry.value),
      maxUses: Number(uses.value),
      temporary: tempBox.checked,
    });
    if (extra?.targetUserId) {
      body.target_type = 1;
      body.target_user_id = extra.targetUserId;
    }
    const made = await host.invoke<{ code?: string }>("guild_admin", {
      request: { op: "create_invite", channelId, body },
    });
    const code = made?.code ?? "";
    if (code) link.textContent = `https://discord.gg/${code}`;
    return code;
  };
  const copy = el("button", "primary", "Copy link");
  copy.type = "button";
  copy.addEventListener("click", () => {
    copy.disabled = true;
    void create()
      .then((code) => {
        copy.disabled = false;
        if (!code) {
          host.toast("Invite", "Discord did not return a link.");
          return;
        }
        return host.copy(`https://discord.gg/${code}`).then(() => host.toast("Invite copied", `discord.gg/${code}`));
      })
      .catch((err) => {
        copy.disabled = false;
        host.toast("Couldn't create the invite", err instanceof Error ? err.message : "Discord refused the invite.");
      });
  });
  const close = el("button", "ghost", "Close");
  close.type = "button";
  close.addEventListener("click", () => layer.remove());
  const actions = el("div", "choice-row");
  actions.append(copy, close);
  card.append(search, results, el("label", "field-label", "Expire after"), expiry, el("label", "field-label", "Max number of uses"), uses, temporary, roleBox, link, actions);
  layer.append(card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
  paintFriends();
  search.focus();
  return layer;
}

/** Overview editor. Permissions, invites, and voice controls extend this same dialog. */
export function mountChannelEditor(host: ChannelHost, channel: Channel): HTMLElement {
  const layer = el("div", "modal-layer");
  const card = el("div", "modal-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Edit Channel");
  card.append(el("h2", "", "Overview"), el("p", "hint", `#${channel.name}`));
  const name = el("input");
  name.value = channel.name;
  name.maxLength = 100;
  name.setAttribute("aria-label", "Channel name");
  const topic = el("textarea");
  topic.value = channel.topic ?? "";
  topic.maxLength = 1024;
  topic.setAttribute("aria-label", "Channel topic");
  const slow = el("select");
  slow.setAttribute("aria-label", "Slowmode");
  for (const seconds of SLOWMODE_SECONDS) {
    const label = seconds === 0 ? "Off" : seconds < 60 ? `${seconds} seconds` : seconds < 3600 ? `${seconds / 60} minutes` : `${seconds / 3600} hours`;
    slow.append(new Option(label, String(seconds)));
  }
  const currentSlow = channel.rateLimitPerUser ?? 0;
  slow.value = String(SLOWMODE_SECONDS.includes(currentSlow) ? currentSlow : 0);
  const nsfw = el("label", "check-row");
  const nsfwBox = el("input");
  nsfwBox.type = "checkbox";
  nsfwBox.checked = Boolean(channel.nsfw);
  nsfw.append(nsfwBox, el("span", "", "Age-restricted channel"));
  const save = el("button", "primary", "Save");
  save.type = "button";
  save.addEventListener("click", () => {
    const body = textChannelPatch({
      name: name.value,
      topic: topic.value,
      slowmode: Number(slow.value),
      nsfw: nsfwBox.checked,
      hideAfter: null,
    });
    save.disabled = true;
    void host
      .invoke<Channel>("guild_admin", { request: { op: "patch_channel", channelId: channel.id, body } })
      .then((next) => {
        layer.remove();
        host.toast("Channel saved", body.name as string);
        host.onChannel(next?.id ? next : { ...channel, name: String(body.name), topic: topic.value, nsfw: nsfwBox.checked, rateLimitPerUser: Number(slow.value) });
      })
      .catch((err) => {
        save.disabled = false;
        host.toast("Couldn't save the channel", err instanceof Error ? err.message : "Discord refused the change.");
      });
  });
  const close = el("button", "ghost", "Cancel");
  close.type = "button";
  close.addEventListener("click", () => layer.remove());
  const actions = el("div", "choice-row");
  actions.append(save, close);
  card.append(el("label", "field-label", "Name"), name, el("label", "field-label", "Topic"), topic, el("label", "field-label", "Slowmode"), slow, nsfw, actions);
  layer.append(card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
  name.focus();
  return layer;
}
