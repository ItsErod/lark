/**
 * Local microphone meter for the muted-talk banner.
 * The stream stays in this process. Nothing here calls set_voice_transmit.
 */

import { micLevel } from "./voice";

export type MicConstraint = true | { deviceId: { exact: string } };

export interface MutedProbe {
  /** Opens the analyser when the constraint changes. A repeat with the same constraint is a no-op. */
  arm(constraint: MicConstraint): void;
  stop(): void;
}

export function createMutedProbe(onLevel: (level: number, stepMs: number) => void): MutedProbe {
  let key = "";
  let generation = 0;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let timer = 0;

  const stopTracks = () => {
    window.clearTimeout(timer);
    timer = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const closing = context;
    context = null;
    closing?.close().catch(() => undefined);
  };

  return {
    arm(constraint) {
      const next = constraint === true ? "*" : constraint.deviceId.exact;
      if (next === key) return;
      generation += 1;
      stopTracks();
      key = next;
      const ticket = generation;
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) return;
      void devices.getUserMedia({ audio: constraint, video: false }).then((opened) => {
        if (ticket !== generation) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        const audio = new AudioContext();
        context = audio;
        const source = audio.createMediaStreamSource(opened);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const bins = new Float32Array(analyser.fftSize);
        let last = 0;
        const pump = () => {
          if (ticket !== generation) return;
          analyser.getFloatTimeDomainData(bins);
          const now = performance.now();
          const step = last === 0 ? 80 : Math.min(500, Math.max(0, now - last));
          last = now;
          onLevel(micLevel(bins), step);
          if (ticket !== generation) return;
          timer = window.setTimeout(pump, 80);
        };
        pump();
      }).catch(() => undefined);
    },
    stop() {
      generation += 1;
      key = "";
      stopTracks();
    },
  };
}
