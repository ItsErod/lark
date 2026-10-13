import { ME } from "../demo/data";
import { newestClip, pipBox, youtubeId, youtubePlayerUrl } from "../media/watch";
import { nextZoom } from "../pack/zoom";
import { browserPlatform } from "../platform";
import {
  AUTO_INSTALL_KEY,
  UPDATE_CHECK_MS,
  beginCheck,
  checkFailed,
  checkFinished,
  dismissUpdate,
  downloadFinished,
  downloadProgress,
  initialUpdateState,
  readAutoInstall,
  requestRestart, setInCall,
  updateBanner,
  updateErrorMessage, type UpdateStep
} from "../updates";
import {
  INTERFACE_CHECK_MS,
  applyInterfaceError,
  applyInterfaceReport,
  applyInterfaceSnapshot, interfaceToast,
  setInterfaceCall,
  type InterfaceChannel,
  type InterfaceReport,
  type InterfaceSnapshot
} from "../interface-update";
import { commandError, gateQr } from "../signin";
import { clear, el } from "./dom";
import {
  composerPanel, gifQueryText, scheduleGifLoad, setStickerHits,
  stickerGuildNow, toggleComposerPanel
} from "./composer-tools";
import { callKeyAction } from "../keybind-actions";
import {
  dropSession,
  matchingKeybind,
  parseAccountOverview, rememberSession
} from "../user-settings";
import { isTauri, invoke } from "./app-shared";
import { defineMethods } from "./app-shared";

export const updateMethods = defineMethods({
  runDiscordKeybind(event: KeyboardEvent, os: ReturnType<typeof browserPlatform>["os"]): boolean {
    const id = matchingKeybind(event, this.config.keybinds, os);
    if (!id) return false;
    if (event.repeat && id !== "scroll_chat_up" && id !== "scroll_chat_down") return true;
    if (id === "push_to_mute") {
      this.holdPushMute();
      return true;
    }
    if (id === "toggle_hotkeys") {
      this.hotkeysOff = true;
      this.toast("Keybinds", "Hotkeys are off.");
      return true;
    }
    if (id === "mark_server_read") {
      const ids = this.visibleChannels().filter((channel) => channel.kind !== "category").map((channel) => channel.id);
      if (ids.length) this.markRead(ids);
      return true;
    }
    if (id === "return_previous_text") {
      this.cycle(-1);
      return true;
    }
    if (id === "return_previous_audio") {
      if (this.voice?.channelId) void this.openChannel(this.voice.channelId);
      return true;
    }
    if (id === "toggle_pins") {
      this.pinsOpen = !this.pinsOpen;
      this.paintPins();
      return true;
    }
    if (id === "toggle_emoji_picker") {
      this.pickerFor = this.pickerFor === "composer" ? null : "composer";
      this.emojiQuery = "";
      if (this.pickerFor) void this.ensureEmojis();
      this.paintComposer();
      return true;
    }
    if (id === "scroll_chat_up" || id === "scroll_chat_down") {
      const delta = id === "scroll_chat_up" ? -1 : 1;
      this.messagesEl.scrollBy({ top: delta * Math.max(120, this.messagesEl.clientHeight * 0.8) });
      return true;
    }
    if (id === "upload_file") {
      this.composerMeta.querySelector<HTMLInputElement>("input[type=file]")?.click();
      return true;
    }
    if (id === "search") {
      this.searchOpen = true;
      this.paintSearch();
      return true;
    }
    if (id === "create_or_join_server") {
      this.openAddServer();
      return true;
    }
    if (id === "toggle_inbox") {
      void this.ensureLate().then((mod) => mod.toggleInbox());
      return true;
    }
    if (id === "toggle_gif_picker") {
      this.toggleGifPicker();
      return true;
    }
    if (id === "toggle_sticker_picker") {
      this.toggleStickerPicker();
      return true;
    }
    if (id === "create_group") {
      this.openGroupCreator();
      return true;
    }
    const call = callKeyAction(id, this.currentChannel() ?? null, this.voice, this.incoming);
    if (call) {
      if (call.op === "answer") this.answerIncoming();
      else if (call.op === "decline") this.declineIncoming();
      else if (call.op === "join") {
        const channel = this.currentChannel();
        if (channel && channel.id === call.channelId) this.startDmCall(channel, false);
      } else if (call.op === "focus") void this.openChannel(call.channelId);
      else if (call.op === "leave") this.leaveVoice();
      else this.toast("Call", call.message);
      return true;
    }
    window.dispatchEvent(new CustomEvent("lark-keybind", { detail: { id } }));
    return true;
  },
  toggleGifPicker() {
    toggleComposerPanel("gif");
    if (composerPanel() === "gif") scheduleGifLoad(gifQueryText());
    this.paintComposer();
  },
  toggleStickerPicker() {
    toggleComposerPanel("stickers");
    const guildId = this.guildId;
    if (composerPanel() === "stickers" && guildId && !this.demo && stickerGuildNow() !== guildId) {
      void invoke<{ id: string; name: string; url?: string | null }[]>("fetch_stickers", { guildId }).then((list) => {
        setStickerHits(guildId, list.map((item) => ({ id: item.id, name: item.name, url: item.url ?? null })));
        if (composerPanel() === "stickers") this.paintComposer();
      }).catch(() => {
        setStickerHits(guildId, []);
        if (composerPanel() === "stickers") this.paintComposer();
      });
    }
    this.paintComposer();
  },
  holdPushMute() {
    if (this.pushMuted) return;
    this.pushMuted = true;
    if (this.voice && !this.voice.muted) {
      this.mutedByPush = true;
      this.toggleMute();
    }
  },
  releasePushMute() {
    if (!this.pushMuted) return;
    this.pushMuted = false;
    if (this.mutedByPush) {
      this.mutedByPush = false;
      if (this.voice?.muted) this.toggleMute();
    }
  },
  openDiscord(url: string) {
    if (!url.startsWith("https://discord.com/")) return;
    if (!isTauri()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void invoke("open_discord_link", { url }).catch((err) => {
      this.toast("Discord", commandError(err, "Couldn't open Discord."));
    });
  },
  async rememberCurrentAccount(id: string, name: string) {
    if (this.demo || !isTauri() || id === ME) return;
    const next = rememberSession(this.config.sessions, { id, name });
    this.config.sessions = next.sessions;
    this.persist();
    try {
      await invoke("remember_account", { userId: id });
      for (const dropped of next.dropped) {
        await invoke("forget_account", { userId: dropped }).catch(() => undefined);
      }
    } catch {
      /* The credential store is unavailable in this preview. */
    }
  },
  async loadAccountOverview() {
    if (!isTauri() || this.demo) return;
    try {
      this.accountOverview = parseAccountOverview(await invoke("account_overview"));
      this.accountNote = "";
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't load the account from Discord.");
    }
    if (this.settings && (this.section === "account" || this.section === "connections")) this.renderSettings();
  },
  async unlinkConnection(type: string, id: string) {
    if (!isTauri()) return;
    try {
      await invoke("remove_connection", { kind: type, id });
      await this.loadAccountOverview();
    } catch (err) {
      this.accountNote = commandError(err, "Couldn't remove that connection.");
      if (this.settings) this.renderSettings();
    }
  },
  async switchTo(id: string) {
    if (!isTauri()) {
      this.toast("Accounts", "Switching accounts runs in the desktop app.");
      return;
    }
    try {
      await invoke("switch_account", { userId: id });
      this.accountOverview = null;
      this.closeSettings();
      this.beginStartup(true);
      await invoke("connect");
    } catch (err) {
      this.abortStartup();
      this.toast("Accounts", commandError(err, "Couldn't switch to that account."));
    }
  },
  async addAccount() {
    this.closeSettings();
    await this.forgetToken();
  },
  async removeAccount(id: string) {
    const current = id === this.me.id;
    this.config.sessions = dropSession(this.config.sessions, id);
    this.persist();
    if (isTauri()) {
      try {
        await invoke("forget_account", { userId: id });
      } catch (err) {
        this.toast("Accounts", commandError(err, "Couldn't remove that account."));
      }
    }
    if (current) await this.logoutAccount();
    else if (this.settings) this.renderSettings();
  },
  async logoutAccount() {
    const current = this.me.id;
    if (current && current !== ME) {
      this.config.sessions = dropSession(this.config.sessions, current);
      this.persist();
      if (isTauri()) await invoke("forget_account", { userId: current }).catch(() => undefined);
    }
    const next = this.config.sessions[0];
    if (next && isTauri()) {
      try {
        await invoke("switch_account", { userId: next.id });
        this.accountOverview = null;
        this.closeSettings();
        this.beginStartup(true);
        await invoke("connect");
        return;
      } catch (err) {
        this.abortStartup();
        this.toast("Log Out", commandError(err, "Couldn't switch accounts."));
      }
    }
    await this.forgetToken();
  },
  async forgetToken() {
    try {
      await invoke("clear_token");
    } catch (err) {
      const message = commandError(err, "Couldn't remove the saved token.");
      this.tokenNote = message;
      this.toast("Sign out", message);
      return;
    }
    this.view = "gate";
    this.demo = false;
    this.qrWatching = false;
    const initial = await gateQr(isTauri());
    this.qrSvg = initial.svg;
    this.qrStatus = initial.status;
    this.tokenNote = "";
    this.signInBusy = "";
    this.connection = "Signed out";
    this.closeSettings();
    this.paint();
    this.ensureQr();
  },
  openImage(url: string) {
    if (this.lightbox !== url) this.lightboxZoom = 1;
    this.lightbox = url;
    this.paintLightbox();
  },
  paintLightbox() {
    this.lightboxEl.hidden = !this.lightbox;
    clear(this.lightboxEl);
    if (!this.lightbox) {
      this.lightboxZoom = 1;
      return;
    }
    const img = el("img");
    img.src = this.lightbox;
    img.alt = "Attachment";
    if (this.hookOn("imageZoom")) {
      img.classList.add("is-zoomable");
      if (this.lightboxZoom > 1) img.classList.add("is-zoomed");
      img.style.transform = `scale(${this.lightboxZoom})`;
      img.addEventListener("click", (event) => {
        event.stopPropagation();
        this.lightboxZoom = nextZoom(this.lightboxZoom, 1, this.pack.zoomMax);
        this.paintLightbox();
      });
      img.addEventListener("wheel", (event) => {
        event.preventDefault();
        this.lightboxZoom = nextZoom(this.lightboxZoom, event.deltaY > 0 ? -1 : 1, this.pack.zoomMax);
        this.paintLightbox();
      }, { passive: false });
    }
    this.lightboxEl.append(img);
  },
  openYoutube(url: string) {
    const id = youtubeId(url);
    if (!id) {
      this.toast("YouTube", "That embed doesn't have a video id.");
      return;
    }
    this.youtubeFloat = id;
    this.paintYoutubeFloat();
  },
  paintYoutubeFloat() {
    if (!this.youtubeFloat || !this.hookOn("youtubePip")) {
      this.youtubeFloatEl.hidden = true;
      clear(this.youtubeFloatEl);
      this.youtubeFloatStamp = "";
      if (!this.hookOn("youtubePip")) this.youtubeFloat = null;
      return;
    }
    const box = pipBox(this.pack.youtubePipSize);
    const muted = this.pack.youtubePipStart !== "sound";
    const stamp = `${this.youtubeFloat}:${box.width}:${muted ? 1 : 0}`;
    this.youtubeFloatEl.hidden = false;
    this.youtubeFloatEl.style.width = `${box.width}px`;
    this.youtubeFloatEl.style.height = `${box.height + 36}px`;
    if (stamp === this.youtubeFloatStamp && this.youtubeFloatEl.querySelector("iframe")) return;
    this.youtubeFloatStamp = stamp;
    clear(this.youtubeFloatEl);
    const bar = el("div", "yt-pip-bar");
    const close = el("button", "text-button", "Close");
    close.type = "button";
    close.addEventListener("click", () => {
      this.youtubeFloat = null;
      this.paintYoutubeFloat();
    });
    bar.append(el("strong", "", "YouTube"), close);
    const frame = document.createElement("iframe");
    frame.title = "YouTube";
    frame.src = youtubePlayerUrl(this.youtubeFloat, muted) ?? "";
    frame.allow = "autoplay; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    this.youtubeFloatEl.append(bar, frame);
  },
  async shareLatestClip() {
    if (!this.clipItems.length) await this.loadClips();
    const clip = newestClip(this.clipItems);
    if (!clip) {
      this.toast("Clip", "No saved clip to send.");
      return;
    }
    await this.shareClip(clip.name);
  },
  startUpdates() {
    this.updates = initialUpdateState(this.updates.currentVersion || "3.0.5", readAutoInstall(localStorage.getItem(AUTO_INSTALL_KEY)));
    if (!isTauri()) return;
    void this.watchForUpdates();
    void this.watchInterface();
  },
  async watchForUpdates() {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();
      if (version) this.updates = { ...this.updates, currentVersion: version };
    } catch {
      this.updates = { ...this.updates, currentVersion: this.updates.currentVersion || "3.0.5" };
    }
    this.refreshUpdateUi();
    void this.checkForUpdates(false);
    window.clearInterval(this.updateTimer);
    this.updateTimer = window.setInterval(() => void this.checkForUpdates(false), UPDATE_CHECK_MS);
  },
  async checkForUpdates(manual: boolean) {
    if (!isTauri()) {
      if (!manual) return;
      this.updates = { ...this.updates, phase: "error", error: "Updates install from the macOS and Windows apps." };
      this.refreshUpdateUi();
      return;
    }
    const started = beginCheck(this.updates);
    if (started === this.updates) return;
    this.updates = started;
    this.refreshUpdateUi();
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const found = await check();
      if (this.updates.phase !== "checking") return;
      if (!found) {
        this.applyUpdateStep(checkFinished(this.updates, null, manual));
        return;
      }
      if (this.pendingUpdate && this.pendingUpdate.version !== found.version) void this.pendingUpdate.close().catch(() => undefined);
      this.pendingUpdate = found;
      const step = checkFinished(this.updates, { version: found.version, notes: found.body ?? "" }, manual);
      this.applyUpdateStep(step);
    } catch (err) {
      this.updates = checkFailed(this.updates, updateErrorMessage(err), manual);
      this.refreshUpdateUi();
    }
  },
  followUpdate(step: UpdateStep) {
    if (step.effect === "download") void this.downloadPending();
    else if (step.effect === "install") void this.installPending();
  },
  applyUpdateStep(step: UpdateStep) {
    this.updates = step.state;
    this.refreshUpdateUi();
    this.followUpdate(step);
  },
  async downloadPending() {
    const update = this.pendingUpdate;
    if (!update || this.updateBusy) return;
    this.updateBusy = true;
    let received = 0;
    try {
      await update.download((event) => {
        if (event.event === "Started") {
          received = 0;
          this.updates = downloadProgress(this.updates, 0, event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          this.updates = downloadProgress(this.updates, received, this.updates.total);
        }
        this.paintUpdateBanner();
      });
      this.applyUpdateStep(downloadFinished({ ...this.updates, inCall: Boolean(this.voice) }));
    } catch (err) {
      if (this.updates.skippedVersion === update.version) return;
      this.updates = { ...this.updates, phase: "error", error: updateErrorMessage(err) };
      this.refreshUpdateUi();
    } finally {
      this.updateBusy = false;
    }
  },
  async installPending() {
    if (this.installingUpdate) return;
    if (this.voice) {
      this.updates = { ...this.updates, inCall: true, phase: "deferred", installRequested: true };
      this.refreshUpdateUi();
      return;
    }
    const update = this.pendingUpdate;
    if (!update) {
      this.updates = { ...this.updates, phase: "error", error: "The update is no longer available." };
      this.refreshUpdateUi();
      return;
    }
    this.installingUpdate = true;
    this.updates = { ...this.updates, phase: "installing", inCall: false };
    this.refreshUpdateUi();
    try {
      await update.install();
      // The Windows NSIS installer exits Lark and starts the new version itself.
      if (this.platform.os !== "windows") {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      this.installingUpdate = false;
      this.updates = { ...this.updates, phase: "error", error: updateErrorMessage(err) };
      this.refreshUpdateUi();
    }
  },
  noteCallForUpdates() {
    const step = setInCall(this.updates, Boolean(this.voice));
    const interfaceUi = setInterfaceCall(this.interfaceUi, Boolean(this.voice));
    if (interfaceUi !== this.interfaceUi) {
      this.interfaceUi = interfaceUi;
      this.refreshInterfaceUi();
    }
    if (step.state === this.updates && step.effect === "none") return;
    this.applyUpdateStep(step);
  },
  async watchInterface() {
    try {
      const status = await invoke<InterfaceSnapshot>("interface_status");
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
    } catch {
      this.interfaceUi = { ...this.interfaceUi, inCall: Boolean(this.voice) };
    }
    this.refreshInterfaceUi();
    void this.checkInterface(false);
    window.clearInterval(this.interfaceTimer);
    this.interfaceTimer = window.setInterval(() => void this.checkInterface(false), INTERFACE_CHECK_MS);
  },
  async checkInterface(manual: boolean) {
    if (!isTauri()) {
      if (!manual) return;
      this.interfaceUi = applyInterfaceError(this.interfaceUi, "Interface updates install from the macOS and Windows apps.", true);
      this.refreshInterfaceUi();
      return;
    }
    if (this.interfaceUi.checking) return;
    this.interfaceUi = { ...this.interfaceUi, checking: true, error: "" };
    this.refreshInterfaceUi();
    try {
      const report = await invoke<InterfaceReport>("interface_check", { manual });
      if (!this.interfaceUi.checking) return;
      this.interfaceUi = applyInterfaceReport({ ...this.interfaceUi, inCall: Boolean(this.voice) }, report, manual);
    } catch (err) {
      this.interfaceUi = applyInterfaceError({ ...this.interfaceUi, inCall: Boolean(this.voice) }, updateErrorMessage(err), manual);
    }
    this.refreshInterfaceUi();
  },
  async setInterfaceChannel(channel: InterfaceChannel) {
    if (!isTauri()) {
      this.interfaceUi = applyInterfaceSnapshot(this.interfaceUi, { ...this.interfaceUi.snapshot, channel });
      this.refreshInterfaceUi();
      return;
    }
    try {
      const status = await invoke<InterfaceSnapshot>("interface_set_channel", { channel });
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
      this.refreshInterfaceUi();
      void this.checkInterface(true);
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  },
  async resetInterface() {
    if (!isTauri()) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, "Interface updates install from the macOS and Windows apps.", true);
      this.refreshInterfaceUi();
      return;
    }
    try {
      const status = await invoke<InterfaceSnapshot>("interface_reset");
      this.interfaceUi = applyInterfaceSnapshot({ ...this.interfaceUi, inCall: Boolean(this.voice) }, status);
      this.refreshInterfaceUi();
      if (!this.voice && status.reloadReady) await this.reloadInterface();
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  },
  async reloadInterface() {
    if (this.voice) {
      this.interfaceUi = setInterfaceCall(this.interfaceUi, true);
      this.refreshInterfaceUi();
      return;
    }
    try {
      await invoke("interface_reload");
    } catch (err) {
      this.interfaceUi = applyInterfaceError(this.interfaceUi, updateErrorMessage(err), true);
      this.refreshInterfaceUi();
    }
  },
  refreshInterfaceUi() {
    this.paintInterfaceToast();
    if (this.settings && this.section === "updates") this.renderSettings();
  },
  paintInterfaceToast() {
    const toast = interfaceToast(this.interfaceUi);
    clear(this.interfaceToastEl);
    if (!toast) {
      this.interfaceToastEl.hidden = true;
      return;
    }
    this.interfaceToastEl.hidden = false;
    const reload = el("button", "primary", toast.action);
    reload.type = "button";
    reload.addEventListener("click", () => void this.reloadInterface());
    this.interfaceToastEl.append(el("span", "", toast.text), reload);
  },
  refreshUpdateUi() {
    this.paintUpdateBanner();
    if (this.settings && this.section === "updates") this.renderSettings();
  },
  paintUpdateBanner() {
    const banner = updateBanner(this.updates);
    clear(this.updateBannerEl);
    if (!banner) {
      this.updateBannerEl.hidden = true;
      return;
    }
    this.updateBannerEl.hidden = false;
    this.updateBannerEl.append(el("strong", "", banner.title));
    if (banner.notes) this.updateBannerEl.append(el("p", "", banner.notes));
    if (banner.status) this.updateBannerEl.append(el("p", "", banner.status));
    if (banner.progress != null) {
      const track = el("div", "update-progress");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(banner.progress * 100)));
      track.setAttribute("aria-label", "Update download");
      const bar = el("span");
      bar.style.width = `${Math.round(banner.progress * 100)}%`;
      track.append(bar);
      this.updateBannerEl.append(track);
    }
    if (!banner.showActions) return;
    const actions = el("div", "update-banner-actions");
    const later = el("button", "text-button", "Later");
    later.type = "button";
    later.addEventListener("click", () => {
      this.updates = dismissUpdate(this.updates);
      this.refreshUpdateUi();
    });
    const restart = el("button", "primary", "Restart to update");
    restart.type = "button";
    restart.addEventListener("click", () => this.applyUpdateStep(requestRestart({ ...this.updates, inCall: Boolean(this.voice) })));
    actions.append(later, restart);
    this.updateBannerEl.append(actions);
  },
});
