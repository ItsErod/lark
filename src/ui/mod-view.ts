/** Member Mod View: roles, join date, recent messages, and moderation actions. */

import { TIMEOUTS, timeoutUntil } from "../server-model";
import { el } from "./dom";

export interface ModRole {
  id: string;
  name: string;
  position?: number;
}

export interface ModMessage {
  id: string;
  channelId: string;
  content: string;
}

export interface ModVoice {
  inVoice: boolean;
  mute: boolean;
  deaf: boolean;
}

export interface ModViewHost {
  isDemo(): boolean;
  name(userId: string): string;
  roles(guildId: string): ModRole[];
  memberRoleIds(userId: string): string[];
  localMessages(userId: string): ModMessage[];
  voice(guildId: string, userId: string): ModVoice;
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  toast(title: string, detail: string): void;
  jump(channelId: string, messageId: string): void;
  rememberRole(userId: string, roleId: string, on: boolean): void;
  noteVoice(userId: string, kind: "mute" | "deaf", on: boolean): void;
}

export function joinLabel(iso?: string | null): string {
  if (!iso) return "Join date not loaded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Join date not loaded";
  return `Joined ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

export function messageLines(value: unknown, limit = 8): ModMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ModMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const channelId = typeof row.channelId === "string" ? row.channelId : typeof row.channel_id === "string" ? row.channel_id : "";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    out.push({ id, channelId, content: content || "Empty message" });
    if (out.length >= limit) break;
  }
  return out;
}

export function roleRows(value: unknown, guildId: string): ModRole[] {
  if (!Array.isArray(value)) return [];
  const roles: ModRole[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name : "";
    if (!id || id === guildId || !name) continue;
    const position = typeof row.position === "number" ? row.position : 0;
    roles.push({ id, name, position });
  }
  return roles.sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
}

/** Server mute and deafen use the live voice state when the member is in a channel. */
export function voiceCommand(inVoice: boolean, kind: "mute" | "deaf", on: boolean, guildId: string, userId: string): { command: string; args: Record<string, unknown> } {
  if (inVoice) {
    return {
      command: "set_member_voice",
      args: {
        guildId,
        userId,
        mute: kind === "mute" ? on : kind === "deaf" && on ? true : null,
        deaf: kind === "deaf" ? on : null,
        channelId: null,
        disconnect: false,
        suppress: null,
      },
    };
  }
  const body = kind === "mute" ? { mute: on } : on ? { deaf: true, mute: true } : { deaf: false };
  return {
    command: "guild_admin",
    args: { request: { op: "patch_member", guildId, userId, body } },
  };
}

export function installModView(host: ModViewHost) {
  const api = (globalThis as { larkModView?: { open?: (userId: string, guildId: string | null) => void } });
  api.larkModView = {
    open(userId, guildId) {
      if (!guildId) {
        host.toast("Mod View", "Open a server to moderate this member.");
        return;
      }
      openPanel(host, userId, guildId);
    },
  };
}

function openPanel(host: ModViewHost, userId: string, guildId: string) {
  document.getElementById("lark-mod-view")?.remove();
  const layer = el("div", "modal-layer");
  layer.id = "lark-mod-view";
  const card = el("article", "modal-card");
  card.style.width = "min(560px, calc(100% - 32px))";
  const name = host.name(userId);
  card.append(el("h2", "", name));
  card.append(el("p", "hint", "Mod View"));
  const join = el("p", "", "Join date not loaded");
  const roles = el("div", "role-picks");
  const messages = el("div", "role-picks");
  const voice = host.voice(guildId, userId);
  let flags = { ...voice };
  const mute = el("button", "ghost", flags.mute ? "Remove server mute" : "Server mute");
  const deaf = el("button", "ghost", flags.deaf ? "Remove server deafen" : "Server deafen");
  mute.type = "button";
  deaf.type = "button";
  const paintFlags = () => {
    mute.textContent = flags.mute ? "Remove server mute" : "Server mute";
    deaf.textContent = flags.deaf ? "Remove server deafen" : "Server deafen";
  };
  const applyVoice = (kind: "mute" | "deaf") => {
    const on = kind === "mute" ? !flags.mute : !flags.deaf;
    if (host.isDemo()) {
      flags = { ...flags, [kind]: on, mute: kind === "deaf" && on ? true : kind === "mute" ? on : flags.mute };
      host.noteVoice(userId, kind, on);
      paintFlags();
      host.toast("Mod View", "Demo moderation stays on this device.");
      return;
    }
    const call = voiceCommand(flags.inVoice, kind, on, guildId, userId);
    void host.invoke(call.command, call.args).then(() => {
      flags = { ...flags, [kind]: on, mute: kind === "deaf" && on ? true : kind === "mute" ? on : flags.mute };
      host.noteVoice(userId, kind, on);
      paintFlags();
    }).catch((err: unknown) => host.toast("Mod View", err instanceof Error ? err.message : "Couldn't update voice."));
  };
  mute.addEventListener("click", () => applyVoice("mute"));
  deaf.addEventListener("click", () => applyVoice("deaf"));

  const timeout = el("select");
  timeout.setAttribute("aria-label", "Timeout");
  timeout.append(new Option("No timeout", "0"));
  for (const option of TIMEOUTS) timeout.append(new Option(option.label, String(option.seconds)));
  const applyTimeout = el("button", "ghost", "Timeout");
  applyTimeout.type = "button";
  applyTimeout.addEventListener("click", () => {
    if (host.isDemo()) {
      host.toast("Mod View", "Demo moderation stays on this device.");
      return;
    }
    const seconds = Number(timeout.value);
    const body = seconds ? { communication_disabled_until: timeoutUntil(seconds) } : { communication_disabled_until: null };
    void host.invoke("guild_admin", { request: { op: "patch_member", guildId, userId, body } })
      .then(() => host.toast("Timeout", seconds ? "Timeout set." : "Timeout cleared."))
      .catch((err: unknown) => host.toast("Mod View", err instanceof Error ? err.message : "Couldn't update the timeout."));
  });
  const kick = el("button", "ghost", "Kick");
  const ban = el("button", "ghost is-danger", "Ban");
  kick.type = "button";
  ban.type = "button";
  const close = () => layer.remove();
  kick.addEventListener("click", () => {
    if (!window.confirm(`Kick ${name}?`)) return;
    if (host.isDemo()) {
      host.toast("Mod View", "Demo moderation stays on this device.");
      return;
    }
    void host.invoke("guild_admin", { request: { op: "kick_member", guildId, userId } })
      .then(() => { host.toast("Kicked", name); close(); })
      .catch((err: unknown) => host.toast("Mod View", err instanceof Error ? err.message : "Couldn't kick."));
  });
  ban.addEventListener("click", () => {
    if (!window.confirm(`Ban ${name}?`)) return;
    if (host.isDemo()) {
      host.toast("Mod View", "Demo moderation stays on this device.");
      return;
    }
    void host.invoke("guild_admin", { request: { op: "ban", guildId, userId, body: { delete_message_seconds: 0 } } })
      .then(() => { host.toast("Banned", name); close(); })
      .catch((err: unknown) => host.toast("Mod View", err instanceof Error ? err.message : "Couldn't ban."));
  });
  const dismiss = el("button", "ghost", "Close");
  dismiss.type = "button";
  dismiss.addEventListener("click", close);
  layer.addEventListener("click", (event) => { if (event.target === layer) close(); });

  const paintRoles = (list: ModRole[], selected: Set<string>) => {
    roles.replaceChildren();
    if (!list.length) {
      roles.append(el("p", "hint", "No roles loaded."));
      return;
    }
    for (const role of list) {
      const label = el("label", "check-row");
      const box = el("input");
      box.type = "checkbox";
      box.checked = selected.has(role.id);
      box.addEventListener("change", () => {
        const on = box.checked;
        if (host.isDemo()) {
          host.rememberRole(userId, role.id, on);
          host.toast("Mod View", "Demo moderation stays on this device.");
          return;
        }
        const op = on ? "add_role" : "remove_role";
        void host.invoke("guild_admin", { request: { op, guildId, userId, roleId: role.id } })
          .then(() => host.rememberRole(userId, role.id, on))
          .catch((err: unknown) => {
            box.checked = !on;
            host.toast("Mod View", err instanceof Error ? err.message : "Couldn't update roles.");
          });
      });
      label.append(box, el("span", "", role.name));
      roles.append(label);
    }
  };
  const paintMessages = (list: ModMessage[], note: string) => {
    messages.replaceChildren();
    if (!list.length) {
      messages.append(el("p", "hint", note));
      return;
    }
    for (const message of list) {
      const button = el("button", "text-button", message.content.slice(0, 140));
      button.type = "button";
      button.style.textAlign = "left";
      button.addEventListener("click", () => {
        if (!message.channelId) return;
        close();
        host.jump(message.channelId, message.id);
      });
      messages.append(button);
    }
  };

  let shownRoles = host.roles(guildId);
  let selectedRoles = new Set(host.memberRoleIds(userId));
  const renderRoles = () => paintRoles(shownRoles, selectedRoles);
  renderRoles();
  paintMessages(host.localMessages(userId), host.isDemo() ? "No recent messages loaded." : "Loading messages…");
  card.append(
    el("p", "field-label", "Roles"),
    roles,
    join,
    el("p", "field-label", "Recent messages"),
    messages,
    el("p", "field-label", "Timeout"),
    timeout,
    applyTimeout,
  );
  const actions = el("div", "choice-row");
  actions.append(mute, deaf, kick, ban, dismiss);
  card.append(actions);
  layer.append(card);
  document.body.append(layer);

  if (host.isDemo()) return;
  void host.invoke<unknown>("guild_admin", { request: { op: "list_roles", guildId } })
    .then((payload) => {
      const listed = roleRows(payload, guildId);
      if (!listed.length || !layer.isConnected) return;
      shownRoles = listed;
      renderRoles();
    })
    .catch(() => undefined);
  void host.invoke<{ joinedAt?: string; roleIds?: string[] }>("fetch_profile", { userId, guildId })
    .then((profile) => {
      if (!layer.isConnected) return;
      join.textContent = joinLabel(profile?.joinedAt);
      if (profile?.roleIds) {
        selectedRoles = new Set(profile.roleIds);
        renderRoles();
      }
    })
    .catch(() => { if (layer.isConnected) join.textContent = joinLabel(null); });
  void host.invoke<unknown>("search_filtered", {
    guildId,
    channelId: null,
    search: { content: "", authorIds: [userId], mentionIds: [], has: [], channelIds: [], pinned: null },
  }).then((payload) => {
    if (!layer.isConnected) return;
    const remote = messageLines(payload);
    paintMessages(remote.length ? remote : host.localMessages(userId), "No recent messages.");
  }).catch(() => {
    if (layer.isConnected) paintMessages(host.localMessages(userId), "Discord search missed. Showing loaded messages.");
  });
}
