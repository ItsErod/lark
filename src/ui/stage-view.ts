import type { StageGroups } from "../voice-stage";
import { clear, el, portrait } from "./dom";

export interface StageHandlers {
  topic: string;
  raised: boolean;
  selfSpeaker: boolean;
  onRaise: () => void;
  onStart: (topic: string) => void;
  onInviteUp: (userId: string) => void;
  onMoveAudience: (userId: string) => void;
}

/** Audience, speakers, raise hand, and the stage topic. Text chat stays outside this board. */
export function renderStageBoard(host: HTMLElement, groups: StageGroups, handlers: StageHandlers): void {
  clear(host);
  host.className = "stage-board";
  host.setAttribute("aria-label", "Stage");
  const topic = el("div", "stage-topic");
  topic.append(el("strong", "", handlers.topic || "Stage"));
  if (!groups.speakers.length) {
    const form = el("form", "stage-start");
    const input = el("input");
    input.type = "text";
    input.maxLength = 120;
    input.placeholder = "Stage topic";
    input.value = handlers.topic;
    input.setAttribute("aria-label", "Stage topic");
    const start = el("button", "text-button", "Start stage");
    start.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.onStart(input.value);
    });
    form.append(input, start);
    topic.append(form);
  }
  host.append(topic);
  host.append(stageRow("Speakers", groups.speakers, (person) => {
    if (person.self) return null;
    const button = el("button", "text-button", "Move to audience");
    button.type = "button";
    button.addEventListener("click", () => handlers.onMoveAudience(person.userId));
    return button;
  }));
  host.append(stageRow("Requests", groups.requests, (person) => {
    const button = el("button", "text-button", "Invite to speak");
    button.type = "button";
    button.addEventListener("click", () => handlers.onInviteUp(person.userId));
    return button;
  }));
  host.append(stageRow("Audience", groups.audience, () => null));
  if (!handlers.selfSpeaker) {
    const hand = el("button", handlers.raised ? "text-button is-on" : "text-button", handlers.raised ? "Lower hand" : "Raise hand");
    hand.type = "button";
    hand.addEventListener("click", () => handlers.onRaise());
    host.append(hand);
  }
}

function stageRow(
  title: string,
  people: StageGroups["speakers"],
  action: (person: StageGroups["speakers"][number]) => HTMLElement | null,
): HTMLElement {
  const block = el("section", "stage-row");
  block.append(el("h3", "", `${title} — ${people.length}`));
  if (!people.length) block.append(el("p", "hint", "Nobody here."));
  const list = el("div", "stage-people");
  for (const person of people) {
    const row = el("div", `stage-person${person.speaking ? " is-speaking" : ""}`);
    row.append(portrait(person.name, person.userId, person.avatarUrl, true));
    row.append(el("span", "voice-user-name", person.name));
    const extra = action(person);
    if (extra) row.append(extra);
    list.append(row);
  }
  block.append(list);
  return block;
}

export interface VoiceChatLine {
  id: string;
  author: string;
  text: string;
}

/** Voice-channel text. The node is placed beside the call and does not cover the composer. */
export function renderVoiceChat(
  host: HTMLElement,
  lines: readonly VoiceChatLine[],
  onSend: (text: string) => void,
): void {
  clear(host);
  host.className = "voice-chat";
  host.setAttribute("aria-label", "Voice channel chat");
  host.append(el("strong", "", "Voice chat"));
  const log = el("div", "voice-chat-log");
  if (!lines.length) log.append(el("p", "hint", "No messages in this voice channel yet."));
  for (const line of lines.slice(-40)) {
    const row = el("p", "voice-chat-line");
    row.append(el("span", "voice-chat-author", line.author), document.createTextNode(` ${line.text}`));
    log.append(row);
  }
  const form = el("form", "voice-chat-form");
  const input = el("input");
  input.type = "text";
  input.maxLength = 2000;
  input.placeholder = "Message this voice channel";
  input.setAttribute("aria-label", "Message the voice channel");
  const send = el("button", "text-button", "Send");
  send.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    onSend(text);
  });
  form.append(input, send);
  host.append(log, form);
}
