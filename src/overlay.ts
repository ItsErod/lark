import { invoke } from "@tauri-apps/api/core";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderVoiceHud } from "./ui/hud";
import type { VoiceHudView } from "./voice-hud";

const host = document.querySelector("#hud");
let fitted = 0;

function isView(value: unknown): value is VoiceHudView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<VoiceHudView>;
  return typeof view.enabled === "boolean" && Array.isArray(view.people);
}

async function show(view: VoiceHudView) {
  if (!(host instanceof HTMLElement)) return;
  if (!view.enabled && !view.perf) {
    host.replaceChildren();
    return;
  }
  renderVoiceHud(host, view);
  const card = host.querySelector(".voice-hud");
  if (!(card instanceof HTMLElement)) return;
  try {
    const win = getCurrentWindow();
    const height = Math.min(480, Math.max(52, Math.ceil(card.offsetHeight + 8)));
    if (Math.abs(height - fitted) < 2) return;
    fitted = height;
    await win.setSize(new LogicalSize(240, height));
  } catch {
    // The browser preview of this page has no window bridge.
  }
}

async function restorePlace() {
  try {
    const win = getCurrentWindow();
    const saved = localStorage.getItem("lark.voiceHud.pos");
    if (saved) {
      const pos = JSON.parse(saved) as { x?: number; y?: number };
      if (typeof pos.x === "number" && typeof pos.y === "number" && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        await win.setPosition(new PhysicalPosition(pos.x, pos.y));
      }
    }
    await win.onMoved(({ payload }) => {
      localStorage.setItem("lark.voiceHud.pos", JSON.stringify({ x: payload.x, y: payload.y }));
    });
  } catch {
    // Position is remembered only in the desktop window.
  }
}

async function start() {
  let painted = false;
  await listen<VoiceHudView>("voice-hud", (event) => {
    if (!isView(event.payload)) return;
    painted = true;
    void show(event.payload);
  });
  await restorePlace();
  try {
    const current = await invoke<VoiceHudView | null>("current_voice_hud");
    if (!painted && isView(current)) await show(current);
  } catch {
    // The main window pushes a frame as soon as this page is up.
  }
}

if (host instanceof HTMLElement) void start();
