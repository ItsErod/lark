export function formatRelative(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const delta = now - then;
  const future = delta < 0;
  const abs = Math.abs(delta);
  const sec = Math.round(abs / 1000);
  if (sec < 45) return future ? "in a moment" : "just now";
  const min = Math.round(abs / 60_000);
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(abs / 3_600_000);
  if (hr < 36) return future ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(abs / 86_400_000);
  if (day < 7) return future ? `in ${day}d` : `${day}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(then));
}

export function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
