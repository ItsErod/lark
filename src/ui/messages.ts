import { formatAbsolute, formatRelative } from "../pack/relative";
import { formatFull, formatStamp, type HourCycle, type TimeMode } from "../pack/time";
import type { ViewMessage } from "../render/message";
import { emojiCdnUrl, formatBytes, mediaBox, type Block, type Inline, type MediaBox } from "../render/content";
import { highlightCode, inlineLang } from "../syntax";
import { messageMenuItems, reactorSummary, systemMessage, type SlashCommand } from "./composer-tools";
import { colorFor, el, formatClock, formatDay, icon, initials, paths, portrait } from "./dom";

export function renderMessage(
  view: ViewMessage,
  options: {
    density: "cozy" | "compact" | "irc";
    grouped: boolean;
    showDay: boolean;
    divider: boolean;
    remoteEmoji: boolean;
    mine: boolean;
    onReply: () => void;
    onJump?: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onPin?: () => void;
    onThread?: () => void;
    onReact: (emoji: string, emojiId?: string | null) => void;
    onImage: (url: string) => void;
    jumped?: boolean;
    now?: number;
    quickReactions?: string[];
    bookmarked?: boolean;
    reminded?: boolean;
    translated?: boolean;
    onBookmark?: () => void;
    onRemind?: () => void;
    onTranslate?: () => void;
    onHideAuthor?: () => void;
    /** Game Mode: skip media preload and autoplay. */
    quiet?: boolean;
    log?: { deleted: boolean; history: string[] };
    clock?: { mode: TimeMode; hours: HourCycle };
    authorColor?: string | null;
    blocked?: boolean;
    developerMode?: boolean;
    pinned?: boolean;
    showEmbeds?: boolean;
    revealSpoilers?: boolean;
    onForward?: () => void;
    onCopyText?: () => void;
    onCopyLink?: () => void;
    onSpeak?: () => void;
    onCopyId?: () => void;
    onMarkUnread?: () => void;
    onCreateThread?: () => void;
    onShowPins?: () => void;
    loadApps?: () => Promise<SlashCommand[]>;
    onRunApp?: (command: SlashCommand) => void;
    loadReactors?: (emoji: string, emojiId?: string | null) => Promise<{ id: string; name: string }[]>;
  },
): HTMLElement {
  const wrap = el("div", "message-wrap");
  if (options.showDay) wrap.append(el("div", "day-sep", formatDay(view.timestamp)));
  if (options.divider) wrap.append(el("div", "unread-sep", "New messages"));
  const system = systemMessage({
    id: view.id,
    kind: view.kind,
    messageType: view.messageType,
    authorName: view.authorName,
    content: view.raw,
    timestamp: view.timestamp,
    callEnded: view.callEnded,
  });
  if (view.kind === "join" || view.kind === "system" || system) {
    const line = el("div", "system-line");
    line.append(el("span", "", system?.text || view.raw || `${view.authorName} joined`));
    if (system?.pins && options.onShowPins) {
      const pins = el("button", "text-button", "See all the pins.");
      pins.type = "button";
      pins.addEventListener("click", () => options.onShowPins?.());
      line.append(pins);
    }
    wrap.append(line);
    return wrap;
  }
  const nameColor = options.authorColor || colorFor(view.authorId);
  const effects = new Set(view.effects ?? []);
  const article = el("article", `message${options.grouped ? " is-grouped" : ""}${view.highlights.length ? " is-highlight" : ""}${view.pending ? " is-pending" : ""}${options.jumped ? " is-jump" : ""}${effects.has("compact-media") ? " is-compact-media" : ""}${options.log?.deleted ? " is-deleted" : ""}`);
  article.dataset.id = view.id;
  if (options.density === "irc") {
    article.classList.add("is-irc");
  } else if (options.density === "compact") {
    article.append(timeStamp(view, options, "gutter"));
  } else if (!options.grouped) {
    article.append(portrait(view.authorName, view.authorId, view.authorAvatar));
  } else {
    article.append(timeStamp(view, options, "gutter hover-time"));
  }
  const body = el("div", "message-body");
  if (options.density === "cozy" && !options.grouped) {
    const head = el("header", "message-head");
    const name = el("span", "author", view.authorName);
    name.style.color = nameColor;
    head.append(name);
    if (view.authorBot) head.append(el("span", "bot-tag", "Bot"));
    head.append(timeStamp(view, options, "stamp"));
    if (view.edited) head.append(el("span", "edited", "edited"));
    body.append(head);
  }
  if (view.reply) {
    const reply = el("button", "reply-ref");
    reply.type = "button";
    reply.title = "Jump to message";
    reply.append(el("span", "reply-name", view.reply.authorName), el("span", "reply-preview", view.reply.preview));
    reply.addEventListener("click", () => options.onJump?.());
    body.append(reply);
  }
  if (view.forwarded) {
    const card = el("div", "forwarded-card");
    card.append(el("span", "reply-name", "Forwarded"), el("span", "reply-preview", `${view.forwarded.authorName}: ${view.forwarded.preview}`));
    body.append(card);
  }
  if (options.density === "irc") {
    const line = el("div", "irc-line");
    line.append(timeStamp(view, options, "gutter"));
    const name = el("span", "author", view.authorName);
    name.style.color = nameColor;
    line.append(name);
    const text = el("div", "compact-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    line.append(text);
    body.append(line);
  } else if (options.density === "compact") {
    const line = el("div", "compact-line");
    if (!options.grouped) {
      const name = el("span", "author", view.authorName);
      name.style.color = nameColor;
      line.append(name);
    }
    const text = el("div", "compact-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    if (view.edited) text.append(el("span", "edited", "edited"));
    line.append(text);
    body.append(line);
  } else {
    const text = el("div", "message-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    body.append(text);
  }
  if (options.log?.deleted) body.append(el("div", "log-deleted", "Deleted"));
  if (options.log?.history.length) {
    const past = el("div", "log-history");
    past.append(el("div", "log-history-label", "Earlier"));
    for (const line of options.log.history) past.append(el("div", "", line));
    body.append(past);
  }
  if (view.badges.length) {
    const badges = el("div", "badges");
    for (const badge of view.badges) badges.append(el("span", "badge", badge));
    body.append(badges);
  }
  for (const attachment of view.attachments) {
    body.append(wrapSpoiler(renderAttachment(attachment, options.onImage, Boolean(options.quiet)), attachment.spoiler, Boolean(options.revealSpoilers)));
  }
  if (!effects.has("hide-previews") && options.showEmbeds !== false) {
    for (const embed of view.embeds) body.append(renderEmbed(embed, options.remoteEmoji, Boolean(options.quiet)));
  }
  for (const sticker of view.stickers) {
    const chip = el("div", "sticker");
    if (sticker.url) {
      const img = el("img");
      img.alt = "";
      img.decoding = "async";
      img.width = 72;
      img.height = 72;
      img.dataset.lazySrc = sticker.url;
      chip.append(img);
    }
    chip.append(el("span", "", sticker.name));
    body.append(chip);
  }
  if (view.thread) {
    const chip = el("button", "thread-chip", `Thread · ${view.thread.name} · ${view.thread.count}`);
    chip.type = "button";
    chip.addEventListener("click", () => options.onThread?.());
    body.append(chip);
  }
  if (view.reactions.length) {
    const row = el("div", "reactions");
    for (const reaction of view.reactions) {
      const group = el("span", `reaction${reaction.me ? " is-mine" : ""}`);
      const button = el("button", "reaction-emoji");
      button.type = "button";
      button.append(reactionFace(reaction, options.remoteEmoji));
      button.addEventListener("click", () => options.onReact(reaction.emoji, reaction.emojiId));
      const count = el("button", "reaction-count", String(reaction.count));
      count.type = "button";
      count.title = "Who reacted";
      count.setAttribute("aria-label", "Who reacted");
      count.addEventListener("click", (event) => {
        event.stopPropagation();
        void openReactors(group, reaction.emoji, reaction.emojiId, options.loadReactors);
      });
      group.append(button, count);
      row.append(group);
    }
    body.append(row);
  }
  const actions = el("div", "message-actions");
  for (const emoji of (options.quickReactions ?? []).slice(0, 3)) {
    const button = el("button", "icon-button react-quick", emoji);
    button.type = "button";
    button.title = `React with ${emoji}`;
    button.setAttribute("aria-label", `React with ${emoji}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onReact(emoji);
    });
    actions.append(button);
  }
  actions.append(actionButton("Add Reaction", paths.plus, () => options.onReact("picker")));
  if (options.mine) actions.append(actionButton("Edit", paths.pencil, options.onEdit));
  if (options.onForward) actions.append(actionButton("Forward", paths.reply, options.onForward));
  const more = actionButton("More", paths.panels, () => openMessageMenu(more, view, options));
  actions.append(more);
  body.append(actions);
  article.append(body);
  article.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMessageMenu(article, view, options, event.clientX, event.clientY);
  });
  if (options.blocked) {
    const hidden = el("div", "blocked-message");
    const show = el("button", "text-button", "Show message");
    show.type = "button";
    hidden.append("Blocked message. ", show);
    article.hidden = true;
    show.addEventListener("click", () => {
      hidden.remove();
      article.hidden = false;
    });
    wrap.append(hidden);
  }
  wrap.append(article);
  return wrap;
}

function openMessageMenu(
  anchor: HTMLElement,
  view: ViewMessage,
  options: Parameters<typeof renderMessage>[1],
  x?: number,
  y?: number,
) {
  document.querySelectorAll(".msg-menu").forEach((node) => node.remove());
  const menu = el("div", "msg-menu");
  menu.setAttribute("role", "menu");
  const items = messageMenuItems({
    mine: options.mine,
    pinned: Boolean(options.pinned ?? view.pinned),
    developerMode: Boolean(options.developerMode),
    bookmarked: Boolean(options.bookmarked),
    reminded: Boolean(options.reminded),
    hasTranslate: Boolean(options.onTranslate),
    translated: Boolean(options.translated),
    hasHide: Boolean(options.onHideAuthor),
  });
  for (const item of items) {
    const button = el("button", `msg-item${item.danger ? " is-danger" : ""}`, item.label);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (item.id === "apps") {
        void fillApps(menu, options);
        return;
      }
      menu.remove();
      runMenuItem(item.id, options);
    });
    menu.append(button);
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  const left = x ?? rect.right - 200;
  const top = y ?? rect.bottom + 4;
  menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - 220))}px`;
  menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - 280))}px`;
  const close = (event: Event) => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    menu.remove();
    document.removeEventListener("pointerdown", close);
  };
  window.setTimeout(() => document.addEventListener("pointerdown", close), 0);
}

function runMenuItem(id: string, options: Parameters<typeof renderMessage>[1]) {
  if (id === "react") options.onReact("picker");
  else if (id === "edit") options.onEdit();
  else if (id === "pin") options.onPin?.();
  else if (id === "reply") options.onReply();
  else if (id === "forward") options.onForward?.();
  else if (id === "thread") options.onCreateThread?.();
  else if (id === "copy") options.onCopyText?.();
  else if (id === "bookmark") options.onBookmark?.();
  else if (id === "remind") options.onRemind?.();
  else if (id === "unread") options.onMarkUnread?.();
  else if (id === "link") options.onCopyLink?.();
  else if (id === "speak") options.onSpeak?.();
  else if (id === "translate") options.onTranslate?.();
  else if (id === "hide") options.onHideAuthor?.();
  else if (id === "id") options.onCopyId?.();
  else if (id === "delete") options.onDelete();
}

async function fillApps(menu: HTMLElement, options: Parameters<typeof renderMessage>[1]) {
  let slot = menu.querySelector(".msg-apps");
  if (!slot) {
    slot = el("div", "msg-apps");
    menu.append(slot);
  }
  slot.replaceChildren(el("p", "hint", "Loading apps…"));
  const commands = options.loadApps ? await options.loadApps().catch(() => []) : [];
  slot.replaceChildren();
  if (!commands.length) {
    slot.append(el("p", "hint", "No message apps in this channel."));
    return;
  }
  for (const command of commands) {
    const button = el("button", "msg-item", command.name);
    button.type = "button";
    button.title = command.description;
    button.addEventListener("click", () => {
      menu.remove();
      options.onRunApp?.(command);
    });
    slot.append(button);
  }
}

async function openReactors(
  anchor: HTMLElement,
  emoji: string,
  emojiId: string | null | undefined,
  load: ((emoji: string, emojiId?: string | null) => Promise<{ id: string; name: string }[]>) | undefined,
) {
  document.querySelectorAll(".reactor-pop").forEach((node) => node.remove());
  const pop = el("div", "reactor-pop");
  pop.append(el("strong", "", "Reactions"), el("p", "hint", "Loading…"));
  anchor.append(pop);
  const people = load ? await load(emoji, emojiId).catch(() => []) : [];
  pop.replaceChildren(el("strong", "", "Reactions"), el("p", "", reactorSummary(people.map((person) => person.name))));
  if (people.length) {
    const list = el("div", "forward-list");
    for (const person of people) list.append(el("div", "forward-hit", person.name));
    pop.append(list);
  }
}

function timeStamp(view: ViewMessage, options: { now?: number; clock?: { mode: TimeMode; hours: HourCycle } }, className: string): HTMLElement {
  const clock = options.clock;
  const relative = !clock && (view.effects ?? []).includes("relative-time");
  const now = options.now ?? Date.now();
  const label = clock ? formatStamp(view.timestamp, now, clock.mode, clock.hours) : relative ? formatRelative(view.timestamp, now) : formatClock(view.timestamp);
  const node = el("time", className, label);
  node.dateTime = view.timestamp;
  node.title = clock ? formatFull(view.timestamp, clock.hours) : formatAbsolute(view.timestamp);
  return node;
}

function actionButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon-button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(path));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function avatar(name: string, id: string): HTMLElement {
  const node = el("div", "avatar", initials(name));
  node.style.background = colorFor(id);
  return node;
}

function reactionFace(reaction: ViewMessage["reactions"][number], remoteEmoji: boolean): HTMLElement {
  const remote = remoteEmoji && reaction.emojiId ? emojiCdnUrl(reaction.emojiId, reaction.animated) : null;
  if (!remote) return el("span", "reaction-emoji", reaction.emoji);
  const img = el("img", "emoji");
  img.alt = reaction.emoji;
  img.decoding = "async";
  img.width = 22;
  img.height = 22;
  img.src = remote;
  img.addEventListener("error", () => img.replaceWith(el("span", "reaction-emoji", reaction.emoji || "emoji")));
  return img;
}

function wrapSpoiler(node: HTMLElement, spoiler: boolean, revealed: boolean): HTMLElement {
  if (!spoiler) return node;
  const cover = el("div", `spoiler-media${revealed ? " is-revealed" : ""}`);
  const button = el("button", "spoiler-cover", "Spoiler");
  button.type = "button";
  button.setAttribute("aria-label", "Spoiler, activate to reveal");
  button.addEventListener("click", () => cover.classList.add("is-revealed"));
  cover.append(button, node);
  return cover;
}

function renderAttachment(
  attachment: ViewMessage["attachments"][number],
  onImage: (url: string) => void,
  quiet: boolean,
): HTMLElement {
  if (attachment.kind === "image" && attachment.url) {
    const button = el("button", "image-frame");
    button.type = "button";
    button.setAttribute("aria-label", attachment.name);
    const img = el("img", "image-preview");
    img.alt = "";
    img.decoding = "async";
    applyMediaBox(img, mediaBox(attachment.width, attachment.height));
    img.dataset.lazySrc = attachment.url;
    img.addEventListener("error", () => {
      if (!img.getAttribute("src")) return;
      const chip = el("div", "file-chip");
      chip.append(el("strong", "", attachment.name), el("span", "", "Couldn't load image"));
      button.replaceWith(chip);
    });
    button.append(img);
    button.addEventListener("click", () => onImage(attachment.url!));
    return button;
  }
  if ((attachment.kind === "video" || attachment.kind === "audio") && attachment.url) {
    const media = el(attachment.kind === "video" ? "video" : "audio", attachment.kind === "video" ? "attachment-video" : "attachment-audio");
    media.controls = true;
    media.preload = "none";
    if (quiet) media.dataset.quiet = "1";
    if (attachment.kind === "video") applyMediaBox(media, mediaBox(attachment.width, attachment.height));
    media.dataset.lazySrc = attachment.url;
    if (attachment.kind === "audio") media.setAttribute("aria-label", attachment.name);
    return media;
  }
  if (attachment.url) {
    const link = el("a", "file-chip");
    link.href = attachment.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.append(el("strong", "", attachment.name), el("span", "", formatBytes(attachment.bytes)));
    return link;
  }
  const row = el("div", "file-chip");
  row.append(el("strong", "", attachment.name), el("span", "", formatBytes(attachment.bytes)));
  return row;
}

function renderEmbed(embed: ViewMessage["embeds"][number], remoteEmoji: boolean, quiet: boolean): HTMLElement {
  const card = el("article", "embed");
  if (embed.color) card.style.borderColor = embed.color;
  if (embed.author) card.append(el("div", "embed-author", embed.author));
  if (embed.title) {
    if (embed.url) {
      const link = el("a", "embed-title", embed.title);
      link.href = embed.url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      card.append(link);
    } else {
      card.append(el("div", "embed-title", embed.title));
    }
  }
  if (embed.description.length) {
    const desc = el("div", "embed-desc");
    renderBlocks(desc, embed.description, remoteEmoji);
    card.append(desc);
  }
  if (embed.fields.length) {
    const fields = el("div", "embed-fields");
    for (const field of embed.fields) {
      const item = el("div", field.inline ? "embed-field is-inline" : "embed-field");
      const value = el("div", "field-value");
      renderBlocks(value, field.value, remoteEmoji);
      item.append(el("div", "field-name", field.name), value);
      fields.append(item);
    }
    card.append(fields);
  }
  if (embed.video) {
    const video = el("video", "embed-video");
    video.preload = "none";
    video.playsInline = true;
    video.controls = true;
    const loop = !quiet && (/tenor|giphy/i.test(embed.provider ?? "") || /tenor|giphy/i.test(embed.video));
    applyMediaBox(video, mediaBox(embed.videoWidth, embed.videoHeight));
    if (quiet) video.dataset.quiet = "1";
    if (loop) video.dataset.loopPlay = "1";
    video.dataset.lazySrc = embed.video;
    card.append(video);
  } else if (embed.image || embed.thumbnail) {
    const img = el("img", "embed-image");
    img.alt = "";
    img.decoding = "async";
    const width = embed.image ? embed.imageWidth : undefined;
    const height = embed.image ? embed.imageHeight : undefined;
    applyMediaBox(img, mediaBox(width, height));
    img.dataset.lazySrc = embed.image || embed.thumbnail || "";
    card.append(img);
  }
  if (embed.provider) card.append(el("div", "embed-footer", embed.provider));
  if (embed.footer) card.append(el("div", "embed-footer", embed.footer));
  return card;
}

function applyMediaBox(node: HTMLElement, box: MediaBox) {
  node.dataset.reserved = box.reserved ? "1" : "0";
  node.style.aspectRatio = `${box.width} / ${box.height}`;
  node.style.width = `${box.width}px`;
  node.style.maxWidth = "100%";
  node.style.height = `${box.height}px`;
  if (node instanceof HTMLImageElement) {
    node.decoding = "async";
    node.width = box.width;
    node.height = box.height;
  }
}

let lazyObserver: IntersectionObserver | null = null;

function activateLazy(node: HTMLElement) {
  const url = node.dataset.lazySrc;
  if (!url || node.dataset.lazyOn === "1") return;
  node.dataset.lazyOn = "1";
  delete node.dataset.lazySrc;
  if (node instanceof HTMLImageElement) {
    node.decoding = "async";
    node.src = url;
    if (typeof node.decode === "function") void node.decode().catch(() => undefined);
    return;
  }
  if (node instanceof HTMLVideoElement || node instanceof HTMLAudioElement) {
    const quiet = node.dataset.quiet === "1";
    node.preload = quiet ? "none" : "metadata";
    node.src = url;
    if (node instanceof HTMLVideoElement && node.dataset.loopPlay === "1" && !quiet) {
      node.muted = true;
      node.loop = true;
      void node.play().catch(() => undefined);
    }
  }
}

/** Assign media URLs only once the node is near the message scroller. Decode off the main thread. */
export function bindLazyMedia(root: HTMLElement) {
  lazyObserver?.disconnect();
  lazyObserver = null;
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-lazy-src]")];
  if (!nodes.length) return;
  const scroller = root.classList.contains("messages") ? root : root.closest(".messages");
  if (typeof IntersectionObserver === "undefined" || !(scroller instanceof Element)) {
    for (const node of nodes) activateLazy(node);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      activateLazy(entry.target as HTMLElement);
      observer.unobserve(entry.target);
    }
  }, { root: scroller, rootMargin: "240px 0px", threshold: 0 });
  lazyObserver = observer;
  for (const node of nodes) observer.observe(node);
}

function inlineNode(source: string, highlight: boolean): HTMLElement {
  const code = el("code", "inline-code");
  if (!highlight) {
    code.textContent = source;
    return code;
  }
  for (const token of highlightCode(inlineLang(source), source)) {
    code.append(el("span", `tok tok-${token.kind}`, token.text));
  }
  return code;
}

function renderBlocks(parent: HTMLElement, blocks: Block[], remoteEmoji: boolean, collapsed = false, inlineCode = false) {
  const host = collapsed ? el("details", "collapse") : parent;
  if (collapsed) {
    host.append(el("summary", "", "Long message"));
    parent.append(host);
  }
  for (const block of blocks) {
    if (block.t === "pre") {
      const pre = el("pre", "codeblock");
      if (block.lang) pre.append(el("span", "code-lang", block.lang));
      const code = el("code");
      for (const token of highlightCode(block.lang, block.v)) {
        const span = el("span", `tok tok-${token.kind}`, token.text);
        code.append(span);
      }
      pre.append(code);
      host.append(pre);
    } else if (block.t === "quote") {
      const quote = el("blockquote", "quote");
      renderBlocks(quote, block.c, remoteEmoji, false, inlineCode);
      host.append(quote);
    } else if (block.t === "h") {
      const heading = el(block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5", `md-h md-h${block.level}`);
      renderInlines(heading, block.c, remoteEmoji, inlineCode);
      host.append(heading);
    } else if (block.t === "ul" || block.t === "ol") {
      const list = el(block.t, "md-list");
      for (const item of block.items) {
        const row = el("li");
        renderInlines(row, item, remoteEmoji, inlineCode);
        list.append(row);
      }
      host.append(list);
    } else if (block.t === "sub") {
      const sub = el("div", "md-sub");
      renderInlines(sub, block.c, remoteEmoji, inlineCode);
      host.append(sub);
    } else {
      const paragraph = el("p", "paragraph");
      renderInlines(paragraph, block.c, remoteEmoji, inlineCode);
      host.append(paragraph);
    }
  }
}

function wrapInline(tag: "strong" | "em" | "u" | "s", children: Inline[], remoteEmoji: boolean, inlineCode: boolean): HTMLElement {
  const child = el(tag);
  renderInlines(child, children, remoteEmoji, inlineCode);
  return child;
}

function renderInlines(parent: HTMLElement, nodes: Inline[], remoteEmoji: boolean, inlineCode = false) {
  for (const node of nodes) {
    if (node.t === "text") parent.append(document.createTextNode(node.v));
    else if (node.t === "br") parent.append(document.createElement("br"));
    else if (node.t === "code") parent.append(inlineNode(node.v, inlineCode));
    else if (node.t === "time") {
      const stamp = el("time", "discord-time", node.label);
      stamp.dateTime = new Date(node.unix * 1000).toISOString();
      stamp.title = node.label;
      parent.append(stamp);
    }
    else if (node.t === "strong" || node.t === "em" || node.t === "u" || node.t === "s") {
      parent.append(wrapInline(node.t, node.c, remoteEmoji, inlineCode));
    } else if (node.t === "spoiler") {
      const spoiler = el("span", "spoiler");
      spoiler.tabIndex = 0;
      spoiler.setAttribute("role", "button");
      spoiler.setAttribute("aria-label", "Spoiler, activate to reveal");
      renderInlines(spoiler, node.c, remoteEmoji, inlineCode);
      const reveal = () => spoiler.classList.add("is-revealed");
      spoiler.addEventListener("click", reveal);
      spoiler.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") reveal();
      });
      parent.append(spoiler);
    } else if (node.t === "mention") {
      parent.append(el("span", node.me ? "mention is-me" : "mention", node.label));
    } else if (node.t === "link") {
      const link = el("a", "text-link", node.label);
      if (node.href.startsWith("https://") || node.href.startsWith("http://")) {
        link.href = node.href;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
      }
      parent.append(link);
    } else if (node.t === "emoji") {
      const remote = remoteEmoji && node.id ? emojiCdnUrl(node.id, node.animated) : null;
      if (remote) {
        const img = el("img", "emoji");
        img.alt = `:${node.name}:`;
        img.decoding = "async";
        img.width = 22;
        img.height = 22;
        img.src = remote;
        img.addEventListener("error", () => img.replaceWith(el("span", "emoji-pill", `:${node.name}:`)));
        parent.append(img);
      } else {
        parent.append(el("span", `emoji-pill${node.animated ? " is-animated" : ""}`, `:${node.name}:`));
      }
    }
  }
}

export { avatar, icon, paths };
