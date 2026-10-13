import { history, pins as demoPins } from "../demo/data";
import { atOrBefore, noteSeen } from "../pack/receipts";
import { digestRows } from "../pack/digest";
import { replyChain } from "../pack/chain";
import { connectionLabel, connectionLines } from "../pack/connections";
import { setLocalNick } from "../pack/nicks";
import type { LocalSearchClient } from "../local-search-client";
import type { Channel, RawMessage } from "../types";
import { clear, el } from "./dom";
import { filterLoadedMessages, hasSearchCriteria, parseSearchQuery, resolveSearch } from "./composer-tools";
import { remoteSearchCall, searchNote, searchPlace, searchPlaceholder, searchUsers } from "../home-search";
import type { WireProfile } from "./profile";
import { isTauri, invoke, normalizeMessage } from "./app-shared";
import { defineMethods } from "./app-shared";

export const searchMethods = defineMethods({
  channelById(id: string): Channel | undefined {
    const dm = this.dmChannels().find((channel) => channel.id === id);
    if (dm) return dm;
    for (const guild of this.guilds()) {
      const found = this.channelsOf(guild.id).find((channel) => channel.id === id);
      if (found) return found;
    }
    return undefined;
  },
  localClient(): Promise<LocalSearchClient> {
    if (!this.localClientPromise) {
      this.localClientPromise = import("../local-search-client").then((mod) => mod.startLocalSearch());
    }
    return this.localClientPromise;
  },
  localOp(task: () => Promise<void>): void {
    this.localOps = this.localOps.then(task).catch(() => undefined);
  },
  reindexLoaded() {
    if (this.bench) return;
    for (const id of Object.keys(this.pages)) this.queueLocalIndex(id);
  },
  queueLocalIndex(channelId: string) {
    if (this.bench || !channelId) return;
    const list = this.pages[channelId];
    if (!list?.length) return;
    this.localPending.set(channelId, list.slice());
    this.armLocalFlush();
  },
  armLocalFlush() {
    if (this.localFlushQueued) return;
    this.localFlushQueued = true;
    const run = () => {
      this.localFlushQueued = false;
      this.localOp(() => this.flushLocalIndex());
    };
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") idle(() => run(), { timeout: 700 });
    else window.setTimeout(run, 200);
  },
  async flushLocalIndex(): Promise<void> {
    const pending = [...this.localPending.entries()];
    this.localPending.clear();
    if (!pending.length) return;
    const { localDocFromMessage } = await import("../local-search");
    const docs = [];
    for (const [, messages] of pending) {
      for (const message of messages) {
        const doc = localDocFromMessage({ ...message, mentionUsers: this.mentionNames(message) }, this.placeFor(message.channelId));
        if (!doc || this.localTombstones.has(doc.key)) continue;
        docs.push(doc);
      }
    }
    if (docs.length) (await this.localClient()).upsert(docs);
    if (this.localPending.size) this.armLocalFlush();
  },
  forgetLocalMessage(channelId: string, messageId: string, nonce?: string | null) {
    if (this.bench || !channelId || !messageId) return;
    this.localOp(async () => {
      const { docKey, localKeys } = await import("../local-search");
      const keys = localKeys(channelId, messageId, nonce);
      for (const key of keys) this.localTombstones.add(key);
      const queued = this.localPending.get(channelId);
      if (queued) {
        this.localPending.set(channelId, queued.filter((message) => !keys.includes(docKey(message.channelId || channelId, message.id, message.nonce))));
      }
      (await this.localClient()).remove(keys);
    });
  },
  mentionNames(message: RawMessage): { id: string; name: string }[] {
    const names = new Map<string, string>();
    for (const mention of message.mentionUsers ?? []) {
      if (mention.id && mention.name && mention.name !== "someone") names.set(mention.id, mention.name);
    }
    for (const id of message.mentionIds ?? []) {
      if (names.has(id)) continue;
      const name = this.userNames[id];
      if (name) names.set(id, name);
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  },
  placeFor(channelId: string): { guildId: string; guildName: string; channelName: string } {
    const channel = this.channelById(channelId);
    const guildId = this.guildForChannel(channelId) ?? "";
    const guildName = guildId
      ? (this.guilds().find((guild) => guild.id === guildId)?.name ?? "")
      : channel?.kind === "group" ? "Group DM" : "Direct messages";
    return { guildId, guildName, channelName: channel?.name ?? "" };
  },
  openLocalSearch() {
    this.searchOpen = false;
    this.paintSearch();
    this.closeSwitcher();
    this.localSearchPanel?.destroy();
    this.localSearchPanel = null;
    const seq = ++this.localSearchSeq;
    this.localSearchOpen = true;
    void import("./local-search-view").then(({ openLocalSearchPanel }) => {
      if (seq !== this.localSearchSeq || !this.localSearchOpen) return;
      this.localSearchPanel = openLocalSearchPanel(this.root, {
        query: (query) => this.localClient().then((client) => client.query(query)),
        present: (hit) => this.localHitText(hit),
        jump: (channelId, messageId) => {
          this.closeLocalSearch();
          void this.jumpToMessage(channelId, messageId);
        },
        close: () => this.closeLocalSearch(),
      });
    });
  },
  closeLocalSearch() {
    this.localSearchOpen = false;
    this.localSearchSeq += 1;
    this.localSearchPanel?.destroy();
    this.localSearchPanel = null;
  },
  localHitText(hit: { channelId: string; guildId: string; authorName: string; channelName: string; guildName: string; preview: string }): { author: string; where: string; preview: string } {
    const channel = this.channelById(hit.channelId);
    const direct = !hit.guildId || channel?.kind === "dm" || channel?.kind === "group";
    if (direct && this.hideDirect()) return { author: "Someone", where: "Direct message", preview: "Message hidden" };
    const place = this.placeFor(hit.channelId);
    const guild = place.guildName || hit.guildName || "Server";
    const name = place.channelName || hit.channelName;
    const where = (place.guildId || hit.guildId) ? `${guild} · #${name || "channel"}` : `${guild} · ${name || "conversation"}`;
    return { author: this.maskText(hit.authorName), where: this.maskText(where), preview: this.maskText(hit.preview) };
  },
  paintSearch() {
    let overlay = document.getElementById("lark-search");
    if (!this.searchOpen) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = el("div", "overlay");
      overlay.id = "lark-search";
      this.root.append(overlay);
    }
    clear(overlay);
    const card = el("div", "switcher-card");
    const input = el("input");
    input.placeholder = searchPlaceholder(searchPlace(this.guildId, this.channelId));
    input.setAttribute("aria-label", "Search messages");
    const results = el("div", "switcher-results");
    let timer = 0;
    const show = (hits: RawMessage[], note: string) => {
      clear(results);
      if (!hits.length) results.append(el("div", "empty", note || "No matches."));
      else if (note) results.append(el("div", "hint", note));
      for (const hit of hits) {
        const button = el("button", "switcher-hit");
        button.type = "button";
        button.append(el("strong", "", this.maskText(hit.authorName)), el("span", "faint", this.previewLine(hit, 120)));
        button.addEventListener("click", () => {
          this.searchOpen = false;
          this.paintSearch();
          void this.jumpToMessage(hit.channelId, hit.id);
        });
        results.append(button);
      }
    };
    const render = () => {
      const query = input.value.trim();
      const place = searchPlace(this.guildId, this.channelId);
      input.placeholder = searchPlaceholder(place);
      const ctx = this.searchDirectory();
      const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
      const local = this.localSearch(query);
      const criteria = hasSearchCriteria(resolved);
      const note = (phase: "local" | "remote" | "fallback") => searchNote({
        place,
        query,
        hasCriteria: criteria,
        unresolved: resolved.unresolved,
        phase,
      });
      show(local, note("local"));
      if (!criteria || this.demo) return;
      const call = remoteSearchCall(this.guildId, this.channelId);
      window.clearTimeout(timer);
      const token = ++this.searchToken;
      timer = window.setTimeout(() => {
        void invoke<RawMessage[]>("search_filtered", {
          guildId: call.guildId,
          channelId: call.channelId,
          search: {
            content: resolved.content,
            authorIds: resolved.authorIds,
            mentionIds: resolved.mentionIds,
            has: resolved.has,
            beforeId: resolved.beforeId,
            afterId: resolved.afterId,
            channelIds: resolved.channelIds,
            pinned: resolved.pinned,
          },
        }).then((messages) => {
          if (token !== this.searchToken || !this.searchOpen) return;
          const hits = messages.map(normalizeMessage);
          for (const message of hits) this.absorbMessage(message);
          show(hits, note("remote"));
        }).catch(() => {
          if (token === this.searchToken) show(local, note("fallback"));
        });
      }, 280);
    };
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 48);
    });
    const loaded = el("div", "local-search-jump");
    const loadedButton = el("button", "text-button", "Search loaded messages");
    loadedButton.type = "button";
    loadedButton.title = "Messages already on this device, across servers";
    loadedButton.addEventListener("click", () => this.openLocalSearch());
    loaded.append(loadedButton);
    card.append(input, loaded, results);
    overlay.append(card);
    overlay.onclick = (event) => {
      if (event.target === overlay) {
        this.searchOpen = false;
        this.paintSearch();
      }
    };
    render();
    input.focus();
  },
  searchDirectory() {
    const ctx = this.renderContext();
    return { ...ctx, users: searchUsers(ctx.users, this.friends) };
  },
  localSearch(query: string): RawMessage[] {
    const ctx = this.searchDirectory();
    const resolved = resolveSearch(parseSearchQuery(query), { users: ctx.users, channels: ctx.channels, meId: this.meId() });
    if (!hasSearchCriteria(resolved)) return [];
    const pools = this.demo ? Object.values(history).flat() : Object.values(this.pages).flat();
    return filterLoadedMessages(pools, resolved);
  },
  paintNickBanner() {
    const target = this.nickTarget;
    if (!target) return;
    this.composerBanner.hidden = false;
    const field = el("input");
    field.value = this.pack.localNicks[target.id] ?? "";
    field.placeholder = "Nickname";
    field.maxLength = 32;
    field.setAttribute("aria-label", `Local nickname for ${target.name}`);
    const save = el("button", "primary", "Save");
    save.type = "button";
    save.addEventListener("click", () => {
      this.pack.localNicks = setLocalNick(this.pack.localNicks, target.id, field.value);
      this.savePack();
      this.nickTarget = null;
      this.msgSig = "";
      this.paint();
    });
    const clearNick = el("button", "ghost", "Clear");
    clearNick.type = "button";
    clearNick.addEventListener("click", () => {
      this.pack.localNicks = setLocalNick(this.pack.localNicks, target.id, "");
      this.savePack();
      this.nickTarget = null;
      this.msgSig = "";
      this.paint();
    });
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      this.nickTarget = null;
      this.paintComposer();
    });
    this.composerBanner.append(el("span", "", `Nickname for ${this.maskText(target.name)}`), field, save, clearNick, cancel);
  },
  openReplyChain(message: RawMessage) {
    const loaded = (this.pages[message.channelId] ?? []).map((item) => ({
      id: item.id,
      authorName: item.authorName,
      content: item.content,
      replyId: item.reply?.id ?? null,
    }));
    const chain = replyChain(loaded, message.id);
    let panel = document.getElementById("lark-chain");
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-chain";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Reply chain"));
    if (!chain.steps.length) panel.append(el("p", "empty", "That message isn't loaded."));
    for (const step of chain.steps) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      button.append(el("strong", "", this.maskText(step.authorName)), el("span", "", this.maskText(step.preview)));
      button.addEventListener("click", () => {
        panel?.remove();
        void this.jumpToMessage(message.channelId, step.id);
      });
      panel.append(button);
    }
    const note = chain.stopped === "missing"
      ? "An earlier message isn't loaded. Lark did not fetch it."
      : chain.stopped === "cap"
        ? "Showing the newest 12. Lark did not fetch older ones."
        : chain.stopped === "loop"
          ? "The chain repeats, so it stops."
          : "Built from messages already loaded.";
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => panel?.remove());
    panel.append(el("p", "hint", note), close);
  },
  async openConnections(message: RawMessage) {
    const cached = this.connectionCache.get(message.authorId);
    const fresh = cached && Date.now() - cached.at < 5 * 60_000 ? cached.lines : null;
    let lines = fresh;
    if (!lines && !this.demo && isTauri()) {
      try {
        const profile = await invoke<WireProfile>("fetch_profile", { userId: message.authorId, guildId: this.guildId ?? "" });
        lines = connectionLines(profile?.widgets);
        this.connectionCache.set(message.authorId, { lines, at: Date.now() });
      } catch {
        this.toast("Connections", "Couldn't load that profile.");
        return;
      }
    }
    lines = lines ?? [];
    let card = document.getElementById("lark-connections");
    if (!card) {
      card = el("aside", "pins");
      card.id = "lark-connections";
      this.stage.append(card);
    }
    clear(card);
    card.append(el("h2", "", "Connections"));
    if (!lines.length) card.append(el("p", "empty", "No linked accounts on that profile."));
    for (const line of lines) card.append(el("p", "", this.maskText(connectionLabel(line))));
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => card?.remove());
    card.append(el("p", "hint", "One profile, because you asked. Nobody else is looked up."), close);
  },
  messageSeen(channelId: string, messageId: string): boolean {
    if (!this.hookOn("readReceipts") || !this.pack.showReceipts) return false;
    return atOrBefore(this.pack.seenCursors[channelId] ?? "", messageId);
  },
  newestVisibleId(): string {
    const view = this.messagesEl.getBoundingClientRect();
    let newest = "";
    for (const wrap of this.messagesEl.querySelectorAll<HTMLElement>(".message-wrap")) {
      const id = wrap.dataset.mid ?? "";
      if (!id) continue;
      const box = wrap.getBoundingClientRect();
      if (box.bottom < view.top || box.top > view.bottom) continue;
      newest = noteSeen({ here: newest }, "here", id).here ?? newest;
    }
    return newest;
  },
  noteLocalReceipts() {
    if (!this.hookOn("readReceipts") || !this.channelId || this.scrollLock > 0 || this.receiptNote) return;
    const newest = this.newestVisibleId();
    if (!newest) return;
    const next = noteSeen(this.pack.seenCursors, this.channelId, newest);
    if ((next[this.channelId] ?? "") === (this.pack.seenCursors[this.channelId] ?? "")) return;
    this.pack.seenCursors = next;
    this.savePack();
    this.msgSig = "";
    this.receiptNote = true;
    queueMicrotask(() => {
      this.receiptNote = false;
      this.paintMessages();
    });
  },
  mentionDigestRows() {
    const rows: { channelId: string; name: string; where: string; mentions: number; kind: string }[] = [];
    for (const guild of this.guilds()) {
      for (const channel of this.channelsOf(guild.id)) {
        rows.push({
          channelId: channel.id,
          name: channel.name,
          where: guild.name,
          mentions: this.mentions[channel.id] ?? channel.mentions ?? 0,
          kind: channel.kind,
        });
      }
    }
    for (const channel of this.dms()) {
      rows.push({
        channelId: channel.id,
        name: channel.name,
        where: "Direct messages",
        mentions: this.mentions[channel.id] ?? channel.mentions ?? 0,
        kind: channel.kind,
      });
    }
    return digestRows(rows, this.pack.digestDms);
  },
  paintDigest() {
    let panel = document.getElementById("lark-digest");
    if (!this.digestOpen || !this.hookOn("mentionDigest")) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-digest";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Mentions"));
    const rows = this.mentionDigestRows();
    if (!rows.length) panel.append(el("p", "empty", "No mentions waiting."));
    for (const row of rows) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      const where = row.where ? `${row.where} · ` : "";
      button.append(el("strong", "", this.maskText(row.name)), el("span", "", `${where}${row.mentions} mention${row.mentions === 1 ? "" : "s"}`));
      button.addEventListener("click", () => {
        this.digestOpen = false;
        this.paintDigest();
        void this.openChannel(row.channelId);
      });
      panel.append(button);
    }
    panel.append(el("p", "hint", "Counts already on this device. Nothing is fetched."));
  },
  paintPins() {
    let panel = document.getElementById("lark-pins");
    if (!this.pinsOpen || !this.channelId) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = el("aside", "pins");
      panel.id = "lark-pins";
      this.stage.append(panel);
    }
    clear(panel);
    panel.append(el("h2", "", "Pins"));
    const channelId = this.channelId;
    const ids = this.demo ? demoPins[channelId] ?? [] : [];
    const cached = this.demo
      ? (this.pages[channelId] ?? history[channelId] ?? []).filter((message) => ids.includes(message.id))
      : this.pinCache[channelId] ?? [];
    const loaded = this.demo || channelId in this.pinCache;
    if (!cached.length) panel.append(el("p", "empty", loaded ? "Nothing pinned in this channel." : "Loading pins…"));
    for (const message of cached) panel.append(this.pinRow(message));
    if (!this.demo && !loaded) {
      void invoke<RawMessage[]>("fetch_pins", { channelId }).then((messages) => {
        if (this.channelId !== channelId || !this.pinsOpen) return;
        this.pinCache[channelId] = messages.map(normalizeMessage);
        for (const message of this.pinCache[channelId]) this.absorbMessage(message);
        this.paintPins();
      }).catch(() => {
        if (!panel || this.channelId !== channelId) return;
        const empty = panel.querySelector(".empty");
        if (empty) empty.textContent = "Couldn't load pins.";
      });
    }
  },
});
