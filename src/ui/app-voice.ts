import { ARCHIVE, history, NORTHWIND, channels as demoChannels, pageMessages, people } from "../demo/data";
import { hiddenIds } from "../pack/hidden";
import { boostedPlayback } from "../media/volume";
import { buildViewMessage } from "../render/message";
import { fpsFromMarks, noteFpsMark } from "../frame";
import {
  cleanGameName, pollInterval,
  profileFromBase,
  resolveGame,
  shouldPreload,
  type GameBase
} from "../game";
import { fpsWatch, type PerfSample } from "../perf";
import { HISTORY_PAGE } from "../history";
import {
  CALL_PIP_KEY,
  CALL_SPLIT_KEY,
  CALL_STRIP_KEY,
  PIP_HEIGHT,
  PIP_WIDTH,
  callChrome,
  voiceChatInsets,
  clampPip,
  clampSplitRatio,
  dismissCallSurface,
  FOCUS_SPLIT_PX,
  leadMedia,
  nearestPipCorner,
  pipAnchors,
  pipPoint, stripPeople,
  stripWindow,
  toggleCallHotkey,
  voiceChannelAction
} from "../call-layout";
import { callBus, openCallPopout, type CallCommand, type CallFrame } from "../call-window";
import { speakColor, speakingMotion, stageTiles, voiceBadges, type RingMotion, type StageMember, type StageTile } from "../voice-stage";
import { motionChoice, prefersReduced } from "../motion-pref";
import { formatShortcut } from "../shortcuts";
import type { Channel, GameProfile, SoundClip } from "../types";
import {
  clampNote, requestModView
} from "../social";
import { acceptHeardSound, clipForHotkey, hearSoundKey, parseSoundEffect, playableClipIds, playableGuildSounds, sanitizeGuildSounds, soundEnabled, soundHotkeyIsGlobal } from "../soundboard";
import { applyMoreAction, applyUserMix, applyVoiceState, browserMicConstraint, hydrateMix, isDefaultAvatar, joinVoiceTarget, memberVoiceBody, micLevel, participantMenu, participantsIn, noiseQualityName, placeMenu, preferAvatar, selectInputProfile, setSpeaking, toggleDeskDeafen, toggleDeskMute, voiceChannelLink, voiceChannelMenu, voiceLinkDetails, type ParticipantMenuAction, type VoiceStateInput } from "../voice";
import { voiceHudFrame, type VoiceHudView } from "../voice-hud";
import { ACTIVITIES, activityById, isStageChannel, messagePreview, raiseHand, stageGroups, startStageBody, visibleCallTiles, watchEmbedUrl, watchVideoId, type StagePerson } from "../voice-stage";
import { clear, el, icon, paths } from "./dom";
import { noteGateway, noteVoice, trafficArmed } from "../net/traffic";
import { demoShareSources, qualityLabel, snapShareFps, snapShareHeight, streamKeyFor, type ShareSource } from "../share";
import { renderVoiceHud } from "./hud";
import { renderBlockedMessage, renderMessage } from "./messages";
import { nextMutedTalk } from "../muted-talk";
import { createMutedProbe } from "../muted-probe";
import { renderMutedTalk } from "./muted-talk-view";
import { takeAudioHotkey } from "../audio-hotkey";
import type { WireProfile } from "./profile";
import { isTauri, invoke, rectBox } from "./app-shared";
import { defineMethods } from "./app-shared";

export const voiceMethods = defineMethods({
  onVoiceChannel(channel: Channel) {
    const action = voiceChannelAction({
      joinedThisChannel: this.voice?.channelId === channel.id,
      surface: this.callSurface,
    });
    if (this.callSurface === "popout" && action.surface !== "popout") this.closeCallPopout();
    this.callSurface = action.surface;
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.voiceMenu = null;
    if (action.join) {
      this.friendsOpen = false;
      this.clipsOpen = false;
      this.joinVoice(channel);
      return;
    }
    this.paint();
  },
  ringMotion(): RingMotion {
    const os = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return speakingMotion(this.gameMode, prefersReduced(motionChoice(this.config.preferences.reduced_motion), os));
  },
  stageMembers(): StageMember[] {
    if (!this.voice) return [];
    const selfId = this.meId();
    return this.voice.members.map((member) => ({
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl ?? null,
      speaking: member.speaking,
      selfMute: Boolean(member.selfMute) || (member.id === selfId && this.voice!.muted),
      selfDeaf: Boolean(member.selfDeaf) || (member.id === selfId && this.voice!.deafened),
      serverMute: Boolean(member.serverMute),
      serverDeaf: Boolean(member.serverDeaf),
      localMuted: Boolean(member.localMuted),
      volume: member.volume,
      self: member.id === selfId,
      video: Boolean(member.video) || (member.id === selfId && this.cameraOn),
      sharing: Boolean(member.sharing) || (member.id === selfId && this.shareOn),
      streamLabel: member.streamLabel,
    }));
  },
  bindVoiceChannelMenu() {
    if (this.voiceChannelMenuBound) return;
    this.voiceChannelMenuBound = true;
    this.channelPane.addEventListener("contextmenu", (event) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest("[data-channel]");
      if (!(row instanceof HTMLElement)) return;
      const channel = this.channelById(row.dataset.channel ?? "");
      if (!channel || (channel.kind !== "voice" && !isStageChannel(channel))) return;
      event.preventDefault();
      this.channelMenu = { channelId: channel.id, x: event.clientX, y: event.clientY };
      this.voiceMenu = null;
      this.paintVoiceChannelMenu();
    });
  },
  toggleDeviceMenu(which: "input" | "output") {
    this.deviceMenu = this.deviceMenu === which ? null : which;
    void this.loadAudioDevices();
    this.paintChannels();
  },
  deviceMenuPop(): HTMLElement {
    const pop = el("div", "user-device-menu");
    pop.setAttribute("role", "menu");
    const input = this.deviceMenu !== "output";
    pop.append(el("strong", "", input ? "Input device" : "Output device"));
    const options = input ? this.captureDevices() : this.playbackDevices();
    const current = input ? this.config.voice.input_device : this.config.voice.output_device;
    const pick = (id: string) => {
      if (input) this.pickInput(id);
      else this.pickOutput(id);
      this.deviceMenu = null;
      this.paintChannels();
    };
    const def = el("button", current ? "text-button" : "text-button is-on", "Default");
    def.type = "button";
    def.addEventListener("click", () => pick(""));
    pop.append(def);
    for (const option of options) {
      const button = el("button", option.id === current ? "text-button is-on" : "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => pick(option.id));
      pop.append(button);
    }
    if (input && this.inputProfiles.length) {
      pop.append(el("span", "hint", "Input profile"));
      for (const profile of this.inputProfiles) {
        const button = el("button", profile.id === this.inputProfileId ? "text-button is-on" : "text-button", profile.name);
        button.type = "button";
        button.addEventListener("click", () => {
          this.pickInputProfile(profile.id);
          this.deviceMenu = null;
          this.paintChannels();
        });
        pop.append(button);
      }
    }
    return pop;
  },
  toggleNoiseSuppression() {
    this.config.voice.noise_suppression = !this.config.voice.noise_suppression;
    this.persist();
    this.pushVoiceAudio();
    this.paintChannels();
    this.paintVoiceFloats();
  },
  toggleEchoCancellation() {
    this.ensureVoicePrefs();
    this.echoCancellation = !this.echoCancellation;
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
    this.paintChannels();
    this.paintVoiceFloats();
  },
  toggleActivities() {
    this.activitiesOpen = !this.activitiesOpen;
    this.soundboardOpen = false;
    this.gearOpen = false;
    this.micMenuOpen = false;
    this.moreOpen = false;
    this.voiceMenu = null;
    this.paintVoice();
  },
  toggleSoundboard() {
    this.soundboardOpen = !this.soundboardOpen;
    this.activitiesOpen = false;
    this.gearOpen = false;
    this.micMenuOpen = false;
    this.moreOpen = false;
    this.voiceMenu = null;
    if (this.soundboardOpen && this.voice?.guildId) void this.loadGuildSounds(this.voice.guildId);
    this.paintChannels();
    this.paintVoice();
  },
  toggleShowChat() {
    this.callView = { ...this.callView, showChat: !this.callView.showChat };
    if (this.callView.showChat) void this.loadVoiceChat();
    this.paintVoice();
  },
  toggleFullScreen() {
    this.callView = { ...this.callView, fullScreen: !this.callView.fullScreen };
    this.paint();
  },
  toggleMicMenu() {
    this.micMenuOpen = !this.micMenuOpen;
    this.moreOpen = false;
    this.activitiesOpen = false;
    this.soundboardOpen = false;
    if (this.micMenuOpen) this.watchMicLevel();
    else this.stopMicLevel();
    this.paintVoice();
  },
  toggleMore() {
    this.moreOpen = !this.moreOpen;
    this.micMenuOpen = false;
    this.paintVoice();
  },
  onMoreAction(action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") {
    if (action === "settings") {
      this.moreOpen = false;
      this.section = "voice";
      this.openSettings();
      return;
    }
    this.callView = applyMoreAction(this.callView, action);
    this.paint();
  },
  pickInput(id: string) {
    this.config.voice.input_device = id;
    this.persist();
    this.pushVoiceAudio();
  },
  pickOutput(id: string) {
    this.config.voice.output_device = id;
    this.persist();
    this.pushVoiceAudio();
  },
  pickInputProfile(id: string) {
    this.inputProfileId = id;
    const profile = selectInputProfile(this.inputProfiles, id);
    if (!profile) return;
    this.config.voice.input_device = profile.deviceId;
    this.config.voice.mode = profile.mode;
    this.config.voice.sensitivity = profile.sensitivity;
    this.persist();
    this.pushVoiceAudio();
    this.storeVoicePrefs();
    this.paintVoice();
  },
  setInputVolume(value: number) {
    this.inputVolume = Math.min(200, Math.max(0, Math.round(value)));
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
  },
  setOutputVolume(value: number) {
    this.outputVolume = Math.min(200, Math.max(0, Math.round(value)));
    this.storeVoicePrefs();
    this.pushVoiceProcessing();
  },
  pushVoiceProcessing() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_processing", {
      echoCancellation: this.echoCancellation,
      agc: this.agc,
      inputVolume: this.inputVolume,
      outputVolume: this.outputVolume,
      noiseQuality: this.noiseQuality,
    }).catch(() => undefined);
  },
  joinVoice(channel: Channel, options?: { quiet?: boolean }) {
    this.ensureVoicePrefs();
    const target = joinVoiceTarget(channel, this.guildId);
    if (!target) return;
    this.voiceEpoch += 1;
    const epoch = this.voiceEpoch;
    const profile = selectInputProfile(this.inputProfiles, this.inputProfileId);
    if (profile) {
      this.config.voice.input_device = profile.deviceId;
      this.config.voice.mode = profile.mode;
      this.config.voice.sensitivity = profile.sensitivity;
    }
    applyVoiceState(this.voiceRoster, {
      guildId: target.guildId ?? "",
      channelId: target.channelId,
      userId: this.meId(),
      name: this.demo ? "Ethan Park" : this.me.name,
      avatarUrl: this.me.avatarUrl ?? null,
      selfMute: this.desk.muted,
      selfDeaf: this.desk.deafened,
    });
    this.voice = {
      channelId: target.channelId,
      guildId: target.guildId,
      name: channel.name,
      status: "connecting",
      muted: this.desk.muted,
      deafened: this.desk.deafened,
      members: [],
    };
    this.notePlace("voice", target.channelId, 1);
    this.noteCallForUpdates();
    this.voiceJoinedAt = Date.now();
    this.voiceConnectedAt = 0;
    this.armCallTimer();
    this.stageRaised = false;
    if (target.callKind === "stage") this.stageTopic = channel.topic ?? this.stageTopic;
    this.syncCallMembers();
    this.applyAppearance();
    this.paintChannels();
    this.paintVoice();
    if (options?.quiet) this.toast("Voice", "Joined without the entrance sound.");
    if (!this.demo && this.guildId) void this.loadGuildSounds(this.guildId);
    if (this.demo) {
      window.setTimeout(() => {
        if (!this.voice || this.voice.channelId !== target.channelId) return;
        this.voice.status = "connected";
        this.noteVoiceConnected();
        this.voiceDetails = voiceLinkDetails({ pingMs: 28, endpoint: "c-demo.discord.gg", mode: "connected", lossPct: 0, jitterMs: 1.4 });
        if (trafficArmed()) {
          noteVoice({ ping: 28 });
          noteGateway({ kind: "voiceLink", state: "connected", endpoint: "c-demo.discord.gg", pingMs: 28, mode: "connected" });
        }
        this.refreshSpeaking();
        this.paintChannels();
        this.paintVoice();
      }, 180);
      return;
    }
    void invoke("join_voice", {
      guildId: target.guildId,
      channelId: target.channelId,
      mute: this.desk.muted,
      deaf: this.desk.deafened,
      epoch,
      vad: this.voiceMode() === "vad",
      sensitivity: this.config.voice.sensitivity,
      noiseSuppression: this.config.voice.noise_suppression,
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
    }).catch((err) => {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't join.");
      this.leaveVoice();
    });
    this.pushVoiceProcessing();
    void this.loadAudioDevices();
  },
  leaveVoice() {
    if (this.voice) this.notePlace("voice", this.voice.channelId, 0);
    const guildId = this.voice?.guildId ?? "";
    if (this.voice) applyVoiceState(this.voiceRoster, { guildId, channelId: "", userId: this.meId() });
    this.voice = null;
    this.clearVoiceClock();
    this.noteCallForUpdates();
    this.shareOn = false;
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareDialogOpen = false;
    this.shareQualityOpen = false;
    this.shareWatching = "";
    this.pipUser = "";
    this.shareNote = "";
    this.late?.clearStreamFrames();
    this.late?.clearCameraFrames();
    this.callBus?.postMessage({ type: "camera-clear" });
    this.cameraOn = false;
    this.stopCameraSend();
    this.callSurface = dismissCallSurface();
    this.closeCallPopout();
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.voiceMenu = null;
    this.pttHeld = false;
    if (!this.demo) void invoke("leave_voice").catch(() => undefined);
    this.applyAppearance();
    this.paintVoice();
    this.paintChannels();
  },
  acceptAudioHotkey(kind: "mute" | "deafen"): boolean {
    const last = kind === "mute" ? this.muteHotkeyAt : this.deafenHotkeyAt;
    const next = takeAudioHotkey(last, performance.now());
    if (kind === "mute") this.muteHotkeyAt = next.at;
    else this.deafenHotkeyAt = next.at;
    return next.allow;
  },
  toggleMute() {
    this.desk = toggleDeskMute(this.voice ? { muted: this.voice.muted, deafened: this.voice.deafened } : this.desk);
    if (!this.voice) {
      this.paintChannels();
      return;
    }
    this.voice.muted = this.desk.muted;
    this.voice.deafened = this.desk.deafened;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  },
  toggleDeafen() {
    this.desk = toggleDeskDeafen(this.voice ? { muted: this.voice.muted, deafened: this.voice.deafened } : this.desk);
    if (!this.voice) {
      this.paintChannels();
      return;
    }
    this.voice.muted = this.desk.muted;
    this.voice.deafened = this.desk.deafened;
    this.mirrorSelfFlags();
    this.refreshSpeaking();
    this.pushVoiceState();
    this.pushTransmit();
    this.paintVoice();
    this.paintChannels();
  },
  pushVoiceState() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_self", { mute: this.voice.muted, deaf: this.voice.deafened }).catch(() => undefined);
    this.pushVoiceAudio();
  },
  pushTransmit() {
    if (!this.voice || this.demo) return;
    const transmit = !this.voice.muted && (this.voiceMode() === "ptt" ? this.pttHeld : true);
    void invoke("set_voice_transmit", { transmit }).catch(() => undefined);
  },
  pushVoiceAudio() {
    if (!this.voice || this.demo) return;
    void invoke("set_voice_audio", {
      deafened: this.voice.deafened,
      vad: this.voiceMode() === "vad",
      sensitivity: this.config.voice.sensitivity,
      noiseSuppression: this.config.voice.noise_suppression,
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
    }).catch(() => undefined);
  },
  refreshSpeaking() {
    if (!this.voice) return;
    const self = this.voice.members.find((member) => member.id === this.meId());
    if (!self) return;
    if (this.demo) {
      const vad = this.voiceMode() === "vad" && this.config.voice.sensitivity > 5;
      const speaking = !this.voice.muted && (this.voiceMode() === "ptt" ? this.pttHeld : vad);
      self.speaking = speaking;
      setSpeaking(this.voiceRoster, self.id, speaking);
    } else if (this.voice.muted || (this.voiceMode() === "ptt" && !this.pttHeld)) {
      self.speaking = false;
      setSpeaking(this.voiceRoster, self.id, false);
    }
    this.syncSpeakingClass(self.id);
  },
  mirrorSelfFlags() {
    if (!this.voice) return;
    applyVoiceState(this.voiceRoster, {
      guildId: this.voice.guildId ?? "",
      channelId: this.voice.channelId,
      userId: this.meId(),
      name: this.me.name,
      avatarUrl: this.me.avatarUrl ?? null,
      selfMute: this.voice.muted,
      selfDeaf: this.voice.deafened,
    });
  },
  syncCallMembers() {
    if (!this.voice) return;
    hydrateMix(this.voiceRoster, this.config.voice.levels);
    const people = participantsIn(this.voiceRoster, this.voice.guildId ?? "", this.voice.channelId);
    this.voice.members = people.map((person) => ({
      id: person.userId,
      name: person.name,
      speaking: person.speaking,
      volume: person.volume,
      localMuted: person.localMuted,
      avatarUrl: person.avatarUrl,
      selfMute: person.selfMute,
      selfDeaf: person.selfDeaf,
      serverMute: person.serverMute,
      serverDeaf: person.serverDeaf,
      video: person.video,
      sharing: person.sharing,
      streamLabel: person.streamLabel,
    }));
    if (this.demo) return;
    for (const member of this.voice.members) {
      if (member.id === this.meId()) continue;
      const gain = boostedPlayback(member.volume, Boolean(member.localMuted), this.userVolumeCeiling());
      if (this.sentMix.get(member.id) === gain) continue;
      this.sentMix.set(member.id, gain);
      void invoke("set_voice_volume", { userId: member.id, volume: gain }).catch(() => undefined);
    }
  },
  markSpeaking(userId: string, speaking: boolean) {
    const known = Object.values(this.voiceRoster).some((person) => person.userId === userId);
    if (!known && this.voice) {
      const person = this.knownPerson(userId);
      applyVoiceState(this.voiceRoster, {
        guildId: this.voice.guildId ?? "",
        channelId: this.voice.channelId,
        userId,
        name: person?.name ?? "Someone",
        avatarUrl: person?.avatarUrl ?? null,
      });
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    }
    setSpeaking(this.voiceRoster, userId, speaking);
    if (userId === this.meId() && speaking !== this.statSpeaking) {
      this.statSpeaking = speaking;
      this.noteStat({ t: Date.now(), kind: "speak", on: speaking ? 1 : 0 });
    }
    const member = this.voice?.members.find((item) => item.id === userId);
    if (member) member.speaking = speaking;
    this.syncSpeakingClass(userId);
    this.publishVoiceHud();
  },
  syncSpeakingClass(userId: string) {
    const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
    let on = person ? voiceBadges(person).speaking : false;
    if (userId === this.meId() && this.voice && (this.voice.muted || this.voice.deafened)) on = false;
    const selector = `[data-voice-user="${CSS.escape(userId)}"]`;
    for (const node of this.root.querySelectorAll(selector)) node.classList.toggle("is-speaking", on);
  },
  hydrateVoice(state: VoiceStateInput, fallbackGuild: string): VoiceStateInput {
    const known = state.userId ? this.knownPerson(state.userId) : null;
    return {
      guildId: state.guildId || fallbackGuild,
      channelId: state.channelId ?? "",
      userId: state.userId,
      name: state.name || known?.name || "",
      avatarUrl: preferAvatar(state.avatarUrl, known?.avatarUrl, state.userId),
      selfMute: Boolean(state.selfMute),
      selfDeaf: Boolean(state.selfDeaf),
      serverMute: Boolean(state.serverMute),
      serverDeaf: Boolean(state.serverDeaf),
      ...(state.selfStream === undefined ? {} : { selfStream: Boolean(state.selfStream) }),
      ...(state.suppress === undefined ? {} : { suppress: Boolean(state.suppress) }),
      ...(state.requestToSpeak === undefined ? {} : { requestToSpeak: Boolean(state.requestToSpeak) }),
    };
  },
  knownPerson(id: string): { name: string; avatarUrl: string | null } | null {
    if (id === this.me.id || (this.demo && id === this.meId())) {
      const person = this.demo ? people.find((item) => item.id === id) : this.me;
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    if (this.demo) {
      const person = people.find((item) => item.id === id);
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    for (const bucket of Object.values(this.membersByGuild)) {
      const person = bucket.find((item) => item.id === id);
      if (person) return { name: person.name, avatarUrl: person.avatarUrl ?? null };
    }
    const cached = this.directory[id];
    if (cached?.name || cached?.avatarUrl) return { name: cached.name, avatarUrl: cached.avatarUrl ?? null };
    const name = this.userNames[id];
    return name ? { name, avatarUrl: null } : null;
  },
  /** Fill voice rows from the member cache, then fetch anyone still on a default picture. */
  refreshVoicePortraits() {
    let changed = false;
    for (const person of Object.values(this.voiceRoster)) {
      if (!isDefaultAvatar(person.avatarUrl)) continue;
      const known = this.knownPerson(person.userId);
      const better = preferAvatar(known?.avatarUrl, null, person.userId);
      if (!better || isDefaultAvatar(better) || better === person.avatarUrl) continue;
      person.avatarUrl = better;
      changed = true;
    }
    if (changed) {
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
    }
    this.fetchMissingVoiceAvatars();
  },
  fetchMissingVoiceAvatars() {
    if (this.demo) return;
    for (const person of Object.values(this.voiceRoster)) {
      if (!isDefaultAvatar(person.avatarUrl) || this.voiceAvatarFetches.has(person.userId)) continue;
      this.voiceAvatarFetches.add(person.userId);
      const guildId = person.guildId || this.guildId || "";
      void invoke<WireProfile>("fetch_profile", { userId: person.userId, guildId }).then((profile) => {
        const avatar = preferAvatar(profile.avatarUrl, null, person.userId);
        const current = Object.values(this.voiceRoster).find((item) => item.userId === person.userId);
        if (!current || !avatar || isDefaultAvatar(avatar)) return;
        current.avatarUrl = avatar;
        const name = profile.nick || profile.name;
        if (name && (current.name === "Someone" || !current.name)) current.name = name;
        if (name) this.userNames[current.userId] = name;
        const cached = this.directory[current.userId];
        this.directory[current.userId] = { ...cached, id: current.userId, name: current.name, status: cached?.status ?? "offline", avatarUrl: avatar };
        this.syncCallMembers();
        this.paintChannels();
        this.paintVoice();
      }).catch(() => {
        this.voiceAvatarFetches.delete(person.userId);
      });
    }
  },
  async loadAudioDevices() {
    if (this.demo || !isTauri()) return;
    try {
      const listed = await invoke<{ inputs: string[]; outputs: string[] }>("list_audio_devices");
      const inputs = listed.inputs ?? [];
      const outputs = listed.outputs ?? [];
      const same = inputs.join("\0") === this.cpalInputs.join("\0") && outputs.join("\0") === this.cpalOutputs.join("\0");
      this.cpalInputs = inputs;
      this.cpalOutputs = outputs;
      if (same) return;
      if (this.voice) this.paintVoice();
      if (this.settings && this.section === "voice") this.renderSettings();
    } catch {
      this.cpalInputs = [];
      this.cpalOutputs = [];
    }
  },
  toggleSplit() {
    if (this.splitId) {
      this.splitId = null;
    } else {
      const next = this.visibleChannels().find((channel) => channel.kind !== "voice" && channel.kind !== "category" && channel.id !== this.channelId);
      this.splitId = next?.id ?? null;
      if (this.splitId && !this.pages[this.splitId] && shouldPreload(this.gameMode)) void this.preload(this.splitId);
    }
    this.paint();
  },
  async preload(id: string) {
    if (!shouldPreload(this.gameMode) || this.pages[id] || id === ARCHIVE) return;
    if (this.demo) {
      const page = pageMessages(history[id] ?? [], undefined, HISTORY_PAGE);
      this.pages[id] = page.messages;
      this.queueLocalIndex(id);
      this.paintSplit();
      return;
    }
    const page = await this.livePage(id);
    this.pages[id] = page.messages;
    this.queueLocalIndex(id);
    this.paintSplit();
  },
  runCommand(id: string) {
    if (id === "settings") this.openSettings();
    else if (id === "search") {
      this.searchOpen = true;
      this.paintSearch();
    } else if (id === "local-search") this.openLocalSearch();
    else if (id === "split") this.toggleSplit();
    else if (id === "theme") {
      this.themeOpen = true;
      this.paintTheme();
    } else if (id === "themes") {
      this.section = "appearance";
      this.openSettings();
    } else if (id === "mute") this.toggleMute();
    else if (id === "deafen") this.toggleDeafen();
    else if (id === "leave-voice") this.leaveVoice();
    else if (id === "call") this.toggleCallView();
    else if (id === "voice-hud") this.toggleVoiceOverlay();
    else if (id === "perf-overlay") this.togglePerfOverlay();
    else if (id === "game-mode") this.toggleGameMode();
    else if (id === "members") {
      this.config.appearance.show_member_list = !this.config.appearance.show_member_list;
      this.persist();
      this.paint();
    } else if (id === "irc") {
      this.config.appearance.density = this.config.appearance.density === "irc" ? "cozy" : "irc";
      this.persist();
      this.msgSig = "";
      this.paint();
    }     else if (id === "pins") {
      this.pinsOpen = true;
      this.paintPins();
    } else if (id === "clips") this.openClips();
    else if (id === "saved") {
      this.bookmarksOpen = true;
      this.paintBookmarks();
    } else if (id === "reminders" || id === "scheduled") {
      this.section = "messages";
      this.openSettings();
    } else if (id === "streamer") this.toggleStreamer();
    else if (id === "status") {
      this.statusOpen = true;
      this.popout = this.demo ? people[0] : this.me;
      this.paintPopout();
    }
  },
  gameBase(): GameBase {
    return {
      voiceMode: this.config.voice.mode,
      pttKey: this.config.shortcuts.push_to_talk,
      voiceOverlay: this.config.voice.overlay,
      perfOverlay: this.config.desktop.perf_overlay,
      gameMode: this.config.desktop.game_mode,
    };
  },
  resolvedGame() {
    return resolveGame(this.detectedGame, this.config.games, this.gameBase());
  },
  voiceMode(): "vad" | "ptt" {
    return this.resolvedGame().voiceMode;
  },
  pttShortcut(): string {
    return this.resolvedGame().pttKey;
  },
  overlayOn(): boolean {
    return this.resolvedGame().voiceOverlay;
  },
  perfOn(): boolean {
    return this.resolvedGame().perfOverlay;
  },
  setVoiceMode(mode: "vad" | "ptt") {
    if (this.detectedGame) {
      this.patchProfile(this.detectedGame, { ptt: mode === "ptt" });
      return;
    }
    this.config.voice.mode = mode;
    this.persist();
    this.syncGameEffects();
  },
  patchProfile(name: string, patch: Partial<GameProfile>) {
    const clean = cleanGameName(name);
    if (!clean) return;
    const current = this.config.games[clean] ?? profileFromBase(this.gameBase());
    this.config.games = { ...this.config.games, [clean]: { ...current, ...patch } };
    this.persist();
    this.syncGameEffects();
  },
  noteGame(name: string | null) {
    const clean = name ? cleanGameName(name) : null;
    if (clean === this.detectedGame) return;
    this.detectedGame = clean;
    this.noteStat({ t: Date.now(), kind: "game", on: clean ? 1 : 0, name: clean ?? "" });
    this.syncGameEffects();
    if (this.settings && (this.section === "voice" || this.section === "gaming")) this.renderSettings();
  },
  syncGameEffects() {
    const next = this.resolvedGame();
    const modeChanged = next.gameMode !== this.gameMode;
    this.gameMode = next.gameMode;
    document.documentElement.classList.toggle("is-game-mode", next.gameMode);
    if (modeChanged) this.bindPolls();
    const voiceKey = `${next.voiceMode}|${next.pttKey}`;
    if (voiceKey !== this.appliedVoiceKey) {
      this.appliedVoiceKey = voiceKey;
      this.pttHeld = false;
      if (this.voice) {
        this.refreshSpeaking();
        this.pushTransmit();
        this.pushVoiceAudio();
      }
    }
    if (!next.perfOverlay) this.fpsLoop = false;
    if (isTauri()) {
      const reporting = this.config.desktop.detect_games;
      void invoke("set_clip_pace", {
        gameMode: next.gameMode,
        activity: reporting ? (this.detectedGame ?? "") : "",
        reportActivity: reporting,
      }).catch(() => undefined);
    }
    this.armFps();
    this.publishVoiceHud();
    if (this.shell) this.applyAppearance();
    if (modeChanged && this.view === "app") {
      this.msgSig = "";
      this.paintMessages();
    }
  },
  bindPolls() {
    for (const id of this.pollTimers) window.clearInterval(id);
    const mode = this.gameMode;
    this.pollTimers = [
      window.setInterval(() => {
        if (this.themeOpen || (this.settings && this.section === "appearance")) void this.applyTheme();
      }, pollInterval("theme", mode)),
      window.setInterval(() => this.tickPlugins(), pollInterval("plugins", mode)),
      window.setInterval(() => this.tickClock(), pollInterval("clock", mode)),
      window.setInterval(() => void this.detectLoad(), pollInterval("detect", mode)),
    ];
  },
  async detectLoad() {
    if (this.demo) {
      if (this.perfOn()) this.armFps();
      return;
    }
    const detect = this.config.desktop.detect_games;
    const obs = this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoObs;
    if (!obs) this.frontApp = null;
    if (!detect && this.detectedGame) this.noteGame(null);
    const watch = detect || obs || this.perfOn() || this.config.desktop.hardware_status;
    if (!watch) return;
    if (this.perfOn()) this.armFps();
    if (!isTauri() || this.detectBusy) return;
    this.detectBusy = true;
    try {
      const snap = await invoke<{
        game?: string | null;
        cpuPercent?: number | null;
        ramUsedMb?: number | null;
        ramTotalMb?: number | null;
      }>("hardware_snapshot", { full: false, game: obs });
      const named = typeof snap.game === "string" ? snap.game : null;
      if (detect) this.noteGame(named);
      if (obs) {
        const was = this.streamerSafeOn();
        this.frontApp = named;
        if (was !== this.streamerSafeOn()) this.noteCapture();
      }
      if (this.perfOn()) {
        this.perfSample = {
          ...this.perfSample,
          cpu: typeof snap.cpuPercent === "number" ? snap.cpuPercent : null,
          ramUsedMb: typeof snap.ramUsedMb === "number" ? snap.ramUsedMb : null,
          ramTotalMb: typeof snap.ramTotalMb === "number" ? snap.ramTotalMb : null,
        };
        this.publishVoiceHud();
        this.armFps();
      }
    } catch {
      // The shell refuses the read when detection, the overlay, and hardware status are all off.
    } finally {
      this.detectBusy = false;
    }
  },
  shownPerf(): PerfSample {
    if (!this.demo) return this.perfSample;
    return {
      cpu: this.perfSample.cpu ?? 18,
      ramUsedMb: this.perfSample.ramUsedMb ?? 6_400,
      ramTotalMb: this.perfSample.ramTotalMb ?? 16_384,
      fps: this.perfSample.fps,
    };
  },
  armFps() {
    const mode = fpsWatch(this.perfOn(), this.gameMode);
    if (mode === "off") {
      this.fpsLoop = false;
      return;
    }
    if (this.fpsLoop) return;
    this.fpsLoop = true;
    const started = performance.now();
    const step = (now: number) => {
      const next = fpsWatch(this.perfOn(), this.gameMode);
      if (next === "off") {
        this.fpsLoop = false;
        return;
      }
      this.fpsMarks = noteFpsMark(this.fpsMarks, now);
      const fps = fpsFromMarks(this.fpsMarks, now);
      if (fps !== this.perfSample.fps) {
        this.perfSample = { ...this.perfSample, fps };
        this.publishVoiceHud();
      }
      // Game Mode keeps the number, then drops the frame loop until the next poll.
      if (next === "burst" && now - started >= 1000) {
        this.fpsLoop = false;
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  togglePerfOverlay() {
    const now = Date.now();
    if (now - this.perfToggleAt < 300) return;
    this.perfToggleAt = now;
    this.setPerfOverlay(!this.perfOn(), true);
  },
  setPerfOverlay(enabled: boolean, announce: boolean) {
    if (this.perfOn() === enabled) {
      this.publishVoiceHud();
      return;
    }
    if (this.detectedGame) this.patchProfile(this.detectedGame, { perf_overlay: enabled });
    else {
      this.config.desktop.perf_overlay = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.settings && (this.section === "voice" || this.section === "gaming")) this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
    this.toast("Performance", enabled ? `On. ${hotkey} hides it.` : "Hidden.");
  },
  toggleGameMode() {
    const now = Date.now();
    if (now - this.gameToggleAt < 300) return;
    this.gameToggleAt = now;
    this.setGameMode(!this.gameMode, true);
  },
  setGameMode(enabled: boolean, announce: boolean) {
    if (this.detectedGame) this.patchProfile(this.detectedGame, { game_mode: enabled });
    else {
      this.config.desktop.game_mode = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.settings && (this.section === "gaming" || this.section === "voice")) this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    this.toast("Game Mode", enabled ? `On. ${hotkey} turns it off.` : "Off.");
  },
  appendGameProfiles(wrap: HTMLElement) {
    wrap.append(el("p", "setting-help", "Each game keeps its own push-to-talk key and the defaults for Game Mode, the voice HUD, and the performance strip. They apply while that game is detected."));
    const names = Object.keys(this.config.games).sort((a, b) => a.localeCompare(b));
    if (this.detectedGame && !names.includes(this.detectedGame)) {
      wrap.append(el("p", "hint", `${this.detectedGame} is in front. Change a switch below, or here, and Lark remembers it.`));
      wrap.append(this.profileCard(this.detectedGame, profileFromBase(this.gameBase())));
    }
    if (!names.length && !this.detectedGame) {
      wrap.append(el("p", "setting-help", "No saved games yet. Start one, or turn on Detect games above."));
    }
    for (const name of names) {
      const profile = this.config.games[name];
      if (profile) wrap.append(this.profileCard(name, profile));
    }
  },
  profileCard(name: string, profile: GameProfile): HTMLElement {
    const card = el("div", "plugin-card");
    card.append(el("strong", "", name));
    card.append(this.toggle("Push to talk", profile.ptt, (value) => this.patchProfile(name, { ptt: value })));
    const row = el("div", "shortcut-row");
    row.append(el("span", "", "Push to talk key"));
    const button = el("button", "kbd", this.rebindingGame === name ? "Press keys" : formatShortcut(profile.ptt_key, this.platform.os));
    button.type = "button";
    button.addEventListener("click", () => {
      this.rebinding = null;
      this.rebindingGame = name;
      this.renderSettings();
    });
    row.append(button);
    card.append(row);
    card.append(this.toggle("Game Mode", profile.game_mode, (value) => this.patchProfile(name, { game_mode: value })));
    card.append(this.toggle("Voice HUD", profile.voice_overlay, (value) => this.patchProfile(name, { voice_overlay: value })));
    card.append(this.toggle("Performance overlay", profile.perf_overlay, (value) => this.patchProfile(name, { perf_overlay: value })));
    const remove = el("button", "text-button", "Forget this game");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const games = { ...this.config.games };
      delete games[name];
      this.config.games = games;
      this.persist();
      this.syncGameEffects();
      this.renderSettings();
    });
    card.append(remove);
    return card;
  },
  voiceHudView(): VoiceHudView {
    const frame = voiceHudFrame(
      this.voiceRoster,
      this.voice
        ? {
            guildId: this.voice.guildId ?? "",
            channelId: this.voice.channelId,
            name: this.voice.name,
            status: this.voice.status,
            muted: this.voice.muted,
            deafened: this.voice.deafened,
            selfId: this.meId(),
          }
        : null,
    );
    const resolved = this.resolvedGame();
    return {
      ...frame,
      enabled: resolved.voiceOverlay && this.view === "app",
      perf: resolved.perfOverlay && this.view === "app",
      stats: this.shownPerf(),
      opacity: this.config.voice.overlay_opacity,
      clickThrough: this.config.voice.overlay_click_through,
      pingMs: this.voice ? this.voiceDetails.pingMs : null,
      game: this.detectedGame ?? "",
    };
  },
  toggleVoiceOverlay() {
    const now = Date.now();
    if (now - this.hudToggleAt < 300) return;
    this.hudToggleAt = now;
    this.setVoiceOverlay(!this.overlayOn(), true);
  },
  setVoiceOverlay(enabled: boolean, announce: boolean) {
    if (this.overlayOn() === enabled) {
      this.publishVoiceHud();
      return;
    }
    if (this.detectedGame) this.patchProfile(this.detectedGame, { voice_overlay: enabled });
    else {
      this.config.voice.overlay = enabled;
      this.persist();
      this.syncGameEffects();
    }
    if (this.voice) this.paintVoice();
    if (this.settings && this.section === "voice") this.renderSettings();
    if (!announce) return;
    const hotkey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
    this.toast("Voice HUD", enabled ? `On. ${hotkey} hides it.` : "Hidden.");
  },
  publishVoiceHud() {
    if (!this.hudEl) return;
    if (this.hudQueued) return;
    this.hudQueued = true;
    requestAnimationFrame(() => {
      this.hudQueued = false;
      this.flushVoiceHud();
    });
  },
  flushVoiceHud() {
    if (!this.hudEl) return;
    const view = this.voiceHudView();
    const sig = JSON.stringify(view);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    if (!isTauri()) {
      this.paintHudHost(view, false);
      return;
    }
    const ticket = ++this.hudTicket;
    void invoke<boolean>("sync_voice_overlay", {
      visible: view.enabled || view.perf,
      clickThrough: view.clickThrough,
      frame: view,
    }).then((native) => {
      if (ticket !== this.hudTicket) return;
      this.paintHudHost(view, native);
    }).catch(() => {
      if (ticket !== this.hudTicket) return;
      this.paintHudHost(view, false);
    });
  },
  syncMutedTalk() {
    const voice = this.voice;
    if (!voice || !(voice.muted || voice.deafened) || this.demo) {
      this.mutedProbe?.stop();
      this.mutedProbe = null;
      this.mutedTalk = { show: false, heldMs: 0 };
      renderMutedTalk(false);
      return;
    }
    if (!this.mutedProbe) {
      this.mutedProbe = createMutedProbe((level, stepMs) => {
        if (!this.voice || !(this.voice.muted || this.voice.deafened) || this.demo) {
          this.mutedProbe?.stop();
          this.mutedProbe = null;
          this.mutedTalk = { show: false, heldMs: 0 };
          renderMutedTalk(false);
          return;
        }
        this.mutedTalk = nextMutedTalk(this.mutedTalk, {
          selfMuted: true,
          level,
          sensitivity: this.config.voice.sensitivity,
        }, stepMs);
        renderMutedTalk(this.mutedTalk.show);
      });
    }
    this.mutedProbe.arm(browserMicConstraint(this.config.voice.input_device, this.audioInputs.map((device) => device.id)));
  },
  paintHudHost(view: VoiceHudView, native: boolean) {
    const show = (view.enabled || view.perf) && !native;
    this.hudEl.hidden = !show;
    if (show) renderVoiceHud(this.hudEl, view);
  },
  paintVoice() {
    if (this.holdShell) return;
    this.syncMutedTalk();
    if (this.boardActive()) {
      this.refreshBoard("voice");
      return;
    }
    const dock = this.voiceDock;
    if (!dock || !this.callStrip || !this.callSplit) return;
    const liveCall = Boolean(this.voice) || this.shareOn || this.cameraOn || this.callSurface !== "chat";
    if (!liveCall) {
      this.parkCallChrome();
      return;
    }
    if (!this.late) {
      void this.ensureLate().then(() => this.paintVoice());
      return;
    }
    const textChat = Boolean(this.voice) && !this.clipsOpen && !(this.friendsOpen && !this.guildId);
    const tiles = textChat ? visibleCallTiles(stageTiles(this.stageMembers()), this.callView.showNonVideo) : [];
    const media = leadMedia(tiles);
    const chrome = callChrome({
      inCall: textChat,
      surface: textChat ? this.callSurface : "chat",
      stripOpen: this.stripOpen,
      hasMedia: Boolean(media),
      showChat: this.callView.showChat,
      fullScreen: this.callView.fullScreen,
    });
    const chat = this.messagesEl.parentElement;
    if (chat) {
      chat.dataset.call = this.voice ? this.callSurface : "off";
      chat.dataset.strip = chrome.stripPx > 0 ? "open" : "closed";
    }
    this.messagesEl.hidden = false;
    this.callStrip.hidden = chrome.stripPx === 0;
    clear(this.callStrip);
    if (chrome.stripPx > 0) {
      const people = stripPeople(this.stageMembers().map((member) => ({
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        speaking: voiceBadges(member).speaking,
        self: member.self,
      })));
      this.late!.renderCallStrip(this.callStrip, stripWindow(people), this.ringMotion(), {
        onOpen: () => this.openCallSplit(),
        onHide: () => this.setStripOpen(false),
      });
    }
    const showGrid = chrome.grid === "split";
    const channel = this.voice ? this.channelById(this.voice.channelId) : undefined;
    const stageChannel = Boolean(channel && isStageChannel(channel));
    const focusLayoutOn = showGrid && !stageChannel && !this.callView.grid;
    this.callSplit.classList.toggle("is-focus", focusLayoutOn && !this.callView.fullScreen);
    this.callSplit.hidden = !showGrid;
    this.callHandle.hidden = !showGrid || (focusLayoutOn && !this.callView.fullScreen);
    clear(this.callSplitBar);
    clear(dock);
    if (showGrid && this.voice) {
      this.callSplitBar.append(el("strong", "call-split-name", this.voice.name));
      const pop = el("button", "text-button", "Pop out");
      pop.type = "button";
      pop.addEventListener("click", () => this.popCallOut());
      const close = el("button", "icon-button");
      close.type = "button";
      close.setAttribute("aria-label", "Close call view");
      close.title = "Close call view (Esc)";
      close.append(icon(paths.close));
      close.addEventListener("click", () => this.dismissCallView());
      const actions = el("div", "call-split-actions");
      actions.append(pop, close);
      this.callSplitBar.append(actions);
      const chat = chrome.voiceChat && !focusLayoutOn ? this.voiceChatPanel() : null;
      if (stageChannel) {
        clear(dock);
        dock.className = "voice-stage";
        this.late!.renderStageBoard(dock, stageGroups(this.stagePeople()), {
          topic: this.stageTopic,
          raised: this.stageRaised,
          selfSpeaker: this.stageSpeaker,
          onRaise: () => this.toggleRaiseHand(),
          onStart: (topic) => void this.startStage(topic),
          onInviteUp: (userId) => void this.setStageAudience(userId, false),
          onMoveAudience: (userId) => void this.setStageAudience(userId, true),
        });
        if (chat) dock.append(chat);
        this.late!.appendCallControls(dock, this.callStageHandlers());
      } else {
        if (focusLayoutOn) {
          const members = this.callView.showNonVideo
            ? this.stageMembers()
            : this.stageMembers().filter((member) => member.self || member.video || member.sharing);
          this.late!.renderFocusStage(dock, members, this.ringMotion(), this.callStageHandlers());
        } else {
          this.late!.renderCallStage(dock, this.decorateTiles(tiles), this.ringMotion(), this.callStageHandlers(), chat);
        }
      }
    }
    this.paintPip(chrome.pip ? media : null);
    this.mountShareSurfaces();
    this.late!.attachCameraTiles(this.root);
    this.paintShareDialog();
    this.paintVoiceFloats();
    this.publishVoiceHud();
    this.publishCallFrame();
    const inlineChat = chrome.voiceChat && chrome.grid === "split" && !focusLayoutOn;
    this.placeVoiceChat(chrome.voiceChat && !inlineChat);
    if (this.callView.fullScreen) this.messagesEl.parentElement?.classList.add("is-call-full");
    else this.messagesEl.parentElement?.classList.remove("is-call-full");
    requestAnimationFrame(() => {
      this.placeCallSplit();
      this.placePip();
      this.placeVoiceChat(chrome.voiceChat && (chrome.grid !== "split" || focusLayoutOn));
    });
  },
  callStageHandlers() {
    const clips = this.config.soundboard.clips
      .filter((clip) => playableClipIds([clip], this.soundToggles).length > 0)
      .map((clip) => ({ id: clip.id, name: clip.name }));
    const guildSounds = playableGuildSounds(this.guildSounds, this.soundToggles, Boolean(this.voice?.deafened))
      .map((sound) => ({ id: sound.id, name: sound.name, enabled: true }));
    return {
      cameraOn: this.cameraOn,
      shareOn: this.shareOn,
      muted: Boolean(this.voice?.muted),
      deafened: Boolean(this.voice?.deafened),
      activitiesOpen: this.activitiesOpen,
      soundboardOpen: this.soundboardOpen,
      clips,
      showChat: this.callView.showChat,
      fullScreen: this.callView.fullScreen,
      gridView: this.callView.grid,
      showNonVideo: this.callView.showNonVideo,
      messagePreviews: this.callView.messagePreviews,
      micMenuOpen: this.micMenuOpen,
      moreOpen: this.moreOpen,
      inputLevel: this.inputLevel,
      profiles: this.inputProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
      profileId: this.inputProfileId,
      inputVolume: this.inputVolume,
      outputVolume: this.outputVolume,
      inputs: this.captureDevices(),
      outputs: this.playbackDevices(),
      inputDevice: this.config.voice.input_device,
      outputDevice: this.config.voice.output_device,
      guildSounds,
      activities: ACTIVITIES.map((activity) => ({ id: activity.id, name: activity.name })),
      watchUrl: this.watchUrl,
      onCamera: () => this.toggleCamera(),
      onShare: () => this.toggleShare(),
      onActivities: () => this.toggleActivities(),
      onSoundboard: () => this.toggleSoundboard(),
      onShowChat: () => this.toggleShowChat(),
      onInvite: () => void this.inviteToCall(),
      onFullScreen: () => this.toggleFullScreen(),
      onMicMenu: () => this.toggleMicMenu(),
      onMore: () => this.toggleMore(),
      onMoreAction: (action: "grid" | "non-video" | "previews" | "settings" | "fullscreen") => this.onMoreAction(action),
      onInput: (id: string) => this.pickInput(id),
      onOutput: (id: string) => this.pickOutput(id),
      onProfile: (id: string) => this.pickInputProfile(id),
      onInputVolume: (value: number) => this.setInputVolume(value),
      onOutputVolume: (value: number) => this.setOutputVolume(value),
      onGuildSound: (id: string) => void this.playGuildSound(id),
      onActivity: (id: string) => void this.launchActivity(id),
      onWatch: (url: string) => void this.startWatchTogether(url),
      onMute: () => this.toggleMute(),
      onDeafen: () => this.toggleDeafen(),
      onLeave: () => this.leaveVoice(),
      onPlay: (id: string) => this.playSound(id),
      onMenu: (userId: string, x: number, y: number) => this.openVoiceMenu(userId, x, y),
    };
  },
  returnToChat() {
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = dismissCallSurface();
  },
  dismissCallView() {
    this.returnToChat();
    this.paint();
  },
  setStripOpen(open: boolean) {
    this.stripOpen = open;
    try {
      localStorage.setItem(CALL_STRIP_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
    this.channelShape = "";
    this.paint();
  },
  openCallSplit() {
    if (!this.voice) return;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "split";
    this.paint();
  },
  toggleCallView() {
    if (!this.voice) return;
    const next = toggleCallHotkey(true, this.callSurface);
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = next;
    this.paint();
  },
  popCallOut() {
    if (!this.voice) return;
    if (this.callPopout && !this.callPopout.closed) {
      this.callPopout.focus();
      this.callSurface = "popout";
      this.ensureCallBus();
      this.paint();
      return;
    }
    const child = openCallPopout();
    if (!child) {
      this.toast("Call", "Couldn't open a call window. The call stays above the text channel.");
      this.callSurface = "split";
      this.paint();
      return;
    }
    this.callPopout = child;
    this.callSurface = "popout";
    this.ensureCallBus();
    this.paint();
  },
  closeCallPopout() {
    const child = this.callPopout;
    this.callPopout = null;
    try {
      this.callBus?.postMessage({ type: "bye" });
    } catch {
      /* already closed */
    }
    if (child && !child.closed) child.close();
  },
  ensureCallBus() {
    if (this.callBus) return;
    this.callBus = callBus();
    if (!this.callBus) return;
    this.callBus.onmessage = (event) => {
      const data = event.data as { type?: string; command?: CallCommand; frame?: CallFrame } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "hello") this.publishCallFrame();
      else if (data.type === "command" && data.command) this.onCallCommand(data.command);
    };
  },
  publishCallFrame() {
    if (!this.callBus || this.callSurface !== "popout" || !this.voice) return;
    const frame: CallFrame = {
      channel: this.voice.name,
      tiles: stageTiles(this.stageMembers()),
      motion: this.ringMotion(),
      speakColor: speakColor(this.config.voice.speak_color),
      cameraOn: this.cameraOn,
      shareOn: this.shareOn,
      muted: this.voice.muted,
      deafened: this.voice.deafened,
      activitiesOpen: this.activitiesOpen,
      clips: this.config.soundboard.clips.map((clip) => ({ id: clip.id, name: clip.name })),
    };
    this.callBus.postMessage({ type: "frame", frame });
  },
  onCallCommand(command: CallCommand) {
    if (command.type === "close") {
      if (this.callSurface !== "popout") return;
      this.callSurface = "chat";
      this.closeCallPopout();
      this.paint();
      return;
    }
    if (command.type === "dock") {
      this.closeCallPopout();
      this.callSurface = "split";
      this.paint();
      return;
    }
    if (!this.voice) return;
    if (command.type === "mute") this.toggleMute();
    else if (command.type === "deafen") this.toggleDeafen();
    else if (command.type === "leave") this.leaveVoice();
    else if (command.type === "camera") this.toggleCamera();
    else if (command.type === "share") this.toggleShare();
    else if (command.type === "activities") {
      this.activitiesOpen = !this.activitiesOpen;
      this.paintVoice();
    } else if (command.type === "play") this.playSound(command.id);
  },
  paintPip(tile: StageTile | null) {
    if (!this.callPip) return;
    if (!tile) {
      this.callPip.hidden = true;
      clear(this.callPip);
      return;
    }
    this.callPip.hidden = false;
    this.late!.renderPipTile(this.callPip, tile, this.ringMotion());
  },
  callAvailable(): number {
    const chat = this.callSplit.parentElement;
    if (!chat) return 0;
    const composer = this.composer.closest(".composer-wrap");
    const composerH = composer instanceof HTMLElement && !composer.hidden ? composer.offsetHeight : 0;
    const used = this.chatHead.offsetHeight + (this.callStrip.hidden ? 0 : this.callStrip.offsetHeight) + composerH + this.typingEl.offsetHeight + this.callHandle.offsetHeight;
    return Math.max(0, chat.clientHeight - used);
  },
  placeCallSplit() {
    if (!this.callSplit || this.callSplit.hidden) return;
    if (this.callSplit.classList.contains("is-focus")) {
      this.callSplit.style.height = `${FOCUS_SPLIT_PX}px`;
      return;
    }
    const available = this.callAvailable();
    if (available <= 0) return;
    this.callSplit.style.height = `${Math.round(available * this.splitRatio)}px`;
    this.callHandle.setAttribute("aria-valuemin", "28");
    this.callHandle.setAttribute("aria-valuemax", "62");
    this.callHandle.setAttribute("aria-valuenow", String(Math.round(this.splitRatio * 100)));
  },
  placePip() {
    if (!this.callPip || this.callPip.hidden || this.pipDrag) return;
    const frame = this.messagesEl.getBoundingClientRect();
    if (frame.width < 80 || frame.height < 80) return;
    const composer = this.composer.closest(".composer-wrap");
    const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
    const size = { width: PIP_WIDTH, height: PIP_HEIGHT };
    const point = pipPoint(this.pipCorner, rectBox(frame), blocker ? rectBox(blocker) : null, size);
    this.callPip.style.width = `${size.width}px`;
    this.callPip.style.height = `${size.height}px`;
    this.callPip.style.left = `${point.x}px`;
    this.callPip.style.top = `${point.y}px`;
  },
  bindCallChrome() {
    this.callHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.callSurface !== "split") return;
      event.preventDefault();
      const startY = event.clientY;
      const start = this.splitRatio;
      const available = this.callAvailable();
      const move = (ev: PointerEvent) => {
        if (available <= 0) return;
        this.splitRatio = clampSplitRatio(start + (ev.clientY - startY) / available);
        this.placeCallSplit();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        try {
          localStorage.setItem(CALL_SPLIT_KEY, String(this.splitRatio));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    this.callPip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.callPip.hidden) return;
      event.preventDefault();
      const rect = this.callPip.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = rect.left;
      const originY = rect.top;
      let moved = false;
      this.pipDrag = true;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > 4) moved = true;
        const frame = this.messagesEl.getBoundingClientRect();
        const composer = this.composer.closest(".composer-wrap");
        const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
        const next = clampPip(
          { x: originX + dx, y: originY + dy },
          { width: PIP_WIDTH, height: PIP_HEIGHT },
          rectBox(frame),
          blocker ? rectBox(blocker) : null,
        );
        this.callPip.style.left = `${next.x}px`;
        this.callPip.style.top = `${next.y}px`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        this.pipDrag = false;
        if (!moved) {
          this.openCallSplit();
          return;
        }
        const pip = this.callPip.getBoundingClientRect();
        const frame = this.messagesEl.getBoundingClientRect();
        const composer = this.composer.closest(".composer-wrap");
        const blocker = composer instanceof HTMLElement && !composer.hidden ? composer.getBoundingClientRect() : null;
        const size = { width: PIP_WIDTH, height: PIP_HEIGHT };
        this.pipCorner = nearestPipCorner(
          { x: pip.left, y: pip.top },
          pipAnchors(rectBox(frame), blocker ? rectBox(blocker) : null, size),
        );
        try {
          localStorage.setItem(CALL_PIP_KEY, this.pipCorner);
        } catch {
          /* ignore */
        }
        this.placePip();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    window.addEventListener("resize", () => {
      this.placeCallSplit();
      this.placePip();
    });
  },
  toggleCamera() {
    this.cameraOn = !this.cameraOn;
    if (this.cameraOn) void this.startCameraSend();
    else this.stopCameraSend();
    if (this.voice && !this.demo) {
      void invoke("set_voice_camera", { active: this.cameraOn }).catch(() => undefined);
      void invoke("set_voice_video", {
        guildId: this.voice.guildId,
        channelId: this.voice.channelId,
        mute: this.voice.muted,
        deaf: this.voice.deafened,
        video: this.cameraOn,
      }).catch(() => undefined);
    }
    this.paintVoice();
    this.paintChannels();
  },
  async startCameraSend() {
    this.stopCameraSend();
    const gen = this.cameraGen;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast("Camera", "This window cannot open a camera.");
      this.cameraOn = false;
      return;
    }
    try {
      const { openCameraSend } = await import("../camera-send");
      if (gen !== this.cameraGen || !this.cameraOn) return;
      const handle = await openCameraSend({
        deviceId: this.config.voice.video_device,
        height: this.config.voice.camera_height,
        fps: this.config.voice.camera_fps,
        send: !this.demo && Boolean(this.voice),
        lossPct: () => this.voiceDetails.lossPct ?? 0,
        invoke: (cmd, args) => invoke(cmd, args),
        onFrame: (stream) => this.attachCameraPreview(stream),
      });
      if (gen !== this.cameraGen || !this.cameraOn) {
        handle.stop();
        return;
      }
      this.cameraStream = handle.stream;
      this.cameraStop = () => handle.stop();
    } catch (err) {
      if (gen !== this.cameraGen) return;
      if (this.demo) return;
      this.cameraOn = false;
      this.toast("Camera", err instanceof Error ? err.message : "Couldn't open the camera.");
      this.paintVoice();
    }
  },
  stopCameraSend() {
    this.cameraGen += 1;
    this.cameraStop?.();
    this.cameraStop = null;
    window.clearInterval(this.cameraTimer);
    this.cameraTimer = 0;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
  },
  attachCameraPreview(stream: MediaStream) {
    const mount = (slot: Element) => {
      if (slot.querySelector("video")) return;
      const preview = document.createElement("video");
      preview.className = "camera-preview";
      preview.muted = true;
      preview.playsInline = true;
      preview.autoplay = true;
      preview.srcObject = stream;
      slot.replaceChildren(preview);
    };
    const test = document.querySelector("[data-camera-test]");
    if (test) mount(test);
    const slot = document.querySelector(`.voice-tile.is-video[data-voice-user="${this.meId()}"] .voice-media`);
    if (slot) mount(slot);
  },
  watchMicLevel() {
    this.stopMicLevel();
    if (!navigator.mediaDevices?.getUserMedia) return;
    void navigator.mediaDevices.getUserMedia({
      audio: browserMicConstraint(this.config.voice.input_device, this.audioInputs.map((device) => device.id)),
      video: false,
    }).then((stream) => {
      this.micPreview = stream;
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const bins = new Float32Array(analyser.fftSize);
      const pump = () => {
        if (!this.micMenuOpen && !this.micTestOn) {
          context.close().catch(() => undefined);
          return;
        }
        analyser.getFloatTimeDomainData(bins);
        this.inputLevel = micLevel(bins);
        const fill = document.querySelector(".mic-meter-fill");
        if (fill instanceof HTMLElement) fill.style.width = `${this.inputLevel}%`;
        this.micMeterTimer = window.setTimeout(pump, 80);
      };
      pump();
    }).catch(() => undefined);
  },
  stopMicLevel() {
    window.clearTimeout(this.micMeterTimer);
    this.micMeterTimer = 0;
    this.micPreview?.getTracks().forEach((track) => track.stop());
    this.micPreview = null;
  },
  stagePeople(): StagePerson[] {
    if (!this.voice) return [];
    return participantsIn(this.voiceRoster, this.voice.guildId ?? "", this.voice.channelId).map((person) => ({
      userId: person.userId,
      name: person.name,
      avatarUrl: person.avatarUrl,
      suppressed: person.userId === this.meId() ? !this.stageSpeaker : person.suppress,
      requestToSpeak: person.userId === this.meId() ? this.stageRaised : person.requestToSpeak,
      self: person.userId === this.meId(),
      speaking: person.speaking,
    }));
  },
  toggleRaiseHand() {
    this.stageRaised = !this.stageRaised;
    if (this.stageRaised) this.stageSpeaker = false;
    const stamp = raiseHand(this.stageRaised, new Date().toISOString());
    if (this.voice && !this.demo) {
      void invoke("set_voice_video", {
        guildId: this.voice.guildId,
        channelId: this.voice.channelId,
        mute: this.voice.muted,
        deaf: this.voice.deafened,
        video: this.cameraOn,
        requestToSpeak: stamp.requestToSpeakTimestamp,
      }).catch(() => undefined);
    }
    this.paintVoice();
  },
  async startStage(topic: string) {
    if (!this.voice) return;
    this.stageTopic = topic.trim().slice(0, 120);
    this.stageSpeaker = true;
    this.stageRaised = false;
    const body = startStageBody(this.voice.channelId, this.stageTopic);
    if (!this.demo) {
      try {
        await invoke("start_stage", { channelId: body.channel_id, topic: body.topic });
      } catch (err) {
        this.toast("Stage", err instanceof Error ? err.message : "Couldn't start the stage.");
      }
    }
    this.paintVoice();
  },
  async setStageAudience(userId: string, audience: boolean) {
    if (!this.voice?.guildId || this.demo) {
      const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
      if (person) person.suppress = audience;
      this.paintVoice();
      return;
    }
    try {
      await invoke("set_member_voice", { guildId: this.voice.guildId, userId, suppress: audience });
    } catch (err) {
      this.toast("Stage", err instanceof Error ? err.message : "Couldn't move that person.");
    }
  },
  async loadGuildSounds(guildId: string) {
    if (this.demo) return;
    try {
      const listed = await invoke<unknown>("fetch_soundboard", { guildId });
      this.guildSounds = sanitizeGuildSounds(listed, guildId);
      this.paintVoice();
      if (this.soundboardOpen) this.paintChannels();
    } catch {
      this.guildSounds = [];
      if (this.soundboardOpen) this.paintChannels();
    }
  },
  async playGuildSound(id: string) {
    if (!this.voice || this.voice.deafened) return;
    if (!soundEnabled(this.soundToggles, id)) return;
    const sound = this.guildSounds.find((item) => item.id === id);
    if (!sound) return;
    this.noteHeardSound(this.meId(), sound.id);
    if (this.demo) return;
    try {
      await invoke("play_guild_sound", { channelId: this.voice.channelId, soundId: sound.id, guildId: sound.guildId, volume: sound.volume });
    } catch (err) {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't play that sound.");
    }
  },
  noteHeardSound(userId: string, soundId: string) {
    this.heardSounds.set(hearSoundKey(userId, soundId), Date.now());
    if (this.heardSounds.size <= 32) return;
    const cutoff = Date.now() - 5_000;
    for (const [key, at] of this.heardSounds) {
      if (at < cutoff) this.heardSounds.delete(key);
    }
  },
  onSoundEffect(payload: unknown) {
    const effect = parseSoundEffect(payload);
    if (!effect || !this.voice) return;
    const recent = this.heardSounds.get(hearSoundKey(effect.userId, effect.soundId));
    if (!acceptHeardSound(effect, this.voice.channelId, Boolean(this.voice.deafened), Date.now(), recent)) return;
    this.noteHeardSound(effect.userId, effect.soundId);
    if (this.demo) return;
    void invoke("hear_guild_sound", { soundId: effect.soundId, volume: effect.volume }).catch(() => undefined);
  },
  async inviteToCall() {
    if (!this.voice) return;
    if (this.demo) {
      const link = voiceChannelLink(this.voice.guildId, this.voice.channelId);
      this.toast("Invite", link || "Invite copied.");
      return;
    }
    try {
      const code = await invoke<string>("create_channel_invite", { channelId: this.voice.channelId });
      const url = code.startsWith("http") ? code : `https://discord.gg/${code}`;
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      this.toast("Invite", "Copied the invite link.");
    } catch (err) {
      this.toast("Invite", err instanceof Error ? err.message : "Couldn't create an invite.");
    }
  },
  async launchActivity(id: string) {
    const activity = activityById(id);
    if (!activity || !this.voice) return;
    this.activitiesOpen = true;
    if (this.demo) {
      this.toast(activity.name, "Activity invite is ready in the desktop app.");
      return;
    }
    try {
      const url = await invoke<string>("create_activity_invite", { channelId: this.voice.channelId, applicationId: activity.id });
      this.toast(activity.name, url);
    } catch (err) {
      this.toast(activity.name, err instanceof Error ? err.message : "Couldn't start that activity.");
    }
  },
  async startWatchTogether(url: string) {
    const videoId = watchVideoId(url);
    if (!videoId) {
      this.toast("Watch Together", "Paste a YouTube link.");
      return;
    }
    this.watchUrl = url.trim();
    this.watchVideo = videoId;
    await this.launchActivity(ACTIVITIES[0].id);
    if (this.voice && !this.demo) {
      void invoke("send_message", { channelId: this.voice.channelId, content: url.trim(), replyTo: null, nonce: null, files: [] }).catch(() => undefined);
    }
    this.paintVoice();
  },
  async loadVoiceChat() {
    if (!this.voice) return;
    const channelId = this.voice.channelId;
    if (this.demo) {
      this.voiceChatLines = (this.pages[channelId] ?? []).slice(-40).map((message) => ({
        id: message.id,
        author: message.authorName,
        text: messagePreview(message.content),
      }));
      this.paintVoice();
      return;
    }
    try {
      const page = await invoke<{ id: string; authorName?: string; content?: string }[]>("fetch_messages", { channelId, before: null });
      this.voiceChatLines = page.slice(-40).map((message) => ({
        id: message.id,
        author: message.authorName || "Someone",
        text: messagePreview(message.content ?? ""),
      }));
      this.paintVoice();
    } catch (err) {
      this.toast("Voice chat", err instanceof Error ? err.message : "Couldn't load the voice channel chat.");
    }
  },
  async sendVoiceChat(text: string) {
    if (!this.voice) return;
    const content = text.trim();
    if (!content) return;
    const local = { id: `local-${Date.now()}`, author: this.me.name, text: messagePreview(content) };
    this.voiceChatLines = [...this.voiceChatLines, local].slice(-40);
    this.paintVoice();
    if (this.demo) return;
    try {
      await invoke("send_message", { channelId: this.voice.channelId, content, replyTo: null, nonce: null, files: [] });
    } catch (err) {
      this.toast("Voice chat", err instanceof Error ? err.message : "Couldn't send that.");
    }
  },
  ensureVoiceChat(): HTMLElement {
    if (this.voiceChatEl) return this.voiceChatEl;
    const panel = el("aside", "voice-chat");
    panel.hidden = true;
    this.voiceChatEl = panel;
    return panel;
  },
  voiceChatPanel(): HTMLElement {
    const panel = this.ensureVoiceChat();
    const sig = `${this.watchVideo}:${this.voiceChatLines.map((line) => line.id + line.text).join("\n")}`;
    if (panel.dataset.sig !== sig) {
      panel.dataset.sig = sig;
      this.late!.renderVoiceChat(panel, this.voiceChatLines, (value) => void this.sendVoiceChat(value));
      if (this.watchVideo) {
        const frame = el("iframe", "watch-frame");
        frame.src = watchEmbedUrl(this.watchVideo);
        frame.title = "Watch Together";
        frame.setAttribute("allow", "autoplay; encrypted-media");
        panel.prepend(frame);
      }
    }
    panel.hidden = false;
    return panel;
  },
  placeVoiceChat(docked: boolean) {
    const panel = this.ensureVoiceChat();
    const chat = this.messagesEl.parentElement;
    if (!chat) return;
    if (!docked) {
      panel.classList.remove("is-docked");
      if (!panel.closest(".voice-stage")) panel.hidden = true;
      if (!this.callView.showChat) this.messagesEl.style.marginRight = "";
      return;
    }
    if (panel.parentElement !== chat) chat.append(panel);
    const composer = this.composer.closest(".composer-wrap");
    const composerH = composer instanceof HTMLElement ? composer.offsetHeight : 0;
    const insets = voiceChatInsets(true, chat.clientWidth, composerH);
    panel.hidden = insets.panelWidth === 0;
    panel.classList.toggle("is-docked", insets.panelWidth > 0);
    panel.style.width = `${insets.panelWidth}px`;
    panel.style.bottom = `${insets.panelBottom}px`;
    this.messagesEl.style.marginRight = insets.marginRight ? `${insets.marginRight}px` : "";
    if (insets.panelWidth > 0 && panel.dataset.sig == null) this.voiceChatPanel();
  },
  decorateTiles<T extends { userId: string; name?: string; badge?: string }>(tiles: T[]): T[] {
    if (!this.callView.messagePreviews) return tiles;
    return tiles.map((tile) => {
      const line = [...this.voiceChatLines].reverse().find((item) => item.author === tile.name);
      if (!line || tile.badge) return tile;
      return { ...tile, badge: line.text };
    });
  },
  paintVoiceChannelMenu() {
    const host = this.voiceMenuEl;
    if (!host) return;
    const menu = this.channelMenu;
    const channel = menu ? this.channelById(menu.channelId) : undefined;
    if (!menu || !channel) {
      if (!this.voiceMenu) {
        host.hidden = true;
        clear(host);
      }
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("role", "menu");
    host.setAttribute("aria-label", channel.name);
    host.style.left = `${menu.x}px`;
    host.style.top = `${menu.y}px`;
    host.append(el("strong", "", channel.name));
    const labels: Record<(typeof voiceChannelMenu extends () => readonly (infer T)[] ? T : never), string> = {
      "join-quiet": "Join Without Entrance Sound",
      "open-chat": "Open Chat",
      "hide-names": this.callView.hideNames ? "Show Names" : "Hide Names",
      invite: "Invite",
      edit: "Edit Channel",
      duplicate: "Duplicate Channel",
      "copy-link": "Copy Link",
      mute: "Mute Channel",
      "set-status": "Set Channel Status",
    };
    for (const action of voiceChannelMenu()) {
      const button = el("button", "text-button", labels[action]);
      button.type = "button";
      button.addEventListener("click", () => void this.runVoiceChannelAction(channel, action));
      host.append(button);
    }
    this.clampFloat(host, menu.x, menu.y);
  },
  async runVoiceChannelAction(channel: Channel, action: ReturnType<typeof voiceChannelMenu>[number]) {
    this.channelMenu = null;
    this.paintVoiceChannelMenu();
    if (action === "join-quiet") {
      this.joinVoice(channel, { quiet: true });
      return;
    }
    if (action === "open-chat") {
      this.callView = { ...this.callView, showChat: true };
      if (this.voice?.channelId === channel.id) void this.loadVoiceChat();
      else void this.openChannel(channel.id);
      this.paint();
      return;
    }
    if (action === "hide-names") {
      this.callView = { ...this.callView, hideNames: !this.callView.hideNames };
      this.channelPane.dataset.hideNames = this.callView.hideNames ? "1" : "0";
      this.paintChannels();
      return;
    }
    if (action === "invite") {
      this.joinVoice(channel);
      await this.inviteToCall();
      return;
    }
    if (action === "copy-link") {
      const link = voiceChannelLink(this.guildId, channel.id);
      if (link && navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      this.toast("Link", link || "Couldn't copy that link.");
      return;
    }
    if (action === "mute") {
      const muted = this.levelFor(this.guildId, channel.id) === "mute";
      this.writeChannelLevel(channel.id, muted ? "all" : "mute");
      return;
    }
    if (action === "edit") {
      const opener = (this as unknown as { openChannelSettings?: (item: Channel) => void }).openChannelSettings;
      if (typeof opener === "function") {
        opener.call(this, channel);
        return;
      }
      const name = window.prompt("Channel name", channel.name);
      if (!name || this.demo) return;
      try {
        await invoke("modify_channel", { channelId: channel.id, name: name.trim() });
      } catch (err) {
        this.toast("Edit channel", err instanceof Error ? err.message : "Couldn't edit that channel.");
      }
      return;
    }
    if (action === "duplicate") {
      if (this.demo || !this.guildId) return;
      try {
        await invoke("duplicate_channel", { guildId: this.guildId, channelId: channel.id, name: `${channel.name} copy` });
        this.toast("Channel", "Duplicated.");
      } catch (err) {
        this.toast("Channel", err instanceof Error ? err.message : "Couldn't duplicate that channel.");
      }
      return;
    }
    const status = window.prompt("Channel status", "");
    if (status === null || this.demo) return;
    try {
      await invoke("set_voice_status", { channelId: channel.id, status: status.trim().slice(0, 500) });
    } catch (err) {
      this.toast("Status", err instanceof Error ? err.message : "Couldn't set the channel status.");
    }
  },
  toggleShare() {
    if (this.shareOn) {
      this.stopShare();
      return;
    }
    this.shareDialogOpen = true;
    this.shareQualityOpen = false;
    void this.loadShareSources();
    this.paint();
  },
  openDemoShare(mode: "dialog" | "live") {
    const channel = demoChannels[NORTHWIND].find((item) => item.kind === "voice");
    if (!channel) return;
    if (mode === "live") {
      this.shareOn = true;
      this.shareLiveHeight = snapShareHeight(this.config.voice.share_resolution);
      this.shareLiveFps = snapShareFps(this.config.voice.share_fps);
      this.shareSources = demoShareSources();
    } else {
      this.shareDialogOpen = true;
      this.shareSources = demoShareSources();
      this.sharePick = this.shareSources[0]?.id ?? "screen:0";
    }
    if (mode === "live") this.callSurface = "split";
    this.joinVoice(channel);
    this.paintShareDialog();
  },
  async loadShareSources() {
    if (this.demo) {
      this.shareSources = demoShareSources();
    } else {
      try {
        const listed = await invoke<ShareSource[]>("list_share_sources");
        this.shareSources = listed.length ? listed : [{ id: "screen:0", kind: "screen", name: "Entire screen", width: 0, height: 0, thumbnail: "" }];
      } catch {
        this.shareSources = [{ id: "screen:0", kind: "screen", name: "Entire screen", width: 0, height: 0, thumbnail: "" }];
      }
    }
    if (!this.shareSources.some((source) => source.id === this.sharePick)) this.sharePick = this.shareSources[0]?.id ?? "";
    this.paintShareDialog();
  },
  goLive() {
    const source = this.shareSources.find((item) => item.id === this.sharePick) ?? this.shareSources[0];
    if (!source || !this.voice) return;
    this.shareDialogOpen = false;
    this.shareOn = true;
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareNote = "";
    this.shareLiveHeight = snapShareHeight(this.config.voice.share_resolution);
    this.shareLiveFps = snapShareFps(this.config.voice.share_fps);
    this.persist();
    if (!this.demo) {
      void invoke("start_screen_share", {
        sourceId: source.id,
        resolution: this.config.voice.share_resolution,
        fps: this.shareLiveFps,
        appAudio: this.config.voice.share_app_audio,
        encoder: this.config.voice.share_encoder,
        sourceWidth: source.width,
        sourceHeight: source.height,
      }).catch((err) => {
        this.shareOn = false;
        this.toast("Screen share", err instanceof Error ? err.message : "Couldn't start the stream.");
        this.paintVoice();
        this.paintChannels();
      });
    }
    this.noteCapture();
  },
  stopShare() {
    this.shareOn = false;
    this.sharePaused = false;
    this.shareUserPaused = false;
    this.shareHeld = false;
    this.shareQualityOpen = false;
    this.shareDialogOpen = false;
    this.shareNote = "";
    if (this.pipUser === this.meId()) this.pipUser = "";
    if (!this.demo) void invoke("stop_screen_share").catch(() => undefined);
    this.noteCapture();
  },
  setShareQuality(resolution: string, fps: number) {
    const height = resolution === "0" || resolution === "source" ? "source" : resolution;
    this.config.voice.share_resolution = height;
    this.config.voice.share_fps = snapShareFps(fps);
    this.shareLiveHeight = snapShareHeight(height);
    this.shareLiveFps = this.config.voice.share_fps;
    this.persist();
    const source = this.shareSources.find((item) => item.id === this.sharePick);
    if (this.shareOn && !this.demo) {
      void invoke("set_share_quality", {
        resolution: height,
        fps: this.shareLiveFps,
        sourceWidth: source?.width ?? 0,
        sourceHeight: source?.height ?? 0,
      }).catch(() => undefined);
    }
    this.paintVoice();
    this.paintShareDialog();
  },
  toggleSharePause() {
    this.shareUserPaused = !this.shareUserPaused;
    this.sharePaused = this.shareUserPaused;
    this.shareHeld = false;
    if (!this.demo) void invoke("set_share_paused", { paused: this.sharePaused }).catch(() => undefined);
    this.paintVoice();
    this.paintChannels();
  },
  noteShareVisibility(hidden: boolean) {
    if (!this.shareOn || this.demo || this.shareUserPaused) return;
    if (hidden && !this.sharePaused) {
      this.shareHeld = true;
      this.sharePaused = true;
      void invoke("set_share_paused", { paused: true }).catch(() => undefined);
      this.paintVoice();
      this.paintChannels();
    } else if (!hidden && this.shareHeld) {
      this.shareHeld = false;
      this.sharePaused = false;
      void invoke("set_share_paused", { paused: false }).catch(() => undefined);
      this.paintVoice();
      this.paintChannels();
    }
  },
  watchMember(userId: string) {
    if (!this.voice) return;
    this.shareWatching = userId;
    if (!this.demo) {
      const key = streamKeyFor(this.voice.guildId ?? "", this.voice.channelId, userId);
      void invoke("watch_stream", { streamKey: key }).catch((err) => {
        this.shareWatching = "";
        this.toast("Screen share", err instanceof Error ? err.message : "Couldn't watch that stream.");
        this.paintVoice();
      });
    }
    this.paintVoice();
  },
  stopWatching() {
    this.shareWatching = "";
    if (!this.demo) void invoke("stop_watch_stream").catch(() => undefined);
    this.paintVoice();
  },
  streamHandlers() {
    return {
      onWatch: (userId: string) => this.watchMember(userId),
      onStopWatch: () => this.stopWatching(),
      onStop: () => this.stopShare(),
      onPause: () => this.toggleSharePause(),
      onQuality: () => {
        this.shareQualityOpen = !this.shareQualityOpen;
        this.paintVoice();
      },
      onResolution: (value: string) => this.setShareQuality(value, this.config.voice.share_fps),
      onFps: (fps: number) => this.setShareQuality(this.config.voice.share_resolution, fps),
      onPip: (userId: string) => {
        this.pipUser = this.pipUser === userId ? "" : userId;
        this.paintVoice();
      },
      resolution: this.config.voice.share_resolution,
      fps: this.config.voice.share_fps,
    };
  },
  mountShareSurfaces() {
    if (!this.callPip) return;
    this.late!.mountStreamTiles(this.root, this.streamModels(), this.streamHandlers(), this.pipUser);
  },
  streamModels() {
    if (!this.voice) return [];
    const selfId = this.meId();
    return this.voice.members.flatMap((member) => {
      const self = member.id === selfId;
      const sharing = (self && this.shareOn) || Boolean(member.sharing);
      if (!sharing) return [];
      return [{
        userId: member.id,
        name: member.name,
        self,
        paused: self && this.sharePaused,
        watching: !self && this.shareWatching === member.id,
        label: self ? qualityLabel(this.shareLiveHeight, this.shareLiveFps) : member.sharing ? "Go Live" : "",
        note: self ? this.shareNote : "",
        qualityOpen: self && this.shareQualityOpen,
      }];
    });
  },
  paintShareDialog() {
    if (!this.shareLayer) return;
    this.shareLayer.replaceChildren();
    if (!this.shareDialogOpen) {
      this.shareLayer.hidden = true;
      return;
    }
    this.shareLayer.hidden = false;
    this.shareLayer.append(this.late!.shareDialog({
      sources: this.shareSources.length ? this.shareSources : demoShareSources(),
      selectedId: this.sharePick,
      resolution: this.config.voice.share_resolution,
      fps: this.config.voice.share_fps,
      appAudio: this.config.voice.share_app_audio,
      onSelect: (id) => {
        this.sharePick = id;
        this.paintShareDialog();
      },
      onResolution: (value) => this.setShareQuality(value, this.config.voice.share_fps),
      onFps: (fps) => this.setShareQuality(this.config.voice.share_resolution, fps),
      onAppAudio: (on) => {
        this.config.voice.share_app_audio = on;
        this.persist();
        this.paintShareDialog();
      },
      onGo: () => this.goLive(),
      onClose: () => {
        this.shareDialogOpen = false;
        this.paintShareDialog();
      },
    }));
  },
  onScreenShare(event: { state?: string; note?: string; detail?: string; fps?: number; height?: number }) {
    const state = event.state ?? "";
    const note = event.note || event.detail || "";
    if (state === "live") this.shareOn = true;
    if (state === "stopped") this.shareOn = false;
    if (state === "failed") {
      this.shareNote = note || "The stream stopped.";
      this.toast("Screen share", this.shareNote);
    }
    if (state === "adapted") {
      this.shareNote = note;
      if (typeof event.fps === "number") this.shareLiveFps = snapShareFps(event.fps);
      if (typeof event.height === "number" && [720, 1080, 1440, 2160].includes(event.height)) this.shareLiveHeight = event.height;
    }
    this.paintVoice();
    this.paintChannels();
    if ((state === "live" || state === "stopped") && this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoShare) this.noteCapture();
  },
  onStreamFrame(event: { annexB?: string; streamKey?: string; preview?: boolean }) {
    if (!this.late || !event.annexB) return;
    const raw = atob(event.annexB);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    const userId = event.preview || !event.streamKey ? this.meId() : event.streamKey.split(":").at(-1) || "";
    if (userId) this.late!.pushStreamFrame(userId, bytes);
  },
  onCameraFrame(userId: string, annexB: string) {
    if (!this.late) return;
    const bytes = this.late.cameraFrameBytes(annexB);
    if (!userId || !bytes) return;
    this.late!.pushCameraFrame(userId, bytes);
    this.late!.attachCameraTiles(this.root);
    this.callBus?.postMessage({ type: "camera", userId, annexB });
  },
  openVoiceMenu(userId: string, x: number, y: number) {
    if (userId === this.meId()) return;
    this.voiceMenu = { userId, x, y };
    this.gearOpen = false;
    this.activitiesOpen = false;
    this.paintVoice();
  },
  dismissVoiceFloats(event: PointerEvent) {
    if (event.button !== 0) return;
    if (!this.voiceMenu && !this.gearOpen && !this.activitiesOpen && !this.soundboardOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".voice-menu, .voice-gear, .voice-pop, .voice-bar, .voice-board, .voice-panel, .share-dialog, .share-popover, .share-layer, [data-voice-gear]")) return;
    this.voiceMenu = null;
    this.gearOpen = false;
    this.activitiesOpen = false;
    const board = this.soundboardOpen;
    this.soundboardOpen = false;
    this.paintVoiceFloats();
    if (board) this.paintChannels();
    else if (this.callSurface === "split") this.paintVoice();
  },
  paintVoiceFloats() {
    this.paintVoiceMenu();
    this.paintVoiceChannelMenu();
    this.paintGear();
  },
  async moderateMember(userId: string, action: ParticipantMenuAction, channelId?: string) {
    const person = Object.values(this.voiceRoster).find((item) => item.userId === userId);
    this.voiceMenu = null;
    this.paintVoiceFloats();
    if (!person) return;
    if (action === "profile") {
      const known = this.directory[userId];
      this.openProfile(known ?? { id: userId, name: person.name, avatarUrl: person.avatarUrl });
      return;
    }
    if (action === "pop-out") {
      this.pipUser = userId;
      this.toast("Call", `${person.name} is popped out.`);
      this.paint();
      return;
    }
    if (action === "mod-view") {
      const guildId = person.guildId || this.guildId;
      void this.ensureLate().then(() => {
        if (requestModView(userId, guildId) !== "called") this.toast("Mod View", "Mod View is not available yet.");
      });
      return;
    }
    if (action === "move") {
      /* channel id is the destination */
    }
    const moderation = action === "move" || action === "disconnect" || action === "server-mute" || action === "server-deafen" ? action : null;
    if (!moderation) return;
    const body = memberVoiceBody(moderation, person, channelId);
    if (this.demo || !this.voice?.guildId) {
      if (moderation === "server-mute") person.serverMute = !person.serverMute;
      if (moderation === "server-deafen") {
        person.serverDeaf = !person.serverDeaf;
        if (person.serverDeaf) person.serverMute = true;
      }
      if (moderation === "disconnect") applyVoiceState(this.voiceRoster, { guildId: person.guildId, channelId: "", userId });
      if (moderation === "move" && channelId) person.channelId = channelId;
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      return;
    }
    try {
      await invoke("set_member_voice", {
        guildId: this.voice.guildId,
        userId,
        mute: body.mute ?? null,
        deaf: body.deaf ?? null,
        channelId: moderation === "move" ? channelId ?? null : null,
        disconnect: moderation === "disconnect",
        suppress: null,
      });
    } catch (err) {
      this.toast("Voice", err instanceof Error ? err.message : "Couldn't update that person.");
    }
  },
  paintVoiceMenu() {
    const host = this.voiceMenuEl;
    if (!host) return;
    const menu = this.voiceMenu;
    const person = menu ? Object.values(this.voiceRoster).find((item) => item.userId === menu.userId) : undefined;
    if (!menu || !person || person.userId === this.meId()) {
      host.hidden = true;
      clear(host);
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-label", `Volume for ${person.name}`);
    host.style.left = `${menu.x}px`;
    host.style.top = `${menu.y}px`;
    host.append(el("strong", "", person.name));
    const ceiling = this.userVolumeCeiling();
    const shown = Math.min(person.volume, ceiling);
    const readout = el("span", "hint", `User volume ${shown}%`);
    const vol = el("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = String(ceiling);
    vol.value = String(shown);
    vol.setAttribute("aria-label", `Volume for ${person.name}`);
    const muted = person.localMuted;
    vol.addEventListener("input", () => {
      const next = Number(vol.value);
      readout.textContent = `User volume ${next}%`;
      this.previewMix(person.userId, next, muted);
    });
    vol.addEventListener("change", () => void this.persist());
    const mute = el("button", muted ? "text-button is-on" : "text-button", muted ? "Muted for you" : "Mute for you");
    mute.type = "button";
    mute.addEventListener("click", () => this.setUserMix(person.userId, Number(vol.value), !muted));
    vol.classList.add("voice-user-volume");
    host.append(readout, vol, mute);
    const labels: Record<ParticipantMenuAction, string> = {
      profile: "Profile",
      "server-mute": person.serverMute ? "Unmute on server" : "Server mute",
      "server-deafen": person.serverDeaf ? "Undeafen on server" : "Server deafen",
      "pop-out": "Pop out user",
      "mod-view": "Mod view",
      move: "Move to",
      disconnect: "Disconnect",
    };
    for (const action of participantMenu()) {
      if (action === "move") {
        host.append(el("span", "hint", "Move to"));
        for (const channel of this.visibleChannels().filter((item) => item.kind === "voice" || isStageChannel(item))) {
          if (channel.id === person.channelId) continue;
          const button = el("button", "text-button", channel.name);
          button.type = "button";
          button.addEventListener("click", () => void this.moderateMember(person.userId, "move", channel.id));
          host.append(button);
        }
        continue;
      }
      const button = el("button", "text-button", labels[action]);
      button.type = "button";
      button.addEventListener("click", () => void this.moderateMember(person.userId, action));
      host.append(button);
    }
    this.anchorVoiceMenu(host, menu.x, menu.y);
  },
  anchorVoiceMenu(host: HTMLElement, x: number, y: number) {
    const bounds = this.voiceMenuBounds(x, y);
    const place = (width: number, height: number) => {
      const placed = placeMenu({ x, y }, bounds, { width, height });
      host.style.width = `${placed.width}px`;
      host.style.maxHeight = `${placed.maxHeight}px`;
      host.style.left = `${placed.left}px`;
      host.style.top = `${placed.top}px`;
    };
    place(220, 280);
    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      place(Math.min(220, rect.width || 220), rect.height || 180);
    });
  },
  voiceMenuBounds(x: number, y: number): { left: number; top: number; right: number; bottom: number } {
    const nodes = [this.callSplit, this.channelPane];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.hidden) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 64 || rect.height < 64) continue;
      const near = x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12;
      if (!near) continue;
      return { left: rect.left + 4, top: rect.top + 4, right: rect.right - 4, bottom: rect.bottom - 4 };
    }
    const rect = this.channelPane.getBoundingClientRect();
    return { left: rect.left + 4, top: 8, right: Math.max(rect.left + 160, rect.right - 4), bottom: Math.max(160, window.innerHeight - 8) };
  },
  paintGear() {
    const host = this.voiceGearEl;
    if (!host) return;
    if (!this.gearOpen || !this.voice) {
      host.hidden = true;
      clear(host);
      return;
    }
    host.hidden = false;
    clear(host);
    host.setAttribute("aria-label", "Voice settings");
    host.append(el("strong", "", "Voice settings"));
    host.append(this.diagnosticsButton());
    host.append(this.devicePicker("Microphone", this.config.voice.input_device, this.captureDevices(), (value) => {
      this.config.voice.input_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.devicePicker("Speakers", this.config.voice.output_device, this.playbackDevices(), (value) => {
      this.config.voice.output_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.devicePicker("Camera", this.config.voice.video_device, this.videoInputs, (value) => {
      this.config.voice.video_device = value;
      this.persist();
    }));
    const sense = el("input");
    sense.type = "range";
    sense.min = "0";
    sense.max = "100";
    sense.value = String(this.config.voice.sensitivity);
    sense.setAttribute("aria-label", "Voice activity sensitivity");
    sense.addEventListener("input", () => {
      this.config.voice.sensitivity = Number(sense.value);
      this.persist();
      this.pushVoiceAudio();
      this.refreshSpeaking();
    });
    host.append(el("span", "hint", "Voice activity sensitivity"), sense);
    host.append(this.gearToggle("Lark noise suppression", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    host.append(this.gearToggle("Higher quality noise", this.noiseQuality === "high", (value) => {
      this.noiseQuality = noiseQualityName(value ? "high" : "standard");
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    host.append(this.gearToggle("Echo cancellation", this.echoCancellation, (value) => {
      this.echoCancellation = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    host.append(this.gearToggle("Automatic gain", this.agc, (value) => {
      this.agc = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    host.append(this.gearToggle("Voice HUD", this.overlayOn(), (value) => this.setVoiceOverlay(value, false)));
    host.append(this.gearToggle("Performance", this.perfOn(), (value) => this.setPerfOverlay(value, false)));
    host.append(this.gearToggle("Game capture", this.config.clips.game_capture, (value) => {
      this.config.clips.game_capture = value;
      void this.persist().then(() => this.pullClipStatus());
    }));
    host.append(this.choice(["vad", "ptt"], this.voiceMode(), (value) => {
      this.setVoiceMode(value === "ptt" ? "ptt" : "vad");
      this.paintGear();
    }));
    host.append(el("strong", "", "Soundboard"));
    if (!this.config.soundboard.clips.length) host.append(el("p", "hint", "Add clips in Voice & Video."));
    for (const clip of this.config.soundboard.clips) {
      const play = el("button", "text-button", clip.name);
      play.type = "button";
      play.addEventListener("click", () => this.playSound(clip.id));
      host.append(play);
    }
    const more = el("button", "text-button", "Voice & Video settings");
    more.type = "button";
    more.addEventListener("click", () => {
      this.gearOpen = false;
      this.section = "voice";
      this.paintVoiceFloats();
      this.openSettings();
    });
    host.append(more);
    const anchor = this.channelPane.querySelector("[data-voice-gear]");
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
    const x = rect ? rect.left : 16;
    const y = rect ? rect.top - 8 : 80;
    host.style.left = `${x}px`;
    host.style.top = `${Math.max(8, y)}px`;
    this.clampFloat(host, x, y, true);
  },
  gearToggle(label: string, on: boolean, change: (value: boolean) => void): HTMLElement {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", label));
    const button = el("button", on ? "text-button is-on" : "text-button", on ? "On" : "Off");
    button.type = "button";
    button.addEventListener("click", () => {
      change(!on);
      this.paintGear();
      if (this.settings && this.section === "voice") this.renderSettings();
    });
    row.append(button);
    return row;
  },
  clampFloat(host: HTMLElement, x: number, y: number, above = false) {
    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - rect.width - 8));
      let top = above ? y - rect.height : y;
      top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - rect.height - 8));
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    });
  },
  setUserMix(userId: string, volume: number, muted: boolean) {
    const mix = { volume: boostedPlayback(volume, false, this.userVolumeCeiling()), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    void this.persist();
    this.syncCallMembers();
    this.paintVoice();
    this.paintChannels();
  },
  previewMix(userId: string, volume: number, muted: boolean) {
    const mix = { volume: boostedPlayback(volume, false, this.userVolumeCeiling()), muted };
    this.config.voice.levels[userId] = mix;
    applyUserMix(this.voiceRoster, userId, mix);
    const member = this.voice?.members.find((item) => item.id === userId);
    if (member) {
      member.volume = mix.volume;
      member.localMuted = muted;
    }
    if (this.demo || !this.voice) return;
    const gain = boostedPlayback(mix.volume, muted, this.userVolumeCeiling());
    if (this.sentMix.get(userId) === gain) return;
    this.sentMix.set(userId, gain);
    void invoke("set_voice_volume", { userId, volume: gain }).catch(() => undefined);
  },
  matchSound(event: KeyboardEvent, typing: boolean): boolean {
    const clip = clipForHotkey(this.config.soundboard.clips, event, this.platform.os);
    if (!clip) return false;
    if (typing && !soundHotkeyIsGlobal(clip.hotkey)) return false;
    this.playSound(clip.id);
    return true;
  },
  playSound(id: string) {
    const clip = this.config.soundboard.clips.find((item) => item.id === id);
    if (!clip || !soundEnabled(this.soundToggles, id)) return;
    if (!this.voice) {
      this.toast("Soundboard", "Join a voice channel to play a sound.");
      return;
    }
    if (!isTauri()) {
      const url = this.clipBlobs.get(id);
      if (!url) {
        this.toast("Soundboard", "Add the wav again in this preview. The desktop app plays it into the call.");
        return;
      }
      const audio = new Audio(url);
      audio.volume = Math.min(1, clip.volume / 100);
      void audio.play().catch(() => this.toast("Soundboard", "Couldn't play that clip."));
      return;
    }
    void invoke("play_soundboard", { id }).catch((err) => {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't play that clip.");
    });
  },
  saveNote(userId: string, note: string) {
    const clean = clampNote(note);
    if (clean) this.notes[userId] = clean;
    else delete this.notes[userId];
    if (this.friendsOpen) {
      this.msgSig = "";
      this.paintMessages();
    }
    if (this.demo) return;
    void invoke("save_user_note", { userId, note: clean }).catch((err) => {
      this.toast("Note", err instanceof Error ? err.message : "Couldn't save that note.");
    });
  },
  appendSoundboard(wrap: HTMLElement) {
    const card = this.late!.settingCard("Soundboard");
    card.dataset.setting = "voice.soundboard";
    card.append(el("p", "setting-help", "WAV clips mixed into the call. A hotkey with a modifier also works while another app is in front."));
    const file = el("input");
    file.type = "file";
    file.accept = ".wav,audio/wav,audio/x-wav";
    file.hidden = true;
    file.addEventListener("change", () => {
      const picked = file.files?.[0];
      file.value = "";
      if (picked) void this.addSoundFile(picked);
    });
    const add = el("button", "text-button", "Add wav");
    add.type = "button";
    add.addEventListener("click", () => file.click());
    const actions = el("div", "settings-actions");
    actions.append(add, file);
    card.append(actions);
    if (!this.config.soundboard.clips.length) {
      card.append(el("p", "setting-help", "No clips yet. 16-bit WAV, up to 15 seconds."));
      wrap.append(card);
      return;
    }
    for (const clip of this.config.soundboard.clips) {
      const row = el("div", "shortcut-row");
      const enabled = soundEnabled(this.soundToggles, clip.id);
      const toggle = el("button", enabled ? "text-button is-on" : "text-button", enabled ? "On" : "Off");
      toggle.type = "button";
      toggle.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${clip.name}`);
      toggle.addEventListener("click", () => {
        this.soundToggles = { ...this.soundToggles, [clip.id]: !enabled };
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      row.append(el("span", "", clip.name), toggle);
      const hotkey = el("button", "kbd", this.soundBind === clip.id ? "Press keys" : clip.hotkey ? formatShortcut(clip.hotkey, this.platform.os) : "Hotkey");
      hotkey.type = "button";
      hotkey.addEventListener("click", () => {
        this.soundBind = clip.id;
        this.renderSettings();
      });
      const volume = el("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "200";
      volume.value = String(clip.volume);
      volume.title = "Clip volume";
      volume.setAttribute("aria-label", `${clip.name} volume`);
      volume.addEventListener("input", () => {
        clip.volume = Math.min(200, Math.max(0, Math.round(Number(volume.value))));
      });
      volume.addEventListener("change", () => {
        void this.persist();
      });
      const play = el("button", "text-button", "Play");
      play.type = "button";
      play.addEventListener("click", () => this.playSound(clip.id));
      const remove = el("button", "ghost", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => void this.removeSound(clip));
      row.append(hotkey, volume, play, remove);
      card.append(row);
    }
    wrap.append(card);
  },
  async addSoundFile(file: File) {
    if (this.config.soundboard.clips.length >= 24) {
      this.toast("Soundboard", "The board already has 24 clips.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".wav")) {
      this.toast("Soundboard", "Use a WAV file.");
      return;
    }
    if (!isTauri()) {
      const id = `preview${Date.now().toString(16)}`;
      this.clipBlobs.set(id, URL.createObjectURL(file));
      const name = file.name.replace(/\.wav$/i, "").slice(0, 40) || "Sound";
      this.config.soundboard.clips.push({ id, name, path: file.name, hotkey: "", volume: 100 });
      await this.persist();
      this.renderSettings();
      this.paintVoice();
      return;
    }
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const clip = await invoke<SoundClip>("import_sound_clip", { name: file.name, bytes });
      this.config.soundboard.clips.push(clip);
      await this.persist();
      this.renderSettings();
      this.paintVoice();
    } catch (err) {
      this.toast("Soundboard", err instanceof Error ? err.message : "Couldn't add that clip.");
    }
  },
  async removeSound(clip: SoundClip) {
    const url = this.clipBlobs.get(clip.id);
    if (url) URL.revokeObjectURL(url);
    this.clipBlobs.delete(clip.id);
    if (isTauri()) await invoke("delete_sound_clip", { path: clip.path }).catch(() => undefined);
    this.config.soundboard.clips = this.config.soundboard.clips.filter((item) => item.id !== clip.id);
    await this.persist();
    this.renderSettings();
    this.paintVoice();
  },
  iconButton(label: string, path: string, onClick: () => void, hot: boolean): HTMLButtonElement {
    const button = el("button", hot ? "icon-button is-hot" : "icon-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  },
  captureDevices(): { id: string; label: string }[] {
    if (this.cpalInputs.length) return this.cpalInputs.map((name) => ({ id: name, label: name }));
    return this.audioInputs;
  },
  playbackDevices(): { id: string; label: string }[] {
    if (this.cpalOutputs.length) return this.cpalOutputs.map((name) => ({ id: name, label: name }));
    return this.audioOutputs;
  },
  paintSplit() {
    clear(this.splitPane);
    if (!this.splitId || this.narrow) return;
    const channel = this.channelById(this.splitId);
    const head = el("header", "chat-head");
    head.append(el("h2", "", channel ? `# ${channel.name}` : "Split"));
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.splitId = null;
      this.paint();
    });
    head.append(close);
    const body = el("div", "messages");
    const list = this.pages[this.splitId] ?? [];
    if (!list.length) body.append(el("div", "empty", "Nothing loaded in this pane yet."));
    else {
      const ctx = this.renderContext();
      const plugins = this.enabledPlugins();
      const hidden = hiddenIds(this.pack.hiddenAuthors);
      const settings = this.pluginSettings(this.splitId);
      for (const message of list.slice(-30)) {
        if (this.blockedIds.has(message.authorId) && !this.hookOn("hideBlocked")) {
          body.append(renderBlockedMessage());
          continue;
        }
        const view = buildViewMessage(message, ctx, plugins, this.config.notifications.keywords, {
          settings,
          hiddenAuthors: hidden,
          blockedAuthors: this.blockedIds,
          displayContent: this.translated[message.id],
        });
        if (!view) continue;
        const shown = this.presentView(view);
        body.append(renderMessage(shown, {
          density: this.config.appearance.density,
          grouped: false,
          showDay: false,
          divider: false,
          remoteEmoji: !this.demo,
          mine: false,
          onReply: () => undefined,
          onEdit: () => undefined,
          onDelete: () => undefined,
          onReact: () => undefined,
          onImage: (url) => this.openImage(url),
          ...this.messageChrome(message, shown),
          ...this.messageExtras(message),
          clock: this.timeClock(),
          seen: this.messageSeen(this.splitId, message.id),
        }));
        const last = body.lastElementChild;
        if (last instanceof HTMLElement && this.hookOn("userWhois")) this.watchMessageWhois(last, message);
        if (last instanceof HTMLElement && this.hookOn("emoteClone")) this.watchEmoteClone(last);
        if (last instanceof HTMLElement && this.hookOn("imageSearch")) this.watchImageSearch(last);
        if (last instanceof HTMLElement) this.markJumbo(last, shown.raw);
      }
    }
    this.splitPane.append(head, body);
  },
});
