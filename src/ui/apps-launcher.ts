/**
 * Composer Apps button. Registers `onLaunchActivity` so the launcher opens
 * the activity catalog and can run app commands in the current channel.
 */
import { currentParityHost } from "../threads";
import { ACTIVITIES, activityById, activityLaunchTarget } from "../voice-stage";
import {
  commandsFromPayload,
  interactionBody,
  registerMessagingHooks,
  type SlashCommand,
} from "./composer-tools";
import { el } from "./dom";
import { needsForm } from "../slash-options";
import { openSlashForm } from "./slash-form";

function shell() {
  return currentParityHost();
}

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById("lark-apps-style")) return;
  const style = document.createElement("style");
  style.id = "lark-apps-style";
  style.textContent = `
    #lark-apps-catalog { position: fixed; z-index: 40; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(420px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 48px)); overflow: auto;
      padding: 16px; color: var(--text); background: var(--bg-1); border: 1px solid var(--line); border-radius: 8px; }
    #lark-apps-catalog h3 { margin: 12px 0 8px; font-size: 13px; text-transform: uppercase; color: var(--muted); }
    #lark-apps-catalog header { display: flex; align-items: center; gap: 8px; }
    #lark-apps-catalog header strong { font-size: 16px; }
    #lark-apps-catalog button { border: 0; border-radius: 6px; padding: 8px 10px; background: var(--bg-3); color: var(--text); cursor: pointer; text-align: left; width: 100%; }
    #lark-apps-catalog button:hover { background: var(--bg-4, var(--bg-3)); }
    #lark-apps-catalog .lark-apps-close { width: auto; margin-left: auto; }
    #lark-apps-catalog p { color: var(--muted); margin: 4px 0 8px; }
  `;
  document.head.append(style);
}

export function openActivityCatalog(channelId: string | null) {
  if (typeof document === "undefined") return;
  ensureStyle();
  document.getElementById("lark-apps-catalog")?.remove();
  const panel = el("section", "");
  panel.id = "lark-apps-catalog";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Apps");
  const head = el("header");
  head.append(el("strong", "", "Apps"));
  const close = el("button", "lark-apps-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => panel.remove());
  head.append(close);
  panel.append(head);
  panel.append(el("h3", "", "Activities"));
  const voiceId = shell()?.voiceChannelId ?? null;
  if (!activityLaunchTarget(ACTIVITIES[0]?.id ?? "", voiceId)) {
    panel.append(el("p", "", "Join a voice channel to start an activity. The invite uses the call you are already in."));
  }
  for (const activity of ACTIVITIES) {
    const button = el("button", "", activity.name);
    button.type = "button";
    button.addEventListener("click", () => void startActivity(activity.id));
    panel.append(button);
  }
  const commands = el("div");
  panel.append(el("h3", "", "App commands"), commands);
  document.body.append(panel);
  void loadCommands(channelId, commands);
}

async function startActivity(applicationId: string) {
  const host = shell();
  const activity = activityById(applicationId);
  const target = activityLaunchTarget(applicationId, host?.voiceChannelId);
  if (!activity || !target) {
    host?.toast("Apps", "Join a voice channel to start an activity.");
    return;
  }
  if (!host || host.demo) {
    host?.toast(activity.name, "Activity invite is ready in the desktop app.");
    document.getElementById("lark-apps-catalog")?.remove();
    return;
  }
  try {
    const url = await host.invoke<string>("create_activity_invite", {
      channelId: target.channelId,
      applicationId: target.applicationId,
    });
    host.toast(activity.name, url);
    document.getElementById("lark-apps-catalog")?.remove();
  } catch (error) {
    host.toast(activity.name, error instanceof Error ? error.message : "Couldn't start that activity.");
  }
}

async function loadCommands(channelId: string | null, commands: HTMLElement) {
  const host = shell();
  if (!host || host.demo || !channelId) {
    commands.append(el("p", "", host?.demo ? "Demo mode doesn't run Discord apps." : "Open a channel to use app commands."));
    return;
  }
  try {
    const payload = await host.invoke<unknown>("search_app_commands", {
      guildId: host.guildId,
      channelId,
      query: "",
      kind: 1,
    });
    const list = commandsFromPayload(payload).filter((command) => (command.type || 1) === 1);
    if (!list.length) {
      commands.append(el("p", "", "No app commands in this channel."));
      return;
    }
    for (const command of list) {
      const button = el("button", "", `/${command.name}`);
      button.type = "button";
      if (command.description) button.title = command.description;
      button.addEventListener("click", () => void runCommand(command, channelId));
      commands.append(button);
    }
  } catch (error) {
    commands.append(el("p", "", error instanceof Error ? error.message : "Couldn't load app commands."));
  }
}

async function runCommand(command: SlashCommand, channelId: string) {
  const host = shell();
  if (!host) return;
  const body = interactionBody({
    command,
    channelId,
    guildId: host.guildId,
    args: "",
  });
  if (!body || needsForm(command)) {
    document.getElementById("lark-apps-catalog")?.remove();
    openSlashForm(command, channelId);
    return;
  }
  if (host.demo) {
    host.toast("Apps", "Demo mode doesn't run Discord apps.");
    return;
  }
  try {
    await host.invoke("invoke_command", { payload: body });
    host.toast("Apps", `/${command.name} sent.`);
    document.getElementById("lark-apps-catalog")?.remove();
  } catch (error) {
    host.toast("Apps", error instanceof Error ? error.message : "Discord refused the command.");
  }
}

registerMessagingHooks({
  onLaunchActivity: (channelId) => openActivityCatalog(channelId || null),
});
