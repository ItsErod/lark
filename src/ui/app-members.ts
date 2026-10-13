import { people } from "../demo/data";
import { benchPeople } from "../bench/corpus";
import { displayName } from "../pack/nicks";
import type { Person } from "../types";
import {
  applyMemberListSort, groupMembers,
  MEMBER_LIST_SORTS, highestIndex,
  MEMBER_ROW,
  memberSubtitle, roleColor, sortPeople,
  visibleRows,
  type PaintedRow
} from "../members";
import { memberNote } from "../roster";
import {
  activeNowCards, friendActivityText, friendsForTab, pendingFriendCount, serverTagText, voiceSpotFor, type SocialRelationship,
  type VoiceSpot
} from "../social";
import { sliceWindow, VIRTUAL_MIN } from "../virtual";
import { clear, el, portrait } from "./dom";
import { mountMenu } from "./guild-settings";
import type { ActiveCardModel, FriendRowModel, PendingRowModel } from "./friends";
import { statusLabel } from "./app-shared";
import { defineMethods } from "./app-shared";

export const memberMethods = defineMethods({
  paintFriends() {
    if (this.dashboardOpen && !this.guildId) return;
    if (!this.late) {
      void this.ensureLate().then(() => {
        if (this.friendsOpen && !this.dashboardOpen) this.paintFriends();
      });
      return;
    }
    this.loadRelationships();
    const noteSig = Object.entries(this.notes).map(([id, note]) => `${id}:${note}`).join(",");
    const relSig = this.relationships.map((row) => `${row.id}:${row.kind}:${row.nickname}`).join(",");
    const voiceSig = Object.values(this.voiceRoster).map((person) => `${person.userId}:${person.channelId}:${person.sharing ? 1 : 0}`).join(",");
    const sig = `friends|${this.friendTab}|${pendingFriendCount()}|${this.streamerOn() ? 1 : 0}|${this.friends.map((person) => `${person.id}:${person.status}:${person.custom}:${person.activity}:${person.rich?.startedAt ?? ""}:${serverTagText(person.serverTag)}`).join(",")}|${noteSig}|${relSig}|${voiceSig}|${Math.floor(Date.now() / 15000)}`;
    if (sig === this.msgSig) return;
    this.msgSig = sig;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    const roster = sortPeople(this.demo ? people.filter((person) => person.id !== this.meId()) : this.friends);
    const visible = friendsForTab(roster, this.friendTab);
    const groups = this.friendTab === "all"
      ? [
          ["Online", visible.filter((person) => person.status === "online")],
          ["Idle", visible.filter((person) => person.status === "idle")],
          ["Do not disturb", visible.filter((person) => person.status === "dnd")],
          ["Offline", visible.filter((person) => person.status !== "online" && person.status !== "idle" && person.status !== "dnd")],
        ] as const
      : [
          ["Online", visible.filter((person) => person.status === "online")],
          ["Idle", visible.filter((person) => person.status === "idle")],
          ["Do not disturb", visible.filter((person) => person.status === "dnd")],
        ] as const;
    const voices: Record<string, VoiceSpot | null> = {};
    for (const person of roster) voices[person.id] = voiceSpotFor(Object.values(this.voiceRoster), person.id);
    const now = Date.now();
    const active: ActiveCardModel[] = activeNowCards(roster, voices, now).map((card) => ({
      ...card,
      name: this.maskText(card.name),
      line: this.maskText(card.line),
      detail: this.maskText(card.detail),
    }));
    const rowFor = (person: Person): FriendRowModel => {
      const nick = this.relationshipFor(person.id)?.nickname || person.friendNick || "";
      return {
        id: person.id,
        name: this.maskText(nick || person.name),
        status: person.status ?? "offline",
        line: this.maskText(friendActivityText(person, now) || memberSubtitle(person) || statusLabel(person.status)),
        tag: serverTagText(person.serverTag),
        note: this.maskText(this.notes[person.id] ?? ""),
        avatarUrl: person.avatarUrl,
      };
    };
    const pendingRow = (row: SocialRelationship, incoming: boolean): PendingRowModel => ({
      id: row.id,
      name: this.maskText(row.nickname || row.name),
      username: this.maskText(row.username),
      incoming,
      avatarUrl: row.avatarUrl,
    });
    this.late!.renderFriendsBoard(this.messagesEl, {
      tab: this.friendTab,
      pending: pendingFriendCount(),
      groups: groups.map(([label, people]) => ({ label, people: people.map(rowFor) })),
      incoming: this.relationships.filter((row) => row.kind === "incoming").map((row) => pendingRow(row, true)),
      outgoing: this.relationships.filter((row) => row.kind === "outgoing").map((row) => pendingRow(row, false)),
      active: this.friendTab === "pending" || this.friendTab === "add" ? [] : active,
    }, {
      onTab: (tab) => {
        this.friendTab = tab;
        this.msgSig = "";
        this.paintFriends();
      },
      onOpen: (id) => {
        const person = roster.find((item) => item.id === id) ?? this.personFromRelationship(id);
        if (person) this.openProfile(person);
      },
      onMessage: (id) => void this.openDm(id),
      onAccept: (id) => void this.changeRelationship(id, "friend"),
      onIgnore: (id) => void this.changeRelationship(id, "ignore"),
      onCancel: (id) => void this.changeRelationship(id, "remove"),
      onAdd: (username) => void this.addFriendUsername(username),
      onWatch: (id) => this.watchFriend(id),
      onJoinVoice: (id) => this.joinFriendVoice(id),
    });
    if (this.friendTick) window.clearTimeout(this.friendTick);
    if (active.some((card) => card.elapsed)) {
      this.friendTick = window.setTimeout(() => {
        this.friendTick = 0;
        if (!this.friendsOpen || this.dashboardOpen) return;
        this.msgSig = "";
        this.paintFriends();
      }, 1000);
    }
  },
  dmMemberShape(): string {
    const channel = this.currentChannel();
    const ids = channel?.recipients?.map((item) => item.id) ?? channel?.recipientIds ?? [];
    return `dm:${this.channelId}:${channel?.name ?? ""}:${ids.join(",")}`;
  },
  guildMemberBoard(): { rows: PaintedRow[]; online: number; total: number; note: string; more: boolean } {
    const guildId = this.guildId ?? "";
    const roles = this.rolesByGuild[guildId] ?? [];
    const list = this.demo ? null : this.currentMemberList();
    const wire = list && list.rows.size ? visibleRows(list, roles) : null;
    const roster = this.demo ? (this.bench ? benchPeople() : people) : this.liveMembers;
    const sections = wire ? null : groupMembers(roster, roles);
    const rows: PaintedRow[] = [];
    if (wire) rows.push(...wire);
    else if (sections) {
      for (const section of sections) {
        rows.push({ type: "group", id: section.id, label: section.label, count: section.count, color: section.color });
        for (const person of section.people) {
          rows.push({ type: "member", person, color: roleColor(person.roleIds, roles) || person.color || null });
        }
      }
    }
    const sorted = applyMemberListSort(rows, this.memberListSort);
    rows.length = 0;
    rows.push(...sorted);
    const count = rows.filter((row) => row.type === "member").length;
    const online = list?.onlineCount || roster.filter((person) => person.status === "online" || person.status === "idle" || person.status === "dnd").length;
    const total = list?.memberCount || roster.length;
    const base = memberNote(true, count, this.memberPhase[guildId]);
    const note = list && list.memberCount > 0 && rows.length === 0 ? "Loading members…" : (base ?? "");
    const highest = highestIndex(list);
    const more = Boolean(list && list.memberCount > count && highest >= 0 && highest + 1 < list.memberCount);
    return { rows, online, total, note, more };
  },
  memberShapeOf(rows: PaintedRow[], note: string, more: boolean): string {
    const body = rows.map((row) => row.type === "group" ? `g:${row.id}:${row.count}:${row.color ?? ""}:${row.label}` : `m:${row.person.id}:${row.color ?? ""}:${row.person.name}`).join("|");
    return `${this.guildId}|${this.memberListSort}|${note}|${more ? 1 : 0}|${body}`;
  },
  patchMemberPresence() {
    const board = this.guildId ? this.guildMemberBoard() : null;
    const countEl = this.membersEl.querySelector(".member-count");
    if (countEl && board?.total) countEl.textContent = `${board.online.toLocaleString()} online · ${board.total.toLocaleString()} members`;
    for (const row of this.membersEl.querySelectorAll<HTMLElement>(".member-row")) {
      const person = this.directory[row.dataset.user ?? ""];
      if (!person) continue;
      const dot = row.querySelector("i.status");
      if (dot) dot.className = `status ${person.status ?? "offline"}`;
      const copy = row.querySelector(".member-copy");
      if (!copy) continue;
      const line = this.maskText(memberSubtitle(person));
      const sub = copy.querySelector(":scope > span");
      if (!line) {
        sub?.remove();
        continue;
      }
      if (!sub) copy.append(el("span", "", line));
      else if (sub.textContent !== line) sub.textContent = line;
    }
  },
  appendPaintedRow(parent: HTMLElement, row: PaintedRow) {
    if (row.type === "group") {
      const label = el("div", "member-group", `${row.label} — ${row.count}`);
      if (row.color) label.style.color = row.color;
      parent.append(label);
      return;
    }
    parent.append(this.memberButton(row.person, row.color));
  },
  syncMemberWindow(scroll: HTMLElement) {
    const rows = this.memberPaint;
    if (!rows || rows.length <= VIRTUAL_MIN) return;
    const host = scroll.querySelector(":scope > .virtual-host");
    if (!(host instanceof HTMLElement)) return;
    const slice = sliceWindow(rows.length, scroll.scrollTop, scroll.clientHeight || 640, MEMBER_ROW, 8);
    if (Number(host.dataset.start) === slice.start && Number(host.dataset.end) === slice.end) return;
    const spacers = scroll.querySelectorAll(":scope > .virtual-spacer");
    if (spacers[0] instanceof HTMLElement) spacers[0].style.height = `${slice.start * MEMBER_ROW}px`;
    if (spacers[1] instanceof HTMLElement) spacers[1].style.height = `${(rows.length - slice.end) * MEMBER_ROW}px`;
    clear(host);
    for (let index = slice.start; index < slice.end; index += 1) this.appendPaintedRow(host, rows[index]);
    host.dataset.start = String(slice.start);
    host.dataset.end = String(slice.end);
  },
  bindMemberScroll(scroll: HTMLElement) {
    scroll.addEventListener("scroll", () => {
      if (!this.memberFrame) {
        this.memberFrame = requestAnimationFrame(() => {
          this.memberFrame = 0;
          const current = this.membersEl.querySelector(".member-scroll");
          if (current instanceof HTMLElement) this.syncMemberWindow(current);
        });
      }
      window.clearTimeout(this.memberScrollTimer);
      this.memberScrollTimer = window.setTimeout(() => this.onMemberScroll(scroll), 120);
    }, { passive: true });
  },
  paintMemberRows(scroll: HTMLElement, rows: PaintedRow[], kept: number) {
    const virtual = rows.length > VIRTUAL_MIN;
    if (virtual) scroll.classList.add("is-virtual");
    if (!virtual) {
      for (const row of rows) this.appendPaintedRow(scroll, row);
      this.memberPaint = null;
      return;
    }
    const slice = sliceWindow(rows.length, kept, 640, MEMBER_ROW, 8);
    const top = el("div", "virtual-spacer");
    const host = el("div", "virtual-host");
    const bottom = el("div", "virtual-spacer");
    top.style.height = `${slice.start * MEMBER_ROW}px`;
    bottom.style.height = `${(rows.length - slice.end) * MEMBER_ROW}px`;
    host.dataset.start = String(slice.start);
    host.dataset.end = String(slice.end);
    for (let index = slice.start; index < slice.end; index += 1) this.appendPaintedRow(host, rows[index]);
    scroll.append(top, host, bottom);
    this.memberPaint = rows;
  },
  paintMembers() {
    if (this.holdShell) return;
    if (this.dashboardDock()) {
      this.membersEl.hidden = false;
      this.paintDashboard(this.membersEl, true);
      return;
    }
    if (this.membersEl.querySelector(".dash-feed")) {
      this.memberShape = "";
      this.dashboardSig = "";
      clear(this.membersEl);
    }
    if (this.membersEl.hidden) {
      if (this.memberShape) {
        clear(this.membersEl);
        this.memberShape = "";
        this.memberPaint = null;
      }
      return;
    }
    const kept = this.membersEl.querySelector(".member-scroll")?.scrollTop ?? 0;
    if (!this.guildId) {
      const shape = this.dmMemberShape();
      if (shape === this.memberShape && this.membersEl.querySelector(".member-scroll")) {
        this.patchMemberPresence();
        return;
      }
      this.memberShape = shape;
      this.memberPaint = null;
      clear(this.membersEl);
      const head = el("div", "member-head");
      const scroll = el("div", "member-scroll");
      head.append(el("h2", "", "In this conversation"));
      const channel = this.currentChannel();
      const ids = channel?.recipients?.map((item) => item.id) ?? channel?.recipientIds ?? [];
      const peopleHere = ids.flatMap((id) => {
        if (this.directory[id]) return [this.directory[id]];
        const recipient = channel?.recipients?.find((item) => item.id === id);
        return recipient ? [{ id: recipient.id, name: recipient.name, avatarUrl: recipient.avatarUrl, bot: recipient.bot, status: "offline" as const }] : [];
      });
      if (!peopleHere.length && channel) {
        scroll.append(this.memberButton({ id: channel.id, name: channel.name, status: "offline" }));
      }
      for (const person of peopleHere) scroll.append(this.memberButton(person));
      this.membersEl.append(head, scroll);
      return;
    }
    const board = this.guildMemberBoard();
    const shape = this.memberShapeOf(board.rows, board.note, board.more);
    if (shape === this.memberShape && this.membersEl.querySelector(".member-scroll")) {
      this.patchMemberPresence();
      return;
    }
    this.memberShape = shape;
    clear(this.membersEl);
    const head = el("div", "member-head");
    const scroll = el("div", "member-scroll");
    head.append(el("h2", "", "Members"));
    const sort = el("button", "text-button", MEMBER_LIST_SORTS.find((item) => item.id === this.memberListSort)?.label ?? "Sort");
    sort.type = "button";
    sort.setAttribute("aria-label", "Sort member list");
    sort.addEventListener("click", (event) => {
      const rect = sort.getBoundingClientRect();
      this.closeContextMenu();
      this.contextMenuEl = mountMenu(rect.left, rect.bottom + 4, MEMBER_LIST_SORTS.map((item) => ({
        id: item.id,
        label: item.label,
        hint: item.id === this.memberListSort ? "On" : "",
      })), (id) => {
        if (id === "status" || id === "name" || id === "activity") this.memberListSort = id;
        this.closeContextMenu();
        this.memberShape = "";
        this.paintMembers();
      });
      event.stopPropagation();
    });
    head.append(sort);
    if (board.total) head.append(el("p", "member-count", `${board.online.toLocaleString()} online · ${board.total.toLocaleString()} members`));
    if (board.note && !board.rows.length) scroll.append(el("p", "empty", board.note));
    this.paintMemberRows(scroll, board.rows, kept);
    if (board.more) scroll.append(el("p", "empty", "Scroll for more."));
    this.bindMemberScroll(scroll);
    this.membersEl.append(head, scroll);
    scroll.scrollTop = kept;
    this.syncMemberWindow(scroll);
  },
  memberButton(person: Person, color?: string | null): HTMLButtonElement {
    const row = el("button", "member-row");
    row.type = "button";
    row.dataset.user = person.id;
    const wrap = el("div", "avatar-wrap");
    wrap.append(portrait(person.name, person.id, person.avatarUrl, true), el("i", `status ${person.status ?? "offline"}`));
    const copy = el("div", "member-copy");
    const shownName = this.hookOn("localNicks") ? displayName(this.pack.localNicks, person.id, person.name) : person.name;
    const name = el("strong", "", this.maskText(shownName));
    if (color) name.style.color = color;
    const title = el("div", "member-name");
    title.append(name);
    if (person.bot) title.append(el("span", "bot-tag", "BOT"));
    const line = this.maskText(memberSubtitle(person));
    copy.append(title);
    if (line) copy.append(el("span", "", line));
    row.append(wrap, copy);
    row.addEventListener("click", () => this.openProfile(person));
    if (this.hookOn("userWhois")) {
      row.addEventListener("mouseenter", (event) => this.showWhois(person, event.clientX, event.clientY));
      row.addEventListener("mouseleave", () => this.hideWhoisSoon());
    }
    return row;
  },
});
