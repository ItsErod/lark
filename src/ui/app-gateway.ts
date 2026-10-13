import { deliverAutocomplete } from "./slash-form";
import { mergeIncoming, sameOutgoing, sameReaction } from "../chat";
import { ARCHIVE, history, ME, pageMessages } from "../demo/data";
import { latestGateway, readyShape, rememberGateway } from "../gateway-cache";
import { plainPreview } from "../mentions";
import { bumpsUnread, shouldDesktopNotify } from "../notify";
import {
  mentionsUser,
  normalizeFolder, type GuildFolder
} from "../shell";
import { type RemoteLists } from "../user-lists";
import { isBookmarked, type Bookmark } from "../pack/bookmarks";
import { displayName } from "../pack/nicks";
import { formatRelative } from "../pack/relative";
import { cancelSend, type ScheduledSend } from "../pack/schedule";
import { obsDetected, redactStreamerText, streamerSafeActive, visibleStatus } from "../pack/privacy";
import { stripTrackingText, stripTrackingUrl } from "../pack/links";
import { DRAFTS_PLAIN_KEY, DRAFTS_SEALED_KEY, parseDraftMap, planDraftLoad } from "../drafts";
import { dmPreview, redactBlocks, redactSensitive, streamerActive } from "../privacy";
import { addReminder, cancelReminder, reminderFor, reminderPresets, takeDueReminders, type Reminder } from "../reminders";
import { type ViewMessage } from "../render/message";
import { shouldPreload } from "../game";
import { CHANNEL_GATEWAY_GRACE_MS, channelRestDelay } from "../guilds";
import { prefetchChannelIds } from "../cache";
import { HISTORY_PAGE, initialHistory } from "../history";
import { matchShortcut } from "../shortcuts";
import type { Channel, Guild, Person, RawMessage } from "../types";
import {
  applyMemberOps,
  emptyMemberList, rangesForScroll, type MemberListState,
  type MemberListWire,
  type RoleInfo
} from "../members";
import { mergeGuilds, mergePeople, personFromMember, type RawMember } from "../roster";
import {
  clampNote, friendActivityText, type SocialRelationship
} from "../social";
import { applyVoiceState, replaceGuildVoice, voiceLinkDetails, type VoiceStateInput } from "../voice";
import { clear, el } from "./dom";
import { noteGateway, trafficArmed } from "../net/traffic";
import type { ProfileRole, WireProfile } from "./profile";
import type { VoiceSession } from "./app-shared";
import { isTauri, invoke, delay, friendlyVoiceDetail, localInputValue, normalizeMessage, normalizeChannel, asStatus } from "./app-shared";
import { defineMethods } from "./app-shared";
import type { LarkApp } from "./app";

export const gatewayMethods = defineMethods({
  async ensureGuild(guildId: string) {
    await this.ensureChannels(guildId);
    await this.ensureMembers(guildId);
  },
  async ensureChannels(guildId: string) {
    if (this.liveChannels[guildId]) return;
    const pending = this.channelLoads.get(guildId);
    if (pending) return pending;
    const task = this.loadGuildChannels(guildId);
    this.channelLoads.set(guildId, task);
    try {
      await task;
    } finally {
      if (this.channelLoads.get(guildId) === task) this.channelLoads.delete(guildId);
    }
  },
  /**
   * Channel lists come from READY and GUILD_CREATE. REST is a single fallback
   * for the guild on screen, after those events have had time to arrive.
   */
  async loadGuildChannels(guildId: string) {
    if (this.liveChannels[guildId]) return;
    const delay = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
    if (delay > 0) {
      await this.waitForChannels(guildId, delay);
      if (this.liveChannels[guildId]) return;
    }
    if (this.guildId !== guildId || this.liveChannels[guildId]) return;
    try {
      const channels = await invoke<Channel[]>("fetch_guild_channels", { guildId });
      if (this.liveChannels[guildId]) return;
      this.liveChannels[guildId] = channels.map(normalizeChannel);
      for (const channel of this.liveChannels[guildId]) this.noteChannel(channel);
      this.reindexLoaded();
      if (this.holdShell) {
        this.queueChannelCheck();
        return;
      }
      if (this.guildId === guildId) this.paint();
    } catch {
      /* GUILD_CREATE may still fill the list. */
    }
  },
  waitForChannels(guildId: string, ms: number): Promise<boolean> {
    if (this.liveChannels[guildId]) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      let wake: () => void = () => undefined;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const list = this.channelWaiters.get(guildId);
        if (list) {
          const next = list.filter((item) => item !== wake);
          if (next.length) this.channelWaiters.set(guildId, next);
          else this.channelWaiters.delete(guildId);
        }
        resolve(ok);
      };
      wake = () => finish(true);
      timer = window.setTimeout(() => finish(Boolean(this.liveChannels[guildId])), ms);
      const list = this.channelWaiters.get(guildId) ?? [];
      list.push(wake);
      this.channelWaiters.set(guildId, list);
    });
  },
  wakeChannelWaiters(guildId: string) {
    const waiters = this.channelWaiters.get(guildId);
    if (!waiters) return;
    this.channelWaiters.delete(guildId);
    for (const wake of waiters) wake();
  },
  async ensureMembers(guildId: string) {
    if (this.memberPhase[guildId] !== "done") this.memberPhase[guildId] = "loading";
    const channelId = this.guildId === guildId ? this.channelId : "";
    if (channelId) this.queueMemberSubscribe(guildId, channelId, [[0, 99]]);
    if (!(this.rolesByGuild[guildId]?.length)) {
      const wait = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
      if (wait > 0) await delay(wait);
      if (!this.rolesByGuild[guildId]?.length && this.guildId === guildId) {
        try {
          const roles = await invoke<RoleInfo[]>("fetch_roles", { guildId });
          this.rememberRoles(guildId, roles);
          if (this.guildId === guildId) this.paintMembers();
        } catch {
          /* GUILD_CREATE still delivers role colors. */
        }
      }
    }
    window.setTimeout(() => {
      if (this.memberPhase[guildId] === "loading" && !this.guildHasMembers(guildId)) {
        this.memberPhase[guildId] = "done";
        if (this.guildId === guildId) this.paintMembers();
      }
    }, 8000);
    if (this.guildId === guildId) this.paintMembers();
  },
  guildHasMembers(guildId: string): boolean {
    if (this.membersByGuild[guildId]?.length) return true;
    return Object.entries(this.memberLists).some(([key, list]) => key.startsWith(`${guildId}:`) && list.rows.size > 0);
  },
  queueMemberSubscribe(guildId: string, channelId: string, ranges: [number, number][]) {
    const key = `${guildId}:${channelId}:${ranges.map((range) => range.join("-")).join(",")}`;
    if (key === this.memberRanges) return;
    this.memberRanges = key;
    void invoke("request_members", { guildId, channelId, ranges }).catch(() => undefined);
  },
  onMemberScroll(scroll: HTMLElement) {
    if (this.demo || !this.guildId || !this.channelId) return;
    const list = this.currentMemberList();
    const hint = (list?.memberCount ?? 0) + (list?.groups.length ?? 0);
    const nearEnd = scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 120;
    if (!nearEnd && scroll.scrollTop < 48) return;
    const ranges = rangesForScroll(scroll.scrollTop, scroll.clientHeight || 640, hint);
    this.queueMemberSubscribe(this.guildId, this.channelId, ranges);
  },
  onMemberList(guildId: string, event: MemberListWire) {
    const listId = event.listId || this.channelId || "everyone";
    const key = `${guildId}:${listId}`;
    const state = this.memberLists[key] ?? emptyMemberList(listId);
    applyMemberOps(state, { ...event, listId });
    this.memberLists[key] = state;
    for (const row of state.rows.values()) {
      if (row.kind !== "member") continue;
      this.directory[row.person.id] = row.person;
      this.userNames[row.person.id] = row.person.name;
    }
    this.refreshVoicePortraits();
    this.memberPhase[guildId] = "done";
    if (this.guildId === guildId) this.paintMembers();
  },
  currentMemberList(): MemberListState | null {
    if (!this.guildId) return null;
    const exact = this.memberLists[`${this.guildId}:${this.channelId}`];
    if (exact?.rows.size) return exact;
    const everyone = this.memberLists[`${this.guildId}:everyone`];
    if (everyone?.rows.size) return everyone;
    const prefix = `${this.guildId}:`;
    const found = Object.entries(this.memberLists).find(([key, list]) => key.startsWith(prefix) && list.rows.size);
    return found?.[1] ?? exact ?? everyone ?? null;
  },
  rememberRoles(guildId: string, roles: RoleInfo[]) {
    const prev = new Map((this.rolesByGuild[guildId] ?? []).map((role) => [role.id, role]));
    for (const role of roles) {
      if (!role?.id) continue;
      prev.set(role.id, {
        id: role.id,
        name: role.name || "role",
        color: role.color || null,
        position: role.position ?? 0,
        hoist: Boolean(role.hoist),
      });
      this.liveRoles[role.id] = role.name || "role";
    }
    this.rolesByGuild[guildId] = [...prev.values()];
  },
  async ensureHome() {
    if (this.liveDms.length && this.friends.length) return;
    const wait = channelRestDelay(Date.now(), this.gatewayReadyAt, CHANNEL_GATEWAY_GRACE_MS);
    if (wait > 0) await delay(wait);
    if (!this.liveDms.length) {
      try {
        const channels = await invoke<Channel[]>("fetch_dms");
        this.mergeDms(channels.map(normalizeChannel));
      } catch {
        /* READY private channels still fill the list. */
      }
    }
    if (!this.friends.length) {
      try {
        const friends = await invoke<RawMember[]>("fetch_friends");
        this.storeFriends(friends.map(personFromMember).filter((person): person is Person => Boolean(person)));
      } catch {
        /* Relationships on READY still fill the friends list. */
      }
    }
    if (!this.guildId) this.paint();
  },
  mergeDms(incoming: Channel[]) {
    const byId = new Map(this.liveDms.map((channel) => [channel.id, channel]));
    for (const channel of incoming) {
      if (channel.kind !== "dm" && channel.kind !== "group") continue;
      const prev = byId.get(channel.id);
      const next = prev ? {
        ...prev,
        ...channel,
        recipients: channel.recipients?.length ? channel.recipients : prev.recipients,
        recipientIds: channel.recipientIds?.length ? channel.recipientIds : prev.recipientIds,
        lastMessageId: channel.lastMessageId || prev.lastMessageId,
      } : channel;
      byId.set(channel.id, next);
      this.noteChannel(next);
      for (const recipient of channel.recipients ?? []) {
        const known = this.directory[recipient.id];
        this.directory[recipient.id] = {
          id: recipient.id,
          name: known?.name || recipient.name,
          bot: recipient.bot,
          status: known?.status ?? "offline",
          custom: known?.custom,
          activity: known?.activity,
          avatarUrl: recipient.avatarUrl || known?.avatarUrl || null,
        };
        this.userNames[recipient.id] = this.directory[recipient.id].name;
      }
    }
    this.liveDms = [...byId.values()];
  },
  storeFriends(incoming: Person[]) {
    const byId = new Map(this.friends.map((person) => [person.id, person]));
    for (const person of incoming) {
      const prev = byId.get(person.id);
      const next = prev ? {
        ...prev,
        ...person,
        status: person.status || prev.status,
        custom: person.custom || prev.custom,
        activity: person.activity || prev.activity,
        avatarUrl: person.avatarUrl || prev.avatarUrl,
      } : person;
      byId.set(person.id, next);
      this.directory[person.id] = next;
      this.userNames[person.id] = next.name;
    }
    this.friends = [...byId.values()];
  },
  notePresence(userId: string, status: Person["status"], custom: string, activity: string, rich?: Person["rich"]) {
    if (userId === this.meId() && this.hideActivity()) {
      custom = "";
      activity = "";
    }
    const apply = (person: Person) => {
      person.status = status;
      person.custom = custom;
      person.activity = activity;
      if (rich !== undefined) person.rich = rich;
    };
    const known = this.directory[userId];
    if (known) apply(known);
    else this.directory[userId] = { id: userId, name: this.userNames[userId] || "Someone", status, custom, activity };
    const friend = this.friends.find((person) => person.id === userId);
    if (friend) apply(friend);
    for (const bucket of Object.values(this.membersByGuild)) {
      const person = bucket.find((item) => item.id === userId);
      if (person) apply(person);
    }
    for (const list of Object.values(this.memberLists)) {
      for (const row of list.rows.values()) {
        if (row.kind === "member" && row.person.id === userId) apply(row.person);
      }
    }
    if (this.me.id === userId) apply(this.me);
  },
  schedulePeoplePaint() {
    if (this.peopleTimer) return;
    this.peopleTimer = window.setTimeout(() => {
      this.peopleTimer = 0;
      if (this.view !== "app") return;
      this.paintMembers();
      if (!this.guildId) this.paintChannels();
      if (this.friendsOpen && !this.guildId) {
        this.msgSig = "";
        this.paintMessages();
      }
    }, 50);
  },
  async openDm(userId: string) {
    const existing = this.dmChannels().find((channel) => channel.kind === "dm" && (channel.recipientIds?.includes(userId) || channel.recipients?.some((item) => item.id === userId)));
    if (existing) {
      this.friendsOpen = false;
      void this.openChannel(existing.id);
      return;
    }
    if (this.demo) return;
    try {
      const channel = normalizeChannel(await invoke<Channel>("open_dm", { userId }));
      this.mergeDms([channel]);
      this.friendsOpen = false;
      void this.openChannel(channel.id);
    } catch (err) {
      this.toast("Direct message", err instanceof Error ? err.message : "Couldn't open that conversation.");
    }
  },
  openProfile(person: Person, statusPicker = false, serverEditor = false) {
    this.popout = person;
    this.statusOpen = statusPicker;
    this.profileFull = false;
    this.profileTab = "about";
    this.serverEditor = serverEditor;
    this.wireProfile = this.wireProfile?.id === person.id ? this.wireProfile : null;
    this.paintPopout();
    if (statusPicker && this.premiumType > 0 && this.guildId) {
      void this.ensureEmojis().then(() => {
        if (this.statusOpen && this.popout?.id === person.id) this.paintPopout();
      });
    }
    if (this.demo) return;
    const userId = person.id;
    const guildId = this.guildId;
    void invoke<WireProfile>("fetch_profile", { userId, guildId }).then((profile) => {
      if (this.popout?.id !== userId) return;
      this.wireProfile = profile;
      if (profile.avatarUrl) person.avatarUrl = profile.avatarUrl;
      if (profile.nick) person.name = profile.nick;
      this.paintPopout();
    }).catch(() => undefined);
    if (person.id !== this.meId()) {
      void invoke<string>("fetch_user_note", { userId }).then((note) => {
        if (this.popout?.id !== userId) return;
        const clean = clampNote(note);
        if (clean) this.notes[userId] = clean;
        else delete this.notes[userId];
        this.paintPopout();
      }).catch(() => undefined);
    }
  },
  profileRoles(person: Person): ProfileRole[] {
    const ids = this.wireProfile?.id === person.id ? this.wireProfile.roleIds ?? person.roleIds : person.roleIds;
    const roles = this.guildId ? this.rolesByGuild[this.guildId] ?? [] : [];
    return roles
      .filter((role) => ids?.includes(role.id) && role.id !== this.guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color || null }));
  },
  storeMembers(guildId: string, incoming: Person[]) {
    if (!incoming.length) return;
    this.membersByGuild[guildId] = mergePeople(this.membersByGuild[guildId] ?? [], incoming);
    this.memberPhase[guildId] = "done";
    for (const person of this.membersByGuild[guildId]) {
      this.userNames[person.id] = person.name;
      this.directory[person.id] = { ...this.directory[person.id], ...person, avatarUrl: person.avatarUrl || this.directory[person.id]?.avatarUrl };
    }
    if (this.guildId === guildId) {
      this.liveMembers = this.membersByGuild[guildId];
      this.paintMembers();
    }
    this.refreshVoicePortraits();
    this.msgSig = "";
    if (this.view === "app" && this.channelId) this.paintMessages();
  },
  rememberGuild(guild: Guild) {
    this.liveGuilds = mergeGuilds([guild], this.liveGuilds);
    this.paintRail();
    if (guild.id === this.guildId) this.paintChannels();
  },
  paintConnection() {
    if (this.holdShell) return;
    const next = visibleStatus(this.hideActivity(), this.hideActivity(), this.me.custom ?? "", this.connection);
    const label = this.channelPane.querySelector(".profile-chip .who span");
    if (label instanceof HTMLElement) {
      if (label.textContent !== next) label.textContent = next;
      return;
    }
    this.paintChannels();
  },
  noteGatewayStatus(state: string | undefined) {
    const now = performance.now();
    this.statusFlaps = this.statusFlaps.filter((stamp) => now - stamp < 10_000);
    this.statusFlaps.push(now);
    if (this.statusFlaps.length >= 4) {
      console.warn(`[lark] gateway status changed ${this.statusFlaps.length} times in 10s (${state ?? "unknown"}). Reconnects should resume and leave the open channel alone.`);
    }
  },
  onDiscord(payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    if (trafficArmed()) noteGateway(payload);
    const event = payload as {
      kind?: string;
      state?: string;
      detail?: string;
      user?: { id: string; name: string; bot: boolean; avatarUrl?: string | null };
      guilds?: Guild[];
      guild?: Guild;
      members?: RawMember[];
      dms?: Channel[];
      guildId?: string;
      channels?: Channel[];
      message?: RawMessage;
      channelId?: string;
      messageId?: string;
      content?: string;
      edited?: boolean;
      userId?: string;
      username?: string;
      note?: string;
      emoji?: string;
      added?: boolean;
    };
    if (event.kind === "autocomplete") {
      const hit = payload as { nonce?: string; choices?: unknown };
      if (hit.nonce) deliverAutocomplete(hit.nonce, hit.choices);
      return;
    }
    if (event.kind === "status") {
      const next = event.state === "connected" ? "Connected" : event.state ?? "Offline";
      if (next !== this.connection) this.noteGatewayStatus(event.state);
      this.connection = next;
      this.noteGatewayLiveness(event.state);
      if (event.state === "failed") {
        this.abortStartup();
        this.view = "gate";
        this.demo = false;
        this.signInBusy = "";
        this.tokenNote = event.detail || "Discord closed the connection.";
        this.qrWatching = false;
        this.paint();
        this.ensureQr();
        return;
      }
      if (this.view === "gate" && event.detail) {
        this.signInBusy = event.detail;
        this.paintGate();
      }
      if (this.view === "app") this.paintConnection();
    } else if (event.kind === "ready" && event.user) {
      const shape = readyShape(event);
      const previous = latestGateway("ready");
      rememberGateway(event);
      if (previous && shape && previous.shape === shape && this.view === "app" && !this.holdShell) {
        this.connection = "Connected";
        this.gatewayReadyAt = Date.now();
        return;
      }
      this.demo = false;
      this.view = "app";
      this.tokenNote = "";
      this.signInBusy = "";
      this.qrWatching = false;
      if (isTauri()) {
        void invoke("stop_qr_login").catch(() => undefined);
        void invoke("cancel_browser_login").catch(() => undefined);
      }
      this.voiceRoster = {};
      this.voice = null;
      this.noteCallForUpdates();
      this.me = {
        id: event.user.id,
        name: event.user.name,
        bot: event.user.bot,
        status: "online",
        avatarUrl: event.user.avatarUrl,
      };
      if (isTauri() && event.user.id && event.user.id !== ME) void this.rememberCurrentAccount(event.user.id, event.user.name);
      const premium = (event.user as { premiumType?: number }).premiumType;
      if (typeof premium === "number" && Number.isFinite(premium)) this.premiumType = premium;
      this.userNames[this.me.id] = this.me.name;
      this.directory[this.me.id] = this.me;
      this.liveGuilds = mergeGuilds(event.guilds ?? [], this.liveGuilds);
      this.mergeDms((event.dms ?? []).map(normalizeChannel));
      this.gatewayReadyAt = Date.now();
      const bundled = (event as { guildChannels?: { guildId?: string; channels?: Channel[] }[] }).guildChannels ?? [];
      for (const group of bundled) {
        if (!group.guildId || !group.channels?.length) continue;
        this.liveChannels[group.guildId] = group.channels.map(normalizeChannel);
        for (const channel of this.liveChannels[group.guildId]) this.noteChannel(channel);
        this.wakeChannelWaiters(group.guildId);
      }
      this.reindexLoaded();
      this.connection = "Connected";
      if (this.holdShell) {
        this.resumeOverlay = false;
        this.onStartupReady();
        return;
      }
      void this.ensureHome();
      if (!this.guildId || !this.liveGuilds.some((guild) => guild.id === this.guildId)) {
        this.guildId = this.liveGuilds[0]?.id ?? null;
      }
      if (this.guildId) this.liveMembers = this.membersByGuild[this.guildId] ?? [];
      const keepChannel = Boolean(this.channelId && (this.pages[this.channelId]?.length ?? 0) > 0);
      this.paint();
      if (this.guildId && !this.liveChannels[this.guildId]) void this.ensureChannels(this.guildId);
      if (this.guildId && !(this.membersByGuild[this.guildId]?.length)) void this.ensureMembers(this.guildId);
      if (!keepChannel) {
        const first = this.visibleChannels().find((channel) => channel.kind === "text" || channel.kind === "dm" || channel.kind === "group");
        if (first) void this.openChannel(first.id);
      } else {
        console.info(`[lark] gateway ready kept channel ${this.channelId}`);
      }
    } else if (event.kind === "guild" && event.guild?.id) {
      this.rememberGuild(event.guild);
    } else if (event.kind === "members" && event.guildId && event.members) {
      const roster = event.members.map(personFromMember).filter((person): person is Person => Boolean(person));
      this.storeMembers(event.guildId, roster);
    } else if (event.kind === "memberList" && event.guildId) {
      this.onMemberList(event.guildId, event as MemberListWire);
    } else if (event.kind === "roles" && event.guildId) {
      this.rememberRoles(event.guildId, ((event as { roles?: RoleInfo[] }).roles ?? []));
      this.msgSig = "";
      if (this.guildId === event.guildId) {
        this.paintMembers();
        this.paintMessages();
      }
    } else if (event.kind === "role" && event.guildId) {
      const payload = event as { role?: RoleInfo; removed?: boolean };
      if (payload.removed && payload.role?.id) {
        this.rolesByGuild[event.guildId] = (this.rolesByGuild[event.guildId] ?? []).filter((role) => role.id !== payload.role?.id);
        delete this.liveRoles[payload.role.id];
      } else if (payload.role) this.rememberRoles(event.guildId, [payload.role]);
      this.msgSig = "";
      if (this.guildId === event.guildId) {
        this.paintMembers();
        this.paintMessages();
      }
    } else if (event.kind === "directChannel") {
      const payload = event as { channel?: Channel; removed?: boolean };
      if (payload.removed && payload.channel) this.liveDms = this.liveDms.filter((channel) => channel.id !== payload.channel?.id);
      else if (payload.channel) this.mergeDms([normalizeChannel(payload.channel)]);
      if (!this.guildId) this.paintChannels();
    } else if (event.kind === "friends") {
      const friends = ((event as { friends?: RawMember[] }).friends ?? []).map(personFromMember).filter((person): person is Person => Boolean(person));
      this.storeFriends(friends);
      this.schedulePeoplePaint();
    } else if (event.kind === "blocked") {
      const ids = ((event as { userIds?: unknown }).userIds ?? []) as unknown[];
      const next = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      const replace = Boolean((event as { replace?: boolean }).replace);
      const removed = Boolean((event as { removed?: boolean }).removed);
      if (replace) this.blockedIds = new Set(next);
      else if (removed) for (const id of next) this.blockedIds.delete(id);
      else for (const id of next) this.blockedIds.add(id);
      this.msgSig = "";
      if (this.view === "app") this.paintMessages();
    } else if (event.kind === "friendRemoved") {
      const userId = String((event as { userId?: string }).userId ?? "");
      this.friends = this.friends.filter((person) => person.id !== userId);
      this.schedulePeoplePaint();
    } else if (event.kind === "channels" && event.guildId && event.channels) {
      const incoming = event.channels.map(normalizeChannel);
      if ((event as { replace?: boolean }).replace === false) {
        const prev = this.liveChannels[event.guildId] ?? [];
        const byId = new Map(prev.map((channel) => [channel.id, channel]));
        for (const channel of incoming) byId.set(channel.id, channel);
        this.liveChannels[event.guildId] = [...byId.values()];
      } else this.liveChannels[event.guildId] = incoming;
      this.refileLists();
      this.wakeChannelWaiters(event.guildId);
      for (const channel of this.liveChannels[event.guildId] ?? []) {
        this.noteChannel(channel);
        this.refreshChannelBadge(channel.id);
      }
      this.reindexLoaded();
      if (this.holdShell) {
        this.queueChannelCheck();
        return;
      }
      if (event.guildId === this.guildId && !this.channelId) {
        const first = this.visibleChannels().find((channel) => channel.kind === "text");
        if (first) void this.openChannel(first.id);
        else this.paint();
      } else if (event.guildId === this.guildId) {
        this.paintChannels();
        this.paintHeader();
      }
    } else if (event.kind === "channelGone" && event.guildId && event.channelId) {
      this.liveChannels[event.guildId] = (this.liveChannels[event.guildId] ?? []).filter((channel) => channel.id !== event.channelId);
      if (event.guildId === this.guildId) {
        this.paintChannels();
        this.paintHeader();
      }
      this.paintRail();
      this.syncBadge();
    } else if (event.kind === "folders") {
      if (this.demo || this.railDrag) return;
      const folders = ((event as { folders?: { id?: string | number | null; name?: string | null; color?: string | null; guildIds?: string[] }[] }).folders ?? [])
        .map((folder) => normalizeFolder(folder))
        .filter((folder): folder is GuildFolder => Boolean(folder));
      if (!folders.length) return;
      if (!this.ensureFolderSync().acceptRemote(folders)) return;
      this.folders = folders;
      this.paintRail();
    } else if (event.kind === "userLists") {
      this.applyUserLists(event as RemoteLists);
    } else if (event.kind === "savedMessage") {
      this.applySavedEvent(event as { channelId?: string; messageId?: string; removed?: boolean; dueAt?: string | null; authorName?: string; excerpt?: string; savedAt?: string });
    } else if (event.kind === "guildAccess") {
      const access = (event as { access?: { guildId?: string; owner?: boolean; permissions?: string; roles?: { id: string; permissions: string }[]; myRoles?: string[] } }).access;
      if (access?.guildId) {
        this.access[access.guildId] = {
          owner: Boolean(access.owner),
          permissions: access.permissions ?? "",
          roles: access.roles ?? [],
          myRoles: access.myRoles ?? [],
        };
        if (this.holdShell) this.queueChannelCheck();
        if (access.guildId === this.guildId) {
          this.paintChannels();
          this.paintHeader();
        }
        this.paintRail();
        this.syncBadge();
      }
    } else if (event.kind === "guildNotify") {
      this.applyNotify((event as { entries?: Parameters<LarkApp["applyNotify"]>[0] }).entries ?? []);
      this.paintRail();
      this.paintChannels();
      this.syncBadge();
    } else if (event.kind === "threads") {
      const threads = ((event as { threads?: Channel[] }).threads ?? []).map(normalizeChannel);
      this.mergeThreads(String((event as { guildId?: string }).guildId ?? ""), String(event.channelId ?? ""), threads);
    } else if (event.kind === "messageCreate" && event.message) {
      const message = normalizeMessage(event.message);
      this.considerAwayReply(message);
      this.absorbMessage(message);
      const bucket = this.pages[message.channelId] ?? [];
      const known = bucket.some((item) => sameOutgoing(item, message));
      this.pages[message.channelId] = mergeIncoming(bucket, message);
      this.queueLocalIndex(message.channelId);
      const prior = history[message.channelId];
      if (prior?.some((item) => sameOutgoing(item, message))) history[message.channelId] = mergeIncoming(prior, message);
      const guildId = message.guildId || this.guildForChannel(message.channelId);
      const kind = this.channelById(message.channelId)?.kind;
      const direct = kind === "dm" || kind === "group" || !guildId;
      const pref = guildId ? this.discordNotify.guilds[guildId] : undefined;
      const mentionsMe = mentionsUser({
        mentionIds: message.mentionIds ?? [],
        mentionRoles: message.mentionRoles ?? message.mentionRoleIds ?? [],
        mentionEveryone: Boolean(message.mentionEveryone),
        meId: this.meId(),
        myRoles: guildId ? this.access[guildId]?.myRoles ?? [] : [],
        suppressEveryone: pref?.suppressEveryone ?? false,
        suppressRoles: pref?.suppressRoles ?? false,
        direct,
      });
      const level = this.levelFor(guildId, message.channelId);
      const viewing = message.channelId === this.channelId;
      const follow = viewing && (this.pinnedToBottom || message.authorId === this.meId());
      if (viewing && follow && !this.holdRead()) {
        this.localUnread[message.channelId] = 0;
        this.localMentions[message.channelId] = 0;
        this.markers[message.channelId] = { lastMessageId: message.id, mentionCount: 0 };
        this.refreshChannelBadge(message.channelId);
      } else if ((!viewing || this.holdRead()) && message.authorId !== this.meId() && bumpsUnread(level, mentionsMe, direct)) {
        this.localUnread[message.channelId] = (this.localUnread[message.channelId] ?? 0) + 1;
        if (mentionsMe) this.localMentions[message.channelId] = (this.localMentions[message.channelId] ?? 0) + 1;
        if (message.id) this.channelLast[message.channelId] = message.id;
        this.behind[message.channelId] = true;
        this.refreshChannelBadge(message.channelId);
      }
      if (viewing && !follow && !known) {
        this.freshCount += 1;
        if (!this.divider[message.channelId]) this.divider[message.channelId] = message.id;
        this.paintNewBar();
      }
      if (viewing && follow) this.ackChannel(message.channelId, message.id);
      const alreadyNotified = shouldDesktopNotify({
        level,
        mentionsMe,
        fromMe: message.authorId === this.meId(),
        windowFocused: this.focused,
        channelId: message.channelId,
        activeChannelId: this.channelId,
        direct,
      });
      const body = this.notifyBody(message, direct);
      const sent = this.deliverAlert(message, level, mentionsMe, direct, body);
      this.considerKeyword(message, level, mentionsMe, alreadyNotified || sent);
      this.considerPattern(message, level, alreadyNotified || sent);
      if (viewing) {
        if (follow) this.pinnedToBottom = true;
        this.nearBottom = this.pinnedToBottom;
        this.scroll = follow ? "bottom" : "none";
        this.paintMessages();
      } else if ((this.unread[message.channelId] ?? 0) > 0 || (this.mentions[message.channelId] ?? 0) > 0 || this.behind[message.channelId]) {
        this.paintRail();
        this.paintChannels();
      }
    } else if (event.kind === "messageUpdate" && event.channelId && event.messageId) {
      const list = this.pages[event.channelId];
      const message = list?.find((item) => item.id === event.messageId);
      if (message) {
        const patch = event as {
          content?: string;
          embeds?: RawMessage["embeds"];
          attachments?: RawMessage["attachments"];
          stickers?: RawMessage["stickers"];
          reactions?: RawMessage["reactions"];
          mentionIds?: string[];
          mentionUsers?: RawMessage["mentionUsers"];
        };
        if (typeof patch.content === "string") {
          this.noteLoggedEdit(message, message.content, patch.content);
          message.content = patch.content;
          message.edited = true;
          this.queueLocalIndex(event.channelId);
        }
        if (patch.embeds) message.embeds = patch.embeds;
        if (patch.attachments) message.attachments = patch.attachments;
        if (patch.stickers) message.stickers = patch.stickers;
        if (patch.reactions) message.reactions = patch.reactions;
        if (patch.mentionIds) message.mentionIds = patch.mentionIds;
        if (patch.mentionUsers) message.mentionUsers = patch.mentionUsers;
        this.absorbMessage(message);
        if (event.channelId === this.channelId) {
          this.msgSig = "";
          this.paintMessages();
        }
      }
    } else if (event.kind === "messageDelete" && event.channelId && event.messageId) {
      const list = this.pages[event.channelId];
      const gone = list?.find((item) => item.id === event.messageId);
      if (gone) this.noteLoggedDelete(gone);
      if (list) {
        this.pages[event.channelId] = list.filter((item) => item.id !== event.messageId);
        this.forgetLocalMessage(event.channelId, event.messageId, gone?.nonce);
        if (event.channelId === this.channelId) this.paintMessages();
      }
    } else if (event.kind === "reaction" && event.channelId && event.messageId && event.emoji) {
      const message = this.pages[event.channelId]?.find((item) => item.id === event.messageId);
      if (message) {
        const reactions = message.reactions ?? [];
        const emojiId = (event as { emojiId?: string | null }).emojiId ?? null;
        const existing = reactions.find((item) => sameReaction(item, event.emoji ?? "", emojiId));
        const mine = event.userId === this.meId();
        if (event.added) {
          if (existing) {
            if (mine && existing.me) return;
            existing.count += 1;
            if (mine) existing.me = true;
          } else reactions.push({ emoji: event.emoji, emojiId, count: 1, me: mine });
        } else if (existing) {
          if (mine && !existing.me) return;
          existing.count = Math.max(0, existing.count - 1);
          if (mine) existing.me = false;
        }
        message.reactions = reactions.filter((item) => item.count > 0);
        if (event.channelId === this.channelId) this.paintMessages();
      }
    } else if (event.kind === "userNote" && event.userId) {
      const note = clampNote(String(event.note ?? ""));
      if (note) this.notes[event.userId] = note;
      else delete this.notes[event.userId];
      if (this.popout?.id === event.userId) this.paintPopout();
      if (this.friendsOpen) {
        this.msgSig = "";
        this.paintMessages();
      }
    } else if (event.kind === "relationships") {
      const payload = event as { relationships?: SocialRelationship[]; replace?: boolean; removed?: boolean };
      this.mergeRelationships(payload.relationships ?? [], Boolean(payload.replace), Boolean(payload.removed));
      this.schedulePeoplePaint();
    } else if (event.kind === "presence" && event.userId) {
      const status = asStatus(String((event as { status?: string }).status ?? "offline"));
      const custom = String((event as { custom?: string }).custom ?? "");
      const activity = String((event as { activity?: string }).activity ?? "");
      const rich = (event as { rich?: Person["rich"] }).rich ?? null;
      this.notePresence(event.userId, status, custom, activity, rich);
      if (this.guildId && this.membersByGuild[this.guildId]) this.liveMembers = this.membersByGuild[this.guildId];
      this.schedulePeoplePaint();
    } else if (event.kind === "readState" && event.channelId) {
      const mention = Number((event as { mentionCount?: number }).mentionCount ?? 0);
      const last = String((event as { lastMessageId?: string }).lastMessageId ?? "");
      this.markers[event.channelId] = { lastMessageId: last, mentionCount: mention };
      if (last) this.lastRead[event.channelId] = last;
      if (event.channelId === this.channelId) {
        this.localUnread[event.channelId] = 0;
        this.localMentions[event.channelId] = 0;
      }
      this.refreshBehind(event.channelId);
      this.refreshChannelBadge(event.channelId);
      this.syncBadge();
      this.paintChannels();
      this.paintRail();
    } else if (event.kind === "screenShare") {
      this.onScreenShare(event as { state?: string; note?: string; detail?: string; fps?: number; height?: number });
    } else if (event.kind === "streamFrame") {
      this.onStreamFrame(event as { annexB?: string; streamKey?: string; preview?: boolean });
    } else if (event.kind === "cameraFrame") {
      const frame = event as { annexB?: string; userId?: string; epoch?: number };
      const epoch = Number(frame.epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      this.onCameraFrame(String(frame.userId ?? ""), String(frame.annexB ?? ""));
    } else if (event.kind === "voiceStates" && event.guildId) {
      const states = ((event as { states?: VoiceStateInput[] }).states ?? []).map((state) => this.hydrateVoice(state, event.guildId ?? ""));
      replaceGuildVoice(this.voiceRoster, event.guildId, states);
      this.refreshVoicePortraits();
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      if (this.dashboardOpen) this.refreshDashboard();
    } else if (event.kind === "voiceState" && event.userId) {
      const raw = event as VoiceStateInput;
      const state = this.hydrateVoice({ ...raw, guildId: String(raw.guildId ?? event.guildId ?? ""), userId: event.userId }, String(raw.guildId ?? ""));
      applyVoiceState(this.voiceRoster, state);
      if (state.name && state.name !== "Someone") this.userNames[state.userId] = state.name;
      this.refreshVoicePortraits();
      this.syncCallMembers();
      this.paintChannels();
      this.paintVoice();
      if (this.dashboardOpen) this.refreshDashboard();
    } else if (event.kind === "soundboard") {
      this.onSoundEffect(event);
    } else if (event.kind === "voiceSpeaking" && event.userId) {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      this.markSpeaking(event.userId, Boolean((event as { speaking?: boolean }).speaking));
    } else if (event.kind === "voiceLink") {
      const epoch = Number((event as { epoch?: number }).epoch ?? 0);
      if (epoch && epoch !== this.voiceEpoch) return;
      const state = String((event as { state?: string }).state ?? "");
      const detail = String((event as { detail?: string }).detail ?? "");
      if (detail.toLowerCase().includes("did not answer")) {
        this.toast("Voice", friendlyVoiceDetail(detail) || "Voice server did not answer");
      }
      if (this.voice && (state === "connected" || state === "connecting" || state === "reconnecting")) {
        this.voice.status = state as VoiceSession["status"];
        this.voice.detail = friendlyVoiceDetail(detail);
        if (state === "connected") this.noteVoiceConnected();
        const link = event as { pingMs?: number; endpoint?: string; mode?: string; lossPct?: number; jitterMs?: number };
        if (link.pingMs !== undefined || link.endpoint) {
          this.voiceDetails = voiceLinkDetails({
            pingMs: link.pingMs ?? this.voiceDetails.pingMs,
            endpoint: link.endpoint ?? this.voiceDetails.endpoint,
            mode: link.mode || this.voiceDetails.mode || detail,
            lossPct: link.lossPct ?? this.voiceDetails.lossPct,
            jitterMs: link.jitterMs ?? this.voiceDetails.jitterMs,
          });
        }
        this.paintVoice();
        this.paintChannels();
      }
      if (state === "left" && epoch === this.voiceEpoch) {
        this.voice = null;
        this.clearVoiceClock();
        this.noteCallForUpdates();
        this.paintVoice();
        this.paintChannels();
      }
    } else if (event.kind === "call") {
      const call = payload as { channelId?: string; ringing?: unknown; ended?: boolean; video?: boolean };
      this.applyIncomingCall(call);
    } else if (event.kind === "typing" && event.channelId && event.userId !== this.meId()) {
      const name = event.username || this.userNames[event.userId ?? ""] || "Someone";
      this.typingNames = this.typingNames.filter((item) => item.channelId !== event.channelId || item.name !== name);
      this.typingNames.push({ channelId: event.channelId, name, until: Date.now() + 8000 });
      window.clearTimeout(this.typingTimer);
      this.paintTyping();
      this.typingTimer = window.setTimeout(() => this.paintTyping(), 8100);
    }
  },
  onKeyUp(event: KeyboardEvent) {
    if (this.pushMuted && matchShortcut(event, this.config.keybinds.push_to_mute, this.platform.os)) {
      this.releasePushMute();
    }
    if (!this.voice || this.voiceMode() !== "ptt") return;
    if (matchShortcut(event, this.pttShortcut(), this.platform.os)) {
      this.pttHeld = false;
      this.refreshSpeaking();
      this.pushTransmit();
    }
  },
  saveDraft() {
    const id = this.channelId;
    if (!id) return;
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      if (!this.composer.value) delete this.drafts[id];
      else this.drafts[id] = this.composer.value.slice(0, 2000);
      if (this.draftsReady) void this.writeDrafts();
    }, 120);
  },
  streamerOn(): boolean {
    return streamerActive(
      this.config.privacy.streamer,
      this.config.privacy.streamer_auto,
      this.shareOn || Boolean(this.clipStatus?.recording),
    );
  },
  maskText(value: string): string {
    return this.scrubText(value);
  },
  streamerSafeOn(): boolean {
    return streamerSafeActive({
      enabled: this.hookOn("streamerSafe"),
      manual: this.pack.privacy.streamerManual,
      autoObs: this.pack.privacy.streamerAutoObs,
      obs: obsDetected([this.frontApp, this.detectedGame]),
      autoShare: this.pack.privacy.streamerAutoShare,
      sharing: this.shareOn || Boolean(this.clipStatus?.recording),
    });
  },
  hideDirect(): boolean {
    return this.streamerOn() || (this.streamerSafeOn() && this.pack.privacy.streamerDms);
  },
  scrubText(value: string): string {
    const safe = this.streamerSafeOn();
    if (!this.streamerOn() && !safe) return value;
    let text = this.streamerOn() || (safe && this.pack.privacy.streamerEmails) ? redactSensitive(value) : value;
    if (safe) text = redactStreamerText(text, { phones: this.pack.privacy.streamerPhones, ids: this.pack.privacy.streamerIds });
    return text;
  },
  cleanOutgoing(content: string): string {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnSend) return content;
    return stripTrackingText(content);
  },
  cleanClickedLink(event: MouseEvent) {
    if (!this.hookOn("cleanLinks") || !this.pack.privacy.cleanOnClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
    const next = stripTrackingUrl(anchor.href);
    if (next && next !== anchor.href) anchor.href = next;
  },
  noteCapture() {
    this.msgSig = "";
    this.channelShape = "";
    this.memberShape = "";
    if (this.view === "app") this.paint();
    else if (this.settings && (this.section === "privacy" || this.section === "messages")) this.renderSettings();
  },
  toggleStreamer() {
    this.config.privacy.streamer = !this.config.privacy.streamer;
    this.persist();
    this.noteCapture();
    this.toast("Streamer mode", this.streamerOn() ? "On. Emails, tokens, DM previews, and personal info are hidden." : "Off.");
  },
  dmActivityLabel(channel: Channel): string {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const known = recipient ? this.directory[recipient.id] : undefined;
    if (!known) return "";
    return this.maskText(friendActivityText(known));
  },
  dmPreviewLabel(channelId: string): string {
    const loaded = this.pages[channelId];
    const source = loaded?.length ? loaded : this.demo ? history[channelId] : undefined;
    const last = [...(source ?? [])].reverse().find((message) => message.content.trim());
    if (!last) return "";
    return dmPreview(plainPreview(last.content, this.renderContext(), 80), this.hideDirect(), 80);
  },
  previewLine(message: RawMessage, limit: number): string {
    const channel = this.channelById(message.channelId);
    const direct = channel?.kind === "dm" || channel?.kind === "group";
    if (this.hideDirect() && direct) return "Message hidden";
    const text = plainPreview(message.content, this.renderContext(), limit) || (message.attachments?.length ? "Attachment" : "Empty message");
    return this.maskText(text);
  },
  notifyBody(message: RawMessage, direct: boolean): string {
    if (this.hideDirect() && direct) return "New direct message";
    const body = plainPreview(message.content, this.renderContext()) || (message.attachments?.length ? "Sent an attachment" : message.stickers?.length ? "Sent a sticker" : "New message");
    return this.maskText(body);
  },
  bookmarkExcerpt(bookmark: { channelId: string; excerpt: string }): string {
    const channel = this.channelById(bookmark.channelId);
    if (this.hideDirect() && (channel?.kind === "dm" || channel?.kind === "group")) return "Direct message";
    return this.maskText(bookmark.excerpt || "Empty message");
  },
  presentView(view: ViewMessage): ViewMessage {
    const named = this.hookOn("localNicks")
      ? { ...view, authorName: displayName(this.pack.localNicks, view.authorId, view.authorName) }
      : view;
    if (!this.streamerOn() && !this.streamerSafeOn()) return named;
    const text = (value: string) => this.scrubText(value);
    return {
      ...named,
      authorName: text(named.authorName),
      blocks: redactBlocks(view.blocks, text),
      raw: text(view.raw),
      reply: view.reply
        ? { ...view.reply, authorName: text(view.reply.authorName), preview: text(view.reply.preview) }
        : null,
      embeds: view.embeds.map((embed) => ({
        ...embed,
        author: embed.author ? text(embed.author) : null,
        title: embed.title ? text(embed.title) : null,
        footer: embed.footer ? text(embed.footer) : null,
        description: redactBlocks(embed.description, text),
        fields: embed.fields.map((field) => ({
          ...field,
          name: text(field.name),
          value: redactBlocks(field.value, text),
        })),
      })),
    };
  },
  async hydrateDrafts() {
    const plan = planDraftLoad(localStorage.getItem(DRAFTS_SEALED_KEY), localStorage.getItem(DRAFTS_PLAIN_KEY));
    let shouldSeal = false;
    if (plan.kind === "migrate") {
      localStorage.removeItem(DRAFTS_PLAIN_KEY);
      this.drafts = { ...plan.plain, ...this.drafts };
      shouldSeal = true;
    } else if (plan.kind === "sealed" && isTauri()) {
      try {
        const plain = await invoke<string>("open_drafts", { sealed: plan.sealed });
        const loaded = parseDraftMap(JSON.parse(plain));
        localStorage.removeItem(DRAFTS_PLAIN_KEY);
        this.drafts = { ...loaded, ...this.drafts };
        shouldSeal = true;
      } catch {
        this.toast("Drafts", "Drafts stay in memory for this session. The credential store could not unlock them.");
      }
    }
    this.draftsReady = true;
    this.applyOpenDraft();
    if (isTauri() && shouldSeal) await this.writeDrafts();
  },
  applyOpenDraft() {
    const id = this.channelId;
    if (!id || this.editing || !this.composer) return;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.composer.value) {
      this.composer.value = draft;
      this.paintComposer();
    }
  },
  async writeDrafts() {
    if (!isTauri()) return;
    const ticket = ++this.draftTicket;
    const plain = JSON.stringify(parseDraftMap(this.drafts));
    try {
      const sealed = await invoke<string>("seal_drafts", { plain });
      if (ticket !== this.draftTicket) return;
      localStorage.setItem(DRAFTS_SEALED_KEY, sealed);
      localStorage.removeItem(DRAFTS_PLAIN_KEY);
    } catch {
      // Leave the previous seal. Do not write the plaintext back.
    }
  },
  saveReminders() {
    localStorage.setItem("lark.reminders.v1", JSON.stringify(this.reminders));
  },
  beginReminder(message: RawMessage) {
    const existing = reminderFor(this.reminders, message.channelId, message.id);
    if (existing) {
      this.reminders = cancelReminder(this.reminders, existing.id);
      this.saveReminders();
      this.toast("Reminder", "Removed.");
      this.msgSig = "";
      this.paintMessages();
      if (this.settings && this.section === "messages") this.renderSettings();
      const kept = isBookmarked(this.pack.bookmarks, message.channelId, message.id);
      void this.pushSaved(message.channelId, message.id, kept, null);
      return;
    }
    this.reminding = message;
    this.scheduling = false;
    this.paintComposer();
  },
  queueReminder(at: number) {
    const message = this.reminding;
    if (!message) return;
    const result = addReminder(this.reminders, {
      messageId: message.id,
      channelId: message.channelId,
      authorName: message.authorName,
      excerpt: message.content,
      remindAt: at,
    }, Date.now());
    if (!result.ok) {
      this.toast("Reminder", result.error);
      return;
    }
    this.reminders = result.list;
    this.reminding = null;
    this.saveReminders();
    this.msgSig = "";
    this.paintMessages();
    this.paintComposer();
    this.toast("Reminder", "Lark will notify you once.");
    const saved = result.list.find((item) => item.channelId === message.channelId && item.messageId === message.id);
    if (saved) void this.pushSaved(message.channelId, message.id, true, new Date(saved.remindAt).toISOString());
  },
  paintReminderBanner() {
    const message = this.reminding;
    if (!message) return;
    clear(this.composerBanner);
    this.composerBanner.hidden = false;
    this.composerBanner.append(el("span", "", `Remind about ${this.maskText(message.authorName)}`));
    for (const preset of reminderPresets(Date.now())) {
      const button = el("button", "text-button", preset.label);
      button.type = "button";
      button.addEventListener("click", () => this.queueReminder(preset.at));
      this.composerBanner.append(button);
    }
    const when = el("input");
    when.type = "datetime-local";
    when.setAttribute("aria-label", "Remind at");
    when.value = localInputValue(Date.now() + 60 * 60_000);
    const custom = el("button", "primary", "Set");
    custom.type = "button";
    custom.addEventListener("click", () => this.queueReminder(Date.parse(when.value)));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.reminding = null;
      this.paintComposer();
    });
    this.composerBanner.append(when, custom, cancel);
  },
  tickReminders() {
    const picked = takeDueReminders(this.reminders, Date.now());
    if (!picked.due.length) return;
    this.reminders = picked.pending;
    this.saveReminders();
    for (const item of picked.due) {
      const channel = this.channelById(item.channelId);
      const direct = channel?.kind === "dm" || channel?.kind === "group";
      const body = this.streamerOn() && direct
        ? "A direct message you asked to be reminded about."
        : this.streamerOn()
          ? "A message you asked to be reminded about."
          : (item.excerpt || "Saved reminder");
      void this.notify("Reminder", body);
    }
    this.msgSig = "";
    if (this.view === "app") this.paintMessages();
    if (this.settings && this.section === "messages") this.renderSettings();
  },
  savedRow(bookmark: Bookmark): HTMLElement {
    const row = el("div", "shortcut-row");
    row.append(el("span", "", `${this.maskText(bookmark.authorName)} — ${this.bookmarkExcerpt(bookmark)}`));
    const open = el("button", "text-button", "Open");
    open.type = "button";
    open.addEventListener("click", () => {
      this.closeSettings();
      void this.openChannel(bookmark.channelId);
    });
    const remove = el("button", "ghost", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      this.pack.bookmarks = this.pack.bookmarks.filter((item) => item.messageId !== bookmark.messageId || item.channelId !== bookmark.channelId);
      this.savePack();
      this.msgSig = "";
      this.renderSettings();
    });
    row.append(open, remove);
    return row;
  },
  reminderRow(reminder: Reminder): HTMLElement {
    const row = el("div", "shortcut-row");
    const when = formatRelative(new Date(reminder.remindAt).toISOString(), Date.now());
    const channel = this.channelById(reminder.channelId);
    const direct = this.streamerOn() && (channel?.kind === "dm" || channel?.kind === "group");
    const excerpt = direct ? "Direct message" : this.maskText(reminder.excerpt || "Empty message");
    row.append(el("span", "", `${this.maskText(reminder.authorName)} · ${when} · ${excerpt}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.reminders = cancelReminder(this.reminders, reminder.id);
      this.saveReminders();
      this.msgSig = "";
      this.renderSettings();
    });
    row.append(cancel);
    return row;
  },
  scheduledRow(item: ScheduledSend): HTMLElement {
    const row = el("div", "shortcut-row");
    const when = formatRelative(new Date(item.sendAt).toISOString(), Date.now());
    row.append(el("span", "", `${when} · ${this.maskText(item.content.slice(0, 80))}`));
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.pack.schedule = cancelSend(this.pack.schedule, item.id);
      this.savePack();
      this.renderSettings();
      this.paintComposer();
    });
    row.append(cancel);
    return row;
  },
  rememberCache() {
    const pages: Record<string, RawMessage[]> = {};
    for (const id of this.recent) {
      const list = this.pages[id];
      if (list) pages[id] = initialHistory(list).map((message) => ({ ...message, attachments: (message.attachments ?? []).map((file) => ({ ...file, url: file.url.startsWith("blob:") ? "" : file.url })) }));
    }
    localStorage.setItem("lark.cache.v1", JSON.stringify({ pages }));
  },
  prefetchAround(id: string) {
    if (!shouldPreload(this.gameMode)) return;
    const order = this.visibleChannels()
      .filter((channel) => channel.kind === "text" || channel.kind === "announcement" || channel.kind === "forum" || channel.kind === "thread" || channel.kind === "dm" || channel.kind === "group")
      .map((channel) => channel.id);
    const loaded = new Set(Object.keys(this.pages));
    const targets = prefetchChannelIds(id, order, this.recent, loaded, 3).filter((channelId) => channelId !== ARCHIVE);
    const token = ++this.prefetchToken;
    const load = async () => {
      for (const channelId of targets) {
        if (!shouldPreload(this.gameMode) || token !== this.prefetchToken || this.pages[channelId]) continue;
        if (this.demo) {
          const page = pageMessages(history[channelId] ?? [], undefined, HISTORY_PAGE);
          if (token !== this.prefetchToken || this.pages[channelId]) continue;
          this.pages[channelId] = page.messages;
          this.more[channelId] = page.hasMore;
          this.warm.add(channelId);
          this.queueLocalIndex(channelId);
          continue;
        }
        try {
          const page = await this.livePage(channelId);
          if (!this.pages[channelId]) {
            this.pages[channelId] = page.messages;
            this.more[channelId] = page.hasMore;
            this.warm.add(channelId);
            this.queueLocalIndex(channelId);
          }
          if (token !== this.prefetchToken) return;
        } catch {
          return;
        }
      }
      this.trimPages();
      this.rememberCache();
    };
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 80));
    idle(() => void load());
  },
  trimPages() {
    const keep = new Set<string>([this.channelId ?? "", this.splitId ?? "", ...this.recent, ...this.warm]);
    const keys = Object.keys(this.pages);
    if (keys.length <= 12) return;
    for (const key of keys) {
      if (keep.has(key)) continue;
      this.forgetHeights((this.pages[key] ?? []).map((message) => message.id));
      delete this.pages[key];
    }
    if (this.warm.size > 4) {
      const extra = [...this.warm].filter((key) => key !== this.channelId && key !== this.splitId && !this.recent.includes(key));
      for (const key of extra.slice(0, this.warm.size - 4)) this.warm.delete(key);
    }
  },
});
