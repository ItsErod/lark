import { CALL_BUS } from "./call-layout";
import type { RingMotion, StageTile } from "./voice-stage";
import type { CallClip } from "./ui/voice-view";

/** Snapshot the pop-out window paints. Tiles are plain data, including stream tiles. */
export interface CallFrame {
  channel: string;
  tiles: StageTile[];
  motion: RingMotion;
  speakColor: string;
  cameraOn: boolean;
  shareOn: boolean;
  muted: boolean;
  deafened: boolean;
  activitiesOpen: boolean;
  clips: CallClip[];
}

export type CallCommand =
  | { type: "mute" | "deafen" | "leave" | "camera" | "share" | "close" | "dock" | "activities" }
  | { type: "play"; id: string };

export function openCallPopout(): Window | null {
  if (typeof window === "undefined" || typeof window.open !== "function") return null;
  const child = window.open("/?popout=call", "lark-call", "popup=yes,width=960,height=640,resizable=yes");
  return child && !child.closed ? child : null;
}

export function callBus(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CALL_BUS);
}
