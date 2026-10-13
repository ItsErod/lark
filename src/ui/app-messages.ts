import { firstUnreadId, shouldGroup, typingLine } from "../chat";
import { reportCrash } from "../crash";
import { ARCHIVE, CRIT, history, channels as demoChannels, pageMessages } from "../demo/data";
import { benchHistory } from "../bench/corpus";
import { messageSignature } from "../list-sig";
import { REST_PAGE_TTL_MS, readRestCache, writeRestCache } from "../rest-cache";
import {
  dropChannel
} from "../smart-notify";
import { hiddenIds } from "../pack/hidden";
import { digestTotal } from "../pack/digest";
import { overlayDeletes } from "../pack/logger";
import { typingLabel } from "../pack/typing-list";
import { buildViewMessage } from "../render/message";
import { HISTORY_PAGE, droppedMessageIds, initialHistory, reconcileHistory } from "../history";
import { formatShortcut } from "../shortcuts";
import type { Channel, NotifyLevel, RawMessage } from "../types";
import {
  anchoredScrollTop,
  anchorAfterGrowth,
  capMessages,
  isNearBottom,
  messageListPlan
} from "../scroll";
import { loadThreadsUi, threadsNow } from "./lazy-threads";
import { MESSAGE_OVERSCAN, rowEstimate, rowReuseOps, spanWindow, VIRTUAL_MIN, type SpanWindow } from "../virtual";
import { clear, el, icon, paths } from "./dom";
import {
  DISCORD_LINKS
} from "../server-model";
import { externalLink } from "./guild-settings";
import { bindLazyMedia, renderBlockedMessage, renderMessage } from "./messages";
import type { PerfMarks, ScrollMode } from "./app-shared";
import { invoke, normalizeMessage } from "./app-shared";
import { defineMethods } from "./app-shared";

export const messageMethods = defineMethods({
  historyLimit(): number {
    return this.bench ? 80 : HISTORY_PAGE;
  },
  currentChannel(): Channel | undefined {
    const lists = this.demo ? Object.values(demoChannels) : Object.values(this.liveChannels);
    return [...this.visibleChannels(), ...this.dmChannels(), ...lists.flat()].find((channel) => channel.id === this.channelId);
  },
  /** Demo history is local, so paint it once instead of a skeleton and a second pass. */
  seedDemoPage(id: string) {
    if (!this.demo || id === ARCHIVE || this.pages[id]?.length) return;
    const page = pageMessages(this.bench ? benchHistory(id) : (history[id] ?? []), undefined, this.historyLimit());
    this.pages[id] = page.messages;
    this.more[id] = page.hasMore;
    this.loading = false;
    for (const message of page.messages) this.absorbMessage(message);
    this.queueLocalIndex(id);
    if (this.divider[id]) return;
    const marker = firstUnreadId(page.messages.map((message) => message.id), this.lastRead[id]);
    const unread = this.unread[id] ?? 0;
    if (marker) this.divider[id] = marker;
    else if (unread > 0) this.divider[id] = page.messages[Math.max(0, page.messages.length - unread)]?.id ?? null;
  },
  async openChannel(id: string) {
    if (this.holdShell) return;
    this.revealShell();
    this.prefetchToken += 1;
    const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
    if (perf) {
      perf.lastSwitch = -1;
      perf.switchAt = performance.now();
    }
    const started = performance.now();
    const leaving = this.channelId;
    this.channelId = id;
    const missed = dropChannel(this.missed, id);
    if (missed.length !== this.missed.length) {
      this.missed = missed;
      this.saveMissed();
    }
    if (leaving && leaving !== id) this.shrinkChannel(leaving);
    this.error = null;
    this.reply = null;
    this.editing = null;
    this.pendingDelete = null;
    this.pickerFor = null;
    if (!this.jumpId) {
      this.freshCount = 0;
      this.nearBottom = true;
    }
    this.paintNewBar();
    this.closeSuggest();
    const cached = this.pages[id];
    if (cached?.length) {
      const visible = initialHistory(cached, this.historyLimit());
      if (visible.length !== cached.length) {
        this.forgetHeights(droppedMessageIds(cached, visible));
        this.pages[id] = visible;
        this.more[id] = true;
      } else if (this.more[id] === undefined) {
        this.more[id] = visible.length >= this.historyLimit();
      }
      this.loading = false;
    } else {
      this.loading = true;
    }
    if (!this.holdRead()) {
      this.localUnread[id] = 0;
      this.localMentions[id] = 0;
      this.behind[id] = false;
      if (!this.jumpId) {
        const seen = this.pages[id]?.at(-1)?.id ?? this.channelById(id)?.lastMessageId ?? this.markers[id]?.lastMessageId ?? "";
        this.markers[id] = { lastMessageId: seen, mentionCount: 0 };
      }
    }
    this.refreshChannelBadge(id);
    this.scroll = this.jumpId ? "none" : "bottom";
    this.pinnedToBottom = !this.jumpId;
    this.nearBottom = this.pinnedToBottom;
    const draft = this.drafts[id];
    if (draft !== undefined && !this.editing) this.composer.value = draft;
    this.recent = [id, ...this.recent.filter((item) => item !== id)].slice(0, 6);
    if (!this.demo) this.rememberPlace(id);
    if (!this.jumpId && (this.pages[id]?.length ?? 0) > 0) {
      const last = this.pages[id][this.pages[id].length - 1];
      this.ackChannel(id, last.id);
    }
    this.seedDemoPage(id);
    this.openedAt = performance.now();
    this.msgSig = "";
    this.friendsOpen = false;
    this.clipsOpen = false;
    if (leaving !== id) this.notePlace("focus", id);
    this.paintMessages();
    if (perf) perf.lastSwitch = performance.now() - started;
    window.setTimeout(() => this.finishChannelChrome(id), 0);
    if (this.demo && this.pages[id]?.length) {
      if (perf && perf.switchAt) perf.lastLoad = performance.now() - perf.switchAt;
      const last = this.pages[id].at(-1);
      if (!this.jumpId && last) this.ackChannel(id, last.id);
      return;
    }
    await this.reconcileChannel(id);
  },
  /** Header, channel selection, and composer. Members, threads, and prefetch stay off this path. */
  finishChannelChrome(id: string) {
    if (this.channelId !== id || this.holdShell) return;
    this.applyAppearance();
    this.paintRail();
    this.paintChannels();
    this.paintHeader();
    this.paintSplit();
    this.paintVoice();
    this.paintComposer();
    this.syncBadge();
    this.paintMembers();
    if (!this.bench) {
      void loadThreadsUi().then(() => {
        if (this.channelId === id) this.paintHeader();
      });
    }
    const token = this.prefetchToken;
    const idle = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 0 }), 48));
    idle(() => {
      if (this.channelId !== id || token !== this.prefetchToken) return;
      const opened = this.currentChannel();
      if (opened && (opened.kind === "text" || opened.kind === "forum" || opened.kind === "announcement" || opened.kind === "thread")) {
        void this.loadThreads(id);
      }
      if (!this.demo && this.guildId) {
        const prefix = `${this.guildId}:${id}:`;
        if (!this.memberRanges.startsWith(prefix)) this.queueMemberSubscribe(this.guildId, id, [[0, 99]]);
      }
      this.prefetchAround(id);
    });
  },
  async reconcileChannel(id: string) {
    const hadCache = Boolean(this.pages[id]?.length);
    try {
      if (this.demo && id === ARCHIVE) throw new Error("Couldn't load messages in #archive.");
      const page = this.demo
        ? pageMessages(this.bench ? benchHistory(id) : (history[id] ?? []), undefined, this.historyLimit())
        : await this.livePage(id);
      const next = reconcileHistory(this.pages[id] ?? [], page.messages);
      this.pages[id] = next;
      this.queueLocalIndex(id);
      this.more[id] = page.hasMore || next.length > page.messages.length;
      for (const message of page.messages) this.absorbMessage(message);
      if (!this.divider[id]) {
        const marker = firstUnreadId(next.map((message) => message.id), this.lastRead[id]);
        const unread = this.unread[id] ?? 0;
        const before = this.divider[id];
        if (marker) this.divider[id] = marker;
        else if (unread > 0) this.divider[id] = next[Math.max(0, next.length - unread)]?.id ?? null;
        if (this.divider[id] !== before) this.msgSig = "";
      }
      this.loading = false;
      if (this.channelId !== id) return;
      if (!this.jumpId && this.pinnedToBottom) this.scroll = "bottom";
      this.paintMessages();
      const perf = (window as unknown as { __lark?: PerfMarks }).__lark;
      if (perf && perf.switchAt) perf.lastLoad = performance.now() - perf.switchAt;
      const last = next.at(-1);
      if (!this.jumpId && last) this.ackChannel(id, last.id);
    } catch (err) {
      this.loading = false;
      if (this.channelId !== id) return;
      const message = err instanceof Error ? err.message : "Couldn't load messages.";
      if (hadCache && (this.pages[id]?.length ?? 0) > 0) this.toast("History", message);
      else {
        this.error = message;
        this.msgSig = "";
        this.paintMessages();
      }
    }
  },
  livePage(id: string, before?: string): Promise<{ messages: RawMessage[]; hasMore: boolean }> {
    const key = before ? `${id}:before:${before}` : id;
    const pending = this.pageLoads.get(key);
    if (pending) return pending;
    const task = this.fetchLivePage(id, before).finally(() => {
      if (this.pageLoads.get(key) === task) this.pageLoads.delete(key);
    });
    this.pageLoads.set(key, task);
    return task;
  },
  async fetchLivePage(id: string, before?: string): Promise<{ messages: RawMessage[]; hasMore: boolean }> {
    const key = `GET /channels/${id}/messages${before ? `?before=${before}` : ""}`;
    const cached = readRestCache(this.restPages, key, Date.now(), REST_PAGE_TTL_MS);
    const batch = cached ?? await invoke<RawMessage[]>("fetch_messages", { channelId: id, before });
    if (!cached) writeRestCache(this.restPages, key, batch, Date.now());
    const messages = [...batch].reverse().map(normalizeMessage);
    for (const message of messages) this.absorbMessage(message);
    return { messages, hasMore: batch.length >= HISTORY_PAGE };
  },
  async loadOlder(force = false) {
    const id = this.channelId;
    if (!id || this.loading || !this.more[id] || (!force && performance.now() - this.openedAt < 300)) return;
    const loaded = this.pages[id] ?? [];
    if (!loaded.length) return;
    this.loading = true;
    try {
      const page = this.demo
        ? pageMessages(history[id] ?? [], loaded[0].id, HISTORY_PAGE)
        : await this.livePage(id, loaded[0].id);
      this.pages[id] = [...page.messages, ...loaded];
      this.queueLocalIndex(id);
      this.more[id] = page.hasMore;
      this.scroll = "preserve";
      this.msgSig = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load earlier messages.";
      if ((this.pages[id]?.length ?? 0) > 0) this.toast("History", message);
      else this.error = message;
    } finally {
      this.loading = false;
      this.paintMessages();
    }
  },
  paintHeader() {
    if (this.holdShell) return;
    this.bindThreadHost();
    if (!this.threadCore && !this.bench) {
      const id = this.channelId;
      void this.ensureThreadCore().then(() => {
        if (this.channelId === id) this.paintHeader();
      });
    }
    clear(this.chatHead);
    const channel = this.currentChannel();
    const title = el("div", "chat-title");
    const row = el("div", "chat-title");
    row.style.flexDirection = "row";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    if (this.narrow) {
      const menu = el("button", "icon-button");
      menu.type = "button";
      menu.setAttribute("aria-label", "Channels");
      menu.append(icon(paths.panels));
      menu.addEventListener("click", () => {
        this.drawer = !this.drawer;
        this.paint();
      });
      row.append(menu);
    }
    const heading = this.clipsOpen
      ? "Clips"
      : this.friendsOpen && !this.guildId ? (this.dashboardOpen ? "Activity" : "Friends") : channel ? (channel.kind === "dm" || channel.kind === "group" ? this.maskText(channel.name) : this.channelHeading(channel)) : "Lark";
    row.append(el("h2", "", heading));
    if (this.demo) row.append(el("span", "demo-pill", "Demo"));
    if (this.streamerOn() || this.streamerSafeOn()) row.append(el("span", "demo-pill", "Streamer"));
    if (this.holdRead() || this.hideActivity()) row.append(el("span", "demo-pill", "Incognito"));
    title.append(row);
    if (channel?.topic) title.append(el("div", "topic", this.maskText(channel.topic)));
    const threadBar = threadsNow()?.parityThreadBar() ?? null;
    if (threadBar) title.append(threadBar);
    const actions = el("div", "head-actions");
    if (this.holdRead() && this.channelId) {
      const mark = el("button", "text-button", "Mark read");
      mark.type = "button";
      const channelId = this.channelId;
      mark.addEventListener("click", () => this.markRead([channelId]));
      actions.append(mark);
    }
    if (this.hookOn("mentionDigest")) {
      const total = digestTotal(this.mentionDigestRows());
      const digest = el("button", "text-button", total ? `Mentions ${total}` : "Mentions");
      digest.type = "button";
      digest.setAttribute("aria-label", "Mention digest");
      digest.addEventListener("click", () => {
        this.digestOpen = !this.digestOpen;
        this.paintDigest();
      });
      actions.append(digest);
    }
    const search = el("button", "icon-button");
    search.type = "button";
    search.title = `Command palette (${formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os)})`;
    search.setAttribute("aria-label", "Command palette");
    search.append(icon(paths.search));
    search.addEventListener("click", () => this.openSwitcher());
    const find = el("button", "icon-button");
    find.type = "button";
    find.title = "Search messages (from:, mentions:, has:, before:, after:, in:, pinned:)";
    find.setAttribute("aria-label", "Search messages");
    find.append(icon(paths.search));
    find.addEventListener("click", () => {
      this.searchOpen = true;
      this.paintSearch();
    });
    const pin = el("button", "icon-button");
    pin.type = "button";
    pin.setAttribute("aria-label", "Pinned messages");
    pin.textContent = "Pin";
    pin.addEventListener("click", () => {
      this.pinsOpen = !this.pinsOpen;
      this.paintPins();
    });
    const split = el("button", `icon-button${this.splitId ? " is-on" : ""}`);
    split.type = "button";
    split.setAttribute("aria-label", "Split view");
    split.append(icon(paths.panels));
    split.addEventListener("click", () => this.toggleSplit());
    const theme = el("button", "icon-button");
    theme.type = "button";
    theme.setAttribute("aria-label", "Theme editor");
    theme.textContent = "Aa";
    theme.addEventListener("click", () => {
      this.themeOpen = true;
      this.paintTheme();
    });
    const feed = el("button", `text-button${this.dashboardOpen ? " is-on" : ""}`);
    feed.type = "button";
    feed.textContent = "Feed";
    feed.title = "Dashboard";
    feed.setAttribute("aria-label", "Dashboard");
    feed.setAttribute("aria-pressed", this.dashboardOpen ? "true" : "false");
    feed.addEventListener("click", () => this.toggleDashboard());
    const boardBtn = (this.guildId || this.voice) ? el("button", `text-button${this.boardOpen ? " is-on" : ""}`, "Dashboard") : null;
    if (boardBtn) {
      boardBtn.type = "button";
      boardBtn.title = "Dashboard";
      boardBtn.setAttribute("aria-label", "Open dashboard");
      boardBtn.setAttribute("aria-pressed", this.boardOpen ? "true" : "false");
      boardBtn.addEventListener("click", () => this.toggleBoard());
    }
    const members = el("button", `icon-button${this.config.appearance.show_member_list ? " is-on" : ""}`);
    members.type = "button";
    members.setAttribute("aria-label", "Members");
    members.append(icon(paths.users));
    members.addEventListener("click", () => {
      this.config.appearance.show_member_list = !this.config.appearance.show_member_list;
      this.persist();
      this.paint();
    });
    const bell = el("button", "icon-button");
    bell.type = "button";
    bell.setAttribute("aria-label", "Notification level");
    bell.append(icon(paths.bell));
    bell.addEventListener("click", () => this.cycleNotify());
    const saved = el("button", "text-button");
    saved.type = "button";
    saved.textContent = "Saved";
    saved.setAttribute("aria-label", "Saved messages");
    saved.addEventListener("click", () => {
      this.bookmarksOpen = !this.bookmarksOpen;
      this.paintBookmarks();
    });
    const parityButtons = threadsNow()?.parityHeaderButtons() ?? [];
    const headerButtons = [search, find, pin, ...parityButtons, saved, feed, ...(boardBtn ? [boardBtn] : []), split, theme, members, bell];
    actions.append(...headerButtons);
    if (this.hookOn("readAll")) actions.append(this.readAllButton());
    const help = el("button", "icon-button");
    help.type = "button";
    help.title = "Help";
    help.setAttribute("aria-label", "Help");
    help.textContent = "?";
    help.addEventListener("click", () => externalLink(DISCORD_LINKS.help));
    actions.append(help);
    this.chatHead.append(title, actions);
    threadsNow()?.mountChannelPolls(this.messagesEl);
    this.paintSocialChrome();
  },
  cycleNotify() {
    if (!this.channelId) return;
    const order: NotifyLevel[] = ["all", "mentions", "mute"];
    const current = this.levelFor(this.guildId, this.channelId);
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.config.notifications.channels[this.channelId] = next === "mute" ? { muted: true } : { level: next, muted: false };
    this.stageNotify(this.guildId, this.channelId, next);
    this.persist();
    void this.writeNotify(this.guildId, this.channelId, next);
    this.toast("Notifications", `${this.currentChannel()?.name ?? "Channel"} is set to ${next}.`);
    this.paint();
  },
  lockScroll(run: () => void) {
    this.scrollLock += 1;
    try {
      run();
    } finally {
      this.scrollLock -= 1;
    }
  },
  noteMessagePaint(reason: string) {
    if (reason !== "replace") return;
    const now = performance.now();
    this.messagePaints = this.messagePaints.filter((stamp) => now - stamp < 500);
    this.messagePaints.push(now);
    if (this.messagePaints.length >= 4) {
      console.warn(`[lark] message list rebuilt ${this.messagePaints.length} times in 500ms. A channel view should append, not rebuild in a loop.`);
    }
  },
  captureScroll() {
    const top = this.messagesEl.scrollTop;
    const height = this.messagesEl.scrollHeight;
    const client = this.messagesEl.clientHeight;
    return { top, height, client, near: this.pinnedToBottom || isNearBottom(top, height, client) };
  },
  placeScroll(metrics: { top: number; height: number; client: number; near: boolean }, intent: ScrollMode) {
    const next = anchoredScrollTop({
      intent,
      prevTop: metrics.top,
      prevHeight: metrics.height,
      nextHeight: this.messagesEl.scrollHeight,
      clientHeight: metrics.client || this.messagesEl.clientHeight,
      nearBottom: metrics.near,
    });
    this.messagesEl.scrollTop = next;
    this.pinnedToBottom = intent === "bottom" || (intent !== "preserve" && metrics.near);
  },
  /**
   * The first message line that still crosses the scroller's top edge.
   * Day and unread separators live inside `.message-wrap`, so the wrap's box
   * moves when a separator hops onto a newly prepended message. Anchoring the
   * line itself keeps the text the reader was looking at from jumping.
   */
  readingLine(): { id: string; top: number } | null {
    const edge = this.messagesEl.getBoundingClientRect().top;
    for (const wrap of this.messagesEl.querySelectorAll<HTMLElement>(".message-wrap")) {
      const id = wrap.dataset.mid;
      if (!id) continue;
      const line = wrap.querySelector<HTMLElement>(":scope > .message, :scope > .system-line") ?? wrap;
      const rect = line.getBoundingClientRect();
      if (rect.bottom > edge + 1) return { id, top: rect.top };
    }
    return null;
  },
  holdReadingLine(reading: { id: string; top: number } | null) {
    if (!reading) return;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(reading.id) : reading.id;
    const wrap = this.messagesEl.querySelector<HTMLElement>(`[data-mid="${escaped}"]`);
    const line = wrap?.querySelector<HTMLElement>(":scope > .message, :scope > .system-line") ?? wrap;
    if (!line) return;
    const shift = line.getBoundingClientRect().top - reading.top;
    if (Math.abs(shift) < 1) return;
    this.messagesEl.scrollTop += shift;
  },
  windowMessages(id: string, list: RawMessage[]): RawMessage[] {
    const capped = capMessages(list, this.pinnedToBottom);
    if (!capped.trimmed) return list;
    this.forgetHeights(droppedMessageIds(list, capped.items));
    this.pages[id] = capped.items;
    if (!this.pinnedToBottom && this.scroll === "none") this.scroll = "preserve";
    console.info(`[lark] trimmed channel ${id} to ${capped.items.length} messages`);
    return capped.items;
  },
  /** Images and embeds change height after decode. Re-pin or hold the line without another render. */
  watchMessageLayout() {
    const scroller = this.messagesEl;
    const column = scroller.querySelector(":scope > .message-column");
    if (!(column instanceof HTMLElement)) {
      this.layoutObserver?.disconnect();
      this.layoutObserver = null;
      this.layoutColumn = null;
      return;
    }
    if (this.layoutObserver && this.layoutColumn === column && !column.querySelector("img, [data-lazy-src]")) {
      this.followPinned();
      return;
    }
    this.layoutColumn = column;
    this.layoutObserver?.disconnect();
    const heights = new Map<Element, number>();
    const nodes = [column, ...column.querySelectorAll("img")].filter((node): node is HTMLElement => node instanceof HTMLElement);
    bindLazyMedia(scroller);
    this.layoutObserver = new ResizeObserver((entries) => {
      if (this.scrollLock > 0) {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) heights.set(entry.target, entry.contentRect.height);
        }
        return;
      }
      for (const entry of entries) {
        const node = entry.target;
        if (!(node instanceof HTMLElement)) continue;
        const next = entry.contentRect.height;
        const prev = heights.get(node);
        heights.set(node, next);
        if (prev === undefined) continue;
        const wrap = node.closest(".message-wrap");
        if (wrap instanceof HTMLElement && wrap.dataset.mid) {
          const measured = wrap.offsetHeight;
          if (measured > 0) this.messageHeights.set(wrap.dataset.mid, measured);
        }
        const delta = next - prev;
        if (Math.abs(delta) < 1) continue;
        if (node === column || this.pinnedToBottom) {
          if (this.pinnedToBottom) {
            this.lockScroll(() => {
              scroller.scrollTop = scroller.scrollHeight;
            });
          }
          continue;
        }
        const above = node.getBoundingClientRect().top < scroller.getBoundingClientRect().top;
        if (!above) continue;
        const top = anchorAfterGrowth({
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          delta,
          pinned: false,
          aboveViewport: true,
        });
        this.lockScroll(() => {
          scroller.scrollTop = top;
        });
      }
    });
    for (const node of nodes) this.layoutObserver.observe(node);
    for (const node of nodes) {
      if (!(node instanceof HTMLImageElement) || node.dataset.anchorBound === "1") continue;
      node.dataset.anchorBound = "1";
      node.dataset.anchorHeight = String(node.offsetHeight);
      const apply = () => this.stickToReadingLine(node);
      node.addEventListener("load", () => {
        apply();
        requestAnimationFrame(apply);
      });
      if (node.complete) requestAnimationFrame(apply);
    }
    this.followPinned();
  },
  followPinned() {
    this.stickIfPinned();
    requestAnimationFrame(() => {
      this.stickIfPinned();
      requestAnimationFrame(() => this.stickIfPinned());
    });
  },
  stickIfPinned() {
    if (!this.pinnedToBottom || this.scrollLock > 0) return;
    const scroller = this.messagesEl;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (gap <= 1) return;
    this.lockScroll(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  },
  stickToReadingLine(node: HTMLImageElement) {
    const scroller = this.messagesEl;
    if (this.pinnedToBottom) {
      this.stickIfPinned();
      return;
    }
    const above = node.getBoundingClientRect().top < scroller.getBoundingClientRect().top;
    if (!above) return;
    const delta = node.offsetHeight - Number(node.dataset.anchorHeight ?? node.offsetHeight);
    node.dataset.anchorHeight = String(node.offsetHeight);
    if (Math.abs(delta) < 1) return;
    const top = anchorAfterGrowth({
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      delta,
      pinned: false,
      aboveViewport: true,
    });
    this.lockScroll(() => {
      scroller.scrollTop = top;
    });
  },
  messageBody(list: RawMessage[]): string {
    return messageSignature(list);
  },
  messageSpan(list: RawMessage[], scrollTop: number, pinned: boolean): SpanWindow {
    const heights = new Array<number>(list.length);
    for (let index = 0; index < list.length; index += 1) heights[index] = this.messageHeights.get(list[index].id) ?? 0;
    const focus = this.jumpId ? list.findIndex((message) => message.id === this.jumpId) : -1;
    return spanWindow(
      list.length,
      heights,
      scrollTop,
      this.messagesEl.clientHeight || 640,
      rowEstimate(this.config.appearance.density),
      MESSAGE_OVERSCAN,
      pinned,
      focus,
    );
  },
  spacerBox(list: RawMessage[], start: number, end: number): { top: number; bottom: number } {
    const row = rowEstimate(this.config.appearance.density);
    let top = 0;
    for (let index = 0; index < start; index += 1) top += this.messageHeights.get(list[index].id) || row;
    let bottom = 0;
    for (let index = end; index < list.length; index += 1) bottom += this.messageHeights.get(list[index].id) || row;
    return { top, bottom };
  },
  applySpacers(column: HTMLElement, box: { top: number; bottom: number }) {
    const spacers = column.querySelectorAll(":scope > .virtual-spacer");
    const top = spacers[0];
    const bottom = spacers[1];
    if (top instanceof HTMLElement) top.style.height = `${box.top}px`;
    if (bottom instanceof HTMLElement) bottom.style.height = `${box.bottom}px`;
  },
  measureHost(host: HTMLElement) {
    for (const node of host.querySelectorAll<HTMLElement>(":scope > .message-wrap")) {
      const mid = node.dataset.mid;
      if (!mid) continue;
      const height = node.offsetHeight;
      if (height > 0) this.messageHeights.set(mid, height);
    }
  },
  /** A pinned tail does not move when the top spacer is corrected, so measure on the next frame. */
  measurePinnedLater(host: HTMLElement, column: HTMLElement, list: RawMessage[]) {
    const id = this.channelId;
    const start = this.msgStart;
    const end = this.msgEnd;
    requestAnimationFrame(() => {
      if (!host.isConnected || this.channelId !== id || this.msgStart !== start || this.msgEnd !== end) return;
      this.measureHost(host);
      this.applySpacers(column, this.spacerBox(list, start, end));
      this.stickIfPinned();
    });
  },
  forgetHeights(ids: readonly string[]) {
    for (const id of ids) this.messageHeights.delete(id);
  },
  /** Keep the newest page of a channel we just left, and drop height cache for the rest. */
  shrinkChannel(id: string) {
    const list = this.pages[id];
    if (!list) return;
    const next = initialHistory(list, this.historyLimit());
    if (next.length === list.length) return;
    this.forgetHeights(droppedMessageIds(list, next));
    this.pages[id] = next;
    this.more[id] = true;
  },
  fillWindow(host: HTMLElement, list: RawMessage[], start: number, end: number, channelId: string) {
    if (end <= start) {
      clear(host);
      return;
    }
    const next: string[] = [];
    for (let index = start; index < end; index += 1) next.push(list[index].id);
    const mounted: string[] = [];
    for (const node of host.querySelectorAll<HTMLElement>(":scope > .message-wrap")) {
      const mid = node.dataset.mid;
      if (mid) mounted.push(mid);
    }
    const ops = rowReuseOps(mounted, next);
    if (ops.length === 1 && ops[0].t === "make") {
      clear(host);
      this.appendMessages(host, list, start, channelId, end);
      return;
    }
    const have = new Map<string, HTMLElement>();
    const keep = new Set(next);
    for (const node of [...host.children]) {
      if (!(node instanceof HTMLElement) || !node.classList.contains("message-wrap")) {
        node.remove();
        continue;
      }
      const mid = node.dataset.mid ?? "";
      if (!mid || !keep.has(mid) || have.has(mid)) node.remove();
      else have.set(mid, node);
    }
    let cursor: ChildNode | null = host.firstChild;
    for (const op of ops) {
      if (op.t === "keep") {
        const node = have.get(op.id);
        if (!node) continue;
        if (node !== cursor) host.insertBefore(node, cursor);
        else cursor = cursor.nextSibling;
        continue;
      }
      const bucket = document.createElement("div");
      this.appendMessages(bucket, list, start + op.from, channelId, start + op.to);
      while (bucket.firstChild) host.insertBefore(bucket.firstChild, cursor);
    }
  },
  syncMessageWindow() {
    if (this.scrollLock > 0) return;
    const id = this.channelId;
    const list = id ? this.pages[id] ?? [] : [];
    if (!id || list.length <= VIRTUAL_MIN) return;
    const column = this.messagesEl.querySelector(":scope > .message-column");
    const host = column?.querySelector(":scope > .virtual-host");
    if (!(column instanceof HTMLElement) || !(host instanceof HTMLElement)) return;
    const span = this.messageSpan(list, this.messagesEl.scrollTop, this.pinnedToBottom);
    if (span.start === this.msgStart && span.end === this.msgEnd) return;
    const anchor = host.querySelector<HTMLElement>(":scope > .message-wrap");
    const anchorId = anchor?.dataset.mid ?? "";
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    const prevTop = Number.parseFloat((column.querySelector(":scope > .virtual-spacer") as HTMLElement | null)?.style.height || "0") || 0;
    this.lockScroll(() => {
      this.fillWindow(host, list, span.start, span.end, id);
      this.msgStart = span.start;
      this.msgEnd = span.end;
      if (this.pinnedToBottom) {
        this.measurePinnedLater(host, column, list);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        return;
      }
      this.measureHost(host);
      const box = this.spacerBox(list, span.start, span.end);
      this.applySpacers(column, box);
      const next = anchorId ? host.querySelector<HTMLElement>(`[data-mid="${anchorId}"]`) : null;
      if (next) this.messagesEl.scrollTop += next.getBoundingClientRect().top - before;
      else this.messagesEl.scrollTop += box.top - prevTop;
    });
    this.watchMessageLayout();
  },
  appendMessages(parent: HTMLElement, list: RawMessage[], from: number, channelId: string, to = list.length) {
    const ctx = this.renderContext();
    const plugins = this.enabledPlugins();
    const hidden = hiddenIds(this.pack.hiddenAuthors);
    const settings = this.pluginSettings(channelId);
    let lastDay = "";
    let previous: { authorId: string; timestamp: string; kind?: string } | undefined;
    if (from > 0) {
      const prior = list[from - 1];
      lastDay = new Date(prior.timestamp).toDateString();
      previous = { authorId: prior.authorId, timestamp: prior.timestamp, kind: prior.kind };
    }
    for (let index = from; index < to; index += 1) {
      const message = list[index];
      if (this.blockedIds.has(message.authorId) && !this.hookOn("hideBlocked")) {
        const blocked = renderBlockedMessage();
        blocked.dataset.mid = message.id;
        parent.append(blocked);
        lastDay = new Date(message.timestamp).toDateString();
        previous = { authorId: message.authorId, timestamp: message.timestamp, kind: message.kind };
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
      const day = new Date(message.timestamp).toDateString();
      const grouped = shouldGroup(previous, message, day === lastDay);
      const node = renderMessage(shown, {
        density: this.config.appearance.density,
        grouped,
        showDay: day !== lastDay,
        divider: this.divider[channelId] === message.id,
        remoteEmoji: !this.demo,
        mine: view.authorId === this.meId(),
        jumped: this.jumpId === message.id,
        onReply: () => {
          this.reply = message;
          this.editing = null;
          this.composer.focus();
          this.paintComposer();
        },
        onJump: () => {
          if (message.reply) void this.jumpToMessage(message.channelId, message.reply.id);
        },
        onEdit: () => this.beginEdit(message),
        onDelete: () => {
          this.pendingDelete = message;
          this.paintComposer();
        },
        onPin: () => void this.pinMessage(message),
        onThread: () => {
          if (!message.thread) return;
          this.ensureThreadChannel(message.thread);
          void this.openChannel(message.thread.id);
        },
        onReact: (emoji, emojiId) => {
          if (emoji === "picker") {
            this.pickerFor = this.pickerFor === message.id ? null : message.id;
            this.emojiQuery = "";
            if (this.pickerFor) void this.ensureEmojis();
            this.msgSig = "";
            this.paintMessages();
            return;
          }
          this.toggleReaction(message, emoji, emojiId);
        },
        onImage: (url) => this.openImage(url),
        ...this.messageChrome(message, shown),
        ...this.messageExtras(message),
        clock: this.timeClock(),
        seen: this.messageSeen(channelId, message.id),
      });
      if (this.pickerFor === message.id) node.append(this.emojiPicker((emoji, emojiId) => this.toggleReaction(message, emoji, emojiId)));
      node.dataset.mid = message.id;
      this.bindMessageMenu(node, message);
      if (this.hookOn("userWhois")) this.watchMessageWhois(node, message);
      if (this.hookOn("emoteClone")) this.watchEmoteClone(node);
      if (this.hookOn("imageSearch")) this.watchImageSearch(node);
      this.markJumbo(node, shown.raw);
      parent.append(node);
      lastDay = day;
      previous = { authorId: message.authorId, timestamp: message.timestamp, kind: message.kind };
    }
  },
  paintTyping() {
    const id = this.channelId;
    const now = Date.now();
    const names = id === CRIT && this.demo
      ? ["Jonah Adler"]
      : this.typingNames.filter((item) => item.channelId === id && item.until > now).map((item) => item.name);
    const text = typingLine(names);
    if (this.typingEl.textContent !== text) this.typingEl.textContent = text;
    const nextClass = names.length ? "typing dots" : "typing";
    if (this.typingEl.className !== nextClass) this.typingEl.className = nextClass;
    if (this.hookOn("typingList")) this.paintChannels();
  },
  listTyping(channel: Channel, dm: boolean): { label: string; title: string } | null {
    if (!this.hookOn("typingList")) return null;
    if (dm ? !this.pack.typingDms : !this.pack.typingChannels) return null;
    return typingLabel(this.typingNames, channel.id, Date.now());
  },
  paintMessages() {
    try {
      this.paintMessageList();
    } catch (error) {
      reportCrash(error);
    }
    threadsNow()?.mountChannelPolls(this.messagesEl);
  },
  paintMessageList() {
    if (this.holdShell) return;
    if (this.boardActive()) {
      this.messagesEl.hidden = true;
      this.paintTyping();
      this.refreshBoard("all");
      return;
    }
    this.boardHost.hidden = true;
    this.boardSession?.pause();
    if (this.messagesEl.hidden) this.messagesEl.hidden = false;
    if (this.clipsOpen) {
      this.paintClipLibrary();
      return;
    }
    if (this.friendsOpen && !this.guildId) {
      if (this.dashboardOpen && !this.clipsOpen) {
        if (this.friendTick) {
          window.clearTimeout(this.friendTick);
          this.friendTick = 0;
        }
        this.paintDashboard(this.messagesEl, false);
        return;
      }
      this.paintFriends();
      return;
    }
    this.paintTyping();
    const id = this.channelId;
    let list = id ? this.pages[id] ?? [] : [];
    if (id && list.length) list = this.windowMessages(id, list);
    if (id && this.hookOn("messageLog") && this.pack.logDeleted) list = overlayDeletes(list, this.pack.messageLog, id);
    const receiptCursor = this.channelId ? this.pack.seenCursors[this.channelId] ?? "" : "";
    const pluginStamp = `${this.pack.bookmarks.length}:${this.reminders.length}:${this.streamerOn() ? 1 : 0}:${this.streamerSafeOn() ? 1 : 0}:${this.blockedIds.size}:${this.pack.privacy.spoilerDefault}:${this.channelId ? this.pack.privacy.spoilerChannels[this.channelId] ?? "" : ""}:${this.pack.hiddenAuthors.length}:${Object.keys(this.translated).length}:${this.relativeClock() ? Math.floor(this.clock / 30_000) : 0}:${this.pack.mediaCompact}:${this.pack.mediaPreviews}:${this.pack.timeMode}:${this.pack.timeHours}:${this.pack.voiceDownloadScope}:${this.pack.originalImageAction}:${this.config.plugins.enabled.join(",")}:${this.logStamp()}:${receiptCursor}:${this.pack.showReceipts ? 1 : 0}:${this.pack.wordMin}`;
    const shownError = this.error && !list.length ? this.error : "";
    const threadSig = id ? this.threadsFor(id).map((thread) => thread.id).join(",") : "";
    const structural = `${id}|${this.loading}|${shownError}|${this.pickerFor}|${this.jumpId}|${threadSig}|${this.config.appearance.density}|${pluginStamp}`;
    const body = this.messageBody(list);
    const sig = `${structural}|${body}`;
    if (sig === this.msgSig && this.messagesEl.childElementCount > 0) {
      if (this.scroll === "bottom") {
        this.lockScroll(() => {
          this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
        this.pinnedToBottom = true;
      }
      this.scroll = "none";
      this.noteLocalReceipts();
      return;
    }
    const intent = this.scroll;
    this.scroll = "none";
    const metrics = this.captureScroll();
    const column = this.messagesEl.querySelector(":scope > .message-column");
    const previousBody = this.msgSig && list.length > 1 ? this.messageBody(list.slice(0, -1)) : "";
    const plan = messageListPlan(this.msgSig, structural, previousBody, column instanceof HTMLElement);
    const host = column?.querySelector(":scope > .virtual-host");
    if (plan === "append" && column instanceof HTMLElement && host instanceof HTMLElement && id && list.length) {
      this.noteMessagePaint("append");
      this.lockScroll(() => {
        const span = this.messageSpan(list, metrics.top, intent === "bottom" || metrics.near);
        const pinnedTail = intent === "bottom" || metrics.near;
        const moved = span.start !== this.msgStart || span.end !== this.msgEnd;
        if (moved) {
          this.fillWindow(host, list, span.start, span.end, id);
          this.msgStart = span.start;
          this.msgEnd = span.end;
        }
        if (!pinnedTail && moved) this.measureHost(host);
        this.applySpacers(column, this.spacerBox(list, this.msgStart, this.msgEnd));
        if (pinnedTail && moved) this.measurePinnedLater(host, column, list);
        this.placeScroll(metrics, intent);
      });
      this.watchMessageLayout();
      this.msgSig = sig;
      this.noteLocalReceipts();
      return;
    }
    if (plan === "append" && column instanceof HTMLElement && id && list.length && list.length <= VIRTUAL_MIN) {
      this.noteMessagePaint("append");
      this.lockScroll(() => {
        this.appendMessages(column, list, list.length - 1, id);
        this.placeScroll(metrics, intent);
      });
      this.watchMessageLayout();
      this.msgSig = sig;
      this.noteLocalReceipts();
      return;
    }
    this.noteMessagePaint("replace");
    const reading = intent === "preserve" ? this.readingLine() : null;
    this.lockScroll(() => {
      clear(this.messagesEl);
      if (this.loading && !list.length) {
        const skeleton = el("div", "skeleton-wrap");
        for (let i = 0; i < 6; i += 1) skeleton.append(el("div", "skeleton"));
        this.messagesEl.append(skeleton);
      } else if (shownError) {
        const block = el("div", "error-state");
        block.append(el("h2", "", "Couldn't load messages"), el("p", "", shownError));
        const retry = el("button", "primary", "Retry");
        retry.type = "button";
        retry.addEventListener("click", () => {
          if (id) {
            delete this.pages[id];
            void this.openChannel(id);
          }
        });
        block.append(retry);
        this.messagesEl.append(block);
      } else if (!list.length) {
        const board = id ? this.forumBoard(id) : null;
        if (board) this.messagesEl.append(board);
        const name = this.currentChannel()?.name ?? "this channel";
        this.messagesEl.append(el("div", "empty", board ? "Open a post, or start one from Discord." : `#${name} is quiet. The composer is below when you have something to say.`));
      } else if (id) {
        const board = this.forumBoard(id);
        if (board) this.messagesEl.append(board);
        const pinned = intent === "bottom" || (intent !== "preserve" && metrics.near);
        const rough = this.messageSpan(list, 0, false);
        const added = intent === "preserve" ? Math.max(0, rough.total - metrics.height) : 0;
        const span = this.messageSpan(list, metrics.top + added, pinned);
        const virtual = list.length > VIRTUAL_MIN;
        const next = el("div", virtual ? "message-column is-virtual" : "message-column");
        if (!virtual) {
          this.appendMessages(next, list, 0, id);
          this.msgStart = 0;
          this.msgEnd = list.length;
          this.messagesEl.append(next);
        } else {
          const top = el("div", "virtual-spacer");
          const body = el("div", "virtual-host");
          const bottom = el("div", "virtual-spacer");
          top.style.height = `${span.top}px`;
          bottom.style.height = `${span.bottom}px`;
          this.appendMessages(body, list, span.start, id, span.end);
          next.append(top, body, bottom);
          this.messagesEl.append(next);
          this.msgStart = span.start;
          this.msgEnd = span.end;
          if (pinned) this.measurePinnedLater(body, next, list);
          else {
            this.measureHost(body);
            const box = this.spacerBox(list, span.start, span.end);
            top.style.height = `${box.top}px`;
            bottom.style.height = `${box.bottom}px`;
          }
        }
      }
      this.placeScroll(metrics, intent);
      if (intent === "bottom" || (intent !== "preserve" && metrics.near)) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      } else {
        this.holdReadingLine(reading);
      }
    });
    this.watchMessageLayout();
    this.msgSig = sig;
    this.noteLocalReceipts();
  },
});
