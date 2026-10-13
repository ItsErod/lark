import { channels as demoChannels, people } from "../demo/data";
import type { Person } from "../types";
import { participantsIn } from "../voice";
import type { BoardHandlers, BoardSession, BoardSnapshot } from "./dashboard-view";
import { defineMethods } from "./app-shared";

export const dashboardMethods = defineMethods({
  renderContext() {
    const users: Record<string, string> = { ...this.userNames };
    const roster = this.demo ? people : [this.me, ...this.liveMembers];
    for (const person of roster) users[person.id] = person.name;
    for (const message of this.pages[this.channelId ?? ""] ?? []) {
      if (message.authorId && message.authorName && !users[message.authorId]) users[message.authorId] = message.authorName;
      for (const mention of message.mentionUsers ?? []) {
        if (mention.id && mention.name && !users[mention.id]) users[mention.id] = mention.name;
      }
    }
    const channelNames: Record<string, string> = {};
    const lists = this.demo ? Object.values(demoChannels) : Object.values(this.liveChannels);
    for (const channel of [...lists.flat(), ...this.dms()]) channelNames[channel.id] = channel.name;
    return { users, roles: this.demo ? ({} as Record<string, string>) : this.liveRoles, channels: channelNames, meId: this.meId() };
  },
  dashboardHome(): boolean {
    return this.dashboardOpen && this.friendsOpen && !this.guildId && !this.clipsOpen;
  },
  dashboardDock(): boolean {
    return this.dashboardOpen && !this.dashboardHome();
  },
  watchDashboardVisibility() {
    if (this.dashboardVis) return;
    this.dashboardVis = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stopDashboardTick();
      else if (this.dashboardOpen) this.refreshDashboard();
    });
  },
  ensureDashboard() {
    this.watchDashboardVisibility();
    if (this.dashboardMod) return Promise.resolve(this.dashboardMod);
    if (!this.dashboardLoading) {
      this.dashboardLoading = import("./dashboard").then((mod) => {
        this.dashboardMod = mod;
        return mod;
      });
    }
    return this.dashboardLoading;
  },
  stopDashboardTick() {
    if (!this.dashboardTick) return;
    window.clearTimeout(this.dashboardTick);
    this.dashboardTick = 0;
  },
  refreshDashboard() {
    if (!this.dashboardOpen) return;
    this.dashboardSig = "";
    if (this.dashboardHome()) this.paintMessages();
    else this.paintMembers();
  },
  toggleDashboard() {
    this.dashboardOpen = !this.dashboardOpen;
    this.dashboardSig = "";
    this.msgSig = "";
    this.memberShape = "";
    if (this.dashboardOpen) this.watchDashboardVisibility();
    else this.stopDashboardTick();
    this.paint();
  },
  showActivity() {
    this.dashboardOpen = true;
    this.friendsOpen = true;
    this.clipsOpen = false;
    this.channelId = "";
    this.drawer = false;
    this.dashboardSig = "";
    this.msgSig = "";
    this.memberShape = "";
    this.watchDashboardVisibility();
    this.paint();
  },
  dashboardPeople(): Person[] {
    const byId = new Map<string, Person>();
    for (const person of this.friends) {
      if (person.id && person.id !== this.meId()) byId.set(person.id, person);
    }
    for (const voice of Object.values(this.voiceRoster)) {
      if (!voice.channelId || !voice.userId || voice.userId === this.meId() || byId.has(voice.userId)) continue;
      const known = this.directory[voice.userId];
      byId.set(voice.userId, known ?? {
        id: voice.userId,
        name: voice.name || "Someone",
        avatarUrl: voice.avatarUrl,
        status: "online",
      });
    }
    return [...byId.values()];
  },
  armDashboardTick(ticking: boolean) {
    this.stopDashboardTick();
    if (!this.dashboardOpen || !ticking || document.hidden) return;
    this.dashboardTick = window.setTimeout(() => {
      this.dashboardTick = 0;
      this.refreshDashboard();
    }, 1000);
  },
  paintDashboard(host: HTMLElement, dock: boolean) {
    void this.ensureDashboard().then((mod) => {
      if (!this.dashboardOpen || !host.isConnected) return;
      if (dock ? !this.dashboardDock() : !this.dashboardHome()) return;
      const model = mod.dashboardFeed({
        people: this.dashboardPeople(),
        relationships: this.relationships,
        voices: Object.values(this.voiceRoster).flatMap((person) => person.channelId && person.userId !== this.meId() ? [{
          userId: person.userId,
          guildId: person.guildId,
          channelId: person.channelId,
          sharing: person.sharing,
          streamLabel: person.streamLabel,
          name: person.name,
          avatarUrl: person.avatarUrl,
        }] : []),
        meId: this.meId(),
        now: Date.now(),
        place: (guildId, channelId) => ({
          guild: this.guilds().find((guild) => guild.id === guildId)?.name ?? "",
          channel: this.channelsOf(guildId).find((channel) => channel.id === channelId)?.name ?? "",
        }),
      });
      const masked = {
        ...model,
        rows: model.rows.map((row) => ({
          ...row,
          name: this.maskText(row.name),
          text: this.maskText(row.text),
        })),
      };
      const sig = `${dock ? "dock" : "home"}|${mod.dashboardSig(masked)}`;
      if (sig === this.dashboardSig && host.querySelector(".dash-feed")) {
        this.armDashboardTick(masked.ticking);
        return;
      }
      this.dashboardSig = sig;
      mod.renderDashboard(host, masked, {
        onOpen: (id) => {
          const person = this.dashboardPeople().find((item) => item.id === id) ?? this.personFromRelationship(id);
          if (person) this.openProfile(person);
        },
        onWatch: (id) => this.watchFriend(id),
        onJoin: (id) => this.joinFriendVoice(id),
        onAccept: (id) => void this.changeRelationship(id, "friend"),
        onIgnore: (id) => void this.changeRelationship(id, "ignore"),
        onCancel: (id) => void this.changeRelationship(id, "remove"),
      }, dock);
      this.armDashboardTick(masked.ticking);
    }).catch(() => undefined);
  },
  boardActive(): boolean {
    if (!this.boardOpen || this.clipsOpen) return false;
    if (!(this.guildId || this.voice)) return false;
    if (this.friendsOpen && !this.guildId && !this.voice) return false;
    return true;
  },
  toggleBoard() {
    if (!this.guildId && !this.voice) return;
    this.boardOpen = !this.boardOpen;
    this.msgSig = "";
    this.paint();
  },
  boardPeople(): Person[] {
    if (this.demo) return people.filter((person) => person.id !== this.meId());
    return this.dashboardPeople();
  },
  boardVoicePlace(): { channelId: string; name: string; guildId: string } {
    if (this.voice?.channelId) {
      const channel = this.channelById(this.voice.channelId);
      return {
        channelId: this.voice.channelId,
        name: this.voice.name || channel?.name || "Voice",
        guildId: this.voice.guildId ?? this.guildId ?? "",
      };
    }
    const guildId = this.guildId ?? "";
    let best = { channelId: "", name: "", count: -1 };
    for (const channel of this.channelsOf(guildId)) {
      if (channel.kind !== "voice" && channel.kind !== "stage") continue;
      const count = participantsIn(this.voiceRoster, guildId, channel.id).length;
      if (count > best.count) best = { channelId: channel.id, name: channel.name, count };
    }
    return { channelId: best.channelId, name: best.name, guildId };
  },
  boardHandlers(): BoardHandlers {
    return {
      onWrite: () => this.composer.focus(),
      onOpenDm: (id) => {
        this.boardOpen = false;
        void this.openChannel(id);
      },
      onOpenUser: (id) => {
        const person = this.boardPeople().find((item) => item.id === id) ?? this.directory[id] ?? this.personFromRelationship(id);
        if (person) this.openProfile(person);
      },
      onJoinVoice: () => {
        const place = this.boardVoicePlace();
        const channel = place.channelId ? this.channelById(place.channelId) : undefined;
        if (channel) this.joinVoice(channel);
      },
      onMute: () => this.toggleMute(),
      onDeafen: () => this.toggleDeafen(),
      onLeave: () => this.leaveVoice(),
      onMutePerson: (id) => {
        const person = Object.values(this.voiceRoster).find((item) => item.userId === id);
        if (!person) return;
        this.setUserMix(id, person.volume, !person.localMuted);
      },
      onWatch: (id) => {
        if (this.voice) this.watchMember(id);
        else this.watchFriend(id);
      },
      onStopWatch: () => this.stopWatching(),
      onStopShare: () => this.stopShare(),
      onShareHost: () => this.mountShareSurfaces(),
      feed: {
        onOpen: (id) => {
          const person = this.boardPeople().find((item) => item.id === id) ?? this.personFromRelationship(id);
          if (person) this.openProfile(person);
        },
        onWatch: (id) => this.watchFriend(id),
        onJoin: (id) => this.joinFriendVoice(id),
        onAccept: (id) => void this.changeRelationship(id, "friend"),
        onIgnore: (id) => void this.changeRelationship(id, "ignore"),
        onCancel: (id) => void this.changeRelationship(id, "remove"),
      },
    };
  },
  boardSnapshot(): BoardSnapshot {
    const place = this.boardVoicePlace();
    const voicePeople = place.channelId ? participantsIn(this.voiceRoster, place.guildId, place.channelId) : [];
    const selfId = this.meId();
    const lines = (this.channelId ? this.pages[this.channelId] ?? [] : []).slice(-12);
    const chat = lines.flatMap((message) => {
      const text = this.maskText((message.content || "").replace(/\s+/g, " ").trim()).slice(0, 180);
      if (!text) return [];
      return [{
        id: message.id,
        author: this.maskText(message.authorName || "Someone"),
        text,
        mine: message.authorId === selfId,
      }];
    });
    const sharer = this.shareOn && this.voice
      ? { userId: selfId, name: "You", label: "Live", self: true, paused: this.sharePaused, watching: false }
      : null;
    const other = sharer ? null : Object.values(this.voiceRoster).find((person) => person.sharing && person.channelId);
    const share = sharer ?? (other ? {
      userId: other.userId,
      name: this.maskText(other.name || "Someone"),
      label: other.streamLabel || this.channelById(other.channelId)?.name || "Live",
      self: other.userId === selfId,
      paused: false,
      watching: this.shareWatching === other.userId,
    } : null);
    const channel = this.currentChannel();
    return {
      channelName: channel ? (channel.kind === "text" ? `#${channel.name}` : this.maskText(channel.name)) : "",
      inCall: Boolean(this.voice),
      muted: Boolean(this.voice?.muted),
      deafened: Boolean(this.voice?.deafened),
      chat,
      voiceName: place.name,
      voice: voicePeople.map((person) => {
        const muted = person.selfMute || person.serverMute || person.localMuted;
        const deafened = person.selfDeaf || person.serverDeaf;
        return {
          id: person.userId,
          name: this.maskText(person.userId === selfId ? "You" : (person.name || "Someone")),
          avatarUrl: person.avatarUrl,
          speaking: person.speaking && !muted && !deafened,
          muted,
          deafened,
          self: person.userId === selfId,
          sharing: person.sharing,
        };
      }),
      share,
      feed: {
        people: this.boardPeople(),
        relationships: this.relationships,
        voices: Object.values(this.voiceRoster).flatMap((person) => person.channelId && person.userId !== selfId ? [{
          userId: person.userId,
          guildId: person.guildId,
          channelId: person.channelId,
          sharing: person.sharing,
          streamLabel: person.streamLabel,
          name: person.name,
          avatarUrl: person.avatarUrl,
        }] : []),
        meId: selfId,
        now: Date.now(),
        place: (guildId, channelId) => ({
          guild: this.guilds().find((guild) => guild.id === guildId)?.name ?? "",
          channel: this.channelsOf(guildId).find((item) => item.id === channelId)?.name ?? "",
        }),
      },
      dms: this.dms().slice(0, 8).map((item) => {
        const last = (this.pages[item.id] ?? []).at(-1);
        const preview = last?.content?.replace(/\s+/g, " ").trim() ?? "";
        return {
          id: item.id,
          name: this.maskText(item.name),
          preview: preview ? this.maskText(preview).slice(0, 80) : "",
          unread: item.unread ?? 0,
        };
      }),
      people: this.boardPeople(),
      meId: selfId,
    };
  },
  ensureBoard(): Promise<BoardSession> {
    if (this.boardSession) return Promise.resolve(this.boardSession);
    if (!this.boardLoading) {
      this.boardLoading = import("./dashboard-view").then((mod) => {
        const session = mod.mountBoard(this.boardHost, this.boardHandlers());
        this.boardSession = session;
        return session;
      });
    }
    return this.boardLoading;
  },
  hideCallChrome() {
    if (this.callStrip) this.callStrip.hidden = true;
    if (this.callSplit) this.callSplit.hidden = true;
    if (this.callHandle) this.callHandle.hidden = true;
    if (this.callPip) this.callPip.hidden = true;
    const chat = this.messagesEl.parentElement;
    if (chat) {
      chat.dataset.call = "off";
      chat.dataset.strip = "closed";
      chat.classList.remove("is-call-full");
    }
  },
  refreshBoard(scope: "all" | "voice") {
    if (!this.boardActive()) {
      this.boardHost.hidden = true;
      this.boardSession?.pause();
      return;
    }
    this.boardHost.hidden = false;
    this.messagesEl.hidden = true;
    this.hideCallChrome();
    void this.ensureBoard().then((session) => {
      if (!this.boardActive() || !this.boardHost.isConnected) return;
      session.show(this.boardSnapshot(), scope);
    }).catch(() => undefined);
  },
});
