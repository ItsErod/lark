import "../design-stats.css";
import { el } from "./dom";
import { settingCard, settingHead, settingRow, switchControl } from "./settings";
import { clearStats, collecting, formatDuration, setCollecting, statsView, type StatsView } from "./stats-store";

export interface StatsPageHooks {
  onCollecting: (on: boolean) => void;
}

export function mountStatsPage(host: HTMLElement, hooks: StatsPageHooks) {
  const page = el("div", "stats-page");
  host.append(page);

  const paint = () => {
    const view = statsView();
    page.replaceChildren();
    page.append(settingHead("Stats", "Play time, voice, messages, and usage stay on this device. Nothing is uploaded."));
    page.append(controls(view, hooks, paint));
    page.append(chartCard("Usage", "Lark open on this device", view.larkMs, view.days.map((day) => ({ day: day.day, value: day.larkMs }))));
    page.append(chartCard("Messages sent", `${view.messages} sent`, view.messages, view.days.map((day) => ({ day: day.day, value: day.messages })), "count"));
    page.append(voiceCard(view));
    page.append(listCard("Play time", view.games.map((game) => ({ label: game.name, meta: formatDuration(game.ms) })), "No games yet."));
    page.append(listCard("Servers", view.servers.map((server) => ({ label: server.name, meta: formatDuration(server.ms) })), "No servers yet."));
    page.append(listCard("Channels", view.channels.map((channel) => ({
      label: channel.name.startsWith("#") ? channel.name : `#${channel.name}`,
      meta: channel.messages ? `${channel.messages} sent · ${formatDuration(channel.ms)}` : formatDuration(channel.ms),
    })), "No channels yet."));
    page.append(listCard("Direct messages", view.dms.map((dm) => ({
      label: dm.name,
      meta: dm.messages ? `${dm.messages} sent · ${formatDuration(dm.ms)}` : formatDuration(dm.ms),
    })), "No direct messages yet."));
    page.append(el("p", "stats-note", `${view.clips} clip${view.clips === 1 ? "" : "s"} captured. Counts stay in this browser.`));
  };

  paint();
}

function controls(view: StatsView, hooks: StatsPageHooks, paint: () => void): HTMLElement {
  const card = settingCard("On this device");
  const toggle = switchControl(view.collecting, "Collect stats on this device");
  toggle.addEventListener("click", () => {
    const next = !collecting();
    setCollecting(next);
    hooks.onCollecting(next);
    paint();
  });
  card.append(settingRow("stats.collect", "Collect stats", "Turn collection off to stop new counts. What is already stored stays until you clear it.", toggle));
  const clear = el("button", "text-button", "Clear stats");
  clear.type = "button";
  clear.addEventListener("click", () => {
    clearStats();
    paint();
  });
  card.append(settingRow("stats.clear", "Clear stats", "Erase play time, voice, messages, and usage stored on this device.", clear));
  return card;
}

function chartCard(title: string, lede: string, total: number, points: { day: string; value: number }[], mode: "time" | "count" = "time"): HTMLElement {
  const card = settingCard(title);
  const headline = mode === "count" ? String(Math.round(total)) : formatDuration(total);
  card.append(el("p", "stats-metric", headline));
  card.append(el("p", "stats-kicker", lede));
  card.append(bars(points, mode));
  return card;
}

function voiceCard(view: StatsView): HTMLElement {
  const card = settingCard("Voice");
  card.append(el("p", "stats-metric", formatDuration(view.voiceMs)));
  card.append(el("p", "stats-kicker", `${formatDuration(view.speakMs)} speaking`));
  card.append(bars(view.days.map((day) => ({ day: day.day, value: day.voiceMs })), "time"));
  if (!view.voicePlaces.length) {
    card.append(el("p", "stats-empty", "No voice time yet."));
    return card;
  }
  const list = el("ul", "stats-list");
  for (const place of view.voicePlaces) {
    const row = el("li");
    const where = place.place ? `${place.name} · ${place.place}` : place.name;
    row.append(el("span", "", where), el("span", "stats-meta", `${formatDuration(place.voiceMs)} · ${formatDuration(place.speakMs)} speaking`));
    list.append(row);
  }
  card.append(list);
  return card;
}

function listCard(title: string, rows: { label: string; meta: string }[], empty: string): HTMLElement {
  const card = settingCard(title);
  if (!rows.length) {
    card.append(el("p", "stats-empty", empty));
    return card;
  }
  const list = el("ul", "stats-list");
  for (const row of rows) {
    const item = el("li");
    item.append(el("span", "", row.label), el("span", "stats-meta", row.meta));
    list.append(item);
  }
  card.append(list);
  return card;
}

function bars(points: { day: string; value: number }[], mode: "time" | "count"): HTMLElement {
  const max = Math.max(...points.map((point) => point.value), 0);
  const seconds = mode === "time" && max < 60_000;
  const chart = el("div", "stats-bars");
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", mode === "count" ? "Messages over the last 14 days" : "Time over the last 14 days");
  for (const point of points) {
    const col = el("div", "stats-col");
    const bar = el("div", "stats-bar");
    const amount = max > 0 ? Math.round((point.value / max) * 100) : 0;
    bar.style.height = `${amount}%`;
    const shown = mode === "count" ? String(point.value) : seconds ? `${Math.round(point.value / 1000)}s` : `${Math.round(point.value / 60000)}m`;
    col.title = `${point.day.slice(5)} · ${shown}`;
    const label = el("span", "stats-day", point.day.slice(8));
    col.append(bar, label);
    chart.append(col);
  }
  return chart;
}
