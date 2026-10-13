/** Incoming DM and group calls. Joining still happens on Answer. Decline only stops the ring. */

export interface CallWire {
  channelId: string;
  ringing: readonly string[];
  ended: boolean;
  video: boolean;
}

export interface RingState {
  channelId: string;
  callerName: string;
  video: boolean;
}

const SNOWFLAKE = /^\d{5,22}$/;

export function callerName(selfId: string, people: readonly { id: string; name: string }[]): string {
  const names = people
    .filter((person) => person.id !== selfId)
    .map((person) => person.name.trim())
    .filter((name) => name.length > 0);
  if (!names.length) return "Someone";
  if (names.length === 1) return names[0];
  return `${names[0]} and ${names.length - 1} more`;
}

/** Who to ring when this client starts the call. Never includes the caller. */
export function ringTargets(selfId: string, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const clean = id.trim();
    if (!SNOWFLAKE.test(clean) || clean === selfId || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * The next incoming-call card. A call this client already joined, a call that
 * ended, or a ring list that does not include this user clears only that channel.
 */
export function applyCall(
  current: RingState | null,
  wire: CallWire,
  selfId: string,
  name: string,
  inThisCall: boolean,
): RingState | null {
  const channelId = wire.channelId.trim();
  if (!SNOWFLAKE.test(channelId)) return current;
  const mine = wire.ringing.some((id) => id === selfId);
  if (wire.ended || inThisCall || !mine) {
    return current?.channelId === channelId ? null : current;
  }
  return {
    channelId,
    callerName: name.trim() || "Someone",
    video: wire.video,
  };
}

export function ringAudible(callSound: boolean, ringing: boolean): boolean {
  return ringing && callSound;
}

/** A hidden or unfocused window still needs a system notification. */
export function ringInBackground(hidden: boolean, focused: boolean): boolean {
  return hidden || !focused;
}

export function incomingNotice(caller: string, video: boolean): { title: string; body: string } {
  const who = caller.trim() || "Someone";
  const title = video ? "Incoming video call" : "Incoming call";
  return { title, body: `${who} is calling. Answer or decline.` };
}

export interface RingClock {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export interface RingHandle {
  start(): void;
  stop(): void;
}

/** Repeats a short tone until stop. Starting twice does not stack timers. */
export function createRingtone(play: () => void, everyMs: number, clock: RingClock): RingHandle {
  let id = 0;
  return {
    start() {
      if (id) return;
      play();
      id = clock.setInterval(play, everyMs);
    },
    stop() {
      if (!id) return;
      clock.clearInterval(id);
      id = 0;
    },
  };
}

let ringCtx: AudioContext | null = null;

/** Two short tones. The card itself stays still; this is the only ring motion. */
export function pulseRingtone(): void {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  const ctx = ringCtx ?? new Ctx();
  ringCtx = ctx;
  void ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  tone(ctx, now, 440);
  tone(ctx, now + 0.16, 480);
}

export function stopRingtoneContext(): void {
  const ctx = ringCtx;
  ringCtx = null;
  void ctx?.close().catch(() => undefined);
}

function tone(ctx: AudioContext, when: number, freq: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.05, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.14);
}
