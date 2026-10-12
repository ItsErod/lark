import { formatRelative } from "./relative";

export type TimeMode = "relative" | "absolute";
export type HourCycle = "12" | "24";

export interface TimeFormat {
  locale?: string;
  timeZone?: string;
}

export function formatStamp(iso: string, now: number, mode: TimeMode, hours: HourCycle, format: TimeFormat = {}): string {
  if (mode === "relative") return formatRelative(iso, now);
  return formatClock(iso, hours, format);
}

export function formatFull(iso: string, hours: HourCycle, format: TimeFormat = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(format.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: hours === "12" ? "h12" : "h23",
    timeZone: format.timeZone,
  }).format(date);
}

function formatClock(iso: string, hours: HourCycle, format: TimeFormat): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(format.locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hours === "12" ? "h12" : "h23",
    timeZone: format.timeZone,
  }).format(date);
}
