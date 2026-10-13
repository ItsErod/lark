import "../design-dashboard-view.css";
import type { DashboardHandlers, DashboardInput } from "./dashboard";
import type { Person } from "../types";

/**
 * Optional server and call dashboard. The module, its stylesheet, and each
 * tile load on open. Voice and screen share paint on the next frame so a
 * speaking tick cannot stall the chat tile.
 */

export const DASHBOARD_TILES = ["chat", "voice", "share", "feed", "dms", "pc", "playing"] as const;
export type TileId = (typeof DASHBOARD_TILES)[number];
export type BoardScope = "all" | "voice";

const TILE_TITLE: Record<TileId, string> = {
  chat: "Chat",
  voice: "Voice",
  share: "Screen share",
  feed: "Activity",
  dms: "Direct messages",
  pc: "This PC",
  playing: "Friends playing",
};

const YIELDED = new Set<TileId>(["voice", "share"]);

export function tilePaused(input: { open: boolean; hidden: boolean; onScreen: boolean }): boolean {
  return !input.open || input.hidden || !input.onScreen;
}

export function tileOnScreen(
  root: { top: number; bottom: number; height: number },
  box: { top: number; bottom: number; width: number },
): boolean {
  if (root.height < 8 || box.width <= 0) return false;
  return box.bottom > root.top && box.top < root.bottom;
}

/** Chat paints now. Voice and share wait for the next frame. */
export function tileFrames(ids: readonly TileId[]): { now: TileId[]; later: TileId[] } {
  return {
    now: ids.filter((id) => !YIELDED.has(id)),
    later: ids.filter((id) => YIELDED.has(id)),
  };
}

export function tilesForScope(scope: BoardScope, active: readonly TileId[]): TileId[] {
  if (scope === "voice") return active.filter((id) => id === "voice" || id === "share");
  return [...active];
}

export function voiceControlLabels(inCall: boolean, muted: boolean, deafened: boolean): string[] {
  if (!inCall) return ["Join"];
  return [muted ? "Unmute" : "Mute", deafened ? "Undeafen" : "Deafen", "Leave"];
}

export function voiceDomPlan(prevRoster: string, nextRoster: string, prevSpeak: string, nextSpeak: string): "skip" | "speak" | "rebuild" {
  if (prevRoster === nextRoster && prevSpeak === nextSpeak) return "skip";
  if (prevRoster === nextRoster && prevRoster !== "") return "speak";
  return "rebuild";
}

export interface ChatLine {
  id: string;
  author: string;
  text: string;
  mine: boolean;
}

export interface VoicePerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  self: boolean;
  sharing: boolean;
}

export interface ShareSlot {
  userId: string;
  name: string;
  label: string;
  self: boolean;
  paused: boolean;
  watching: boolean;
}

export interface DmRow {
  id: string;
  name: string;
  preview: string;
  unread: number;
}

export interface BoardSnapshot {
  channelName: string;
  inCall: boolean;
  muted: boolean;
  deafened: boolean;
  chat: ChatLine[];
  voiceName: string;
  voice: VoicePerson[];
  share: ShareSlot | null;
  feed: DashboardInput;
  dms: DmRow[];
  people: Person[];
  meId: string;
}

export interface BoardHandlers {
  onWrite: () => void;
  onOpenDm: (id: string) => void;
  onOpenUser: (id: string) => void;
  onJoinVoice: () => void;
  onMute: () => void;
  onDeafen: () => void;
  onLeave: () => void;
  onMutePerson: (id: string) => void;
  onWatch: (id: string) => void;
  onStopWatch: () => void;
  onStopShare: () => void;
  onShareHost: () => void;
  feed: DashboardHandlers;
}

export interface TileHandle {
  update(snapshot: BoardSnapshot): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface TileModule {
  mount(host: HTMLElement, handlers: BoardHandlers): TileHandle;
}

const LOADERS: Record<TileId, () => Promise<TileModule>> = {
  chat: () => import("./dash-tiles/chat"),
  voice: () => import("./dash-tiles/voice"),
  share: () => import("./dash-tiles/share"),
  feed: () => import("./dash-tiles/feed"),
  dms: () => import("./dash-tiles/dms"),
  pc: () => import("./dash-tiles/pc"),
  playing: () => import("./dash-tiles/playing"),
};

interface Slot {
  id: TileId;
  tile: HTMLElement;
  body: HTMLElement;
  onScreen: boolean;
  paused: boolean;
  handle: TileHandle | null;
  loading: Promise<void> | null;
}

export interface BoardSession {
  show(snapshot: BoardSnapshot, scope?: BoardScope): void;
  pause(): void;
  destroy(): void;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountBoard(host: HTMLElement, handlers: BoardHandlers): BoardSession {
  const board = el("div", "dash-board");
  board.setAttribute("aria-label", "Dashboard");
  const slots = new Map<TileId, Slot>();
  for (const id of DASHBOARD_TILES) {
    const tile = el("section", `dash-tile tile-${id}`);
    tile.dataset.tile = id;
    const head = el("header", "dash-tile-head");
    head.append(el("h3", "", TILE_TITLE[id]));
    const body = el("div", "dash-tile-body");
    tile.append(head, body);
    board.append(tile);
    tile.dataset.paused = "1";
    slots.set(id, { id, tile, body, onScreen: false, paused: true, handle: null, loading: null });
  }
  host.replaceChildren(board);

  let open = true;
  let snapshot: BoardSnapshot | null = null;
  let frame = 0;
  let scrollFrame = 0;

  const session: BoardSession = {
    show(next, scope = "all") {
      open = true;
      snapshot = next;
      if (scope === "voice") {
        paint(tilesForScope("voice", DASHBOARD_TILES).filter((id) => {
          const slot = slots.get(id);
          return Boolean(slot?.handle) && !slot?.paused;
        }));
        return;
      }
      measure();
    },
    pause() {
      if (!open && ![...slots.values()].some((slot) => slot.handle || slot.loading)) return;
      open = false;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const slot of slots.values()) release(slot, true);
    },
    destroy() {
      session.pause();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      board.removeEventListener("scroll", onScroll);
      host.replaceChildren();
    },
  };

  function release(slot: Slot, drop: boolean) {
    slot.handle?.pause();
    slot.paused = true;
    slot.tile.dataset.paused = "1";
    if (!drop) return;
    slot.handle?.destroy();
    slot.handle = null;
    slot.loading = null;
    slot.body.replaceChildren();
  }

  function paint(ids: readonly TileId[]) {
    if (!snapshot) return;
    const frames = tileFrames(ids);
    const snap = snapshot;
    for (const id of frames.now) slots.get(id)?.handle?.update(snap);
    if (!frames.later.length) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!open || document.hidden || snapshot !== snap) return;
      for (const id of frames.later) {
        const slot = slots.get(id);
        if (!slot?.handle || slot.paused) continue;
        slot.handle.update(snap);
      }
    });
  }

  function ensure(slot: Slot) {
    if (slot.handle || slot.loading) return;
    const loader = LOADERS[slot.id];
    slot.loading = loader().then((mod) => {
      slot.loading = null;
      if (!open || document.hidden || !slot.onScreen) return;
      slot.handle = mod.mount(slot.body, handlers);
      slot.paused = false;
      slot.tile.dataset.paused = "0";
      if (!snapshot) return;
      const frames = tileFrames([slot.id]);
      if (frames.later.length) {
        const snap = snapshot;
        requestAnimationFrame(() => {
          if (!open || document.hidden || snapshot !== snap || !slot.handle || slot.paused) return;
          slot.handle.update(snap);
        });
        return;
      }
      slot.handle.update(snapshot);
    }).catch(() => {
      slot.loading = null;
      slot.body.replaceChildren(el("p", "dash-tile-empty", "Couldn't load this tile."));
    });
  }

  function measure() {
    if (!open || !snapshot) return;
    const root = board.getBoundingClientRect();
    if (root.height < 8) {
      requestAnimationFrame(() => {
        if (open) measure();
      });
      return;
    }
    const active: TileId[] = [];
    for (const slot of slots.values()) {
      const box = slot.tile.getBoundingClientRect();
      slot.onScreen = tileOnScreen(
        { top: root.top, bottom: root.bottom, height: root.height },
        { top: box.top, bottom: box.bottom, width: box.width },
      );
      const paused = tilePaused({ open, hidden: document.hidden, onScreen: slot.onScreen });
      if (!slot.onScreen) {
        if (slot.handle || slot.body.childElementCount) release(slot, true);
        else slot.paused = true;
        continue;
      }
      if (paused) {
        if (!slot.paused) release(slot, false);
        continue;
      }
      if (!slot.handle) {
        ensure(slot);
        continue;
      }
      if (slot.paused) {
        slot.handle.resume();
        slot.paused = false;
        slot.tile.dataset.paused = "0";
      }
      active.push(slot.id);
    }
    paint(active);
  }

  function onVis() {
    if (document.hidden) {
      for (const slot of slots.values()) {
        if (!slot.paused) release(slot, false);
      }
      return;
    }
    if (open) measure();
  }

  function onScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (open) measure();
    });
  }

  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(() => {
      if (open) measure();
    }, { root: board, threshold: 0 })
    : null;
  if (observer) {
    for (const slot of slots.values()) observer.observe(slot.tile);
  }
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("resize", onScroll);
  board.addEventListener("scroll", onScroll, { passive: true });
  const baseDestroy = session.destroy;
  session.destroy = () => {
    window.removeEventListener("resize", onScroll);
    baseDestroy();
  };
  return session;
}
