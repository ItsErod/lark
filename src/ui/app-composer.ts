import { outgoingNonce, sameReaction } from "../chat";
import { composedError, spoilerUploadName } from "../compose";
import { history, channels as demoChannels } from "../demo/data";
import { bindEmojiLoader, expandShortcodes, rememberEmoji, setCustomEmojis } from "../emoji";
import { plainPreview } from "../mentions";
import { inviteCode } from "../shell";
import { composerCount } from "../pack/words";
import { commandCatalog, matchCommands } from "../palette";
import {
  uploadLimitBytes
} from "../clips";
import { fuzzyScore } from "../search";
import { formatShortcut } from "../shortcuts";
import type { RawMessage } from "../types";
import { clear, el } from "./dom";
import {
  APP_DIRECTORY_URL,
  NITRO_URL, armStickers,
  bindGifLoader,
  bindSlashLoader,
  bindSlashRunner,
  clearForward,
  clearStickers,
  commandsFromPayload,
  composerPanel,
  ensureMessagingStyles, gifChoice,
  gifHitsNow,
  gifQueryText,
  gifsFromPayload, interactionBody, noteGifFocus,
  openDiscordPage, peekForward,
  peekStickers, renderComposerAccessories,
  renderForwardPicker,
  renderGifPicker,
  renderStickerPicker,
  requestCreatePoll,
  requestCreateThread,
  requestLaunchActivity, scheduleGifLoad,
  setComposerPanel,
  setGifHits,
  setGifQuery,
  setSlashCommands, stickerHitsNow,
  takeGifFocus
} from "./composer-tools";
import type { LocalFile } from "./app-shared";
import { invoke, normalizeMessage } from "./app-shared";
import { defineMethods } from "./app-shared";

export const composerMethods = defineMethods({
  paintComposer() {
    if (this.holdShell) return;
    const wrap = this.composer.closest(".composer-wrap");
    if (wrap instanceof HTMLElement) wrap.hidden = this.friendsOpen && !this.guildId && !this.clipsOpen;
    const channel = this.currentChannel();
    this.composer.placeholder = this.clipsOpen
      ? "Drop a clip here, or write a message"
      : channel
        ? `Message ${channel.kind === "text" ? "#" : ""}${channel.name}`
        : "Message";
    this.paintClipBanner();
    clear(this.composerBanner);
    this.composerBanner.hidden = true;
    if (this.pendingDelete) {
      this.composerBanner.hidden = false;
      this.composerBanner.append(el("span", "", "Delete this message?"));
      const yes = el("button", "primary", "Delete");
      yes.type = "button";
      yes.addEventListener("click", () => this.removeMessage(this.pendingDelete!));
      const no = el("button", "ghost", "Cancel");
      no.type = "button";
      no.addEventListener("click", () => {
        this.pendingDelete = null;
        this.paintComposer();
      });
      this.composerBanner.append(yes, no);
    } else if (this.editing) {
      this.composerBanner.hidden = false;
      this.composerBanner.append(el("span", "", "Editing your message"));
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.editing = null;
        this.composer.value = "";
        this.paintComposer();
      });
      this.composerBanner.append(cancel);
    } else if (this.reminding) {
      this.paintReminderBanner();
    } else if (this.nickTarget) {
      this.paintNickBanner();
    } else if (this.reply) {
      this.composerBanner.hidden = false;
      const preview = this.maskText(plainPreview(this.reply.content, this.renderContext(), 80));
      const author = this.maskText(this.reply.authorName);
      this.composerBanner.append(el("span", "", preview ? `Replying to ${author}: ${preview}` : `Replying to ${author}`));
      const cancel = el("button", "ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        this.reply = null;
        this.paintComposer();
      });
      this.composerBanner.append(cancel);
    }
    if (!this.pendingDelete && !this.editing && !this.reminding) {
      const liveHere = this.hookOn("liveSchedule") && (this.liveScheduling || (!this.scheduling && this.liveQueue.some((item) => item.channelId === this.channelId)));
      if (liveHere) this.paintLiveScheduleBanner();
      else this.paintScheduleBanner();
    }
    clear(this.composerMeta);
    ensureMessagingStyles();
    const emojiScope = `${this.guildId ?? ""}:${this.channelId ?? ""}`;
    if (this.guildId) setCustomEmojis(this.guildEmojis[this.guildId] ?? []);
    bindEmojiLoader(() => {
      const apply = () => {
        setCustomEmojis(this.guildId ? this.guildEmojis[this.guildId] ?? [] : []);
        this.refreshSuggest();
      };
      if (this.guildId && !this.demo && !this.guildEmojis[this.guildId]) void this.ensureEmojis().then(apply);
      else apply();
    }, emojiScope);
    bindSlashRunner((action) => {
      if (action.op === "gif") {
        setGifQuery(action.query);
        setComposerPanel("gif");
        scheduleGifLoad(action.query);
        this.paintComposer();
        return;
      }
      if (action.op === "send") {
        if (!action.text) return;
        this.composer.value = action.text;
        void this.send();
        return;
      }
      const channelId = this.channelId;
      if (!channelId || this.demo) {
        this.toast("Apps", this.demo ? "Demo mode doesn't run Discord apps." : "Open a channel first.");
        return;
      }
      const body = interactionBody({
        command: action.command,
        channelId,
        guildId: this.guildId,
        args: action.args,
        targetId: action.targetId,
      });
      if (!body) {
        this.composer.value = `/${action.command.name} `;
        this.composer.focus();
        return;
      }
      void invoke("invoke_command", { payload: body }).then(() => {
        this.toast("Apps", `/${action.command.name} sent.`);
      }).catch((err) => {
        this.toast("Apps", err instanceof Error ? err.message : "Discord refused the command.");
      });
    });
    bindSlashLoader((query) => {
      if (this.demo || !this.channelId) {
        setSlashCommands([]);
        return;
      }
      void invoke<unknown>("search_app_commands", {
        guildId: this.guildId,
        channelId: this.channelId,
        query,
        kind: 1,
      }).then((payload) => {
        setSlashCommands(commandsFromPayload(payload));
        this.refreshSuggest();
      }).catch(() => undefined);
    }, emojiScope);
    bindGifLoader((query) => {
      if (this.demo) {
        setGifHits([]);
        return;
      }
      void invoke<unknown>("search_gifs", { query }).then((payload) => {
        setGifHits(gifsFromPayload(payload));
        if (composerPanel() === "gif") this.paintComposer();
      }).catch(() => {
        setGifHits([]);
        if (composerPanel() === "gif") this.paintComposer();
      });
    });
    const tools = el("div", "composer-tools");
    const file = el("input");
    file.type = "file";
    file.multiple = true;
    file.hidden = true;
    file.addEventListener("change", () => {
      void this.takeFiles(file.files);
      file.value = "";
    });
    tools.append(renderComposerAccessories({
      fileInput: file,
      onUpload: () => file.click(),
      onThread: () => {
        if (!this.channelId || !requestCreateThread(this.channelId, null)) this.toast("Create Thread", "Threads aren't available yet.");
      },
      onPoll: () => {
        if (!this.channelId || !requestCreatePoll(this.channelId)) this.toast("Create Poll", "Polls aren't available yet.");
      },
      onAppsLink: () => {
        void openDiscordPage(APP_DIRECTORY_URL).then((ok) => {
          if (!ok) this.toast("Use Apps", "Couldn't open the app directory.");
        });
      },
      onGift: () => {
        void openDiscordPage(NITRO_URL).then((ok) => {
          if (!ok) this.toast("Gift", "Couldn't open Discord Nitro.");
        });
      },
      onGif: () => this.toggleGifPicker(),
      onStickers: () => this.toggleStickerPicker(),
      onEmoji: () => {
        this.pickerFor = this.pickerFor === "composer" ? null : "composer";
        this.emojiQuery = "";
        if (this.pickerFor) void this.ensureEmojis();
        this.paintComposer();
      },
      onActivity: () => {
        if (!requestLaunchActivity(this.channelId)) this.toast("Apps", "Activities open from a voice channel.");
      },
      onRepaint: () => this.paintComposer(),
    }));
    const later = el("button", "text-button", "Later");
    later.type = "button";
    later.setAttribute("aria-label", "Send later");
    later.addEventListener("click", () => {
      this.scheduling = !this.scheduling;
      this.liveScheduling = false;
      this.reminding = null;
      this.paintComposer();
    });
    tools.append(later);
    if (this.hookOn("quickReply")) tools.append(this.repliesButton());
    if (this.hookOn("gameDesk")) tools.append(this.deskButton());
    if (this.hookOn("liveSchedule")) {
      const schedule = el("button", "text-button", "Schedule");
      schedule.type = "button";
      schedule.setAttribute("aria-label", "Schedule message");
      schedule.addEventListener("click", () => {
        this.liveScheduling = !this.liveScheduling;
        this.scheduling = false;
        this.reminding = null;
        this.paintComposer();
      });
      tools.append(schedule);
    }
    for (const item of this.files) {
      const chip = el("span", "file-chip");
      const name = el("button", "text-button", item.name);
      name.type = "button";
      name.addEventListener("click", () => {
        this.files = this.files.filter((candidate) => candidate !== item);
        this.paintComposer();
      });
      const spoiler = el("button", item.spoiler ? "text-button file-spoiler is-on" : "text-button file-spoiler", "Spoiler");
      spoiler.type = "button";
      spoiler.setAttribute("aria-label", item.spoiler ? "Remove spoiler" : "Mark as spoiler");
      spoiler.addEventListener("click", () => {
        item.spoiler = !item.spoiler;
        this.paintComposer();
      });
      chip.append(name, spoiler);
      tools.append(chip);
    }
    this.countEl = el("span", "count", composerCount(this.composer.value, this.hookOn("wordCount")));
    const hint = el("span", "hint", "Enter to send");
    if (this.upload > 0 && this.upload < 100) {
      const bar = el("div", "upload");
      bar.style.width = `${this.upload}%`;
      this.composerMeta.append(bar);
    }
    this.composerMeta.append(tools, hint, this.countEl);
    if (composerPanel() === "gif") {
      this.composerMeta.append(renderGifPicker({
        query: gifQueryText(),
        hits: gifHitsNow(),
        onQuery: (query) => {
          setGifQuery(query);
          noteGifFocus();
          scheduleGifLoad(query);
        },
        onPick: (hit, shift) => {
          const choice = gifChoice(hit.url, shift);
          if (!choice) return;
          if (choice.mode === "insert") {
            const caret = this.composer.selectionStart ?? this.composer.value.length;
            this.composer.value = `${this.composer.value.slice(0, caret)}${choice.text}${this.composer.value.slice(caret)}`;
          } else {
            this.composer.value = choice.text;
          }
          setComposerPanel(null);
          if (choice.mode === "send") void this.send();
          else this.paintComposer();
        },
      }));
      if (takeGifFocus()) {
        const field = this.composerMeta.querySelector(".gif-picker input");
        if (field instanceof HTMLInputElement) field.focus();
      }
    }
    if (composerPanel() === "stickers") {
      this.composerMeta.append(renderStickerPicker({
        hits: stickerHitsNow(),
        onPick: (id) => {
          if (this.editing) {
            this.toast("Stickers", "Finish editing before sending a sticker.");
            return;
          }
          armStickers([id]);
          setComposerPanel(null);
          void this.send();
        },
      }));
    }
    const pendingForward = peekForward();
    if (pendingForward) {
      const channels = [...this.dms(), ...this.guilds().flatMap((guild) => this.channelsOf(guild.id))];
      const seen = new Set<string>();
      this.composerMeta.append(renderForwardPicker({
        preview: this.maskText(pendingForward.preview || pendingForward.authorName),
        channels: channels.filter((channel) => {
          if (seen.has(channel.id)) return false;
          seen.add(channel.id);
          return true;
        }).map((channel) => ({ id: channel.id, name: this.maskText(channel.name), kind: channel.kind })),
        onCancel: () => {
          clearForward();
          this.paintComposer();
        },
        onPick: (dest) => {
          const draft = peekForward();
          clearForward();
          this.paintComposer();
          if (!draft) return;
          if (this.demo) {
            this.toast("Forward", "Demo mode keeps the message here.");
            return;
          }
          void invoke("send_message", {
            channelId: dest,
            content: "",
            replyTo: null,
            nonce: null,
            files: [],
            stickerIds: [],
            forward: { messageId: draft.messageId, channelId: draft.channelId, guildId: draft.guildId },
          }).then(() => {
            this.toast("Forwarded", "Message forwarded.");
          }).catch((err) => {
            this.toast("Couldn't forward", err instanceof Error ? err.message : "Discord refused the forward.");
          });
        },
      }));
    }
    if (this.pickerFor === "composer") {
      this.composerMeta.append(this.emojiPicker((glyph, emojiId, animated, name) => this.insertEmoji(glyph, emojiId, animated, name)));
    }
  },
  async takeFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).slice(0, 4);
    this.upload = 10;
    this.paintComposer();
    for (const file of picked) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.files.push({ name: file.name, mime: file.type, bytes, url: URL.createObjectURL(file) });
      this.upload = Math.min(90, this.upload + 30);
      this.paintComposer();
    }
    this.upload = 100;
    this.paintComposer();
    window.setTimeout(() => {
      this.upload = 0;
      this.paintComposer();
    }, 400);
  },
  fileBytes(file: LocalFile): number {
    return file.declaredBytes ?? file.bytes.byteLength;
  },
  async send() {
    const id = this.channelId;
    if (!id) return;
    const ready = await this.prepareOutgoingFiles();
    if (!ready) return;
    const stickers = this.editing ? [] : peekStickers();
    const content = this.cleanOutgoing(expandShortcodes(this.composer.value));
    const error = composedError(content, this.files.length, this.files.reduce((sum, file) => sum + this.fileBytes(file), 0), stickers.length, uploadLimitBytes(this.premiumType));
    if (error) {
      this.toast("Can't send", error);
      return;
    }
    if (this.editing) {
      const editing = this.editing;
      const previous = editing.content;
      editing.content = content;
      editing.edited = true;
      const stored = (history[id] ?? []).find((message) => message.id === editing.id);
      if (stored) {
        stored.content = content;
        stored.edited = true;
      }
      this.editing = null;
      let kept = true;
      if (!this.demo) {
        try {
          const saved = normalizeMessage(await invoke<RawMessage>("edit_message", { channelId: id, messageId: editing.id, content }));
          editing.content = saved.content;
          editing.edited = true;
          if (stored) stored.content = saved.content;
          this.absorbMessage(saved);
        } catch (err) {
          kept = false;
          editing.content = previous;
          editing.edited = false;
          if (stored) {
            stored.content = previous;
            stored.edited = false;
          }
          this.toast("Couldn't edit", err instanceof Error ? err.message : "Discord refused the edit.");
        }
      }
      if (kept) this.noteLoggedEdit(editing, previous, editing.content);
      this.queueLocalIndex(id);
      this.msgSig = "";
    } else {
      const localId = outgoingNonce();
      const message: RawMessage = {
        id: localId,
        nonce: localId,
        channelId: id,
        authorId: this.meId(),
        authorName: this.demo ? "Ethan Park" : this.me.name,
        content,
        timestamp: new Date().toISOString(),
        reply: this.reply
          ? { id: this.reply.id, authorName: this.reply.authorName, preview: plainPreview(this.reply.content, this.renderContext(), 80) || "Click to see message" }
          : null,
        kind: this.reply ? "reply" : "default",
        attachments: this.files.map((file, index) => ({
          id: `file-${index}`,
          name: spoilerUploadName(file.name, Boolean(file.spoiler)),
          url: file.url,
          contentType: file.mime,
          size: this.fileBytes(file),
        })),
        stickers: stickers.map((stickerId) => {
          const hit = stickerHitsNow().find((item) => item.id === stickerId);
          return { id: stickerId, name: hit?.name ?? "Sticker", url: hit?.url ?? null };
        }),
      };
      this.storeEcho(id, message);
      this.scroll = "bottom";
      this.pinnedToBottom = true;
      this.paintMessages();
      if (!this.demo) {
        try {
          const sent = normalizeMessage(await invoke<RawMessage>("send_message", {
            channelId: id,
            content,
            replyTo: this.reply?.id ?? null,
            nonce: localId,
            files: this.files.map((file) => ({ name: spoilerUploadName(file.name, Boolean(file.spoiler)), mime: file.mime, bytes: Array.from(file.bytes) })),
            stickerIds: stickers,
          }));
          this.storeEcho(id, { ...sent, nonce: sent.nonce || localId });
          this.absorbMessage(sent);
          this.ackChannel(id, sent.id);
          this.msgSig = "";
        } catch (err) {
          if ((this.pages[id] ?? []).some((item) => item.id === localId)) {
            this.dropEcho(id, localId);
            this.msgSig = "";
            this.paint();
            this.toast("Couldn't send", err instanceof Error ? err.message : "Discord refused the message.");
            return;
          }
          this.msgSig = "";
        }
      }
      this.notePlace("message", id);
      this.reply = null;
    }
    clearStickers();
    this.composer.value = "";
    if (id) delete this.drafts[id];
    void this.writeDrafts();
    this.files = [];
    this.pinnedToBottom = true;
    this.scroll = "bottom";
    this.paintComposer();
    if (!this.msgSig) this.paintMessages();
  },
  beginEdit(message: RawMessage) {
    this.editing = message;
    this.reply = null;
    this.composer.value = message.content;
    this.composer.focus();
    this.paintComposer();
  },
  editLast() {
    const list = this.pages[this.channelId ?? ""] ?? [];
    const mine = [...list].reverse().find((message) => message.authorId === this.meId());
    if (mine) this.beginEdit(mine);
  },
  removeMessage(message: RawMessage) {
    const id = message.channelId;
    this.noteLoggedDelete(message);
    history[id] = (history[id] ?? []).filter((item) => item.id !== message.id);
    this.pages[id] = (this.pages[id] ?? []).filter((item) => item.id !== message.id);
    this.forgetLocalMessage(id, message.id, message.nonce);
    this.pendingDelete = null;
    if (!this.demo) void invoke("delete_message", { channelId: id, messageId: message.id });
    this.msgSig = "";
    this.paintMessages();
    this.paintComposer();
  },
  toggleReaction(message: RawMessage, emoji: string, emojiId?: string | null) {
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => sameReaction(reaction, emoji, emojiId));
    let add = true;
    this.emojiUses = rememberEmoji(this.emojiUses, emojiId ? `${emoji}:${emojiId}` : emoji, Date.now());
    localStorage.setItem("lark.emoji.v1", JSON.stringify(this.emojiUses));
    if (existing?.me) {
      existing.count -= 1;
      existing.me = false;
      add = false;
      if (existing.count <= 0) message.reactions = reactions.filter((reaction) => reaction !== existing);
    } else if (existing) {
      existing.count += 1;
      existing.me = true;
    } else {
      reactions.push({ emoji, emojiId: emojiId ?? null, count: 1, me: true });
      message.reactions = reactions;
    }
    if (!this.demo && message.channelId) {
      void invoke("toggle_reaction", { channelId: message.channelId, messageId: message.id, emoji, emojiId: emojiId ?? null, add }).catch((err) => {
        this.toast("Couldn't react", err instanceof Error ? err.message : "Discord refused the reaction.");
      });
    }
    this.pickerFor = null;
    this.msgSig = "";
    this.paintMessages();
  },
  openSwitcher() {
    this.switcher = true;
    this.switcherIndex = 0;
    this.switcherEl.hidden = false;
    clear(this.switcherEl);
    const card = el("div", "switcher-card");
    const input = el("input");
    input.placeholder = "Jump, or type a command";
    input.setAttribute("aria-label", "Command palette");
    const results = el("div", "switcher-results");
    const foot = el("div", "switcher-foot", `${formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os)} to open · Enter to jump · Esc to close`);
    const render = () => {
      const hits = this.switcherHits(input.value);
      clear(results);
      if (!hits.length) results.append(el("div", "empty", "No matches."));
      hits.forEach((hit, index) => {
        const button = el("button", `switcher-hit${index === this.switcherIndex ? " is-active" : ""}`);
        button.type = "button";
        button.append(el("strong", "", hit.label), el("span", "faint", hit.hint));
        button.addEventListener("click", () => this.commitHit(hit));
        results.append(button);
      });
      this.switcherHitsCache = hits;
    };
    let frame = 0;
    input.addEventListener("input", () => {
      this.switcherIndex = 0;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    });
    card.append(input, results, foot);
    this.switcherEl.append(card);
    this.switcherEl.onclick = (event) => {
      if (event.target === this.switcherEl) this.closeSwitcher();
    };
    render();
    input.focus();
  },
  switcherHits(query: string) {
    const hits: { id: string; guildId: string | null; label: string; hint: string; score: number; command?: string }[] = [];
    for (const command of matchCommands(query, commandCatalog())) {
      hits.push({ id: `cmd:${command.id}`, guildId: null, label: command.label, hint: command.hint, score: query.trim() ? 80 : 40, command: command.id });
    }
    const index = this.demo ? demoChannels : this.liveChannels;
    for (const [guildId, list] of Object.entries(index)) {
      const guild = this.guilds().find((item) => item.id === guildId);
      for (const channel of list) {
        if (channel.kind === "category" || !this.canSeeChannel(guildId, channel)) continue;
        const score = fuzzyScore(query, `${guild?.name ?? ""} ${channel.name}`);
        if (score === null) continue;
        hits.push({ id: channel.id, guildId, label: channel.kind === "voice" ? channel.name : `# ${channel.name}`, hint: guild?.name ?? "", score });
      }
    }
    for (const dm of this.dms()) {
      const score = fuzzyScore(query, dm.name);
      if (score === null) continue;
      hits.push({ id: dm.id, guildId: null, label: dm.name, hint: dm.kind === "group" ? "Group DM" : "Direct message", score });
    }
    const pasted = inviteCode(query);
    if (pasted) hits.push({ id: `invite:${pasted}`, guildId: null, label: `Join ${pasted}`, hint: "Invite", score: 200 });
    const seen = new Set<string>();
    for (const person of [...this.friends, ...Object.values(this.directory)]) {
      if (!person?.id || seen.has(person.id)) continue;
      seen.add(person.id);
      const score = fuzzyScore(query, person.name);
      if (score === null) continue;
      hits.push({ id: `user:${person.id}`, guildId: null, label: person.name, hint: "Person", score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 16);
  },
  moveSwitcher(delta: number) {
    const hits = this.switcherHitsCache;
    if (!hits.length) return;
    this.switcherIndex = (this.switcherIndex + delta + hits.length) % hits.length;
    this.switcherEl.querySelectorAll(".switcher-hit").forEach((node, index) => node.classList.toggle("is-active", index === this.switcherIndex));
  },
  commitSwitcher() {
    const hit = this.switcherHitsCache[this.switcherIndex];
    if (hit) this.commitHit(hit);
  },
  commitHit(hit: { id: string; guildId: string | null; command?: string }) {
    if (hit.command) {
      this.closeSwitcher();
      this.runCommand(hit.command);
      return;
    }
    if (hit.id.startsWith("invite:")) {
      this.closeSwitcher();
      this.openInvite(hit.id.slice("invite:".length));
      return;
    }
    if (hit.id.startsWith("user:")) {
      this.closeSwitcher();
      void this.openDm(hit.id.slice("user:".length));
      return;
    }
    this.closeSwitcher();
    this.guildId = hit.guildId;
    void this.openChannel(hit.id);
  },
  closeSwitcher() {
    this.switcher = false;
    this.switcherEl.hidden = true;
    clear(this.switcherEl);
  },
});
