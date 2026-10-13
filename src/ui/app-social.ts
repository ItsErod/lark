import { channels as demoChannels, people } from "../demo/data";
import type { Channel, NotifyLevel, Person } from "../types";
import {
  blockedIds,
  clampNickname, developerModeOn,
  dmContextMenu, friendUsernameOk, memberContextMenu, readPinList,
  requestAddFavorite,
  requestModView,
  requestRoleToggle, setRelationshipIndex, voiceSpotFor, type SocialRelationship
} from "../social";
import { clear, el, icon, paths } from "./dom";
import {
  applyCall,
  callerName,
  createRingtone,
  incomingNotice,
  pulseRingtone,
  ringAudible,
  ringInBackground,
  ringTargets,
  stopRingtoneContext,
  type RingState,
} from "../call-ring";
import { renderCallRing } from "./call-ring-view";
import type { ProfileActionSlot, WireProfile } from "./profile";
import { isTauri, invoke, normalizeChannel } from "./app-shared";
import { defineMethods } from "./app-shared";

export const socialMethods = defineMethods({
  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied", text);
    } catch {
      this.toast("Copy", "The clipboard is not available.");
    }
  },
  guildForChannel(channelId: string): string | null {
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      if (list.some((channel) => channel.id === channelId)) return guildId;
    }
    return null;
  },
  ensureDmPins() {
    if (this.dmPinsReady) return;
    this.dmPinsReady = true;
    this.dmPins = new Set(readPinList(localStorage.getItem("lark.dm.pins.v1")));
  },
  saveDmPins() {
    localStorage.setItem("lark.dm.pins.v1", JSON.stringify([...this.dmPins]));
  },
  loadRelationships() {
    if (this.demo || Date.now() < this.relationshipsRetry) return;
    this.relationshipsRetry = Date.now() + 20_000;
    void invoke<SocialRelationship[]>("fetch_relationships").then((rows) => {
      this.mergeRelationships(rows, true, false);
      this.relationshipsRetry = Number.POSITIVE_INFINITY;
      void import("./inbox").then((mod) => mod.noteRelationshipIndex());
      this.msgSig = "";
      if (this.friendsOpen) this.paintFriends();
      if (!this.guildId) this.paintChannels();
    }).catch(() => undefined);
  },
  mergeRelationships(rows: SocialRelationship[], replace: boolean, removed: boolean) {
    if (removed) {
      const ids = new Set(rows.map((row) => row.id));
      this.relationships = this.relationships.filter((row) => !ids.has(row.id));
    } else if (replace) {
      this.relationships = rows.filter((row) => row.id && row.kind);
    } else {
      const byId = new Map(this.relationships.map((row) => [row.id, row]));
      for (const row of rows) {
        if (!row.id || !row.kind) continue;
        byId.set(row.id, row);
      }
      this.relationships = [...byId.values()];
    }
    setRelationshipIndex(this.relationships);
    const blocked = blockedIds();
    for (const row of this.relationships) {
      if (row.kind !== "friend") continue;
      const existing = this.friends.find((person) => person.id === row.id);
      if (existing) {
        existing.friendNick = row.nickname || existing.friendNick;
        if (row.serverTag?.tag) existing.serverTag = row.serverTag;
        if (row.avatarUrl) existing.avatarUrl = row.avatarUrl;
      } else {
        this.friends.push({
          id: row.id,
          name: row.nickname || row.name || "Friend",
          status: "offline",
          friendNick: row.nickname || null,
          serverTag: row.serverTag,
          avatarUrl: row.avatarUrl,
          bot: row.bot,
        });
      }
    }
    this.friends = this.friends.filter((person) => !blocked.has(person.id));
    for (const person of this.friends) {
      this.directory[person.id] = { ...this.directory[person.id], ...person };
      this.userNames[person.id] = person.friendNick || person.name;
    }
  },
  relationshipFor(userId: string): SocialRelationship | undefined {
    return this.relationships.find((row) => row.id === userId);
  },
  personFromRelationship(userId: string): Person | null {
    const row = this.relationshipFor(userId);
    if (!row) return this.directory[userId] ?? null;
    return this.directory[userId] ?? { id: row.id, name: row.nickname || row.name, avatarUrl: row.avatarUrl, status: "offline", friendNick: row.nickname, serverTag: row.serverTag };
  },
  async changeRelationship(userId: string, action: "friend" | "remove" | "block" | "ignore") {
    if (this.demo) {
      this.toast("Friends", "Demo relationships stay on this device.");
      return;
    }
    try {
      if (action === "friend") {
        const row = await invoke<SocialRelationship>("add_relationship", { userId });
        this.mergeRelationships([row], false, false);
      } else if (action === "block") {
        const row = await invoke<SocialRelationship>("block_user", { userId });
        this.friends = this.friends.filter((person) => person.id !== userId);
        this.mergeRelationships([row], false, false);
      } else if (action === "ignore") {
        await invoke("ignore_user", { userId });
        this.mergeRelationships([{ id: userId, kind: "incoming", name: "", username: "", nickname: "" }], false, true);
      } else {
        await invoke("remove_relationship", { userId });
        this.friends = this.friends.filter((person) => person.id !== userId);
        this.mergeRelationships([{ id: userId, kind: "friend", name: "", username: "", nickname: "" }], false, true);
      }
      this.msgSig = "";
      const note = action === "friend" ? "Friend request sent." : action === "block" ? "Blocked." : action === "ignore" ? "Ignored." : "Removed.";
      this.toast("Friends", note);
      if (this.friendsOpen) this.paintFriends();
      this.paintChannels();
    } catch (err) {
      this.toast("Friends", err instanceof Error ? err.message : "Discord refused that.");
    }
  },
  async addFriendUsername(username: string) {
    const name = username.trim().toLowerCase();
    if (!friendUsernameOk(name)) {
      this.toast("Add Friend", "Enter a Discord username.");
      return;
    }
    if (this.demo) {
      this.toast("Add Friend", "Demo requests stay on this device.");
      return;
    }
    try {
      const row = await invoke<SocialRelationship>("add_friend_username", { username: name });
      this.mergeRelationships([row.kind ? row : { ...row, kind: "outgoing" }], false, false);
      this.friendTab = "pending";
      this.msgSig = "";
      this.paintFriends();
      this.toast("Add Friend", "Friend request sent.");
    } catch (err) {
      this.toast("Add Friend", err instanceof Error ? err.message : "Discord refused that username.");
    }
  },
  scheduleSocialChrome() {
    queueMicrotask(() => this.paintSocialChrome());
  },
  paintSocialChrome() {
    this.chatHead.querySelectorAll("[data-social-chrome]").forEach((node) => node.remove());
    const channel = this.currentChannel();
    const dm = Boolean(channel && (channel.kind === "dm" || channel.kind === "group") && !this.friendsOpen);
    if (!dm || !channel) {
      if (this.profilePanelOpen) {
        this.profilePanelOpen = false;
        this.paintProfilePanel();
      }
      return;
    }
    const actions = this.chatHead.querySelector(".head-actions");
    if (actions) {
      const call = this.socialHeaderButton("Start voice call", paths.mic, () => this.startDmCall(channel, false));
      const video = this.socialHeaderButton("Start video call", paths.camera, () => this.startDmCall(channel, true));
      const add = this.socialHeaderButton("Add to DM", paths.plus, () => this.openAddRecipient(channel));
      const profile = this.socialHeaderButton(this.profilePanelOpen ? "Hide profile" : "Show profile", paths.users, () => {
        this.profilePanelOpen = !this.profilePanelOpen;
        this.paintProfilePanel();
      });
      for (const button of [profile, add, video, call]) {
        button.dataset.socialChrome = "1";
        actions.prepend(button);
      }
    }
    this.paintProfilePanel();
  },
  socialHeaderButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "icon-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon(path));
    button.addEventListener("click", onClick);
    return button;
  },
  startDmCall(channel: Channel, video: boolean) {
    if (channel.kind !== "dm" && channel.kind !== "group") return;
    this.friendsOpen = false;
    this.clipsOpen = false;
    if (this.guildId) this.guildId = null;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "chat";
    if (this.channelId !== channel.id) void this.openChannel(channel.id);
    this.joinVoice(channel);
    if (this.voice?.channelId !== channel.id) {
      this.toast("Voice", "Couldn't start that call.");
      return;
    }
    if (video !== this.cameraOn) this.toggleCamera();
    this.ringOthers(channel);
  },
  ringOthers(channel: Channel) {
    if (this.demo || this.voice?.channelId !== channel.id) return;
    const ids = ringTargets(this.meId(), [
      ...(channel.recipientIds ?? []),
      ...(channel.recipients ?? []).map((person) => person.id),
    ]);
    if (!ids.length) return;
    void invoke("ring_call", { channelId: channel.id, recipients: ids }).catch(() => undefined);
  },
  applyIncomingCall(call: { channelId?: string; ringing?: unknown; ended?: boolean; video?: boolean }) {
    const channelId = String(call.channelId ?? "");
    const ringing = Array.isArray(call.ringing) ? call.ringing.filter((id): id is string => typeof id === "string") : [];
    const known = this.dmChannels().find((item) => item.id === channelId);
    const people = (known?.recipients ?? []).map((person) => ({ id: person.id, name: person.name }));
    if (!people.length && known?.name) people.push({ id: "", name: known.name });
    const next = applyCall(
      this.incoming,
      { channelId, ringing, ended: Boolean(call.ended), video: Boolean(call.video) },
      this.meId(),
      callerName(this.meId(), people),
      this.voice?.channelId === channelId && !this.voice.guildId,
    );
    this.syncIncoming(next);
  },
  syncIncoming(next: RingState | null) {
    this.incoming = next;
    renderCallRing(next, {
      onAnswer: () => this.answerIncoming(),
      onDecline: () => this.declineIncoming(),
    });
    if (!this.ringHandle) {
      this.ringHandle = createRingtone(() => {
        if (!ringAudible(this.config.preferences.call_sound, Boolean(this.incoming))) {
          this.ringHandle?.stop();
          stopRingtoneContext();
          return;
        }
        pulseRingtone();
      }, 2000, window);
    }
    if (ringAudible(this.config.preferences.call_sound, Boolean(next))) this.ringHandle.start();
    else {
      this.ringHandle.stop();
      stopRingtoneContext();
    }
    if (!next) {
      this.ringNotified = "";
      return;
    }
    if (next.channelId !== this.ringNotified && ringInBackground(document.hidden, document.hasFocus())) {
      this.ringNotified = next.channelId;
      void this.notifyIncoming(next);
    }
  },
  answerIncoming() {
    const ring = this.incoming;
    if (!ring) return;
    const known = this.dmChannels().find((item) => item.id === ring.channelId);
    const channel: Channel = known ?? { id: ring.channelId, name: ring.callerName, kind: "dm", position: 0 };
    this.syncIncoming(null);
    this.friendsOpen = false;
    if (this.callSurface === "popout") this.closeCallPopout();
    this.callSurface = "chat";
    if (this.channelId !== channel.id) void this.openChannel(channel.id);
    this.joinVoice(channel);
    if (ring.video && this.voice?.channelId === channel.id && !this.cameraOn) this.toggleCamera();
    if (!isTauri()) return;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();
    }).catch(() => undefined);
  },
  declineIncoming() {
    const ring = this.incoming;
    if (!ring) return;
    this.syncIncoming(null);
    if (this.demo) return;
    void invoke("stop_ringing", { channelId: ring.channelId }).catch(() => undefined);
  },
  async notifyIncoming(ring: RingState) {
    const notice = incomingNotice(ring.callerName, ring.video);
    this.toast(notice.title, notice.body);
    if (!isTauri()) return;
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (!granted) return;
    if (!this.callActionsBound) {
      this.callActionsBound = true;
      void mod.onAction((notification) => {
        const action = (notification as { actionId?: string }).actionId;
        if (action === "answer") this.answerIncoming();
        else if (action === "decline") this.declineIncoming();
      });
    }
    await mod.registerActionTypes([{
      id: "lark-call",
      actions: [
        { id: "answer", title: "Answer", foreground: true },
        { id: "decline", title: "Decline", foreground: true },
      ],
    }]).catch(() => undefined);
    mod.sendNotification({
      title: notice.title,
      body: notice.body,
      actionTypeId: "lark-call",
      autoCancel: true,
    });
  },
  joinFriendVoice(userId: string) {
    const spot = voiceSpotFor(Object.values(this.voiceRoster), userId);
    if (!spot) {
      this.toast("Voice", "They are not in a voice channel.");
      return;
    }
    if (spot.guildId) this.guildId = spot.guildId;
    const known = this.channelsOf(spot.guildId).find((channel) => channel.id === spot.channelId);
    const channel: Channel = known ?? { id: spot.channelId, name: spot.channelName, kind: "voice", position: 0 };
    this.friendsOpen = false;
    this.popout = null;
    this.paintPopout();
    this.joinVoice(channel);
  },
  watchFriend(userId: string) {
    const spot = voiceSpotFor(Object.values(this.voiceRoster), userId);
    if (!spot) {
      this.toast("Stream", "They are not in a voice channel.");
      return;
    }
    if (this.voice?.channelId !== spot.channelId) this.joinFriendVoice(userId);
    this.watchMember(userId);
  },
  bindSocialMenus() {
    if (this.socialMenusBound) return;
    this.socialMenusBound = true;
    this.membersEl.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest(".member-row");
      if (!(row instanceof HTMLElement)) return;
      const id = row.dataset.user;
      if (!id) return;
      event.preventDefault();
      const person = this.directory[id] ?? { id, name: row.querySelector("strong")?.textContent || "Member" };
      this.openMemberMenu(person, event.clientX, event.clientY);
    });
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".social-menu")) return;
      this.closeSocialMenu();
    });
  },
  closeSocialMenu() {
    document.getElementById("lark-social-menu")?.remove();
  },
  showSocialMenu(x: number, y: number, items: { id: string; label: string; danger?: boolean }[], onPick: (id: string) => void) {
    if (!this.late) {
      void this.ensureLate().then(() => this.showSocialMenu(x, y, items, onPick));
      return;
    }
    this.closeSocialMenu();
    const menu = this.late!.renderContextMenu(x, y, items, (id) => {
      this.closeSocialMenu();
      onPick(id);
    });
    menu.id = "lark-social-menu";
    this.root.append(menu);
  },
  openDmMenu(channel: Channel, x: number, y: number) {
    const userId = this.dmUserId(channel);
    const friend = this.friends.some((person) => person.id === userId) || this.relationshipFor(userId)?.kind === "friend";
    this.showSocialMenu(x, y, dmContextMenu({
      developerMode: developerModeOn(this.config),
      pinned: this.dmPins.has(channel.id),
      favorite: this.favoriteIds.includes(channel.id),
      muted: this.levelFor(null, channel.id) === "mute",
      friend,
      group: channel.kind === "group",
    }), (id) => this.runDmMenu(channel, userId, id));
  },
  runDmMenu(channel: Channel, userId: string, id: string) {
    if (id === "read") this.markDmRead(channel);
    else if (id === "pin") this.toggleDmPin(channel.id);
    else if (id === "favorite") {
      const had = this.favoriteIds.includes(channel.id);
      const saved = requestAddFavorite(channel.id) === "called";
      this.toast("Favorites", saved ? (had ? "Removed from Favorites." : "Added to Favorites.") : "Favorites are not available yet.");
    } else if (id === "profile") {
      const person = userId ? this.personFromRelationship(userId) : null;
      if (person) this.openProfile(person);
    } else if (id === "call") this.startDmCall(channel, false);
    else if (id === "note") {
      this.openPrompt("Note", this.notes[userId] ?? "", false, (text) => {
        if (userId) this.saveNote(userId, text);
      });
    } else if (id === "nick") {
      const current = this.relationshipFor(userId)?.nickname || "";
      this.openPrompt("Friend Nickname", current, false, (text) => void this.saveFriendNick(userId, text));
    } else if (id === "close") void this.closeDmChannel(channel);
    else if (id === "apps") window.open("https://discord.com/app-directory", "_blank", "noopener");
    else if (id === "invite") void this.invitePerson(channel);
    else if (id === "rename") {
      this.openPrompt("Rename Group", channel.name, false, (text) => void this.renameGroup(channel.id, text));
    } else if (id === "unfriend") void this.changeRelationship(userId, "remove");
    else if (id === "ignore") void this.changeRelationship(userId, "ignore");
    else if (id === "block") void this.changeRelationship(userId, "block");
    else if (id === "mute") void this.muteDm(channel.id, this.levelFor(null, channel.id) !== "mute");
    else if (id === "copy-user" && userId) void this.copySocialId(userId, "User ID");
    else if (id === "copy-channel") void this.copySocialId(channel.id, "Channel ID");
  },
  openMemberMenu(person: Person, x: number, y: number) {
    const self = person.id === this.meId();
    this.showSocialMenu(x, y, memberContextMenu({ developerMode: developerModeOn(this.config), self }), (id) => {
      if (id === "profile") this.openProfile(person);
      else if (id === "mention") this.mentionPerson(person);
      else if (id === "server-profile") this.openProfile(self ? person : person, false, self);
      else if (id === "apps") window.open("https://discord.com/app-directory", "_blank", "noopener");
      else if (id === "roles") this.openRoleMenu(person);
      else if (id === "mod") {
        const guildId = this.guildId;
        void this.ensureLate().then(() => {
          if (requestModView(person.id, guildId) !== "called") this.toast("Mod View", "Mod View is not available yet.");
        });
      } else if (id === "copy-id") void this.copySocialId(person.id, "User ID");
    });
  },
  openRoleMenu(person: Person) {
    const roles = this.profileRoles(person);
    if (!roles.length) {
      this.toast("Roles", "No roles on this member yet.");
      return;
    }
    this.openChoice("Roles", roles.map((role) => ({ id: role.id, label: role.name })), (roleId) => {
      this.toast("Roles", requestRoleToggle(person.id, roleId, this.guildId) === "called" ? "Role updated." : "Role changes open from server settings.");
    });
  },
  mentionPerson(person: Person) {
    const token = `<@${person.id}>`;
    const current = this.composer.value;
    this.composer.value = current && !/\s$/.test(current) ? `${current} ${token} ` : `${current}${token} `;
    this.composer.focus();
  },
  dmUserId(channel: Channel): string {
    return channel.recipients?.find((item) => item.id !== this.meId())?.id
      ?? channel.recipientIds?.find((id) => id !== this.meId())
      ?? "";
  },
  markDmRead(channel: Channel) {
    const last = channel.lastMessageId || this.pages[channel.id]?.at(-1)?.id || "";
    this.localUnread[channel.id] = 0;
    this.localMentions[channel.id] = 0;
    this.behind[channel.id] = false;
    if (last) {
      this.markers[channel.id] = { lastMessageId: last, mentionCount: 0 };
      this.lastRead[channel.id] = last;
      if (!this.demo) void invoke("ack_message", { channelId: channel.id, messageId: last }).catch(() => undefined);
    }
    this.refreshChannelBadge(channel.id);
    this.paintChannels();
    this.syncBadge();
  },
  async muteDm(channelId: string, muted: boolean) {
    const level: NotifyLevel = muted ? "mute" : "all";
    this.config.notifications.channels[channelId] = muted ? { muted: true } : { level: "all", muted: false };
    this.stageNotify(null, channelId, level);
    void this.persist();
    this.paint();
    await this.writeNotify(null, channelId, level);
  },
  async closeDmChannel(channel: Channel) {
    if (!this.demo) {
      try {
        await invoke("close_dm", { channelId: channel.id });
      } catch (err) {
        this.toast("Direct message", err instanceof Error ? err.message : "Couldn't close that conversation.");
        return;
      }
      this.liveDms = this.liveDms.filter((item) => item.id !== channel.id);
    }
    this.closedDms.add(channel.id);
    if (this.channelId === channel.id) {
      this.channelId = "";
      this.friendsOpen = true;
    }
    this.paint();
  },
  async saveFriendNick(userId: string, nickname: string) {
    const clean = clampNickname(nickname);
    const row = this.relationshipFor(userId);
    if (row) row.nickname = clean;
    const friend = this.friends.find((person) => person.id === userId);
    if (friend) friend.friendNick = clean;
    this.msgSig = "";
    if (this.friendsOpen) this.paintFriends();
    if (this.demo) return;
    try {
      await invoke("set_friend_nickname", { userId, nickname: clean });
    } catch (err) {
      this.toast("Nickname", err instanceof Error ? err.message : "Couldn't save that nickname.");
    }
  },
  async renameGroup(channelId: string, name: string) {
    if (this.demo) {
      this.toast("Group", "Demo groups stay on this device.");
      return;
    }
    try {
      const channel = normalizeChannel(await invoke<Channel>("rename_group_dm", { channelId, name }));
      this.mergeDms([channel]);
      this.paint();
    } catch (err) {
      this.toast("Group", err instanceof Error ? err.message : "Couldn't rename that group.");
    }
  },
  openGroupCreator() {
    const roster = this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends;
    this.openPicker("New Group DM", roster.map((person) => ({ id: person.id, label: person.name })), 2, (ids) => void this.createGroup(ids));
  },
  openAddRecipient(channel: Channel) {
    const present = new Set([...(channel.recipientIds ?? []), ...(channel.recipients ?? []).map((item) => item.id)]);
    const roster = (this.demo ? people : this.friends).filter((person) => person.id !== this.meId() && !present.has(person.id));
    this.openPicker("Add to DM", roster.map((person) => ({ id: person.id, label: person.name })), 1, (ids) => void this.addRecipient(channel, ids[0]));
  },
  async createGroup(ids: string[]) {
    if (this.demo) {
      this.toast("Group", "Demo groups stay on this device.");
      return;
    }
    try {
      const channel = normalizeChannel(await invoke<Channel>("create_group_dm", { recipientIds: ids }));
      this.mergeDms([channel]);
      this.friendsOpen = false;
      void this.openChannel(channel.id);
    } catch (err) {
      this.toast("Group", err instanceof Error ? err.message : "Couldn't create that group.");
    }
  },
  async addRecipient(channel: Channel, userId: string | undefined) {
    if (!userId) return;
    if (this.demo) {
      this.toast("Direct message", "Demo groups stay on this device.");
      return;
    }
    try {
      await invoke("add_dm_recipient", { channelId: channel.id, userId });
      const channels = await invoke<Channel[]>("fetch_dms");
      this.mergeDms(channels.map(normalizeChannel));
      this.paint();
      this.toast("Direct message", "Added to the conversation.");
    } catch (err) {
      this.toast("Direct message", err instanceof Error ? err.message : "Couldn't add that person.");
    }
  },
  async invitePerson(channel: Channel) {
    const guilds = this.guilds();
    if (!guilds.length) {
      this.toast("Invite", "Join a server before inviting someone.");
      return;
    }
    this.openChoice("Invite to Server", guilds.map((guild) => ({ id: guild.id, label: guild.name })), (guildId) => {
      const text = this.channelsOf(guildId).find((item) => item.kind === "text" || item.kind === "announcement");
      if (!text) {
        this.toast("Invite", "Open that server once so Lark can see a text channel.");
        return;
      }
      if (this.demo) {
        this.toast("Invite", "Demo invites stay on this device.");
        return;
      }
      void invoke<string>("create_channel_invite", { channelId: text.id }).then(async (code) => {
        const sent = await this.postPlain(channel.id, `https://discord.gg/${code}`);
        this.toast("Invite", sent ? "Invite sent." : "Couldn't send that invite.");
      }).catch((err) => {
        this.toast("Invite", err instanceof Error ? err.message : "Couldn't create an invite.");
      });
    });
  },
  async saveServerProfile(nick: string, bio: string, avatar: string | null) {
    if (!this.guildId) {
      this.toast("Profile", "Open a server to edit the per-server profile.");
      return;
    }
    if (this.demo) {
      this.toast("Profile", "Demo server profiles stay on this device.");
      return;
    }
    try {
      await invoke("set_server_profile", { guildId: this.guildId, nick: clampNickname(nick), bio, avatar });
      this.toast("Profile", "Server profile saved.");
    } catch (err) {
      this.toast("Profile", err instanceof Error ? err.message : "Couldn't save that profile.");
    }
  },
  profileSlots(person: Person): ProfileActionSlot[] {
    const host = globalThis as { larkProfileSlots?: (person: { id: string; guildId: string | null }) => ProfileActionSlot[] };
    if (typeof host.larkProfileSlots !== "function") return [];
    try {
      return host.larkProfileSlots({ id: person.id, guildId: this.guildId }) ?? [];
    } catch {
      return [];
    }
  },
  paintProfilePanel() {
    let panel = document.getElementById("lark-profile-panel");
    const channel = this.currentChannel();
    const open = Boolean(channel && (channel.kind === "dm" || channel.kind === "group") && this.profilePanelOpen && !this.friendsOpen);
    if (!open || !channel) {
      panel?.remove();
      this.stage.classList.remove("is-profile");
      return;
    }
    if (!panel) {
      panel = el("aside", "profile-panel");
      panel.id = "lark-profile-panel";
      this.stage.append(panel);
    }
    this.stage.classList.add("is-profile");
    const person = this.dmCounterparty(channel);
    if (!person) {
      clear(panel);
      panel.append(el("p", "empty", "No profile for this conversation."));
      return;
    }
    if (!this.late) {
      void this.ensureLate().then(() => this.paintProfilePanel());
      return;
    }
    if (panel.dataset.user !== person.id) {
      panel.dataset.user = person.id;
      if (!this.demo) {
        void invoke<WireProfile>("fetch_profile", { userId: person.id, guildId: this.guildId }).then((profile) => {
          if (!this.profilePanelOpen) return;
          this.wireProfile = profile;
          this.paintProfilePanel();
        }).catch(() => undefined);
      }
    }
    const details = this.wireProfile?.id === person.id ? this.wireProfile : null;
    const sample = this.demo && !details ? this.late!.sampleProfile(person) : null;
    const roles = this.profileRoles(person);
    this.late!.renderProfileCard(panel, {
      person,
      self: false,
      statusPicker: false,
      roles: roles.length ? roles : (sample ? this.late!.sampleRoles() : []),
      placement: "panel",
      details: details ? {
        id: details.id,
        name: this.maskText(details.name),
        username: this.maskText(details.username),
        avatarUrl: details.avatarUrl,
        bannerUrl: details.bannerUrl,
        accent: details.accent,
        bio: this.maskText(details.bio ?? ""),
        pronouns: this.maskText(details.pronouns ?? ""),
        nick: details.nick ? this.maskText(details.nick) : details.nick,
        mutualNames: [],
        mutualGuilds: details.mutualGuilds?.length ?? 0,
        mutualFriends: details.mutualFriends ?? 0,
        mutualFriendsList: (details.mutualFriendsList ?? []).map((friend) => ({ id: friend.id, name: this.maskText(friend.name) })),
        joinedAt: details.joinedAt,
        badges: details.badges ?? [],
        widgets: details.widgets ?? [],
        serverTag: details.serverTag ?? person.serverTag ?? null,
      } : sample,
    }, {
      onClose: () => {
        this.profilePanelOpen = false;
        this.paintProfilePanel();
      },
      onMessage: () => void this.openDm(person.id),
      onAddFriend: this.friends.some((item) => item.id === person.id) ? undefined : () => void this.changeRelationship(person.id, "friend"),
      onJoinVoice: voiceSpotFor(Object.values(this.voiceRoster), person.id) ? () => this.joinFriendVoice(person.id) : undefined,
      note: this.notes[person.id] ?? "",
      onNote: (note) => this.saveNote(person.id, note),
      slots: this.profileSlots(person),
    });
  },
  dmCounterparty(channel: Channel): Person | null {
    const recipient = channel.recipients?.find((item) => item.id !== this.meId()) ?? channel.recipients?.[0];
    const id = recipient?.id ?? channel.recipientIds?.find((item) => item !== this.meId());
    if (!id) return null;
    return this.directory[id] ?? { id, name: recipient?.name || channel.name, avatarUrl: recipient?.avatarUrl, status: "offline" };
  },
  async copySocialId(id: string, label: string) {
    try {
      await navigator.clipboard.writeText(id);
      this.toast(label, "Copied.");
    } catch {
      this.toast(label, id);
    }
  },
  openPrompt(title: string, value: string, multiline: boolean, onSave: (text: string) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("form", "social-prompt");
    card.append(el("h2", "", title));
    const field = multiline ? el("textarea") : el("input");
    field.value = value;
    field.maxLength = multiline ? 256 : 100;
    const save = el("button", "primary", "Save");
    save.type = "submit";
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(field, save, cancel);
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      overlay.remove();
      onSave(field.value);
    });
    overlay.append(card);
    this.root.append(overlay);
    field.focus();
  },
  openChoice(title: string, options: { id: string; label: string }[], onPick: (id: string) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("div", "social-prompt");
    card.append(el("h2", "", title));
    for (const option of options.slice(0, 40)) {
      const button = el("button", "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        overlay.remove();
        onPick(option.id);
      });
      card.append(button);
    }
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(cancel);
    overlay.append(card);
    this.root.append(overlay);
  },
  openPicker(title: string, options: { id: string; label: string }[], minimum: number, onPick: (ids: string[]) => void) {
    document.getElementById("lark-social-prompt")?.remove();
    const selected = new Set<string>();
    const overlay = el("div", "overlay");
    overlay.id = "lark-social-prompt";
    const card = el("div", "social-prompt");
    card.append(el("h2", "", title));
    if (!options.length) card.append(el("p", "empty", "No one to add."));
    for (const option of options.slice(0, 40)) {
      const button = el("button", "text-button", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        if (selected.has(option.id)) selected.delete(option.id);
        else selected.add(option.id);
        button.classList.toggle("is-on", selected.has(option.id));
      });
      card.append(button);
    }
    const save = el("button", "primary", "Add");
    save.type = "button";
    save.addEventListener("click", () => {
      if (selected.size < minimum) {
        this.toast(title, minimum > 1 ? "Pick at least two people." : "Pick someone.");
        return;
      }
      overlay.remove();
      onPick([...selected]);
    });
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => overlay.remove());
    card.append(save, cancel);
    overlay.append(card);
    this.root.append(overlay);
  },
});
