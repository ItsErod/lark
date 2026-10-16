import { outgoingNonce } from "../chat";
import { bytesFromBase64 } from "../clip";
import {
  CLIP_DRAG,
  clipMime,
  clipPlaybackBlock,
  clampTrim,
  clipAttachAction,
  clipDisplayTitle,
  compressCopy,
  demoClips,
  fitAction,
  formatClipBytes,
  formatClipDate,
  formatClipDuration, limitSentence, posterFor,
  renamedClipName,
  trimPresets,
  trimRange,
  uploadLimitBytes,
  type ClipCard,
  clipGame,
  clipGames,
} from "../clips";
import type { RawMessage } from "../types";
import { commandError } from "../signin";
import { clear, el } from "./dom";
import type { LocalFile } from "./app-shared";
import { isTauri, invoke, normalizeMessage } from "./app-shared";
import { defineMethods } from "./app-shared";

export const clipMethods = defineMethods({
  clipStatusLine(): string {
    if (!isTauri()) return "The desktop app keeps the buffer. This preview does not record the screen.";
    const status = this.clipStatus;
    if (!status) return "Checking the clip buffer…";
    if (status.recording) {
      const seconds = Math.max(0, Math.round(status.spanMs / 1000));
      const size = status.width && status.height ? `${status.width}×${status.height}` : "the main display";
      const rate = status.fps ? ` at ${status.fps} fps` : "";
      const codec = status.codec ? ` ${status.codec}` : "";
      return `Recording ${size}${rate}${codec} · ${seconds}s in the buffer · ${status.backend}`;
    }
    return status.error
      ? `Buffer off. ${status.error}`
      : "Buffer off. Turn on Game Mode capture or share your screen. The hotkey does nothing until one of those is on.";
  },
  async pullClipStatus() {
    if (!isTauri()) return;
    try {
      const status = await invoke<{
        recording: boolean;
        spanMs: number;
        dir: string;
        backend: string;
        error: string;
        hotkeyError: string;
        width?: number;
        height?: number;
        fps?: number;
        codec?: string;
        capNote?: string;
      }>("clip_status");
      const was = Boolean(this.clipStatus?.recording);
      this.clipStatus = status;
      if (was !== status.recording && (this.config.privacy.streamer_auto || (this.hookOn("streamerSafe") && this.pack.privacy.streamerAutoShare))) this.noteCapture();
    } catch {
      this.clipStatus = null;
    }
  },
  onClipReady(payload: { ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }) {
    if (!payload?.ok || !payload.name) {
      const error = payload?.error || "Couldn't save a clip.";
      if (this.clipNotice === error) return;
      this.clipNotice = error;
      window.setTimeout(() => {
        if (this.clipNotice === error) this.clipNotice = "";
      }, 1500);
      void this.notify("Clip", error);
      return;
    }
    if (this.clipNotice === payload.name) return;
    this.clipNotice = payload.name;
    window.setTimeout(() => {
      if (this.clipNotice === payload.name) this.clipNotice = "";
    }, 1500);
    this.pendingClip = {
      name: payload.name,
      path: payload.path || "",
      bytes: payload.bytes || 0,
      spanMs: payload.spanMs || 0,
    };
    this.noteStat({ t: Date.now(), kind: "clip" });
    void this.notify("Clip saved", `${clipDisplayTitle(payload.name)} is on this computer. Share sends it to the open channel. Nothing was uploaded.`);
    if (this.view === "app") this.paintComposer();
  },
  async saveClip() {
    if (!isTauri()) {
      this.toast("Clips", "The clip hotkey saves a file in the macOS and Windows app while screen share or Game Mode capture is on.");
      return;
    }
    try {
      const saved = await invoke<{ ok?: boolean; name?: string; path?: string; bytes?: number; spanMs?: number; error?: string }>("save_clip");
      this.onClipReady(saved);
    } catch (err) {
      this.onClipReady({ ok: false, error: commandError(err, "Couldn't save a clip.") });
    }
  },
  paintClipBanner() {
    clear(this.clipBanner);
    const clip = this.pendingClip;
    this.clipBanner.hidden = !clip;
    if (!clip) return;
    const seconds = Math.max(1, Math.round(clip.spanMs / 1000));
    this.clipBanner.append(el("span", "", `Clip saved · ${clipDisplayTitle(clip.name)} · about ${seconds}s · not uploaded`));
    const share = el("button", "primary", "Share");
    share.type = "button";
    const channel = this.textChannel();
    if (channel) share.title = `Send to ${this.channelShareLabel(channel)}`;
    share.addEventListener("click", () => void this.sharePendingClip());
    const attach = el("button", "text-button", "Attach");
    attach.type = "button";
    attach.addEventListener("click", () => void this.attachPendingClip());
    const folder = el("button", "text-button", "Show in folder");
    folder.type = "button";
    folder.addEventListener("click", () => void this.showPendingClip());
    const dismiss = el("button", "ghost", "Dismiss");
    dismiss.type = "button";
    dismiss.addEventListener("click", () => {
      this.pendingClip = null;
      this.paintClipBanner();
    });
    this.clipBanner.append(share, attach, folder, dismiss);
  },
  rememberPendingClip() {
    const clip = this.pendingClip;
    if (!clip || this.clipItems.some((item) => item.name === clip.name)) return;
    this.clipItems = [{
      name: clip.name,
      bytes: clip.bytes,
      modifiedMs: Date.now(),
      durationMs: clip.spanMs,
      width: 0,
      height: 0,
      poster: "",
    }, ...this.clipItems];
  },
  textChannel() {
    const current = this.currentChannel();
    return current && current.kind !== "voice" && current.kind !== "category" ? current : undefined;
  },
  channelShareLabel(channel: { kind: string; name: string }): string {
    return channel.kind === "dm" || channel.kind === "group" ? channel.name : `#${channel.name}`;
  },
  async sharePendingClip() {
    const clip = this.pendingClip;
    if (!clip) return;
    this.rememberPendingClip();
    const name = clip.name;
    this.pendingClip = null;
    this.paintClipBanner();
    await this.shareClip(name);
  },
  async shareClip(name: string) {
    const channel = this.textChannel();
    if (!channel) {
      this.toast("Clip", "Open a channel or a DM first.");
      return;
    }
    await this.deliverClip(name, channel.id);
  },
  async attachPendingClip() {
    const clip = this.pendingClip;
    if (!clip) return;
    if (!this.channelId) {
      this.toast("Clip", "Open a channel, then attach the clip.");
      return;
    }
    this.rememberPendingClip();
    this.pendingClip = null;
    this.paintClipBanner();
    await this.attachClipByName(clip.name);
  },
  async showPendingClip() {
    const clip = this.pendingClip;
    if (!clip || !isTauri()) return;
    try {
      await invoke("show_clip", { name: clip.name });
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't show the clip."));
    }
  },
  async openClipsFolder() {
    if (!isTauri()) return;
    try {
      await invoke("open_clips_dir");
    } catch (err) {
      this.toast("Clips", commandError(err, "Couldn't open the clips folder."));
    }
  },
  openClips() {
    this.clipsOpen = true;
    this.returnToChat();
    this.friendsOpen = false;
    this.settings = false;
    this.settingsEl.hidden = true;
    this.switcher = false;
    this.switcherEl.hidden = true;
    this.msgSig = "";
    void this.loadClips().then(() => {
      if (this.clipsOpen) {
        this.msgSig = "";
        this.paint();
      }
    });
    this.paint();
  },
  async loadClips() {
    let next: ClipCard[] = [];
    if (this.demo || !isTauri()) next = demoClips();
    else {
      try {
        const listed = await invoke<ClipCard[]>("list_clips");
        next = listed.map((clip) => ({
          ...clip,
          poster: clip.poster ? `data:image/jpeg;base64,${clip.poster}` : posterFor(clip.name, clip.name),
        }));
      } catch (err) {
        this.toast("Clips", commandError(err, "Couldn't list clips."));
      }
    }
    const stamp = next.map((clip) => `${clip.name}:${clip.bytes}:${clip.modifiedMs}`).join("|");
    if (stamp === this.clipStamp) return;
    this.clipStamp = stamp;
    this.clipItems = next;
  },
  paintClipLibrary() {
    const stamp = `${this.clipStamp}|${this.channelId ?? ""}|${this.clipSendFor ?? ""}|${this.clipRename ?? ""}|${this.clipProgress?.name ?? ""}:${this.clipProgress?.percent ?? ""}|${this.premiumType}|${this.config.clips.compress}|${this.clipGameFilter ?? ""}`;
    if (stamp === this.msgSig && this.messagesEl.querySelector(".clip-library")) return;
    this.msgSig = stamp;
    clear(this.messagesEl);
    this.typingEl.textContent = "";
    this.appendClipLibrary(this.messagesEl);
  },
  appendClipLibrary(parent: HTMLElement) {
    const board = el("div", "clip-library");
    const limit = uploadLimitBytes(this.premiumType);
    board.append(el("p", "lede", limitSentence(this.platform.os, this.premiumType)));
    if (this.clipProgress) {
      const progress = el("div", "clip-progress");
      progress.append(el("span", "", `Compressing ${this.clipProgress.name} · ${this.clipProgress.percent}%`));
      const bar = el("div", "clip-progress-bar");
      const fill = el("span");
      fill.style.width = `${this.clipProgress.percent}%`;
      bar.append(fill);
      progress.append(bar);
      board.append(progress);
    }
    if (!this.clipItems.length) {
      board.append(el("p", "empty", "No clips yet. The hotkey saves one while screen share or Game Mode capture is on."));
      parent.append(board);
      return;
    }
    const grid = el("div", "clip-grid");
    const games = clipGames(this.clipItems.map((clip) => clip.name));
    if (this.clipGameFilter && !games.some((g) => g.game === this.clipGameFilter)) this.clipGameFilter = null;
    if (games.length > 1) {
      const bar = el("div", "clip-filter");
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Filter clips by game");
      const chip = (label: string, value: string | null, count: number) => {
        const button = el("button", "clip-filter-chip", `${label} ${count}`);
        button.type = "button";
        button.setAttribute("aria-pressed", String(this.clipGameFilter === value));
        button.addEventListener("click", () => {
          this.clipGameFilter = value;
          this.msgSig = "";
          this.paint();
        });
        bar.append(button);
      };
      chip("All", null, this.clipItems.length);
      for (const g of games) chip(g.game, g.game, g.count);
      board.append(bar);
    }
    for (const clip of this.clipItems) {
      if (this.clipGameFilter && clipGame(clip.name) !== this.clipGameFilter) continue;
      grid.append(this.clipCard(clip, limit));
    }
    board.append(grid);
    parent.append(board);
  },
  clipCard(clip: ClipCard, limit: number): HTMLElement {
    const card = el("article", "clip-card");
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(CLIP_DRAG, clip.name);
      event.dataTransfer?.setData("text/plain", clip.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });
    const thumb = el("div", "clip-thumb");
    const image = document.createElement("img");
    image.alt = "";
    image.src = clip.poster || posterFor(clip.name, clip.name);
    thumb.append(image, el("span", "clip-duration", formatClipDuration(clip.durationMs)));
    const meta = el("div", "clip-meta");
    const title = this.clipRename === clip.name ? el("input") : el("strong", "", clipDisplayTitle(clip.name));
    if (!(title instanceof HTMLInputElement)) title.title = clip.name;
    if (title instanceof HTMLInputElement) {
      title.value = clip.name.replace(/^lark-clip-/, "").replace(/\.(mp4|avi)$/, "");
      title.setAttribute("aria-label", "Clip name");
      queueMicrotask(() => title.focus());
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.renameClip(clip.name, title.value);
        }
        if (event.key === "Escape") {
          this.clipRename = null;
          this.msgSig = "";
          this.paint();
        }
      });
      title.addEventListener("blur", () => {
        if (this.clipRename === clip.name) void this.renameClip(clip.name, title.value);
      });
    }
    meta.append(title);
    const facts = el("span", "clip-facts", `${formatClipDuration(clip.durationMs)} · ${formatClipBytes(clip.bytes)} · ${formatClipDate(clip.modifiedMs)}`);
    meta.append(facts);
    if (clip.bytes > limit) meta.append(el("span", "clip-over", `Over the ${formatClipBytes(limit)} upload limit`));
    const actions = el("div", "clip-actions");
    actions.append(this.clipAction("Play", () => void this.playClip(clip.name)));
    const share = this.clipAction("Share", () => void this.shareClip(clip.name));
    const channel = this.textChannel();
    if (channel) share.title = `Send to ${this.channelShareLabel(channel)}`;
    actions.append(share);
    actions.append(this.clipAction("Trim", () => {
      this.clipTrim = clip.name;
      this.paintClipDialog();
    }));
    actions.append(this.clipAction("Rename", () => {
      this.clipRename = clip.name;
      this.msgSig = "";
      this.paint();
    }));
    actions.append(this.clipAction("Delete", () => void this.deleteClip(clip.name)));
    actions.append(this.clipAction("Reveal", () => void this.revealClip(clip.name)));
    actions.append(this.clipAction("Send", () => {
      this.clipSendFor = this.clipSendFor === clip.name ? null : clip.name;
      this.msgSig = "";
      this.paint();
    }));
    meta.append(actions);
    if (this.clipSendFor === clip.name) meta.append(this.clipSendMenu(clip.name));
    card.append(thumb, meta);
    return card;
  },
  clipAction(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "text-button", label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  },
  clipSendMenu(name: string): HTMLElement {
    const menu = el("div", "clip-send");
    const sendable = this.textChannel();
    if (sendable) {
      menu.append(this.clipAction(`Send to ${this.channelShareLabel(sendable)}`, () => void this.deliverClip(name, sendable.id)));
    }
    for (const dm of this.dms().slice(0, 6)) {
      if (dm.id === sendable?.id) continue;
      menu.append(this.clipAction(`DM ${dm.name}`, () => void this.deliverClip(name, dm.id)));
    }
    if (!menu.childElementCount) menu.append(el("span", "hint", "Open a channel or a DM first."));
    return menu;
  },
  async deliverClip(name: string, channelId: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    if (!clip) return;
    const limit = uploadLimitBytes(this.premiumType);
    const action = fitAction(clip.bytes, limit, this.config.clips.compress);
    this.clipSendFor = null;
    if (action === "block") {
      this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
      return;
    }
    if (action === "ask") {
      this.clipAsk = { name, channelId, mode: "send" };
      this.paintClipDialog();
      return;
    }
    const sending = action === "compress" ? await this.compressClip(name, limit) : name;
    if (!sending) return;
    await this.sendClipFile(sending, channelId);
  },
  async prepareOutgoingFiles(): Promise<boolean> {
    const limit = uploadLimitBytes(this.premiumType);
    for (const file of [...this.files]) {
      if (!file.clipName) continue;
      const action = fitAction(this.fileBytes(file), limit, this.config.clips.compress);
      if (action === "send") {
        await this.materializeClip(file);
        continue;
      }
      if (action === "block") {
        this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
        return false;
      }
      if (action === "ask") {
        this.clipAsk = { name: file.clipName, channelId: this.channelId || "", mode: "attach" };
        this.paintClipDialog();
        return false;
      }
      const fitted = await this.compressClip(file.clipName, limit);
      if (!fitted) return false;
      await this.replaceClipFile(file, fitted);
    }
    return true;
  },
  async confirmClipCompress() {
    const ask = this.clipAsk;
    if (!ask) return;
    this.clipAsk = null;
    this.paintClipDialog();
    const limit = uploadLimitBytes(this.premiumType);
    const fitted = await this.compressClip(ask.name, limit);
    if (!fitted) return;
    if (ask.mode === "send") {
      await this.sendClipFile(fitted, ask.channelId);
      return;
    }
    const file = this.files.find((item) => item.clipName === ask.name);
    if (file) await this.replaceClipFile(file, fitted);
    this.paintComposer();
    void this.send();
  },
  async compressClip(name: string, limit: number): Promise<string | null> {
    const clip = this.clipItems.find((item) => item.name === name);
    if (this.demo || !isTauri()) {
      if (!clip) return null;
      for (const percent of [20, 55, 100]) {
        this.clipProgress = { name, percent };
        this.msgSig = "";
        this.paint();
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      const fitted = compressCopy(clip, limit);
      if (!this.clipItems.some((item) => item.name === fitted.name)) this.clipItems = [fitted, ...this.clipItems];
      this.clipStamp = "";
      this.clipProgress = null;
      this.msgSig = "";
      this.paint();
      this.toast("Clip compressed", "The original is still in the clips folder.");
      return fitted.name;
    }
    try {
      const saved = await invoke<{ name?: string; bytes?: number }>("compress_clip", { name, limitBytes: limit });
      this.clipProgress = null;
      this.clipStamp = "";
      await this.loadClips();
      this.toast("Clip compressed", "The original is still in the clips folder.");
      return saved.name || null;
    } catch (err) {
      this.clipProgress = null;
      this.toast("Clip", commandError(err, "Couldn't compress the clip."));
      return null;
    }
  },
  async sendClipFile(name: string, channelId: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    const localId = outgoingNonce();
    if (this.demo || !isTauri()) {
      const message: RawMessage = {
        id: localId,
        nonce: localId,
        channelId,
        authorId: this.meId(),
        authorName: "Ethan Park",
        content: "",
        timestamp: new Date().toISOString(),
        kind: "default",
        attachments: [{
          id: "clip",
          name,
          url: clip?.poster || "",
          contentType: clipMime(name),
          size: clip?.bytes ?? 0,
        }],
      };
      this.storeEcho(channelId, message);
      this.toast("Clip sent", `${name} was sent from this computer.`);
      this.clipsOpen = false;
      this.msgSig = "";
      void this.openChannel(channelId);
      return;
    }
    try {
      const encoded = await invoke<string>("read_clip", { name });
      const bytes = bytesFromBase64(encoded);
      const sent = await invoke<RawMessage>("send_message", {
        channelId,
        content: "",
        replyTo: null,
        nonce: localId,
        files: [{ name, mime: clipMime(name), bytes: Array.from(bytes) }],
      });
      this.toast("Clip sent", "Discord has the file. The original is still in the clips folder.");
      this.absorbMessage(normalizeMessage(sent));
      this.clipsOpen = false;
      this.msgSig = "";
      void this.openChannel(channelId);
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't send the clip."));
    }
  },
  async attachClipByName(name: string) {
    const clip = this.clipItems.find((item) => item.name === name) ?? {
      name,
      bytes: 0,
      modifiedMs: 0,
      durationMs: 0,
      width: 0,
      height: 0,
      poster: "",
    };
    if (!this.channelId && !this.clipsOpen) {
      this.toast("Clip", "Open a channel, then drop the clip on the composer.");
      return;
    }
    const action = clipAttachAction(clip.bytes, this.premiumType, this.config.clips.compress);
    const limit = uploadLimitBytes(this.premiumType);
    if (action === "block") {
      this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Compression is set to never.`);
      return;
    }
    if (this.demo || !isTauri() || action !== "send") {
      this.files.push({
        name: clip.name,
        mime: clipMime(clip.name),
        bytes: new Uint8Array(),
        url: clip.poster,
        clipName: clip.name,
        declaredBytes: clip.bytes,
      });
      this.clipsOpen = false;
      this.paint();
      if (action === "compress") this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Lark will compress a copy when you send.`);
      else if (action === "ask") this.toast("Clip", `This clip is over your ${formatClipBytes(limit)} upload limit. Lark will ask before compressing it.`);
      return;
    }
    try {
      const encoded = await invoke<string>("read_clip", { name: clip.name });
      const bytes = bytesFromBase64(encoded);
      const blob = new Blob([bytes], { type: clipMime(clip.name) });
      this.files.push({
        name: clip.name,
        mime: clipMime(clip.name),
        bytes,
        url: URL.createObjectURL(blob),
        clipName: clip.name,
      });
      this.clipsOpen = false;
      this.paintComposer();
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't read the clip."));
    }
  },
  async materializeClip(file: LocalFile) {
    if (file.bytes.byteLength > 0 || !file.clipName || this.demo || !isTauri()) return;
    const encoded = await invoke<string>("read_clip", { name: file.clipName });
    const bytes = bytesFromBase64(encoded);
    file.bytes = bytes;
    file.declaredBytes = bytes.byteLength;
    file.mime = clipMime(file.clipName);
    file.url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  },
  async replaceClipFile(file: LocalFile, name: string) {
    const clip = this.clipItems.find((item) => item.name === name);
    file.name = name;
    file.clipName = name;
    file.mime = clipMime(name);
    file.declaredBytes = clip?.bytes;
    file.bytes = new Uint8Array();
    file.url = clip?.poster || file.url;
    if (!this.demo && isTauri()) await this.materializeClip(file);
  },
  async playClip(name: string) {
    this.clipPlayer = name;
    this.clipPlayNote = "";
    const clip = this.clipItems.find((item) => item.name === name);
    if (!this.demo && isTauri() && clip && !clip.poster.startsWith("blob:")) {
      try {
        const encoded = await invoke<string>("read_clip", { name });
        if (this.clipPlayer !== name) return;
        const bytes = bytesFromBase64(encoded);
        const block = clipPlaybackBlock(name, bytes);
        if (block) {
          this.clipPlayNote = block;
        } else {
          clip.poster = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        }
      } catch (err) {
        this.toast("Clip", commandError(err, "Couldn't play the clip."));
      }
    }
    this.paintClipDialog();
  },
  async revealClip(name: string) {
    if (this.demo || !isTauri()) {
      this.toast("Clips", `This preview keeps ${name} in the sample library.`);
      return;
    }
    try {
      await invoke("show_clip", { name });
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't show the clip."));
    }
  },
  async renameClip(name: string, label: string) {
    const next = renamedClipName(name, label);
    this.clipRename = null;
    if (!next || next === name) {
      this.msgSig = "";
      this.paint();
      return;
    }
    if (this.demo || !isTauri()) {
      this.clipItems = this.clipItems.map((clip) => clip.name === name ? { ...clip, name: next, poster: posterFor(next, label) } : clip);
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      return;
    }
    try {
      await invoke("rename_clip", { name, label });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't rename the clip."));
    }
  },
  async deleteClip(name: string) {
    if (this.demo || !isTauri()) {
      this.clipItems = this.clipItems.filter((clip) => clip.name !== name);
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      return;
    }
    try {
      await invoke("delete_clip", { name });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't delete the clip."));
    }
  },
  async applyTrim(name: string, startSec: number, endSec: number) {
    const clip = this.clipItems.find((item) => item.name === name);
    const range = trimRange(clip?.durationMs ?? 0, startSec, endSec);
    if (typeof range === "string") {
      this.toast("Trim", range);
      return;
    }
    this.clipTrim = null;
    this.paintClipDialog();
    if (this.demo || !isTauri()) {
      if (!clip) return;
      const copy: ClipCard = {
        ...clip,
        name: clip.name.replace(/\.(mp4|avi)$/, "-trim.$1"),
        durationMs: range.endMs - range.startMs,
        bytes: Math.max(1, Math.round(clip.bytes * ((range.endMs - range.startMs) / Math.max(1, clip.durationMs)))),
      };
      copy.poster = posterFor(copy.name, "trim");
      this.clipItems = [copy, ...this.clipItems];
      this.clipStamp = "";
      this.msgSig = "";
      this.paint();
      this.toast("Clip trimmed", "The original is still in the clips folder.");
      return;
    }
    try {
      await invoke("trim_clip", { name, startMs: range.startMs, endMs: range.endMs });
      this.clipStamp = "";
      await this.loadClips();
      this.msgSig = "";
      this.paint();
      this.toast("Clip trimmed", "The original is still in the clips folder.");
    } catch (err) {
      this.toast("Clip", commandError(err, "Couldn't trim the clip."));
    }
  },
  appendTrimControls(card: HTMLElement, clip: ClipCard) {
    const durationSec = Math.max(0.1, clip.durationMs / 1000);
    card.append(el("h2", "", "Trim clip"), el("p", "hint", "This writes a new file. The original stays."));
    const start = el("input");
    start.type = "range";
    start.min = "0";
    start.max = String(durationSec);
    start.step = "0.1";
    start.value = "0";
    start.setAttribute("aria-label", "Trim start");
    const end = el("input");
    end.type = "range";
    end.min = "0";
    end.max = String(durationSec);
    end.step = "0.1";
    end.value = String(durationSec);
    end.setAttribute("aria-label", "Trim end");
    const startNum = el("input");
    startNum.type = "number";
    startNum.min = "0";
    startNum.step = "0.1";
    startNum.value = "0";
    startNum.setAttribute("aria-label", "Trim start seconds");
    const endNum = el("input");
    endNum.type = "number";
    endNum.min = "0";
    endNum.step = "0.1";
    endNum.value = String(durationSec);
    endNum.setAttribute("aria-label", "Trim end seconds");
    const times = el("div", "clip-trim-times");
    const startLabel = el("span", "", formatClipDuration(0));
    const endLabel = el("span", "", formatClipDuration(clip.durationMs));
    times.append(startLabel, endLabel);
    const paintTimes = () => {
      const kept = Math.max(0, Number(end.value) - Number(start.value));
      startLabel.textContent = formatClipDuration(Number(start.value) * 1000);
      endLabel.textContent = `${formatClipDuration(Number(end.value) * 1000)} · ${formatClipDuration(kept * 1000)} kept`;
    };
    const apply = (moved: "start" | "end") => {
      const next = clampTrim(durationSec, Number(start.value), Number(end.value), moved);
      start.value = String(next.startSec);
      end.value = String(next.endSec);
      startNum.value = start.value;
      endNum.value = end.value;
      paintTimes();
    };
    start.addEventListener("input", () => {
      startNum.value = start.value;
      apply("start");
    });
    end.addEventListener("input", () => {
      endNum.value = end.value;
      apply("end");
    });
    startNum.addEventListener("input", () => {
      start.value = startNum.value || "0";
      apply("start");
    });
    endNum.addEventListener("input", () => {
      end.value = endNum.value || "0";
      apply("end");
    });
    const ranges = el("div", "clip-trim");
    ranges.append(start, end, times);
    card.append(ranges);
    const presets = el("div", "clip-actions");
    for (const preset of trimPresets(clip.durationMs)) {
      presets.append(this.clipAction(preset.label, () => {
        start.value = String(preset.startSec);
        end.value = String(preset.endSec);
        apply("end");
      }));
    }
    if (presets.childElementCount) card.append(presets);
    const fields = el("div", "clip-trim-fields");
    fields.append(startNum, endNum);
    card.append(fields);
    const actions = el("div", "clip-actions");
    actions.append(this.clipAction("Save trim", () => void this.applyTrim(clip.name, Number(start.value), Number(end.value))));
    actions.append(this.clipAction("Cancel", () => {
      this.clipTrim = null;
      this.paintClipDialog();
    }));
    card.append(actions);
    paintTimes();
  },
  paintClipDialog() {
    clear(this.clipDialog);
    const ask = this.clipAsk;
    const playing = this.clipPlayer ? this.clipItems.find((clip) => clip.name === this.clipPlayer) : undefined;
    const trimming = this.clipTrim ? this.clipItems.find((clip) => clip.name === this.clipTrim) : undefined;
    if (!ask && !playing && !trimming) {
      this.clipDialog.hidden = true;
      return;
    }
    this.clipDialog.hidden = false;
    const card = el("div", "clip-dialog");
    if (ask) {
      const clip = this.clipItems.find((item) => item.name === ask.name);
      const limit = uploadLimitBytes(this.premiumType);
      card.append(el("h2", "", "Compress this clip?"));
      card.append(el("p", "", `${ask.name} is ${formatClipBytes(clip?.bytes ?? 0)}. The upload limit is ${formatClipBytes(limit)}. Lark can re-encode a copy to H.264/AAC MP4 and leave the original in the clips folder.`));
      const actions = el("div", "clip-actions");
      actions.append(this.clipAction("Compress and send", () => void this.confirmClipCompress()));
      actions.append(this.clipAction("Cancel", () => {
        this.clipAsk = null;
        this.paintClipDialog();
      }));
      card.append(actions);
    } else if (playing) {
      card.append(el("h2", "", playing.name));
      if (this.clipPlayNote) card.append(el("p", "warning", this.clipPlayNote));
      if (!this.clipPlayNote && playing.poster.startsWith("blob:") && playing.name.endsWith(".mp4")) {
        const video = el("video", "clip-video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "auto";
        const source = document.createElement("source");
        source.src = playing.poster;
        source.type = "video/mp4";
        video.append(source);
        card.append(video);
      } else {
        const image = document.createElement("img");
        image.className = "clip-video";
        image.alt = "";
        image.src = playing.poster || posterFor(playing.name, playing.name);
        card.append(image, el("p", "hint", `${formatClipDuration(playing.durationMs)} · ${formatClipBytes(playing.bytes)}`));
      }
      card.append(this.clipAction("Close", () => {
        this.clipPlayer = null;
        this.clipPlayNote = "";
        this.paintClipDialog();
      }));
    } else if (trimming) {
      this.appendTrimControls(card, trimming);
    }
    this.clipDialog.append(card);
    this.clipDialog.onclick = (event) => {
      if (event.target !== this.clipDialog) return;
      this.clipAsk = null;
      this.clipPlayer = null;
      this.clipPlayNote = "";
      this.clipTrim = null;
      this.paintClipDialog();
    };
  },
});
