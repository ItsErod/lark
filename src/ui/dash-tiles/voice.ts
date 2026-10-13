import { el, portrait } from "../dom";
import { voiceControlLabels, voiceDomPlan, type BoardHandlers, type BoardSnapshot, type TileHandle, type VoicePerson } from "../dashboard-view";

function rosterSig(people: VoicePerson[]): string {
  return people.map((person) => [person.id, person.name, person.muted ? 1 : 0, person.deafened ? 1 : 0, person.self ? 1 : 0, person.sharing ? 1 : 0].join("|")).join("\n");
}

function speakSig(people: VoicePerson[]): string {
  return people.map((person) => `${person.id}:${person.speaking ? 1 : 0}`).join(",");
}

function note(person: VoicePerson): string {
  if (person.speaking) return "Speaking";
  if (person.deafened) return "Deafened";
  if (person.muted) return "Muted";
  if (person.sharing) return "Sharing";
  return person.self ? "You" : "In voice";
}

export function mount(host: HTMLElement, handlers: BoardHandlers): TileHandle {
  let roster = "";
  let speak = "";
  let controls = "";

  const patchSpeak = (people: VoicePerson[]) => {
    for (const person of people) {
      const row = host.querySelector<HTMLElement>(`[data-user="${person.id}"]`);
      if (!row) continue;
      row.classList.toggle("is-speaking", person.speaking);
      const sub = row.querySelector(".dash-voice-copy span");
      if (sub) sub.textContent = note(person);
    }
  };

  const rebuild = (snapshot: BoardSnapshot) => {
    host.replaceChildren();
    const bar = el("div", "dash-controls");
    for (const label of voiceControlLabels(snapshot.inCall, snapshot.muted, snapshot.deafened)) {
      const button = el("button", label === "Leave" ? "dash-mini ghost" : "dash-mini", label);
      button.type = "button";
      button.addEventListener("click", () => {
        if (label === "Join") handlers.onJoinVoice();
        else if (label === "Leave") handlers.onLeave();
        else if (label === "Mute" || label === "Unmute") handlers.onMute();
        else handlers.onDeafen();
      });
      bar.append(button);
    }
    host.append(bar);
    if (snapshot.voiceName) host.append(el("div", "dash-kicker", snapshot.voiceName));
    if (!snapshot.voice.length) {
      host.append(el("p", "dash-tile-empty", "No one is in voice."));
      return;
    }
    const list = el("div", "dash-list");
    for (const person of snapshot.voice) {
      const row = el("div", `dash-voice-row${person.speaking ? " is-speaking" : ""}`);
      row.dataset.user = person.id;
      const face = portrait(person.name, person.id, person.avatarUrl, true);
      const copy = el("div", "dash-voice-copy");
      copy.append(el("strong", "", person.name), el("span", "", note(person)));
      row.append(face, copy);
      if (!person.self) {
        const mute = el("button", "dash-mini ghost", person.muted ? "Unmute" : "Mute");
        mute.type = "button";
        mute.addEventListener("click", () => handlers.onMutePerson(person.id));
        row.append(mute);
      }
      list.append(row);
    }
    host.append(list);
  };

  return {
    update(snapshot) {
      const nextRoster = `${snapshot.inCall ? 1 : 0}|${snapshot.muted ? 1 : 0}|${snapshot.deafened ? 1 : 0}|${snapshot.voiceName}|${rosterSig(snapshot.voice)}`;
      const nextSpeak = speakSig(snapshot.voice);
      const nextControls = voiceControlLabels(snapshot.inCall, snapshot.muted, snapshot.deafened).join(",");
      const plan = voiceDomPlan(`${roster}|${controls}`, `${nextRoster}|${nextControls}`, speak, nextSpeak);
      if (plan === "skip") return;
      speak = nextSpeak;
      if (plan === "speak") {
        patchSpeak(snapshot.voice);
        return;
      }
      roster = nextRoster;
      controls = nextControls;
      rebuild(snapshot);
    },
    pause() {},
    resume() { roster = ""; speak = ""; controls = ""; },
    destroy() { roster = ""; host.replaceChildren(); },
  };
}
