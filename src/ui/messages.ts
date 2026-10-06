import { formatAbsolute, formatRelative } from "../pack/relative";
import type { ViewMessage } from "../render/message";
import { emojiCdnUrl, formatBytes, type Block, type Inline } from "../render/content";
import { highlightCode, inlineLang } from "../syntax";
import { colorFor, el, formatClock, formatDay, icon, initials, paths } from "./dom";

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
    onEdit: () => void;
    onDelete: () => void;
    onReact: (emoji: string) => void;
    onImage: (url: string) => void;
    now?: number;
    quickReactions?: string[];
    bookmarked?: boolean;
    translated?: boolean;
    onBookmark?: () => void;
    onTranslate?: () => void;
    onHideAuthor?: () => void;
  },
): HTMLElement {
  const wrap = el("div", "message-wrap");
  if (options.showDay) wrap.append(el("div", "day-sep", formatDay(view.timestamp)));
  if (options.divider) wrap.append(el("div", "unread-sep", "New"));
  if (view.kind === "join" || view.kind === "system") {
    wrap.append(el("div", "system-line", view.raw || `${view.authorName} joined`));
    return wrap;
  }
  const effects = new Set(view.effects ?? []);
  const article = el("article", `message${options.grouped ? " is-grouped" : ""}${view.highlights.length ? " is-highlight" : ""}${view.pending ? " is-pending" : ""}${effects.has("compact-media") ? " is-compact-media" : ""}`);
  article.dataset.id = view.id;
  if (options.density === "irc") {
    article.classList.add("is-irc");
  } else if (options.density === "compact") {
    article.append(timeStamp(view, options, "gutter"));
  } else if (!options.grouped) {
    article.append(avatar(view.authorName, view.authorId));
  } else {
    article.append(timeStamp(view, options, "gutter hover-time"));
  }
  const body = el("div", "message-body");
  if (options.density === "cozy" && !options.grouped) {
    const head = el("header", "message-head");
    const name = el("span", "author", view.authorName);
    name.style.color = colorFor(view.authorId);
    head.append(name);
    if (view.authorBot) head.append(el("span", "bot-tag", "Bot"));
    head.append(timeStamp(view, options, "stamp"));
    if (view.edited) head.append(el("span", "edited", "edited"));
    body.append(head);
  }
  if (view.reply) {
    const reply = el("button", "reply-ref");
    reply.type = "button";
    reply.append(el("span", "reply-name", view.reply.authorName), el("span", "reply-preview", view.reply.preview));
    body.append(reply);
  }
  if (options.density === "irc") {
    const line = el("div", "irc-line");
    line.append(timeStamp(view, options, "gutter"));
    const name = el("span", "author", view.authorName);
    name.style.color = colorFor(view.authorId);
    line.append(name);
    const text = el("div", "compact-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    line.append(text);
    body.append(line);
  } else if (options.density === "compact") {
    const line = el("div", "compact-line");
    if (!options.grouped) {
      const name = el("span", "author", view.authorName);
      name.style.color = colorFor(view.authorId);
      line.append(name);
    }
    const text = el("div", "compact-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    line.append(text);
    if (view.edited) line.append(el("span", "edited", "edited"));
    body.append(line);
  } else {
    const text = el("div", "message-text");
    renderBlocks(text, view.blocks, options.remoteEmoji, view.collapsed, effects.has("inline-code"));
    body.append(text);
  }
  if (view.badges.length) {
    const badges = el("div", "badges");
    for (const badge of view.badges) badges.append(el("span", "badge", badge));
    body.append(badges);
  }
  for (const attachment of view.attachments) body.append(renderAttachment(attachment, options.onImage));
  if (!effects.has("hide-previews")) {
    for (const embed of view.embeds) body.append(renderEmbed(embed, options.remoteEmoji));
  }
  for (const sticker of view.stickers) {
    const chip = el("div", "sticker");
    if (sticker.url) {
      const img = el("img");
      img.alt = sticker.name;
      img.src = sticker.url;
      img.loading = "lazy";
      chip.append(img);
    }
    chip.append(el("span", "", sticker.name));
    body.append(chip);
  }
  if (view.thread) body.append(el("div", "thread-chip", `Thread · ${view.thread.name} · ${view.thread.count}`));
  if (view.reactions.length) {
    const row = el("div", "reactions");
    for (const reaction of view.reactions) {
      const button = el("button", `reaction${reaction.me ? " is-mine" : ""}`);
      button.type = "button";
      button.append(el("span", "reaction-emoji", reaction.emoji), el("span", "reaction-count", String(reaction.count)));
      button.addEventListener("click", () => options.onReact(reaction.emoji));
      row.append(button);
    }
    body.append(row);
  }
  const actions = el("div", "message-actions");
  if (effects.has("quick-react")) {
    for (const emoji of options.quickReactions ?? []) {
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
  }
  if (effects.has("translate") && options.onTranslate) {
    actions.append(textAction(options.translated ? "Original" : "Translate", options.onTranslate));
  }
  if (effects.has("bookmark") && options.onBookmark) {
    actions.append(textAction(options.bookmarked ? "Saved" : "Save", options.onBookmark));
  }
  if (options.onHideAuthor) actions.append(textAction("Hide", options.onHideAuthor));
  actions.append(actionButton("Add reaction", paths.plus, () => options.onReact("picker")));
  actions.append(actionButton("Reply", paths.reply, options.onReply));
  if (options.mine) {
    actions.append(actionButton("Edit", paths.pencil, options.onEdit));
    actions.append(actionButton("Delete", paths.trash, options.onDelete));
  }
  body.append(actions);
  article.append(body);
  wrap.append(article);
  return wrap;
}

function timeStamp(view: ViewMessage, options: { now?: number }, className: string): HTMLElement {
  const relative = (view.effects ?? []).includes("relative-time");
  const node = el("time", className, relative ? formatRelative(view.timestamp, options.now ?? Date.now()) : formatClock(view.timestamp));
  node.dateTime = view.timestamp;
  node.title = formatAbsolute(view.timestamp);
  return node;
}

function textAction(label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon-button text-action", label);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
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

function renderAttachment(
  attachment: ViewMessage["attachments"][number],
  onImage: (url: string) => void,
): HTMLElement {
  if (attachment.kind === "image" && attachment.url) {
    const button = el("button", "image-frame");
    button.type = "button";
    const img = el("img", "image-preview");
    img.alt = attachment.name;
    img.loading = "lazy";
    img.decoding = "async";
    reserveBox(img, attachment.width, attachment.height);
    img.src = attachment.url;
    button.append(img);
    button.addEventListener("click", () => onImage(attachment.url!));
    return button;
  }
  const row = el("div", "file-chip");
  row.append(el("strong", "", attachment.name), el("span", "", formatBytes(attachment.bytes)));
  return row;
}

function renderEmbed(embed: ViewMessage["embeds"][number], remoteEmoji: boolean): HTMLElement {
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
      item.append(el("div", "field-name", field.name), el("div", "field-value", field.value));
      fields.append(item);
    }
    card.append(fields);
  }
  if (embed.image) {
    const img = el("img", "embed-image");
    img.alt = "";
    reserveBox(img, undefined, undefined);
    img.src = embed.image;
    card.append(img);
  }
  if (embed.footer) card.append(el("div", "embed-footer", embed.footer));
  return card;
}

function reserveBox(img: HTMLImageElement, width?: number, height?: number) {
  if (width && height && width > 0 && height > 0) {
    img.width = Math.round(width);
    img.height = Math.round(height);
    img.style.aspectRatio = `${Math.round(width)} / ${Math.round(height)}`;
    img.dataset.reserved = "1";
    img.loading = "lazy";
    return;
  }
  img.dataset.reserved = "0";
  img.loading = "eager";
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
        img.loading = "lazy";
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
