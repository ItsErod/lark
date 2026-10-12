import type { Channel } from "../types";
import { el } from "./dom";
import {
  HIDE_AFTER_MINUTES,
  INVITE_EXPIRY,
  INVITE_USES,
  PERMISSION_GROUPS,
  RTC_REGIONS,
  SLOWMODE_SECONDS,
  SPOILER_FLAG,
  bitsOf,
  channelIsPrivate,
  clampChannelName,
  createChannelBody,
  hasPerm,
  inviteBody,
  overwriteBits,
  permissionsIn,
  roleOverwrite,
  searchPeople,
  syncOverwritePlan,
  textChannelPatch,
  voiceChannelPatch,
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

/** Overview, permissions, invites, and webhooks for one channel. */
export function mountChannelEditor(host: ChannelHost, channel: Channel): HTMLElement {
  const layer = el("div", "modal-layer");
  const card = el("div", "modal-card channel-editor");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Edit Channel");
  const voiceLike = channel.kind === "voice" || channel.kind === "stage";
  const textual = channel.kind === "text" || channel.kind === "announcement" || channel.kind === "forum" || channel.kind === "media";
  let tab: "overview" | "permissions" | "invites" | "integrations" = "overview";
  const tabs = el("div", "choice-row");
  const body = el("div", "channel-editor-body");
  const paintTabs = () => {
    tabs.replaceChildren();
    for (const item of [
      ["overview", "Overview"],
      ["permissions", "Permissions"],
      ["invites", "Invites"],
      ["integrations", "Integrations"],
    ] as const) {
      const button = el("button", `ghost${tab === item[0] ? " is-on" : ""}`, item[1]);
      button.type = "button";
      button.addEventListener("click", () => {
        tab = item[0];
        paintTabs();
        paintBody();
      });
      tabs.append(button);
    }
  };
  const paintBody = () => {
    body.replaceChildren();
    if (tab === "overview") paintOverview(host, channel, body, voiceLike, textual, () => layer.remove());
    else if (tab === "permissions") paintChannelPerms(host, channel, body);
    else if (tab === "invites") paintChannelInvites(host, channel, body);
    else paintChannelWebhooks(host, channel, body);
  };
  const close = el("button", "ghost", "Close");
  close.type = "button";
  close.addEventListener("click", () => layer.remove());
  card.append(el("h2", "", "Edit Channel"), el("p", "hint", channel.name), tabs, body, close);
  paintTabs();
  paintBody();
  layer.append(card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) layer.remove();
  });
  document.body.append(layer);
  return layer;
}

function paintOverview(host: ChannelHost, channel: Channel, body: HTMLElement, voiceLike: boolean, textual: boolean, close: () => void) {
  const name = el("input");
  name.value = channel.name;
  name.maxLength = 100;
  name.setAttribute("aria-label", "Channel name");
  body.append(el("label", "field-label", "Name"), name);
  if (textual || channel.kind === "stage") {
    const topic = el("textarea");
    topic.value = channel.topic ?? "";
    topic.maxLength = 1024;
    topic.setAttribute("aria-label", "Channel topic");
    body.append(el("label", "field-label", "Topic"), topic);
    if (textual) {
      const slow = el("select");
      slow.setAttribute("aria-label", "Slowmode");
      for (const seconds of SLOWMODE_SECONDS) {
        const label = seconds === 0 ? "Off" : seconds < 60 ? `${seconds} seconds` : seconds < 3600 ? `${seconds / 60} minutes` : `${seconds / 3600} hours`;
        slow.append(new Option(label, String(seconds)));
      }
      const currentSlow = channel.rateLimitPerUser ?? 0;
      slow.value = String(SLOWMODE_SECONDS.includes(currentSlow) ? currentSlow : 0);
      const hide = el("select");
      hide.setAttribute("aria-label", "Hide after inactivity");
      for (const minutes of HIDE_AFTER_MINUTES) {
        const label = minutes === 60 ? "1 hour" : minutes === 1440 ? "24 hours" : minutes === 4320 ? "3 days" : "1 week";
        hide.append(new Option(label, String(minutes)));
      }
      const currentHide = channel.defaultAutoArchiveDuration ?? 4320;
      hide.value = String((HIDE_AFTER_MINUTES as readonly number[]).includes(currentHide) ? currentHide : 4320);
      const nsfwBox = el("input");
      nsfwBox.type = "checkbox";
      nsfwBox.checked = Boolean(channel.nsfw);
      const nsfw = el("label", "check-row");
      nsfw.append(nsfwBox, el("span", "", "Age-restricted channel"));
      const spoilerBox = el("input");
      spoilerBox.type = "checkbox";
      spoilerBox.checked = ((channel.flags ?? 0) & SPOILER_FLAG) !== 0 && !channel.nsfw;
      const spoiler = el("label", "check-row");
      spoiler.append(spoilerBox, el("span", "", "Spoiler channel"));
      const syncSpoiler = () => {
        spoilerBox.disabled = nsfwBox.checked;
        if (nsfwBox.checked) spoilerBox.checked = false;
      };
      nsfwBox.addEventListener("change", syncSpoiler);
      syncSpoiler();
      body.append(el("label", "field-label", "Slowmode"), slow, el("label", "field-label", "Hide after inactivity"), hide, nsfw, spoiler);
      const save = el("button", "primary", "Save overview");
      save.type = "button";
      save.addEventListener("click", () => {
        const patch = textChannelPatch({
          name: name.value,
          topic: topic.value,
          slowmode: Number(slow.value),
          nsfw: nsfwBox.checked,
          hideAfter: Number(hide.value),
          spoiler: spoilerBox.checked,
          flags: channel.flags ?? 0,
        });
        saveChannel(host, channel, patch, save, close);
      });
      body.append(save);
      return;
    }
  }
  if (voiceLike) {
    const bitrate = el("input");
    bitrate.type = "number";
    bitrate.min = "8";
    bitrate.max = "96";
    bitrate.value = String(Math.min(96, Math.max(8, Math.round((channel.bitrate ?? 64000) / 1000))));
    bitrate.setAttribute("aria-label", "Bitrate");
    const video = el("select");
    video.setAttribute("aria-label", "Video quality");
    video.append(new Option("Auto", "1"), new Option("Full", "2"));
    video.value = channel.videoQualityMode === 2 ? "2" : "1";
    const limit = el("input");
    limit.type = "number";
    limit.min = "0";
    limit.max = "99";
    limit.value = String(Math.min(99, Math.max(0, channel.userLimit ?? 0)));
    limit.setAttribute("aria-label", "User limit");
    const region = el("select");
    region.setAttribute("aria-label", "Region");
    for (const option of RTC_REGIONS) region.append(new Option(option === "auto" ? "Automatic" : option, option));
    region.value = RTC_REGIONS.includes(channel.rtcRegion ?? "auto") ? (channel.rtcRegion ?? "auto") : "auto";
    body.append(
      el("label", "field-label", "Bitrate (8–96 kbps)"),
      bitrate,
      el("label", "field-label", "Video quality"),
      video,
      el("label", "field-label", "User limit"),
      limit,
      el("label", "field-label", "Region"),
      region,
    );
    const save = el("button", "primary", "Save overview");
    save.type = "button";
    save.addEventListener("click", () => {
      const patch = voiceChannelPatch({
        name: name.value,
        bitrateKbps: Number(bitrate.value),
        videoQuality: video.value === "2" ? 2 : 1,
        userLimit: Number(limit.value),
        region: region.value,
      });
      saveChannel(host, channel, patch, save, close);
    });
    body.append(save);
    return;
  }
  const save = el("button", "primary", "Save overview");
  save.type = "button";
  save.addEventListener("click", () => {
    saveChannel(host, channel, { name: clampChannelName(name.value, channel.kind) || channel.name }, save, close);
  });
  body.append(save);
}

function saveChannel(host: ChannelHost, channel: Channel, body: Record<string, unknown>, button: HTMLButtonElement, close: () => void) {
  button.disabled = true;
  void host
    .invoke<Channel>("guild_admin", { request: { op: "patch_channel", channelId: channel.id, body } })
    .then((next) => {
      host.toast("Channel saved", String(body.name ?? channel.name));
      host.onChannel(next?.id ? next : { ...channel, name: String(body.name ?? channel.name) });
      close();
    })
    .catch((err) => {
      button.disabled = false;
      host.toast("Couldn't save the channel", err instanceof Error ? err.message : "Discord refused the change.");
    });
}

function paintChannelPerms(host: ChannelHost, channel: Channel, body: HTMLElement) {
  const parent = host.channels.find((item) => item.id === channel.parentId);
  if (parent) {
    const sync = el("button", "ghost", "Sync with category");
    sync.type = "button";
    sync.addEventListener("click", () => {
      const plan = syncOverwritePlan(parent.overwrites ?? [], channel.overwrites ?? []);
      sync.disabled = true;
      void Promise.all([
        ...plan.put.map((overwrite) => host.invoke("guild_admin", {
          request: { op: "put_overwrite", channelId: channel.id, extra: overwrite.id, body: { type: overwrite.kind, allow: overwrite.allow, deny: overwrite.deny } },
        })),
        ...plan.remove.map((id) => host.invoke("guild_admin", { request: { op: "delete_overwrite", channelId: channel.id, extra: id } })),
      ]).then(() => {
        sync.disabled = false;
        channel.overwrites = parent.overwrites ? parent.overwrites.map((item) => ({ ...item })) : [];
        host.toast("Permissions", "Synced with the category.");
        host.onChannel(channel);
      }).catch((err) => {
        sync.disabled = false;
        host.toast("Couldn't sync", err instanceof Error ? err.message : "Discord refused the sync.");
      });
    });
    body.append(sync);
  }
  const locked = el("input");
  locked.type = "checkbox";
  locked.checked = channelIsPrivate(host.guildId, channel.overwrites);
  const lockRow = el("label", "check-row");
  lockRow.append(locked, el("span", "", "Private channel"));
  const applyPrivate = el("button", "ghost", "Save privacy");
  applyPrivate.type = "button";
  applyPrivate.addEventListener("click", () => {
    applyPrivate.disabled = true;
    const request = locked.checked
      ? { op: "put_overwrite", channelId: channel.id, extra: host.guildId, body: { type: 0, allow: roleOverwrite(host.guildId, false).allow, deny: roleOverwrite(host.guildId, false).deny } }
      : { op: "delete_overwrite", channelId: channel.id, extra: host.guildId };
    void host.invoke("guild_admin", { request }).then(() => {
      applyPrivate.disabled = false;
      host.toast("Permissions", locked.checked ? "Channel is private." : "Channel is open.");
    }).catch((err) => {
      applyPrivate.disabled = false;
      host.toast("Couldn't update privacy", err instanceof Error ? err.message : "Discord refused the change.");
    });
  });
  body.append(lockRow, applyPrivate, el("h3", "", "Advanced overwrites"));
  const target = el("select");
  target.setAttribute("aria-label", "Role or member");
  target.append(new Option("@everyone", `${host.guildId}:0`));
  for (const role of host.roles) {
    if (role.id !== host.guildId) target.append(new Option(role.name, `${role.id}:0`));
  }
  const picks = el("div", "role-picks");
  const choices: { flag: bigint; state: "inherit" | "allow" | "deny" }[] = [];
  const paintPicks = () => {
    picks.replaceChildren();
    choices.length = 0;
    const [id, kindText] = target.value.split(":");
    const current = (channel.overwrites ?? []).find((item) => item.id === id && item.kind === Number(kindText));
    for (const group of PERMISSION_GROUPS) {
      picks.append(el("p", "field-label", group));
      for (const item of permissionsIn(group)) {
        const select = el("select");
        select.setAttribute("aria-label", item.label);
        select.append(new Option("Inherit", "inherit"), new Option("Allow", "allow"), new Option("Deny", "deny"));
        const allow = current ? hasPerm(bitsOf(current.allow), item.flag) : false;
        const deny = current ? hasPerm(bitsOf(current.deny), item.flag) : false;
        const state: "inherit" | "allow" | "deny" = allow ? "allow" : deny ? "deny" : "inherit";
        select.value = state;
        const choice = { flag: item.flag, state };
        choices.push(choice);
        select.addEventListener("change", () => {
          choice.state = select.value === "allow" || select.value === "deny" ? select.value : "inherit";
        });
        const row = el("label", "check-row");
        row.append(el("span", "", item.label), select);
        picks.append(row);
      }
    }
  };
  target.addEventListener("change", paintPicks);
  paintPicks();
  const save = el("button", "primary", "Save overwrite");
  save.type = "button";
  save.addEventListener("click", () => {
    const [id, kindText] = target.value.split(":");
    const overwrite = overwriteBits(id, Number(kindText), choices);
    save.disabled = true;
    void host.invoke("guild_admin", {
      request: { op: "put_overwrite", channelId: channel.id, extra: id, body: { type: overwrite.kind, allow: overwrite.allow, deny: overwrite.deny } },
    }).then(() => {
      save.disabled = false;
      const next = (channel.overwrites ?? []).filter((item) => item.id !== id);
      next.push(overwrite);
      channel.overwrites = next;
      host.onChannel(channel);
      host.toast("Permissions", "Overwrite saved.");
    }).catch((err) => {
      save.disabled = false;
      host.toast("Couldn't save the overwrite", err instanceof Error ? err.message : "Discord refused the change.");
    });
  });
  const remove = el("button", "ghost", "Clear overwrite");
  remove.type = "button";
  remove.addEventListener("click", () => {
    const [id] = target.value.split(":");
    void host.invoke("guild_admin", { request: { op: "delete_overwrite", channelId: channel.id, extra: id } })
      .then(() => {
        channel.overwrites = (channel.overwrites ?? []).filter((item) => item.id !== id);
        host.onChannel(channel);
        paintPicks();
      })
      .catch((err) => host.toast("Couldn't clear the overwrite", err instanceof Error ? err.message : "Discord refused the change."));
  });
  body.append(target, picks, save, remove);
}

function paintChannelInvites(host: ChannelHost, channel: Channel, body: HTMLElement) {
  const list = el("div", "guild-table");
  const reload = () => {
    void host.invoke<unknown>("guild_admin", { request: { op: "list_channel_invites", channelId: channel.id } }).then((invites) => {
      list.replaceChildren();
      const rows = Array.isArray(invites) ? invites : [];
      if (!rows.length) list.append(el("p", "hint", "No invites for this channel."));
      for (const raw of rows) {
        const invite = raw as { code?: string; uses?: number };
        const line = el("div", "guild-row");
        line.append(el("span", "", invite.code ? `discord.gg/${invite.code}` : "Invite"));
        const revoke = el("button", "ghost", "Revoke");
        revoke.type = "button";
        revoke.addEventListener("click", () => {
          void host.invoke("guild_admin", { request: { op: "delete_invite", extra: invite.code ?? "" } })
            .then(() => reload())
            .catch((err) => host.toast("Couldn't revoke", err instanceof Error ? err.message : "Discord refused."));
        });
        line.append(revoke);
        list.append(line);
      }
    }).catch((err) => host.toast("Couldn't load invites", err instanceof Error ? err.message : "Discord refused."));
  };
  const create = el("button", "primary", "Create invite");
  create.type = "button";
  create.addEventListener("click", () => {
    create.disabled = true;
    void host.invoke<{ code?: string }>("guild_admin", {
      request: { op: "create_invite", channelId: channel.id, body: inviteBody({ maxAge: 86400, maxUses: 0, temporary: false }) },
    }).then((created) => {
      create.disabled = false;
      if (created?.code) void host.copy(`https://discord.gg/${created.code}`);
      host.toast("Invite", created?.code ? `discord.gg/${created.code}` : "Created.");
      reload();
    }).catch((err) => {
      create.disabled = false;
      host.toast("Couldn't create the invite", err instanceof Error ? err.message : "Discord refused the invite.");
    });
  });
  body.append(list, create);
  reload();
}

function paintChannelWebhooks(host: ChannelHost, channel: Channel, body: HTMLElement) {
  const list = el("div", "guild-table");
  const name = el("input");
  name.value = "Captain Hook";
  name.maxLength = 80;
  name.setAttribute("aria-label", "Webhook name");
  const reload = () => {
    void host.invoke<unknown>("guild_admin", { request: { op: "list_channel_webhooks", channelId: channel.id } }).then((hooks) => {
      list.replaceChildren();
      const rows = Array.isArray(hooks) ? hooks : [];
      if (!rows.length) list.append(el("p", "hint", "No webhooks on this channel."));
      for (const raw of rows) {
        const hook = raw as { id?: string; name?: string };
        const line = el("div", "guild-row");
        line.append(el("span", "", hook.name || "Webhook"));
        const remove = el("button", "ghost", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => {
          void host.invoke("guild_admin", { request: { op: "delete_webhook", extra: hook.id ?? "" } })
            .then(() => reload())
            .catch((err) => host.toast("Couldn't delete the webhook", err instanceof Error ? err.message : "Discord refused."));
        });
        line.append(remove);
        list.append(line);
      }
    }).catch((err) => host.toast("Couldn't load webhooks", err instanceof Error ? err.message : "Discord refused."));
  };
  const create = el("button", "primary", "Create webhook");
  create.type = "button";
  create.addEventListener("click", () => {
    create.disabled = true;
    void host.invoke("guild_admin", { request: { op: "create_webhook", channelId: channel.id, body: { name: name.value.trim().slice(0, 80) || "Captain Hook" } } })
      .then(() => {
        create.disabled = false;
        reload();
      })
      .catch((err) => {
        create.disabled = false;
        host.toast("Couldn't create the webhook", err instanceof Error ? err.message : "Discord refused.");
      });
  });
  body.append(list, el("label", "field-label", "Name"), name, create);
  reload();
}
