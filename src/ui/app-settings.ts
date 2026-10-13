import { snapCameraFps, snapCameraHeight } from "../camera-quality";
import { people } from "../demo/data";
import {
  cleanAlertList,
  clockMinutes,
  digestLines,
  digestSummary, inQuietHours
} from "../smart-notify";
import { personalLine } from "../privacy";
import {
  setHardwareEnabled
} from "../hardware";
import { clipBehaviorNote, CLIP_BUFFER_OPTIONS, CLIP_FPS_OPTIONS, CLIP_RESOLUTION_OPTIONS, sanitizeClipBuffer, sanitizeClipFps, sanitizeClipResolution } from "../clip";
import {
  limitSentence,
  parseCompressMode
} from "../clips";
import { speakColor } from "../voice-stage";
import {
  AUTO_INSTALL_KEY, setAutoInstall, updatesStatus,
  writeAutoInstall
} from "../updates";
import {
  interfaceBuildLabel
} from "../interface-update";
import { formatShortcut, shortcutConflicts } from "../shortcuts";
import type { AppConfig, NotifyLevel, Shortcuts } from "../types";
import { sanitizeSoundToggles } from "../soundboard";
import { noiseQualityName, readVoicePrefs, sanitizeInputProfiles, VOICE_PREFS_KEY, writeVoicePrefs } from "../voice";
import { clear, el, portrait } from "./dom";
import type { StatNote } from "./stats-store";
import { loadSettingsPages, peekSettingsPages, type SettingsPages } from "./lazy-chrome";
import { noteVoiceDiagnostics, setTrafficArmed, trafficArmed } from "../net/traffic";
import type { SettingEntry } from "./settings";
import { snapShareFps } from "../share";
import { downloadFile, isTauri, invoke, statusLabel, rgbToHex } from "./app-shared";
import { defineMethods } from "./app-shared";

export const settingsMethods = defineMethods({
  openSettings() {
    const opening = !this.settings;
    this.settings = true;
    this.settingsEl.hidden = false;
    if (opening) this.settingsEl.classList.remove("is-in");
    this.renderSettings();
    if (opening) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.settings) this.settingsEl.classList.add("is-in");
        });
      });
      this.settingsEl.querySelector<HTMLInputElement>("[data-settings-search]")?.focus();
    }
    this.afterSettingsSection();
  },
  closeSettings() {
    if (!this.settings) return;
    this.settings = false;
    this.rebinding = null;
    this.discordRebind = null;
    this.settingsQuery = "";
    this.settingsAnchor = "";
    this.settingsEntered = "";
    this.settingsEl.classList.remove("is-in");
    window.setTimeout(() => {
      if (!this.settings) this.settingsEl.hidden = true;
    }, 160);
    this.paint();
  },
  settingsIndex(): SettingEntry[] {
    return this.late!.settingEntries(this.catalog.map((plugin) => ({
      id: `plugin.${plugin.id}`,
      section: "plugins",
      label: plugin.name,
      description: plugin.description,
    })));
  },
  afterSettingsSection() {
    if (!this.settings) return;
    if (this.section === "appearance") void this.refreshThemeIndex();
    if (this.section === "plugins") void this.refreshPluginsPane();
    if (this.section === "account" || this.section === "connections") void this.loadAccountOverview();
    if (this.section === "clips") {
      void this.pullClipStatus().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
      void this.loadClips().then(() => {
        if (this.settings && this.section === "clips") this.renderSettings();
      });
    }
  },
  renderSettings() {
    if (!this.late) {
      void this.ensureLate().then(() => this.renderSettings());
      return;
    }
    const query = this.settingsQuery;
    const index = this.settingsIndex();
    const visible = this.late!.sectionsForQuery(query, this.late!.settingsSections(), index);
    if (query.trim() && visible.length && !visible.some((item) => item.id === this.section)) {
      this.section = visible[0].id;
    }
    const previousTop = this.settingsEl.querySelector(".settings-body")?.scrollTop ?? 0;
    const sameSection = this.settingsEntered === this.section;
    const anchor = this.settingsAnchor;
    clear(this.settingsEl);

    const sidebar = el("aside", "settings-sidebar");
    const searchLabel = el("label", "settings-search");
    const search = el("input");
    search.type = "search";
    search.placeholder = "Search";
    search.value = query;
    search.spellcheck = false;
    search.setAttribute("aria-label", "Search settings");
    search.dataset.settingsSearch = "1";
    search.addEventListener("input", () => {
      const before = this.section;
      this.settingsQuery = search.value;
      const caret = search.selectionStart ?? search.value.length;
      this.renderSettings();
      if (this.section !== before) this.afterSettingsSection();
      const next = this.settingsEl.querySelector<HTMLInputElement>("[data-settings-search]");
      if (!next) return;
      next.focus();
      next.setSelectionRange(caret, caret);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const hit = this.late!.searchSettings(this.settingsQuery, this.late!.settingsSections(), this.settingsIndex())[0];
      if (!hit) return;
      event.preventDefault();
      const before = this.section;
      this.section = hit.section;
      this.settingsAnchor = hit.kind === "setting" ? hit.id : "";
      this.renderSettings();
      if (this.section !== before) this.afterSettingsSection();
    });
    searchLabel.append(search);
    sidebar.append(searchLabel);

    const navScroll = el("div", "settings-nav-scroll");
    const nav = el("nav", "settings-nav");
    nav.setAttribute("aria-label", "Settings categories");
    if (query.trim()) {
      const hits = this.late!.searchSettings(query, this.late!.settingsSections(), index);
      if (!hits.length) nav.append(el("p", "settings-empty", "No settings match that."));
      for (const hit of hits) {
        const button = el("button", "settings-hit");
        button.type = "button";
        const section = this.late!.settingsSections().find((item) => item.id === hit.section);
        button.append(el("strong", "", hit.label));
        button.append(el("span", "", hit.kind === "section" ? "Category" : (section?.label ?? "")));
        button.addEventListener("click", () => {
          const before = this.section;
          this.section = hit.section;
          this.settingsAnchor = hit.kind === "setting" ? hit.id : "";
          this.renderSettings();
          if (this.section !== before) this.afterSettingsSection();
        });
        nav.append(button);
      }
    } else {
      for (const group of this.late!.groupedSections(visible)) {
        const block = el("div", "settings-group");
        block.append(el("h2", "settings-group-label", group.label));
        for (const item of group.sections) {
          const button = el("button", this.section === item.id ? "settings-link is-on" : "settings-link", item.label);
          button.type = "button";
          button.setAttribute("aria-current", this.section === item.id ? "true" : "false");
          button.addEventListener("click", () => {
            if (this.section === item.id) return;
            this.section = item.id;
            this.settingsAnchor = "";
            this.renderSettings();
            this.afterSettingsSection();
          });
          block.append(button);
        }
        nav.append(block);
      }
    }
    navScroll.append(nav);
    sidebar.append(navScroll);
    const logout = el("button", "settings-link", "Log Out");
    logout.type = "button";
    logout.addEventListener("click", () => void this.logoutAccount());
    sidebar.append(logout);

    const stage = el("div", "settings-stage");
    const body = el("div", "settings-body");
    const content = el("div", sameSection ? "settings-content" : "settings-content is-entering");
    this.settingsEntered = this.section;
    content.append(this.settingsPane());
    this.markSettingHits(content);
    body.append(content);
    const closeWrap = el("div", "settings-close-wrap");
    closeWrap.append(this.late!.settingsCloseButton(() => this.closeSettings()));
    stage.append(body, closeWrap);
    this.settingsEl.append(sidebar, stage);
    if (anchor) {
      const target = content.querySelector<HTMLElement>(`[data-setting="${CSS.escape(anchor)}"]`);
      if (target) {
        target.classList.add("is-anchor");
        target.scrollIntoView({ block: "center" });
      }
      this.settingsAnchor = "";
    } else if (sameSection) {
      body.scrollTop = previousTop;
    }
  },
  markSettingHits(root: HTMLElement) {
    const query = this.settingsQuery.trim();
    if (!query) return;
    const ids = new Set(
      this.late!.searchSettings(query, this.late!.settingsSections(), this.settingsIndex())
        .filter((hit) => hit.kind === "setting")
        .map((hit) => hit.id),
    );
    for (const node of root.querySelectorAll<HTMLElement>("[data-setting]")) {
      if (ids.has(node.dataset.setting ?? "")) node.classList.add("is-hit");
    }
  },
  settingsNow(): SettingsPages | null {
    const pages = peekSettingsPages();
    if (pages) return pages;
    if (!this.settingsQueued) {
      this.settingsQueued = true;
      void loadSettingsPages().then(() => {
        this.settingsQueued = false;
        if (this.settings) this.renderSettings();
      });
    }
    return null;
  },
  paneFromSettings(render: (pages: SettingsPages) => HTMLElement): HTMLElement {
    const pages = this.settingsNow();
    if (pages) return render(pages);
    const wrap = el("div", "settings-stack");
    wrap.append(el("p", "setting-help", "Loading settings"));
    return wrap;
  },
  noteStat(note: StatNote) {
    if (this.bench || this.statOff) return;
    this.statQueue.push(note);
    if (this.statTimer) return;
    this.statTimer = window.setTimeout(() => {
      this.statTimer = 0;
      void this.flushStats();
    }, 1200);
  },
  flushStats(): Promise<void> {
    const batch = this.statQueue.splice(0);
    if (!batch.length || this.statOff || this.bench) return Promise.resolve();
    const boot = this.statBoot;
    this.statBoot = 0;
    return import("./stats-store").then((mod) => {
      mod.noteAll(batch, boot);
    }).catch(() => undefined);
  },
  notePlace(kind: "focus" | "message" | "voice", id: string, on?: 0 | 1) {
    if (this.bench || this.statOff) return;
    const place = this.placeFor(id);
    const channel = this.channelById(id);
    const scope = channel?.kind === "dm" || channel?.kind === "group"
      ? channel.kind
      : channel?.kind === "voice" || channel?.kind === "stage" ? "voice" : "text";
    this.noteStat({
      t: Date.now(),
      kind,
      id,
      name: place.channelName,
      place: place.guildName,
      scope: kind === "voice" ? "voice" : scope,
      on,
    });
  },
  paneStats(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(el("p", "setting-help", "Loading stats"));
    void this.flushStats().then(() => import("./stats-page")).then((mod) => {
      if (this.section !== "stats" || !wrap.isConnected) return;
      clear(wrap);
      mod.mountStatsPage(wrap, {
        onCollecting: (on) => {
          this.statOff = !on;
          if (!on) this.statQueue.length = 0;
        },
      });
    }).catch(() => undefined);
    return wrap;
  },
  settingsPane(): HTMLElement {
    switch (this.section) {
      case "account": return this.paneAccount();
      case "messaging": return this.paneFromSettings((pages) => pages.renderMessagingPane(this.settingsHost()));
      case "data": return this.paneFromSettings((pages) => pages.renderDataPane(this.settingsHost()));
      case "connections": return this.paneFromSettings((pages) => pages.renderConnectionsPane(this.settingsHost()));
      case "activity": return this.paneFromSettings((pages) => pages.renderActivityPane(this.settingsHost()));
      case "nitro": return this.paneFromSettings((pages) => pages.renderNitroPane(this.settingsHost()));
      case "appearance": return this.paneAppearance();
      case "accessibility": return this.paneFromSettings((pages) => pages.renderAccessibilityPane(this.settingsHost()));
      case "notifications": return this.paneNotifications();
      case "shortcuts": return this.paneShortcuts();
      case "language": return this.paneFromSettings((pages) => pages.renderLanguagePane(this.settingsHost()));
      case "window": return this.paneWindow();
      case "advanced": return this.paneFromSettings((pages) => pages.renderAdvancedPane(this.settingsHost()));
      case "updates": return this.paneUpdates();
      case "voice": return this.paneVoice();
      case "messages": return this.paneMessages();
      case "privacy": return this.panePrivacy();
      case "clips": return this.paneClips();
      case "gaming": return this.paneGaming();
      case "stats": return this.paneStats();
      case "plugins":
      case "lark":
        return this.panePlugins();
      default: {
        const extra = this.late!.settingsPane(this.section);
        if (extra) return extra();
        const known = this.late!.settingsSections().find((item) => item.id === this.section);
        const wrap = el("div", "settings-stack");
        wrap.append(this.late!.settingHead(known?.label ?? "Settings", known?.description ?? "This page has no controls yet."));
        return wrap;
      }
    }
  },
  paneUpdates(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Updates", "Lark checks for an app update and an interface bundle on startup and every 30 minutes. A voice call finishes before either one reloads."));
    const card = this.late!.settingCard("This computer");
    card.append(this.late!.settingRow("updates.version", "Current version", "The version of Lark running on this computer.", el("span", "hint", this.updates.currentVersion || "3.0.4")));
    card.append(this.switchRow("updates.auto", "Automatically install updates", "Download a new version in the background and install it when it is ready. A voice call finishes first.", this.updates.autoInstall, (value) => {
      const step = setAutoInstall(this.updates, value);
      this.updates = step.state;
      localStorage.setItem(AUTO_INSTALL_KEY, writeAutoInstall(value));
      this.paintUpdateBanner();
      this.followUpdate(step);
    }));
    const check = el("button", "text-button", this.updates.phase === "checking" ? "Checking…" : "Check for updates");
    check.type = "button";
    check.disabled = this.updates.phase === "checking" || this.updates.phase === "downloading" || this.updates.phase === "installing";
    check.addEventListener("click", () => void this.checkForUpdates(true));
    card.append(this.late!.settingRow("updates.check", "Check for updates", "Look for a Lark update now.", check));
    card.append(el("p", "setting-help", updatesStatus(this.updates)));
    if (!isTauri()) card.append(el("p", "setting-help", "Updates install from the macOS and Windows apps."));
    const notes = this.updates.offer?.notes.trim();
    if (notes && this.updates.skippedVersion !== this.updates.offer?.version) {
      card.append(el("p", "setting-help", notes.length > 1200 ? `${notes.slice(0, 1199).trimEnd()}…` : notes));
    }
    wrap.append(card);
    const uiCard = this.late!.settingCard("Interface");
    uiCard.append(this.late!.settingRow("updates.ui", "Interface build", "The interface loaded in this window. Built-in is the one packaged with the app.", el("span", "hint", interfaceBuildLabel(this.interfaceUi.snapshot))));
    uiCard.append(this.late!.settingRow(
      "updates.channel",
      "Interface channel",
      "Stable or Canary. Canary gets each interface build. Stable gets a promoted build.",
      this.late!.segmentControl(["stable", "canary"], this.interfaceUi.snapshot.channel, (value) => {
        void this.setInterfaceChannel(value === "canary" ? "canary" : "stable");
      }, { stable: "Stable", canary: "Canary" }),
      true,
    ));
    const checkUi = el("button", "text-button", this.interfaceUi.checking ? "Checking…" : "Check now");
    checkUi.type = "button";
    checkUi.disabled = this.interfaceUi.checking;
    checkUi.addEventListener("click", () => void this.checkInterface(true));
    uiCard.append(this.late!.settingRow("updates.interface", "Check now", "Look for an interface bundle now.", checkUi));
    const resetUi = el("button", "text-button", "Reset to built-in UI");
    resetUi.type = "button";
    resetUi.addEventListener("click", () => void this.resetInterface());
    uiCard.append(this.late!.settingRow("updates.reset", "Reset to built-in UI", "Drop the downloaded interface and load the one packaged with Lark.", resetUi));
    if (this.interfaceUi.error) uiCard.append(el("p", "setting-help", this.interfaceUi.error));
    else if (this.interfaceUi.note) uiCard.append(el("p", "setting-help", this.interfaceUi.note));
    if (!isTauri()) uiCard.append(el("p", "setting-help", "Interface updates install from the macOS and Windows apps."));
    wrap.append(uiCard);
    return wrap;
  },
  paneAccount(): HTMLElement {
    const me = this.demo ? people[0] : this.me;
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("My Account", "Name, avatar, and id come from Discord. Lark does not edit them. The token never goes in the config file, logs, or a plugin."));
    const who = this.late!.settingCard();
    who.append(el("div", "account-banner"));
    const body = el("div", "account-body");
    body.append(portrait(me.name, me.id, me.avatarUrl));
    const copy = el("div");
    copy.append(el("strong", "", this.maskText(me.name)));
    copy.append(el("div", "hint", this.maskText(me.custom || statusLabel(me.status))));
    copy.append(el("div", "hint", personalLine(me.id, this.streamerOn())));
    body.append(copy);
    who.append(body);
    const session = this.late!.settingCard("Session");
    session.dataset.setting = "account.session";
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "macOS Keychain", "~/Library/Application Support/dev.lark.desktop"));
    grid.append(this.platformCard("Windows", "Windows Credential Manager", "%APPDATA%\\dev.lark.desktop"));
    session.append(grid);
    session.append(el("p", "setting-help", `This session: ${this.platform.credentialStore}. Config folder: ${this.platform.configDir}`));
    const accountPages = this.settingsNow();
    wrap.append(who, session, ...(accountPages ? accountPages.renderAccountDetails(this.settingsHost()) : []));
    return wrap;
  },
  settingsHost() {
    return {
      config: this.config,
      streamer: this.streamerOn(),
      tauri: isTauri(),
      os: this.platform.os,
      meName: this.me.name,
      meId: this.me.id,
      meCustom: this.me.custom || "",
      credentialStore: this.platform.credentialStore,
      configDir: this.platform.configDir,
      account: this.accountOverview,
      accountNote: this.accountNote,
      discordRebind: this.discordRebind,
      mask: (value: string) => this.maskText(value),
      persist: () => { void this.persist(); },
      refresh: () => { if (this.settings) this.renderSettings(); },
      apply: () => this.applyAppearance(),
      repaint: () => this.paint(),
      logout: () => { void this.logoutAccount(); },
      switchAccount: (id: string) => { void this.switchTo(id); },
      removeAccount: (id: string) => { void this.removeAccount(id); },
      addAccount: () => { void this.addAccount(); },
      unlink: (type: string, id: string) => { void this.unlinkConnection(type, id); },
      rebindDiscord: (id: string) => {
        this.discordRebind = id;
        this.rebinding = null;
        if (this.settings) this.renderSettings();
      },
      formatShortcut: (shortcut: string) => formatShortcut(shortcut, this.platform.os),
      open: (url: string) => this.openDiscord(url),
      onDeveloper: (on: boolean) => { if (!on) this.closeNetworkPanel(); },
      openNetwork: () => this.openNetworkPanel(),
    };
  },
  openNetworkPanel() {
    if (this.netPanel || this.netOpening || !this.config.display.developer_mode) return;
    this.netOpening = true;
    const ticket = ++this.netTicket;
    setTrafficArmed(true);
    void import("./net-panel").then(({ mountNetPanel }) => {
      this.netOpening = false;
      if (ticket !== this.netTicket || !this.config.display.developer_mode) {
        if (ticket === this.netTicket) this.disarmNetwork();
        return;
      }
      this.netPanel = mountNetPanel(() => this.disarmNetwork(), (name, body) => downloadFile(name, body, "application/json"));
      this.netVoiceTimer = window.setInterval(() => this.pollVoiceTraffic(), 1000);
    }).catch(() => {
      this.netOpening = false;
      if (ticket === this.netTicket) this.disarmNetwork();
    });
  },
  pollVoiceTraffic() {
    if (!trafficArmed()) return;
    void invoke<string>("voice_diagnostics").then((text) => {
      if (trafficArmed()) noteVoiceDiagnostics(text);
    }).catch(() => undefined);
  },
  disarmNetwork() {
    setTrafficArmed(false);
    window.clearInterval(this.netVoiceTimer);
    this.netVoiceTimer = 0;
    this.netPanel = null;
  },
  closeNetworkPanel() {
    this.netTicket += 1;
    this.netOpening = false;
    const panel = this.netPanel;
    if (panel) panel.close();
    else this.disarmNetwork();
  },
  paneAppearance(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Appearance", "Each card is that theme's own colours. One click applies it."));
    const appearancePages = this.settingsNow();
    if (appearancePages) wrap.append(appearancePages.colorModeCard(this.settingsHost()));
    const themes = this.late!.settingCard("Themes");
    themes.dataset.setting = "appearance.theme";
    const filter = el("input", "theme-filter");
    filter.type = "search";
    filter.placeholder = "Filter themes";
    filter.value = this.themeFilter;
    filter.setAttribute("aria-label", "Filter themes");
    filter.addEventListener("input", () => {
      this.themeFilter = filter.value;
      this.paintThemeGallery();
    });
    const grid = el("div", "theme-gallery");
    const actions = el("div", "theme-actions");
    const exportCss = el("button", "text-button", "Export CSS");
    exportCss.type = "button";
    exportCss.addEventListener("click", () => void this.exportTheme("css"));
    const exportJson = el("button", "text-button", "Export JSON");
    exportJson.type = "button";
    exportJson.addEventListener("click", () => void this.exportTheme("json"));
    const importBtn = el("button", "text-button", "Import");
    importBtn.type = "button";
    const file = el("input", "theme-file");
    file.type = "file";
    file.accept = ".css,.json,text/css,application/json";
    file.setAttribute("aria-label", "Import theme file");
    file.tabIndex = -1;
    file.addEventListener("change", () => {
      const picked = file.files?.[0];
      file.value = "";
      if (picked) void this.importTheme(picked);
    });
    importBtn.addEventListener("click", () => file.click());
    actions.append(exportCss, exportJson, importBtn, file);
    themes.append(filter, grid, actions);
    themes.append(el("p", "setting-help", "CSS and JSON carry the same colours. Frosted uses the system material on macOS and Windows, and stays opaque elsewhere. Themes do not blur or animate the message list."));
    const text = this.late!.settingCard("Text");
    text.append(this.segmentRow(
      "appearance.font",
      "Font",
      "The face used for messages and the chrome.",
      ["inter", "system", "serif", "mono"],
      { inter: "Inter", system: "System", serif: "Serif", mono: "Mono" },
      this.config.appearance.font_family,
      (value) => {
        this.config.appearance.font_family = value as AppConfig["appearance"]["font_family"];
        this.persist();
        this.paint();
      },
    ));
    text.append(this.sliderRow("appearance.size", "Font size", "Interface size, from 12 to 24.", this.config.appearance.font_size, 12, 24, (value) => {
      this.config.appearance.font_size = value;
      this.persist();
      this.applyAppearance();
    }));
    const display = this.late!.settingCard("Display");
    display.append(this.segmentRow(
      "appearance.density",
      "Density",
      "How tightly messages sit.",
      ["cozy", "compact", "irc"],
      { cozy: "Cozy", compact: "Compact", irc: "IRC" },
      this.config.appearance.density,
      (value) => {
        this.config.appearance.density = value as AppConfig["appearance"]["density"];
        this.persist();
        this.msgSig = "";
        this.paint();
      },
    ));
    display.append(this.segmentRow(
      "appearance.channels",
      "Channel list",
      "Which side the channel list uses, or hide it.",
      ["left", "right", "hidden"],
      { left: "Left", right: "Right", hidden: "Hidden" },
      this.config.appearance.channel_list,
      (value) => {
        this.config.appearance.channel_list = value as AppConfig["appearance"]["channel_list"];
        this.persist();
        this.paint();
      },
    ));
    display.append(this.switchRow("appearance.members", "Member list", "Show the member list beside the chat.", this.config.appearance.show_member_list, (value) => {
      this.config.appearance.show_member_list = value;
      this.persist();
      this.paint();
    }));
    display.append(this.switchRow("appearance.rail", "Server rail", "Show the server icons along the left edge.", this.config.appearance.show_server_rail, (value) => {
      this.config.appearance.show_server_rail = value;
      this.persist();
      this.paint();
    }));
    display.append(this.accentRow());
    wrap.append(themes, text, display);
    if (appearancePages) wrap.append(appearancePages.appIconCard(this.settingsHost()), appearancePages.mediaCard(this.settingsHost()));
    this.paintThemeGallery(wrap);
    return wrap;
  },
  accentRow(): HTMLElement {
    const guild = this.guilds().find((item) => item.id === this.guildId);
    const stored = guild ? (this.config.accents[guild.id] ?? "") : "";
    const shown = this.late!.normalizeHex(stored) || rgbToHex(getComputedStyle(this.root).getPropertyValue("--accent")) || "#fafafa";
    const control = this.late!.colorControl(shown, "Server accent", (hex) => {
      if (!this.guildId) return;
      this.config.accents[this.guildId] = hex;
      this.persist();
      this.applyAppearance();
    }, guild && stored ? () => {
      if (!this.guildId) return;
      delete this.config.accents[this.guildId];
      this.persist();
      this.applyAppearance();
      if (this.settings) this.renderSettings();
    } : undefined);
    if (!guild) {
      for (const node of control.querySelectorAll("input, button")) {
        if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement) node.disabled = true;
      }
    }
    const description = guild
      ? `Colour for ${guild.name}. Reset follows the theme.`
      : "Open a server to set its accent. Direct messages use the theme colour.";
    return this.late!.settingRow("appearance.accent", "Server accent", description, control, true);
  },
  paneNotifications(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Notifications", this.platform.notificationNote));
    const card = this.late!.settingCard("Alerts");
    card.append(this.segmentRow(
      "notifications.level",
      "Notify me when",
      "All messages, only mentions, or nothing.",
      ["all", "mentions", "mute"],
      { all: "All messages", mentions: "Mentions", mute: "Nothing" },
      this.config.notifications.default,
      (value) => {
        this.config.notifications.default = value as NotifyLevel;
        this.persist();
      },
    ));
    const test = el("button", "primary", "Send a test notification");
    test.type = "button";
    test.addEventListener("click", () => void this.notify("Lark", "Notifications are on. Mute still wins."));
    card.append(this.late!.settingRow("notifications.test", "Test notification", "Send a sample so you can see where it lands.", test));
    const words = el("input");
    words.value = this.config.notifications.keywords.join(", ");
    words.setAttribute("aria-label", "Highlight keywords");
    words.addEventListener("change", () => {
      this.config.notifications.keywords = words.value.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 20);
      this.persist();
      this.msgSig = "";
    });
    card.append(this.late!.settingRow("notifications.keywords", "Highlight keywords", "Messages that contain these words get a highlight. Separate words with commas.", words, true));
    const grid = el("div", "platform-grid");
    grid.append(this.platformCard("macOS", "Banners and Notification Center", "⌘"));
    grid.append(this.platformCard("Windows", "Toasts in Action Center", "Ctrl"));
    card.append(grid);
    const notificationPages = this.settingsNow();
    if (notificationPages) card.append(...notificationPages.notificationExtras(this.settingsHost()));
    wrap.append(card, this.quietCard(), this.alertCard(), this.missedCard());
    return wrap;
  },
  quietCard(): HTMLElement {
    const quiet = this.config.notifications.quiet;
    const card = this.late!.settingCard("Quiet hours");
    card.append(this.switchRow(
      "notifications.quiet",
      "Quiet hours",
      "Uses this computer's clock. Mentions, direct messages, and keyword or person alerts still come through. A mute still blocks ordinary messages.",
      quiet.enabled,
      (value) => {
        this.config.notifications.quiet.enabled = value;
        this.quietOn = inQuietHours(this.config.notifications.quiet, new Date());
        this.persist();
      },
    ));
    card.append(this.clockRow("notifications.quiet.start", "Start", "When the window begins.", quiet.start, (value) => {
      this.config.notifications.quiet.start = value;
      this.persist();
    }));
    card.append(this.clockRow("notifications.quiet.end", "End", "When the window ends. A later start runs through midnight.", quiet.end, (value) => {
      this.config.notifications.quiet.end = value;
      this.persist();
    }));
    card.append(this.segmentRow(
      "notifications.quiet.mode",
      "Non-critical alerts",
      "Suppress drops them. Batch saves them and sends one summary when the window ends or you come back.",
      ["suppress", "batch"],
      { suppress: "Suppress", batch: "Batch" },
      quiet.mode,
      (value) => {
        this.config.notifications.quiet.mode = value === "suppress" ? "suppress" : "batch";
        this.persist();
      },
    ));
    return card;
  },
  alertCard(): HTMLElement {
    const card = this.late!.settingCard("Alerts");
    card.append(el("p", "setting-help", "A match notifies you even when the channel is muted. Add the word, the person, or the channel id to Blocked to stop that."));
    card.append(this.commaRow(
      "notifications.alerts",
      "Alert keywords",
      "Words, separated by commas.",
      this.config.notifications.alert_keywords,
      (next) => {
        this.config.notifications.alert_keywords = next;
      },
    ));
    card.append(this.commaRow(
      "notifications.people",
      "People",
      "Exact display names or user ids.",
      this.config.notifications.people,
      (next) => {
        this.config.notifications.people = next;
      },
    ));
    card.append(this.commaRow(
      "notifications.blocked",
      "Blocked",
      "These never break a mute.",
      this.config.notifications.blocked,
      (next) => {
        this.config.notifications.blocked = next;
      },
    ));
    return card;
  },
  missedCard(): HTMLElement {
    const card = this.late!.settingCard("Missed");
    card.dataset.setting = "notifications.missed";
    const lines = digestLines(this.missed);
    if (!lines.length) {
      card.append(el("p", "setting-help", "Nothing missed. Lark keeps this list on this device while you are away or in quiet hours."));
      return card;
    }
    const summary = digestSummary(this.missed);
    card.append(el("p", "setting-help", `${summary.title}. Kept on this device. Opening a channel clears it.`));
    const list = el("div", "missed-list");
    for (const line of lines) {
      const button = el("button", "bookmark-row");
      button.type = "button";
      button.append(el("strong", "", this.maskText(line.name)), el("span", "", `${line.count} message${line.count === 1 ? "" : "s"}`));
      button.addEventListener("click", () => this.openMissed(line.channelId));
      list.append(button);
    }
    card.append(list);
    const clear = el("button", "text-button", "Clear");
    clear.type = "button";
    clear.addEventListener("click", () => {
      this.missed = [];
      this.missedSeen = Date.now();
      this.saveMissed();
      if (this.settings) this.renderSettings();
    });
    card.append(clear);
    return card;
  },
  clockRow(id: string, label: string, description: string, value: string, onChange: (value: string) => void): HTMLElement {
    const input = el("input");
    input.type = "time";
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      if (clockMinutes(input.value) === null) {
        input.value = value;
        return;
      }
      onChange(input.value);
      this.quietOn = inQuietHours(this.config.notifications.quiet, new Date());
    });
    return this.late!.settingRow(id, label, description, input);
  },
  commaRow(id: string, label: string, description: string, current: readonly string[], apply: (next: string[]) => void): HTMLElement {
    const input = el("input");
    input.type = "text";
    input.value = current.join(", ");
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      apply(cleanAlertList(input.value));
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return this.late!.settingRow(id, label, description, input, true);
  },
  openMissed(channelId: string) {
    const guildId = this.guildForChannel(channelId);
    if (guildId) {
      this.guildId = guildId;
      this.friendsOpen = false;
    } else if (this.dms().some((channel) => channel.id === channelId)) {
      this.guildId = null;
      this.friendsOpen = false;
    }
    this.closeSettings();
    void this.openChannel(channelId);
  },
  paneShortcuts(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Keybinds", "mod is ⌘ on macOS and Ctrl on Windows. Click a shortcut, then press the new keys. Save clip is global on macOS and Windows, so it still works while a game is in front."));
    const card = this.late!.settingCard("Shortcuts");
    card.append(this.late!.settingRow("shortcut.mark_read", "Mark read", "Esc closes whatever is open first. With nothing open, it marks the channel read.", el("span", "kbd", "Esc")));
    const conflicts = shortcutConflicts(this.config.shortcuts);
    if (conflicts.length) card.append(el("div", "warning", conflicts.join(" ")));
    for (const [action, shortcut] of Object.entries(this.config.shortcuts) as [keyof Shortcuts, string][]) {
      const copy = this.late!.SHORTCUT_COPY[action] ?? { label: action.replaceAll("_", " "), description: "" };
      const button = el("button", "kbd", this.rebinding === action ? "Press keys" : formatShortcut(shortcut, this.platform.os));
      button.type = "button";
      button.addEventListener("click", () => {
        this.rebinding = action;
        this.renderSettings();
      });
      card.append(this.late!.settingRow(`shortcut.${action}`, copy.label, copy.description, button));
    }
    const shortcutPages = this.settingsNow();
    wrap.append(card);
    if (shortcutPages) wrap.append(shortcutPages.discordKeybindCard(this.settingsHost()));
    return wrap;
  },
  paneWindow(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Window", "Tray, login, and how fast the window paints."));
    const card = this.late!.settingCard("Desktop");
    card.append(this.switchRow("window.tray", "Minimise to tray", "Closing the window leaves Lark in the menu bar or system tray.", this.config.desktop.minimize_to_tray, (value) => {
      this.config.desktop.minimize_to_tray = value;
      this.persist();
      if (isTauri()) void invoke("set_minimize_to_tray", { enabled: value });
    }));
    card.append(this.switchRow("window.login", "Open at login", "Start Lark when you sign in to this computer.", this.config.desktop.autostart, (value) => {
      this.config.desktop.autostart = value;
      this.persist();
      if (isTauri()) void invoke("set_autostart", { enabled: value });
    }));
    card.append(this.segmentRow(
      "window.frame",
      "Frame rate",
      "Scrolling and transitions follow the monitor, up to this cap. Lark paints only when something on screen changes.",
      ["0", "240", "165", "144", "120", "60"],
      { "0": "Match", "240": "240", "165": "165", "144": "144", "120": "120", "60": "60" },
      String(this.config.desktop.frame_cap),
      (value) => {
        this.config.desktop.frame_cap = Number(value);
        this.frames.setCap(Number(value));
        this.persist();
      },
    ));
    const hz = this.frames.displayHz;
    card.append(el("p", "setting-help", hz
      ? `This display is about ${hz} Hz. The hard cap is 240.`
      : "Measuring the display. The hard cap is 240."));
    wrap.append(card);
    return wrap;
  },
  paneVoice(): HTMLElement {
    this.ensureVoicePrefs();
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Voice & Video", "Push to talk, voice activity, and Lark noise suppression (RNNoise) on the microphone."));
    void this.loadAudioDevices();
    const input = this.late!.settingCard("Input");
    input.append(this.segmentRow(
      "voice.mode",
      "Input mode",
      "Voice activity opens the mic when you speak. Push to talk waits for the key.",
      ["vad", "ptt"],
      { vad: "Voice activity", ptt: "Push to talk" },
      this.voiceMode(),
      (value) => this.setVoiceMode(value === "ptt" ? "ptt" : "vad"),
    ));
    if (this.detectedGame) {
      input.append(el("p", "setting-help", this.resolvedGame().profile
        ? `Push to talk for ${this.detectedGame} is saved on that game. It steps back when the game closes.`
        : `${this.detectedGame} is using your usual voice setting. A change here is remembered for this game.`));
    }
    input.append(this.sliderRow("voice.sensitivity", "Voice activity sensitivity", "How loud you need to be before voice activity opens the mic.", this.config.voice.sensitivity, 0, 100, (value) => {
      this.config.voice.sensitivity = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    input.append(this.switchRow("voice.noise", "Lark noise suppression", "RNNoise runs on the microphone when this is on. Echo cancellation is separate. Higher quality uses a spectral suppressor. This is not Krisp.", this.config.voice.noise_suppression, (value) => {
      this.config.voice.noise_suppression = value;
      this.persist();
      this.pushVoiceAudio();
      this.paintVoice();
    }));
    const hudKey = formatShortcut(this.config.shortcuts.toggle_voice_overlay, this.platform.os);
    const perfKey = formatShortcut(this.config.shortcuts.toggle_perf_overlay, this.platform.os);
    const hud = this.late!.settingCard("In-game voice HUD");
    hud.append(el("p", "setting-help", "A small always-on-top window on macOS and Windows. It uses the same voice roster as the channel list. It stays off until you turn it on. Click through starts on, so the window does not take the mouse from a game."));
    hud.append(this.switchRow("voice.hud", "Show voice HUD", `${hudKey} shows and hides it, including while a game is focused.`, this.overlayOn(), (value) => {
      this.setVoiceOverlay(value, false);
    }));
    hud.append(this.sliderRow("voice.opacity", "Opacity", "How solid the voice HUD is. The same value covers the performance strip.", this.config.voice.overlay_opacity, 35, 100, (value) => {
      this.config.voice.overlay_opacity = value;
      this.persist();
      this.publishVoiceHud();
    }));
    hud.append(this.switchRow("voice.click", "Click through", "Lets the game take the mouse. Turn it off to drag the HUD.", this.config.voice.overlay_click_through, (value) => {
      this.config.voice.overlay_click_through = value;
      this.persist();
      this.publishVoiceHud();
    }));
    hud.append(this.switchRow("voice.perf", "Show performance", `${perfKey} adds RAM, CPU, and FPS to the same window.`, this.perfOn(), (value) => {
      this.setPerfOverlay(value, false);
    }));
    const devices = this.late!.settingCard("Devices");
    devices.append(el("p", "setting-help", "Lark stores the device you pick. Voice matches that name on the desktop device. An unknown id uses the communications device."));
    devices.append(this.deviceRow("voice.input", "Input", "Microphone Lark stores for the call.", this.config.voice.input_device, this.captureDevices(), (value) => {
      this.config.voice.input_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    devices.append(this.deviceRow("voice.output", "Output", "Speakers or headphones for the call.", this.config.voice.output_device, this.playbackDevices(), (value) => {
      this.config.voice.output_device = value;
      this.persist();
      this.pushVoiceAudio();
    }));
    devices.append(this.deviceRow("voice.camera", "Camera", "Camera Lark opens for the preview and for video in a call.", this.config.voice.video_device, this.videoInputs, (value) => {
      this.config.voice.video_device = value;
      this.persist();
    }));
    const listDevices = el("button", "text-button", "List microphones and cameras");
    listDevices.type = "button";
    listDevices.addEventListener("click", () => void this.listDevices());
    const copyDiag = this.diagnosticsButton();
    const deviceActions = el("div", "settings-actions");
    deviceActions.append(listDevices, copyDiag);
    devices.append(deviceActions);
    const camera = this.late!.settingCard("Camera");
    camera.append(el("p", "setting-help", "720p at 30 fps is the default. The GPU encodes it when this computer has a hardware encoder, and a software encoder is the fallback. Lark steps the picture down when packets are being lost, then back up when the link clears."));
    camera.append(this.segmentRow(
      "voice.camera.quality",
      "Resolution",
      "360p, 480p, 720p, or 1080p.",
      ["360", "480", "720", "1080"],
      { "360": "360p", "480": "480p", "720": "720p", "1080": "1080p" },
      String(snapCameraHeight(this.config.voice.camera_height)),
      (value) => {
        this.config.voice.camera_height = snapCameraHeight(Number(value));
        this.persist();
        if (this.cameraOn) void this.startCameraSend();
      },
    ));
    camera.append(this.segmentRow(
      "voice.camera.fps",
      "Frame rate",
      "15 or 30. 30 matches a Discord camera.",
      ["15", "30"],
      { "15": "15", "30": "30" },
      String(snapCameraFps(this.config.voice.camera_fps)),
      (value) => {
        this.config.voice.camera_fps = snapCameraFps(Number(value));
        this.persist();
        if (this.cameraOn) void this.startCameraSend();
      },
    ));
    const ring = this.late!.settingCard("Speaking ring");
    ring.append(this.speakRingRow());
    const share = this.late!.settingCard("Screen share");
    share.append(el("p", "setting-help", "Go Live uses these defaults. The picker in a call can still change them, and every resolution is available."));
    share.append(this.segmentRow(
      "voice.share.quality",
      "Default quality",
      "Resolution for a new stream. Source keeps the window's own size.",
      ["720", "1080", "1440", "2160", "source"],
      { "720": "720p", "1080": "1080p", "1440": "1440p", "2160": "4K", source: "Source" },
      this.config.voice.share_resolution,
      (value) => {
        this.config.voice.share_resolution = value;
        this.persist();
      },
    ));
    share.append(this.segmentRow(
      "voice.share.quality",
      "Default frame rate",
      "15, 30, or 60. The stream drops a step if the encoder or the uplink cannot hold it.",
      ["15", "30", "60"],
      { "15": "15", "30": "30", "60": "60" },
      String(this.config.voice.share_fps),
      (value) => {
        this.config.voice.share_fps = snapShareFps(Number(value));
        this.persist();
      },
    ));
    share.append(this.switchRow("voice.share.audio", "Share application audio", "Send the shared app's audio when this computer can capture it.", this.config.voice.share_app_audio, (value) => {
      this.config.voice.share_app_audio = value;
      this.persist();
    }));
    share.append(this.segmentRow(
      "voice.share.encoder",
      "Hardware encoder",
      "Auto uses NVENC, AMF, Quick Sync, VideoToolbox, or Media Foundation when that one matches this computer.",
      ["auto", "nvenc", "amf", "qsv", "videotoolbox", "media-foundation"],
      { auto: "Auto", nvenc: "NVENC", amf: "AMF", qsv: "QSV", videotoolbox: "VideoToolbox", "media-foundation": "MF" },
      this.config.voice.share_encoder,
      (value) => {
        this.config.voice.share_encoder = value;
        this.persist();
      },
    ));
    wrap.append(input, hud, devices, camera, ring, share);
    this.appendVoiceLab(wrap);
    this.appendSoundboard(wrap);
    return wrap;
  },
  speakRingRow(): HTMLElement {
    const current = speakColor(this.config.voice.speak_color);
    const control = this.late!.colorControl(current, "Speaking ring color", (hex) => {
      this.config.voice.speak_color = speakColor(hex);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
    }, () => {
      this.config.voice.speak_color = speakColor(undefined);
      document.documentElement.style.setProperty("--speak", this.config.voice.speak_color);
      this.persist();
      if (this.settings) this.renderSettings();
    });
    return this.late!.settingRow(
      "voice.speak",
      "Speaking ring",
      "The ring sweeps around an avatar while someone is speaking. It stays a solid ring when reduced motion is on, and while Game Mode is on. Discord green is the default.",
      control,
      true,
    );
  },
  ensureVoicePrefs() {
    if (this.voicePrefsLoaded) return;
    this.voicePrefsLoaded = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(VOICE_PREFS_KEY);
    } catch {
      raw = null;
    }
    const prefs = readVoicePrefs(raw);
    this.inputProfiles = prefs.profiles;
    this.inputProfileId = prefs.profileId;
    this.echoCancellation = prefs.echoCancellation;
    this.agc = prefs.agc;
    this.noiseQuality = prefs.noiseQuality;
    this.inputVolume = prefs.inputVolume;
    this.outputVolume = prefs.outputVolume;
    this.soundToggles = sanitizeSoundToggles(prefs.soundToggles);
  },
  storeVoicePrefs() {
    try {
      localStorage.setItem(VOICE_PREFS_KEY, writeVoicePrefs({
        profiles: this.inputProfiles,
        profileId: this.inputProfileId,
        echoCancellation: this.echoCancellation,
        agc: this.agc,
        noiseQuality: this.noiseQuality,
        inputVolume: this.inputVolume,
        outputVolume: this.outputVolume,
        soundToggles: this.soundToggles,
      }));
    } catch {
      /* private mode */
    }
  },
  appendVoiceLab(wrap: HTMLElement) {
    this.late!.registerSettingEntries([
      { id: "voice.mic-test", section: "voice", label: "Mic test", description: "Watch the microphone level.", keywords: "meter input" },
      { id: "voice.profiles", section: "voice", label: "Input profiles", description: "Saved microphone, input mode, and sensitivity.", keywords: "profile" },
      { id: "voice.echo", section: "voice", label: "Echo cancellation", description: "Cancel speaker echo with the playback mix.", keywords: "aec echo" },
      { id: "voice.quality", section: "voice", label: "Higher quality suppression", description: "Spectral noise suppression. Echo cancellation is separate.", keywords: "spectral rnnoise" },
      { id: "voice.agc", section: "voice", label: "Automatic gain control", description: "Keep the microphone at a steady level.", keywords: "agc volume" },
      { id: "voice.camera-test", section: "voice", label: "Camera test", description: "Preview the camera. In a call, the same picture is sent.", keywords: "video webcam" },
      { id: "voice.stream-preview", section: "voice", label: "Stream preview", description: "The current Go Live picture.", keywords: "share screen" },
      { id: "voice.sound-toggles", section: "voice", label: "Sound toggles", description: "Turn individual sounds on or off.", keywords: "soundboard" },
    ]);
    const test = this.late!.settingCard("Mic test");
    test.dataset.setting = "voice.mic-test";
    const meter = el("div", "mic-meter");
    meter.append(el("span", "mic-meter-fill"));
    const probe = el("button", this.micTestOn ? "text-button is-on" : "text-button", this.micTestOn ? "Stop mic test" : "Mic test");
    probe.type = "button";
    probe.addEventListener("click", () => {
      this.micTestOn = !this.micTestOn;
      if (this.micTestOn) this.watchMicLevel();
      else this.stopMicLevel();
      if (this.settings) this.renderSettings();
    });
    test.append(el("p", "setting-help", "The meter moves while the test or the microphone menu is open."), meter, probe);
    const profiles = this.late!.settingCard("Input profiles");
    profiles.dataset.setting = "voice.profiles";
    profiles.append(el("p", "setting-help", "A profile stores the microphone, voice activity or push to talk, and the sensitivity."));
    const name = el("input");
    name.type = "text";
    name.maxLength = 40;
    name.placeholder = "Profile name";
    name.setAttribute("aria-label", "Input profile name");
    const save = el("button", "text-button", "Save profile");
    save.type = "button";
    save.addEventListener("click", () => {
      const label = name.value.trim() || "Profile";
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      const id = /^[a-z0-9]/.test(slug) ? slug : `p${Date.now().toString(36)}`;
      this.inputProfiles = sanitizeInputProfiles([
        ...this.inputProfiles.filter((profile) => profile.id !== id),
        { id, name: label, deviceId: this.config.voice.input_device, mode: this.voiceMode() === "ptt" ? "ptt" : "vad", sensitivity: this.config.voice.sensitivity },
      ]);
      this.inputProfileId = id;
      this.storeVoicePrefs();
      if (this.settings) this.renderSettings();
    });
    const form = el("div", "settings-actions");
    form.append(name, save);
    profiles.append(form);
    if (!this.inputProfiles.length) profiles.append(el("p", "setting-help", "No profiles yet."));
    for (const profile of this.inputProfiles) {
      const row = el("div", "shortcut-row");
      const use = el("button", profile.id === this.inputProfileId ? "text-button is-on" : "text-button", profile.name);
      use.type = "button";
      use.addEventListener("click", () => {
        this.pickInputProfile(profile.id);
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      const drop = el("button", "text-button", "Remove");
      drop.type = "button";
      drop.addEventListener("click", () => {
        this.inputProfiles = this.inputProfiles.filter((item) => item.id !== profile.id);
        if (this.inputProfileId === profile.id) this.inputProfileId = "";
        this.storeVoicePrefs();
        if (this.settings) this.renderSettings();
      });
      row.append(use, drop);
      profiles.append(row);
    }
    const process = this.late!.settingCard("Processing");
    process.append(this.switchRow("voice.echo", "Echo cancellation", "Cancels speaker echo with the playback mix, before noise suppression.", this.echoCancellation, (value) => {
      this.echoCancellation = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.quality", "Higher quality suppression", "Spectral noise suppression. Standard stays on RNNoise. Echo cancellation is separate. This is not Krisp.", this.noiseQuality === "high", (value) => {
      this.noiseQuality = noiseQualityName(value ? "high" : "standard");
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    process.append(this.switchRow("voice.agc", "Automatic gain control", "Keeps a quiet microphone at a steady level. Silence stays silence.", this.agc, (value) => {
      this.agc = value;
      this.storeVoicePrefs();
      this.pushVoiceProcessing();
    }));
    const camera = this.late!.settingCard("Camera test");
    camera.dataset.setting = "voice.camera-test";
    const slot = el("div", "camera-preview-slot");
    slot.dataset.cameraTest = "";
    const open = el("button", this.cameraOn ? "text-button is-on" : "text-button", this.cameraOn ? "Stop camera" : "Test camera");
    open.type = "button";
    open.addEventListener("click", () => this.toggleCamera());
    camera.append(el("p", "setting-help", "The preview uses the camera above. In a voice channel the same frames are sent on the voice connection."), slot, open);
    const stream = this.late!.settingCard("Stream preview");
    stream.dataset.setting = "voice.stream-preview";
    const preview = el("div", "stream-preview");
    const live = document.querySelector("[data-stream-slot] video");
    if (live instanceof HTMLVideoElement && live.srcObject instanceof MediaStream) {
      const copy = document.createElement("video");
      copy.className = "stream-preview-video";
      copy.muted = true;
      copy.autoplay = true;
      copy.playsInline = true;
      copy.srcObject = live.srcObject;
      preview.append(copy);
    } else {
      preview.append(el("p", "hint", this.shareOn
        ? `Live at ${this.config.voice.share_resolution} · ${this.config.voice.share_fps} fps.`
        : "Start a stream to see it here."));
    }
    stream.append(preview);
    wrap.append(test, profiles, process, camera, stream);
  },
  paneMessages(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Messages", "Saved messages, reminders, and scheduled sends stay on this device. Discord pins are unchanged."));
    const saved = this.late!.settingCard("Saved");
    saved.dataset.setting = "messages.saved";
    if (!this.pack.bookmarks.length) saved.append(el("p", "setting-help", "Save on a message keeps it here. Saved in the header opens the same list."));
    for (const bookmark of this.pack.bookmarks) saved.append(this.savedRow(bookmark));
    const reminders = this.late!.settingCard("Reminders");
    reminders.dataset.setting = "messages.reminders";
    if (!this.reminders.length) reminders.append(el("p", "setting-help", "Remind on a message. Lark notifies you once, at the time you picked."));
    for (const reminder of this.reminders) reminders.append(this.reminderRow(reminder));
    const scheduled = this.late!.settingCard("Scheduled");
    scheduled.dataset.setting = "messages.scheduled";
    if (!this.pack.schedule.length) scheduled.append(el("p", "setting-help", "Later in the composer queues a send. The soonest time is 15 seconds from now, and one message goes out at a time."));
    for (const item of this.pack.schedule) scheduled.append(this.scheduledRow(item));
    wrap.append(saved, reminders, scheduled);
    return wrap;
  },
  panePrivacy(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Privacy", "Streamer mode hides emails, tokens, DM previews, and personal info on this screen. Discord still has the real messages."));
    const card = this.late!.settingCard("Streamer mode");
    card.append(this.switchRow("privacy.streamer", "Streamer mode", "Hide emails, tokens, DM previews, and your account id on this screen.", this.config.privacy.streamer, (value) => {
      this.config.privacy.streamer = value;
      this.persist();
      this.noteCapture();
    }));
    card.append(this.switchRow("privacy.auto", "Turn on while sharing or recording", "Follows screen share and the clip buffer. It does not look for other apps.", this.config.privacy.streamer_auto, (value) => {
      this.config.privacy.streamer_auto = value;
      this.persist();
      this.noteCapture();
    }));
    const active = this.streamerOn();
    const hotkey = formatShortcut(this.config.shortcuts.quick_switcher, this.platform.os);
    card.append(el("p", "setting-help", active
      ? "Streamer mode is on. Emails and tokens in messages read as hidden, DM previews are dropped, and your account id is hidden."
      : `Off. ${hotkey} can toggle it from the command palette.`));
    wrap.append(card);
    return wrap;
  },
  paneClips(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Clips", clipBehaviorNote(this.platform.os)));
    const card = this.late!.settingCard("Buffer");
    card.dataset.setting = "clips.folder";
    card.append(el("p", "setting-help", this.clipStatusLine()));
    card.append(this.segmentRow(
      "clips.resolution",
      "Resolution",
      "720p, 1080p, 1440p, or 2160p. The default is 1440p.",
      CLIP_RESOLUTION_OPTIONS.map((value) => `${value}p`),
      {},
      `${sanitizeClipResolution(this.config.clips.resolution)}p`,
      (value) => {
        this.config.clips.resolution = sanitizeClipResolution(Number.parseInt(value, 10));
        return this.persist().then(() => this.pullClipStatus());
      },
    ));
    card.append(this.segmentRow(
      "clips.fps",
      "Frame rate",
      "60, 120, or 240 fps. Lark caps the combination when the display or encoder cannot hold it.",
      CLIP_FPS_OPTIONS.map((value) => `${value} fps`),
      {},
      `${sanitizeClipFps(this.config.clips.fps)} fps`,
      (value) => {
        this.config.clips.fps = sanitizeClipFps(Number.parseInt(value, 10));
        return this.persist().then(() => this.pullClipStatus());
      },
    ));
    const bufferLabels: Record<string, string> = { "15": "15s", "30": "30s", "60": "1m", "90": "90s", "120": "2m" };
    card.append(this.segmentRow(
      "clips.buffer",
      "Replay length",
      "How far back the hotkey saves. A longer buffer keeps the same memory budget by lowering the bitrate.",
      CLIP_BUFFER_OPTIONS.map((value) => String(value)),
      bufferLabels,
      String(sanitizeClipBuffer(this.config.clips.buffer_sec)),
      (value) => {
        this.config.clips.buffer_sec = sanitizeClipBuffer(Number.parseInt(value, 10));
        return this.persist().then(() => this.pullClipStatus());
      },
    ));
    if (this.clipStatus?.capNote) card.append(el("p", "warning", this.clipStatus.capNote));
    card.append(el("p", "setting-help", `Clips folder: ${this.clipStatus?.dir || this.platform.clipsDir}`));
    if (this.clipStatus?.hotkeyError) card.append(el("p", "warning", this.clipStatus.hotkeyError));
    card.append(this.switchRow("clips.capture", "Game Mode capture", "Keep a buffer of the main display without sharing your screen.", this.config.clips.game_capture, (value) => {
      this.config.clips.game_capture = value;
      return this.persist().then(() => this.pullClipStatus());
    }));
    card.append(el("p", "setting-help", `Hotkey: ${formatShortcut(this.config.shortcuts.save_clip, this.platform.os)}. Change it under Keybinds. It is global on macOS and Windows, works while another app is in front, and needs a modifier or a function key.`));
    if (isTauri()) {
      const openClips = el("button", "text-button", "Open clips folder");
      openClips.type = "button";
      openClips.addEventListener("click", () => void this.openClipsFolder());
      const actions = el("div", "settings-actions");
      actions.append(openClips);
      card.append(actions);
    }
    const upload = this.late!.settingCard("Upload");
    upload.append(el("p", "setting-help", limitSentence(this.platform.os, this.premiumType)));
    upload.append(this.segmentRow(
      "clips.compress",
      "When a clip is over the upload limit",
      "Always compress, ask first, or keep the original. A compressed copy is H.264/AAC MP4. The original stays in the clips folder.",
      ["always", "ask", "never"],
      { always: "Always", ask: "Ask", never: "Never" },
      this.config.clips.compress,
      (value) => {
        this.config.clips.compress = parseCompressMode(value);
        this.persist();
      },
    ));
    const browse = el("button", "text-button", "Open the Clips view");
    browse.type = "button";
    browse.addEventListener("click", () => this.openClips());
    const uploadActions = el("div", "settings-actions");
    uploadActions.append(browse);
    upload.append(this.late!.settingRow("clips.library", "Clip library", "Play, trim, and share clips saved on this computer.", uploadActions));
    const library = this.late!.settingCard("Saved on this computer");
    this.appendClipLibrary(library);
    wrap.append(card, upload, library);
    return wrap;
  },
  paneGaming(): HTMLElement {
    const wrap = el("div", "settings-stack");
    wrap.append(this.late!.settingHead("Gaming", "Game Mode tucks the side columns during a call or while a game is in front, and eases resource use. Chat stays on screen. Each game can keep its own voice and overlay defaults."));
    const mode = this.late!.settingCard("Game Mode");
    const gameKey = formatShortcut(this.config.shortcuts.toggle_game_mode, this.platform.os);
    mode.append(this.switchRow("gaming.mode", "Game Mode", `${gameKey} toggles it, including while a game is focused. In a call, or while a game is in front, the member list hides and the rail and channel list shrink. Chat, the composer, and mute stay reachable. Animations pause, unopened channels are not prefetched, and the existing polls slow down. Speaking stays a static mark.`, this.gameMode, (value) => {
      this.setGameMode(value, false);
    }));
    mode.append(this.switchRow("gaming.detect", "Detect games", "The check looks at the front app a few times a minute and does not read GPU sensors. Turning it off stops that check.", this.config.desktop.detect_games, (value) => {
      this.config.desktop.detect_games = value;
      this.persist();
      if (!value) this.noteGame(null);
      void this.detectLoad();
    }));
    mode.append(el("p", "setting-help", this.detectedGame
      ? `Detected: ${this.detectedGame}. A detected game turns Game Mode on unless that game's profile says otherwise.`
      : "No game detected."));
    const status = this.late!.settingCard("Status");
    status.append(this.switchRow("gaming.hardware", "Hardware in status", "Off until you turn this on. Lark then reads this computer's GPU name, CPU temperature on macOS when a sensor answers, and the current game. Windows leaves temperature blank. That line becomes your Discord custom status, kept to 128 characters, and it refreshes about once a minute. macOS and Windows only.", this.config.desktop.hardware_status, (value) => {
      this.config.desktop.hardware_status = value;
      this.hardware = setHardwareEnabled(this.hardware, value, this.me.custom ?? "");
      this.hardwarePushFailed = false;
      this.persist();
      this.rememberHardware();
      if (!value) {
        this.hardwareSampleAt = 0;
        this.hardwareChecking = false;
        this.hardwareLine = null;
        this.applyHardware(null);
        return;
      }
      if (!isTauri() || this.demo) return;
      void this.sampleHardware(true);
    }));
    if (this.hardware.paused) {
      status.append(el("p", "setting-help", "Your custom status is left as you set it. Clear it to show hardware again."));
    } else if (this.hardwareChecking) {
      status.append(el("p", "setting-help", "Reading this computer…"));
    } else if (this.hardwareLine) {
      status.append(el("p", "setting-help", `Status line: ${this.hardwareLine}`));
    } else if (this.config.desktop.hardware_status && this.hardwareSampleAt > 0) {
      status.append(el("p", "setting-help", "Nothing to show from this computer right now."));
    } else if (!isTauri()) {
      status.append(el("p", "setting-help", "The desktop app reads the machine. This preview does not."));
    }
    const profiles = this.late!.settingCard("Game profiles");
    profiles.dataset.setting = "gaming.profiles";
    this.appendGameProfiles(profiles);
    wrap.append(mode, status, profiles);
    return wrap;
  },
  segmentRow(id: string, label: string, description: string, values: string[], labels: Record<string, string>, current: string, onPick: (value: string) => void): HTMLElement {
    const control = this.late!.segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
    return this.late!.settingRow(id, label, description, control, true);
  },
  sliderRow(id: string, label: string, description: string, value: number, min: number, max: number, onInput: (value: number) => void): HTMLElement {
    return this.late!.settingRow(id, label, description, this.late!.sliderControl(value, min, max, label, onInput), true);
  },
  switchRow(id: string, label: string, description: string, on: boolean, change: (value: boolean) => void | Promise<void>): HTMLElement {
    const button = this.late!.switchControl(on, label);
    button.addEventListener("click", () => {
      const result = change(!on) as void | Promise<void>;
      if (result && typeof (result as Promise<void>).then === "function") {
        void result.then(() => {
          if (this.settings) this.renderSettings();
        });
        return;
      }
      if (this.settings) this.renderSettings();
    });
    return this.late!.settingRow(id, label, description, button);
  },
  deviceRow(id: string, label: string, description: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    return this.late!.settingRow(id, label, description, this.late!.selectControl(label, current, options, onChange), true);
  },
  devicePicker(label: string, current: string, options: { id: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrap = el("label", "device", label);
    wrap.append(this.late!.selectControl(label, current, options, onChange));
    return wrap;
  },
  platformCard(title: string, body: string, extra: string): HTMLElement {
    const current = (title === "macOS" && this.platform.os === "macos") || (title === "Windows" && this.platform.os === "windows");
    const card = el("article", `platform-card${current ? " is-current" : ""}`);
    card.append(el("strong", "", title), el("div", "", body), el("div", "hint", extra));
    return card;
  },
  choice(values: string[], current: string, onPick: (value: string) => void, labels?: Record<string, string>): HTMLElement {
    return this.late!.segmentControl(values, current, (value) => {
      onPick(value);
      if (this.settings) this.renderSettings();
    }, labels);
  },
  toggle(label: string, on: boolean, change: (value: boolean) => void | Promise<void>, description = ""): HTMLElement {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
    return this.switchRow(id || "setting", label, description, on, change);
  },
});
