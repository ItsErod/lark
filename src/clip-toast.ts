import { clipDisplayTitle } from "./clips";

/** Toast copy: "Clip saved · Valorant" or the failure reason. */
export function toastText(ok: boolean, text: string): string {
  if (!ok) return text ? `Clip not saved · ${text}` : "Clip not saved";
  const title = text ? clipDisplayTitle(text) : "";
  return title && title !== "Saved clip" ? `Clip saved · ${title}` : "Clip saved";
}

function chime(ok: boolean): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const notes = ok ? [880, 1320] : [440, 330];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      const at = ctx.currentTime + i * 0.09;
      osc.start(at);
      osc.stop(at + 0.08);
    });
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    // No audio device: the toast still shows.
  }
}

if (typeof document !== "undefined" && document.getElementById("toast")) {
  const params = new URLSearchParams(location.search);
  const ok = params.get("ok") === "1";
  const box = document.getElementById("toast")!;
  document.getElementById("text")!.textContent = toastText(ok, params.get("t") ?? "");
  box.classList.toggle("fail", !ok);
  requestAnimationFrame(() => box.classList.add("on"));
  setTimeout(() => box.classList.remove("on"), 1950);
  chime(ok);
}
