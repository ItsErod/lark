/**
 * Where a call sits relative to the text channel.
 *
 * Being in a call stays on the current text channel. The grid opens only on
 * purpose: the call strip, the voice channel you are already in, or the hotkey.
 * A split shares the chat column. A pop-out is another window. Video and stream
 * tiles use the grid, or one picture-in-picture tile above the composer.
 * Screen tiles are the stream slot, so a Go Live tile uses the same containers.
 */

export type CallSurface = "chat" | "split" | "popout";
export type PipCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CALL_STRIP_KEY = "lark.call.strip";
export const CALL_PIP_KEY = "lark.call.pip";
export const CALL_SPLIT_KEY = "lark.call.split";
export const CALL_BUS = "lark-call";

/** One row. Collapsed is zero, which is the default. */
export const STRIP_HEIGHT = 40;
export const PIP_WIDTH = 280;
export const PIP_HEIGHT = 158;
export const PIP_GAP = 12;
export const SPLIT_MIN = 0.28;
export const SPLIT_MAX = 0.62;
export const SPLIT_DEFAULT = 0.42;

const CORNERS: readonly PipCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CallChrome {
  /** The transcript stays mounted. A call never replaces it. */
  messages: true;
  /** The composer stays mounted and is never covered by a tile. */
  composer: true;
  /** Hidden while you read. Split shares the column. Window is another window. */
  grid: "hidden" | "split" | "window";
  /** 0 when the strip is collapsed or you are not in a call. */
  stripPx: number;
  pip: boolean;
  /** The member list is not collapsed just because a call is up. */
  members: true;
  /** Voice-channel text beside the call. Closed leaves the column alone. */
  voiceChat: boolean;
  /** Full screen grows the call and still leaves the transcript and composer mounted. */
  fullScreen: boolean;
  /** A call never covers the text channel or the composer. */
  blocksChat: false;
}

/** Voice-channel text column. The main transcript keeps at least this much width. */
export const VOICE_CHAT_WIDTH = 320;
export const VOICE_CHAT_MIN_MAIN = 280;

export function readStripOpen(raw: string | null): boolean {
  return raw === "1";
}

export function readPipCorner(raw: string | null): PipCorner {
  return raw !== null && (CORNERS as readonly string[]).includes(raw) ? (raw as PipCorner) : "bottom-right";
}

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ratio));
}

export function readSplitRatio(raw: string | null): number {
  return clampSplitRatio(raw === null || raw === "" ? SPLIT_DEFAULT : Number(raw));
}

/**
 * Clicking a voice channel joins it and leaves the text channel alone.
 * Clicking the channel you are already in opens the grid, or dismisses it.
 * An open grid stays open when you move to a different voice channel.
 */
export function voiceChannelAction(input: { joinedThisChannel: boolean; surface: CallSurface }): { join: boolean; surface: CallSurface } {
  if (!input.joinedThisChannel) return { join: true, surface: input.surface };
  return { join: false, surface: input.surface === "chat" ? "split" : "chat" };
}

/** Hotkey opens the split, or dismisses a split or pop-out back to the text channel. */
export function toggleCallHotkey(inCall: boolean, surface: CallSurface): CallSurface {
  if (!inCall) return surface;
  return surface === "chat" ? "split" : "chat";
}

export function dismissCallSurface(): CallSurface {
  return "chat";
}

export function callChrome(input: {
  inCall: boolean;
  surface: CallSurface;
  stripOpen: boolean;
  hasMedia: boolean;
  showChat?: boolean;
  fullScreen?: boolean;
}): CallChrome {
  const grid = !input.inCall || input.surface === "chat" ? "hidden" : input.surface === "split" ? "split" : "window";
  return {
    messages: true,
    composer: true,
    grid,
    stripPx: input.inCall && input.stripOpen ? STRIP_HEIGHT : 0,
    pip: Boolean(input.inCall && input.surface === "chat" && input.hasMedia && !input.fullScreen),
    members: true,
    voiceChat: Boolean(input.inCall && input.showChat),
    fullScreen: Boolean(input.inCall && input.fullScreen),
    blocksChat: false,
  };
}

/**
 * The voice-channel side panel takes a column. The transcript keeps a minimum
 * width, and the panel stops above the composer so it never covers either one.
 * A frame that is too narrow closes the panel instead of overlapping the chat.
 */
export function voiceChatInsets(
  open: boolean,
  frameWidth: number,
  composerHeight: number,
): { marginRight: number; panelWidth: number; panelBottom: number; coversComposer: false } {
  const bottom = Math.max(0, composerHeight);
  if (!open || !Number.isFinite(frameWidth)) {
    return { marginRight: 0, panelWidth: 0, panelBottom: bottom, coversComposer: false };
  }
  const room = frameWidth - VOICE_CHAT_MIN_MAIN;
  const panelWidth = Math.min(VOICE_CHAT_WIDTH, Math.floor(room));
  if (panelWidth < 180) {
    return { marginRight: 0, panelWidth: 0, panelBottom: bottom, coversComposer: false };
  }
  return { marginRight: panelWidth, panelWidth, panelBottom: bottom, coversComposer: false };
}

/** Screen (Go Live / stream) leads. Camera is next. Avatars are not a preview tile. */
export function leadMedia<T extends { kind: string }>(tiles: readonly T[]): T | null {
  return tiles.find((tile) => tile.kind === "screen") ?? tiles.find((tile) => tile.kind === "video") ?? null;
}

export function stripPeople<T extends { id: string; name: string; self: boolean; speaking: boolean }>(people: readonly T[]): T[] {
  return [...people]
    .filter((person) => person.id)
    .sort((a, b) => {
      if (a.self !== b.self) return a.self ? -1 : 1;
      if (a.speaking !== b.speaking) return a.speaking ? -1 : 1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
}

export function stripWindow<T>(people: readonly T[], limit = 12): { shown: T[]; extra: number } {
  if (people.length <= limit) return { shown: [...people], extra: 0 };
  return { shown: people.slice(0, limit), extra: people.length - limit };
}

export function pipPoint(corner: PipCorner, frame: Box, blocker: Box | null, size: { width: number; height: number }, gap = PIP_GAP): Point {
  const left = frame.x + gap;
  const right = frame.x + frame.width - size.width - gap;
  const top = frame.y + gap;
  const limit = blocker ? Math.min(frame.y + frame.height, blocker.y) : frame.y + frame.height;
  const bottom = limit - size.height - gap;
  const x = corner.endsWith("right") ? right : left;
  const y = corner.startsWith("bottom") ? bottom : top;
  return clampPip({ x, y }, size, frame, blocker, gap);
}

export function pipAnchors(frame: Box, blocker: Box | null, size: { width: number; height: number }, gap = PIP_GAP): Record<PipCorner, Point> {
  return {
    "top-left": pipPoint("top-left", frame, blocker, size, gap),
    "top-right": pipPoint("top-right", frame, blocker, size, gap),
    "bottom-left": pipPoint("bottom-left", frame, blocker, size, gap),
    "bottom-right": pipPoint("bottom-right", frame, blocker, size, gap),
  };
}

/** Keeps the tile inside the message frame and above the composer. */
export function clampPip(point: Point, size: { width: number; height: number }, frame: Box, blocker: Box | null, gap = PIP_GAP): Point {
  const minX = frame.x + gap;
  const maxX = Math.max(minX, frame.x + frame.width - size.width - gap);
  const minY = frame.y + gap;
  const limitBottom = blocker ? Math.min(frame.y + frame.height, blocker.y) : frame.y + frame.height;
  const maxY = Math.max(minY, limitBottom - size.height - gap);
  return {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y)),
  };
}

export function nearestPipCorner(point: Point, anchors: Record<PipCorner, Point>): PipCorner {
  let best: PipCorner = "bottom-right";
  let score = Infinity;
  for (const corner of CORNERS) {
    const anchor = anchors[corner];
    const dist = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
    if (dist < score) {
      score = dist;
      best = corner;
    }
  }
  return best;
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
