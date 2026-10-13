import { frecency, EMOJI } from "../emoji";
import { applyMention, mentionHits, mentionQuery, plainPreview } from "../mentions";
import { inQuietHours } from "../smart-notify";
import { allowKeywordNotify, firstHit, shouldKeywordNotify, wordsFor } from "../pack/keywords";
import { orderDms } from "../pack/pin-dms";
import { patternHit, patternsFor, shouldPatternNotify } from "../pack/patterns";
import { renderEmojiPicker } from "./emoji-picker";
import type { NotifyLevel, RawMessage } from "../types";
import { floatPinned } from "../social";
import { clear, el } from "./dom";
import { invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const emojiMethods = defineMethods({
  async ensureEmojis() {
    const guildId = this.guildId;
    if (!guildId || this.demo || this.guildEmojis[guildId]) return;
    this.guildEmojis[guildId] = [];
    try {
      const list = await invoke<{ id: string; name: string; animated: boolean }[]>("fetch_emojis", { guildId });
      this.guildEmojis[guildId] = list;
      this.msgSig = "";
      if (this.pickerFor === "composer") this.paintComposer();
      else if (this.pickerFor) this.paintMessages();
    } catch {
      /* Unicode reactions still work when the emoji list is refused. */
    }
  },
  emojiPicker(onPick: (emoji: string, emojiId?: string | null, animated?: boolean, name?: string) => void): HTMLElement {
    return renderEmojiPicker({
      query: this.emojiQuery,
      unicode: EMOJI,
      recent: frecency(this.emojiUses, Date.now()).map((item) => item.emoji).filter((emoji) => !emoji.includes(":")),
      server: (this.guildId ? this.guildEmojis[this.guildId] : []) ?? [],
      allowServer: true,
      onQuery: (value) => {
        this.emojiQuery = value;
      },
      onPick,
    });
  },
  statusEmojiSource() {
    return {
      recent: frecency(this.emojiUses, Date.now()).map((item) => item.emoji).filter((emoji) => !emoji.includes(":")),
      server: (this.guildId ? this.guildEmojis[this.guildId] : []) ?? [],
      allowServer: this.premiumType > 0,
    };
  },
  insertEmoji(emoji: string, emojiId?: string | null, animated?: boolean, name?: string) {
    const token = emojiId ? `<${animated ? "a" : ""}:${name ?? emoji}:${emojiId}>` : emoji;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, caret, caret, token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.pickerFor = null;
    this.composer.focus();
    this.paintComposer();
  },
  refreshSuggest() {
    if (!this.suggestEl || !this.composer) return;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const query = mentionQuery(this.composer.value, caret);
    if (!query) {
      this.closeSuggest();
      return;
    }
    const key = `${query.kind}:${query.query}:${query.start}`;
    if (key !== this.suggestKey) {
      this.suggestKey = key;
      this.suggestIndex = 0;
    }
    this.suggestStart = query.start;
    this.suggest = mentionHits(query, this.renderContext());
    this.suggestEl.hidden = this.suggest.length === 0;
    clear(this.suggestEl);
    this.suggest.forEach((hit, index) => {
      const button = el("button", index === this.suggestIndex ? "is-active" : "");
      button.type = "button";
      button.append(el("span", "", hit.label), el("span", "faint", hit.hint));
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.suggestIndex = index;
        this.commitSuggest();
      });
      this.suggestEl.append(button);
    });
  },
  commitSuggest() {
    const hit = this.suggest[this.suggestIndex];
    if (!hit) return;
    const caret = this.composer.selectionStart ?? this.composer.value.length;
    const next = applyMention(this.composer.value, this.suggestStart, caret, hit.token);
    this.composer.value = next.text;
    this.composer.setSelectionRange(next.caret, next.caret);
    this.closeSuggest();
    this.composer.focus();
  },
  closeSuggest() {
    this.suggest = [];
    this.suggestKey = "";
    if (!this.suggestEl) return;
    this.suggestEl.hidden = true;
    clear(this.suggestEl);
  },
  async pinMessage(message: RawMessage) {
    const unpin = Boolean(message.pinned);
    if (this.demo) {
      this.toast(unpin ? "Unpinned" : "Pinned", "Demo pins stay in the sample data.");
      return;
    }
    try {
      await invoke(unpin ? "unpin_message" : "pin_message", { channelId: message.channelId, messageId: message.id });
      message.pinned = !unpin;
      const stored = (this.pages[message.channelId] ?? []).find((item) => item.id === message.id);
      if (stored) stored.pinned = message.pinned;
      delete this.pinCache[message.channelId];
      this.msgSig = "";
      this.toast(unpin ? "Unpinned" : "Pinned", unpin ? "Message unpinned." : "Message pinned.");
      if (this.pinsOpen) this.paintPins();
      this.paintMessages();
    } catch (err) {
      this.toast(unpin ? "Couldn't unpin" : "Couldn't pin", err instanceof Error ? err.message : "Discord refused the pin.");
    }
  },
  considerKeyword(message: RawMessage, level: NotifyLevel, mentionsMe: boolean, alreadyNotified: boolean) {
    if (!this.hookOn("keywords")) return;
    if (inQuietHours(this.config.notifications.quiet, new Date())) return;
    const words = wordsFor(this.pack.keywordGlobal, this.pack.keywordChannels, message.channelId);
    const hit = firstHit(message.content, words);
    if (!shouldKeywordNotify({
      level,
      mentionsMe,
      fromMe: message.authorId === this.meId(),
      windowFocused: this.focused,
      sameChannel: message.channelId === this.channelId,
      hit: Boolean(hit),
      alreadyNotified,
    })) return;
    const gate = allowKeywordNotify(`${message.channelId}:${hit}`, Date.now(), this.keywordLast);
    this.keywordLast = gate.last;
    if (!gate.ok || !hit) return;
    void this.notify(this.maskText(message.authorName), this.maskText(plainPreview(message.content, this.renderContext()) || hit));
  },
  considerPattern(message: RawMessage, level: NotifyLevel, alreadyNotified: boolean) {
    if (!this.hookOn("patternNotify") || !this.pack.highlightNotify) return;
    if (inQuietHours(this.config.notifications.quiet, new Date())) return;
    const guildId = message.guildId || this.guildForChannel(message.channelId) || "";
    const hit = patternHit(message.content, patternsFor(this.pack.highlightPatterns, this.pack.highlightGuilds, guildId));
    if (!shouldPatternNotify({
      notify: true,
      muted: level === "mute",
      fromMe: message.authorId === this.meId(),
      windowFocused: this.focused,
      sameChannel: message.channelId === this.channelId,
      hit: Boolean(hit),
      alreadyNotified,
    })) return;
    const gate = allowKeywordNotify(`pattern:${message.channelId}:${hit}`, Date.now(), this.keywordLast);
    this.keywordLast = gate.last;
    if (!gate.ok || !hit) return;
    void this.notify(this.maskText(message.authorName), this.maskText(plainPreview(message.content, this.renderContext()) || hit));
  },
  paintDirectMessages(scroll: HTMLElement) {
    this.ensureDmPins();
    const dms = [...this.dms()].sort((a, b) => a.position - b.position).filter((channel) => !this.closedDms.has(channel.id));
    if (!this.hookOn("pinDms")) {
      scroll.append(el("div", "category", "Direct messages"));
      if (!dms.length) scroll.append(el("p", "empty", "No direct messages yet."));
      for (const dm of floatPinned(dms, this.dmPins)) scroll.append(this.channelButton(dm, true));
      return;
    }
    if (!dms.length) {
      scroll.append(el("div", "category", "Direct messages"));
      scroll.append(el("p", "empty", "No direct messages yet."));
      return;
    }
    const split = orderDms(dms, [...this.dmPins]);
    if (split.pinned.length) {
      scroll.append(el("div", "category", "Pinned"));
      for (const dm of split.pinned) scroll.append(this.channelButton(dm, true));
    }
    if (split.rest.length) {
      scroll.append(el("div", "category", "Direct messages"));
      for (const dm of split.rest) scroll.append(this.channelButton(dm, true));
    }
  },
});
