/**
 * Discord-style threads, forum boards, media galleries, polls, and events.
 * Stream A calls onCreateThread / onCreatePoll. Stream B calls onCreateEvent / openEvents.
 */
import { el } from "./dom";
import type { Channel, ForumTag, Poll, ScheduledEvent, ThreadMember } from "../types";
import {
  ARCHIVE_DURATIONS,
  EVENT_ACTIVE,
  EVENT_EXTERNAL,
  EVENT_SCHEDULED,
  THREAD_ANNOUNCEMENT,
  THREAD_PRIVATE,
  THREAD_PUBLIC,
  applyPollVote,
  applyThreadIndex,
  archiveLabel,
  archivePlan,
  canStartEvent,
  canVote,
  channelToPost,
  currentParityHost,
  defaultForumSort,
  endPollPlan,
  eventPlan,
  eventsIn,
  followPlan,
  forgetEvent,
  forgetPost,
  forumFollowPlan,
  galleryPosts,
  guidelinesText,
  isAnnouncementChannel,
  isForumChannel,
  isMediaChannel,
  joinThreadPlan,
  memberPlan,
  mergeThreadChannels,
  parentInfo,
  partitionBoard,
  pollAnswerShare,
  pollExpiryLabel,
  pollExpired,
  pollFromClient,
  pollPlan,
  pollShowsResults,
  pollsIn,
  rememberEvent,
  rememberPoll,
  rememberPosts,
  rsvpPlan,
  startEventPlan,
  startThreadFromMessage,
  tagsRequired,
  threadKindLabel,
  votePlan,
  type BoardPost,
  type EventDraft,
  type ForumSort,
  type ParityHost,
  type ThreadDraft,
  type ThreadIndexWire,
  registerEventOpener,
  registerEventsListOpener,
  registerPollOpener,
  registerThreadOpener,
} from "../threads";

const sortChoice = new Map<string, ForumSort>();
const tagChoice = new Map<string, string | null>();
const splitChoice = new Map<string, boolean>();
const selectedPost = new Map<string, string>();
const followedForums = new Set<string>();
let threadsOpen = false;
let gatewayWired = false;

export function parityStyles() {
  if (document.getElementById("lark-f-styles")) return;
  const style = document.createElement("style");
  style.id = "lark-f-styles";
  style.textContent = `
    .lark-f-pop, .lark-f-dialog {
      position: fixed; z-index: 40; color: var(--text); background: var(--bg-1);
      border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,.45));
      font: 14px/1.4 var(--font, "Inter", system-ui, sans-serif);
    }
    .lark-f-pop { top: 52px; right: 16px; width: min(440px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 80px)); display: flex; flex-direction: column; }
    .lark-f-dialog { top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(480px, calc(100vw - 24px)); max-height: min(720px, calc(100vh - 48px)); overflow: auto; padding: 16px; }
    .lark-f-pop header, .lark-f-bar { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px; }
    .lark-f-pop header strong, .lark-f-dialog h3 { font-size: 16px; font-weight: 700; color: var(--heading, var(--text)); }
    .lark-f-dialog h3 { margin: 0 0 12px; }
    .lark-f-pop .body, .lark-f-scroll { overflow: auto; padding: 0 8px 12px; display: flex; flex-direction: column; gap: 6px; }
    .lark-f-row, .lark-f-card {
      text-align: left; width: 100%; border: 0; background: var(--bg-3); color: var(--text);
      border-radius: 8px; padding: 10px 12px; cursor: pointer;
    }
    .lark-f-row:hover, .lark-f-card:hover { background: var(--bg-4); }
    .lark-f-row small, .lark-f-card small, .lark-f-help { color: var(--muted); display: block; }
    .lark-f-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
    .lark-f-actions button, .lark-f-dialog button, .lark-f-bar button, .lark-f-inline button {
      border: 0; border-radius: 4px; padding: 6px 10px; background: var(--bg-3); color: var(--text); cursor: pointer;
    }
    .lark-f-actions button.primary, .lark-f-dialog button.primary, .lark-f-inline button.primary { background: var(--accent); color: var(--accent-ink, #fff); }
    .lark-f-dialog label { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .02em; }
    .lark-f-dialog input, .lark-f-dialog textarea, .lark-f-dialog select {
      font: inherit; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text);
      background: var(--bg-0, var(--bg-3)); border: 1px solid var(--line); border-radius: 4px; padding: 8px;
    }
    .lark-f-dialog textarea { min-height: 88px; resize: vertical; }
    .lark-f-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; }
    .lark-f-tags button, .lark-f-chip { border: 0; border-radius: 999px; padding: 4px 10px; background: var(--bg-3); color: var(--text); cursor: pointer; }
    .lark-f-tags button.is-on, .lark-f-chip.is-on { background: var(--accent); color: var(--accent-ink, #fff); }
    .lark-f-guidelines { margin: 0 12px 8px; padding: 10px 12px; background: var(--bg-3); border-radius: 8px; color: var(--muted); }
    .lark-f-board.is-split { display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: 8px; padding: 0 12px 12px; }
    .lark-f-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; padding: 0 12px 12px; }
    .lark-f-tile { position: relative; border: 0; padding: 0; border-radius: 8px; overflow: hidden; background: var(--bg-3); color: var(--text); cursor: pointer; min-height: 140px; text-align: left; }
    .lark-f-tile img { width: 100%; height: 140px; object-fit: cover; display: block; }
    .lark-f-tile span { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px; background: linear-gradient(transparent, rgba(0,0,0,.72)); color: #fff; font-weight: 600; }
    .lark-f-detail { padding: 8px; background: var(--bg-3); border-radius: 8px; }
    .lark-f-detail img { max-width: 100%; border-radius: 8px; }
    .lark-f-poll { margin: 6px 0 2px; padding: 12px; background: var(--bg-3); border-radius: 8px; max-width: 420px; }
    .lark-f-poll .poll-expiry { color: var(--muted); display: block; margin-top: 2px; }
    .lark-f-poll button.answer { position: relative; overflow: hidden; display: flex; justify-content: space-between; gap: 8px; width: 100%; margin-top: 6px; text-align: left; }
    .lark-f-poll button.answer .bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); opacity: 0.28; pointer-events: none; }
    .lark-f-poll button.answer span, .lark-f-poll button.answer strong { position: relative; }
    .lark-f-poll button.answer.is-mine { outline: 1px solid var(--accent); }
    .lark-f-bar { padding: 0; margin-top: 6px; }
    .inbox-count { margin-left: 6px; background: var(--danger); color: #fff; border-radius: 999px; padding: 0 6px; font-size: 12px; font-weight: 700; }
    .lark-f-close { margin-left: auto; }
  `;
  document.head.append(style);
}

function host(): ParityHost | null {
  return currentParityHost();
}

function toast(title: string, body: string) {
  host()?.toast(title, body);
}

function closePop() {
  threadsOpen = false;
  document.getElementById("lark-f-popout")?.remove();
}

function closeDialog() {
  document.getElementById("lark-f-dialog")?.remove();
}

function pop(title: string): HTMLElement {
  parityStyles();
  closePop();
  const panel = el("section", "lark-f-pop");
  panel.id = "lark-f-popout";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  const head = el("header");
  head.append(el("strong", "", title));
  const close = el("button", "lark-f-close", "Close");
  close.type = "button";
  close.addEventListener("click", closePop);
  head.append(close);
  panel.append(head);
  document.body.append(panel);
  return panel;
}

function dialog(title: string): HTMLElement {
  parityStyles();
  closeDialog();
  const panel = el("section", "lark-f-dialog");
  panel.id = "lark-f-dialog";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", title);
  panel.append(el("h3", "", title));
  document.body.append(panel);
  return panel;
}

function labeled(name: string, control: HTMLElement): HTMLElement {
  const label = el("label");
  label.append(document.createTextNode(name), control);
  return label;
}

function parentOf(channelId: string) {
  const stored = parentInfo(channelId);
  const channel = host()?.channel(channelId);
  return {
    id: channelId,
    kind: channel?.kind ?? stored?.kind,
    rawKind: stored?.rawKind ?? channel?.rawKind,
    flags: stored?.flags ?? channel?.flags,
    topic: stored?.topic ?? channel?.topic,
    availableTags: stored?.availableTags ?? channel?.availableTags ?? [],
    defaultSortOrder: stored?.defaultSortOrder ?? channel?.defaultSortOrder,
  };
}

function postsFor(channelId: string): BoardPost[] {
  const live = (host()?.channels() ?? []).filter((channel) => channel.kind === "thread" && channel.parentId === channelId);
  return mergeThreadChannels(channelId, live).map(channelToPost);
}

function localId(): string {
  return String(Date.now()).padStart(18, "1").slice(0, 18);
}

async function readFile(file: File): Promise<{ name: string; mime: string; base64: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return { name: file.name, mime: file.type || "application/octet-stream", base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
}

export function parityHeaderButtons(): HTMLElement[] {
  parityStyles();
  ensureGateway();
  const threads = el("button", `text-button${threadsOpen ? " is-on" : ""}`, "Threads");
  threads.type = "button";
  threads.setAttribute("aria-label", "Threads");
  threads.addEventListener("click", () => {
    if (threadsOpen) closePop();
    else openThreadPanel();
  });
  const inbox = el("button", "text-button");
  inbox.type = "button";
  inbox.setAttribute("aria-label", "Inbox");
  inbox.dataset.parity = "inbox";
  inbox.addEventListener("click", () => {
    void import("./inbox").then((mod) => mod.toggleInbox());
  });
  void import("./inbox").then((mod) => mod.paintInboxButton(inbox));
  return [threads, inbox];
}

export function parityThreadBar(): HTMLElement | null {
  const current = host()?.channelId;
  const channel = current ? host()?.channel(current) : undefined;
  if (!channel || channel.kind !== "thread") return null;
  const bar = el("div", "lark-f-bar lark-f-inline");
  const kind = el("span", "", threadKindLabel(channel.rawKind));
  const archive = el("button", "", channel.archived ? "Unarchive" : "Archive");
  archive.type = "button";
  archive.addEventListener("click", () => void setArchived(channel, !channel.archived));
  const members = el("button", "", "Members");
  members.type = "button";
  members.addEventListener("click", () => void openMembers(channel));
  const follow = el("button", "", channel.followed ? "Following" : "Follow");
  follow.type = "button";
  follow.addEventListener("click", () => void setFollow(channel, !channel.followed));
  const leave = el("button", "", "Leave");
  leave.type = "button";
  leave.addEventListener("click", () => void leaveThread(channel));
  bar.append(kind, archive, members, follow, leave);
  return bar;
}

function openThreadPanel() {
  threadsOpen = true;
  const panel = pop("Threads");
  const actions = el("div", "lark-f-actions");
  const create = el("button", "primary", "Create Thread");
  create.type = "button";
  create.addEventListener("click", () => openThreadDialog({ channelId: host()?.channelId ?? "" }));
  actions.append(create);
  const body = el("div", "body");
  const current = host()?.channelId;
  const parentId = current && host()?.channel(current)?.kind === "thread" ? host()?.channel(current)?.parentId ?? current : current;
  const posts = parentId ? postsFor(parentId) : [];
  const active = posts.filter((post) => !post.archived);
  const archived = posts.filter((post) => post.archived);
  body.append(el("small", "", "Active"));
  if (!active.length) body.append(el("p", "lark-f-help", "No active threads."));
  for (const post of active) body.append(threadRow(post));
  body.append(el("small", "", "Archived"));
  if (!archived.length) body.append(el("p", "lark-f-help", "No archived threads."));
  for (const post of archived) body.append(threadRow(post));
  panel.append(actions, body);
}

function threadRow(post: BoardPost): HTMLElement {
  const button = el("button", "lark-f-row");
  button.type = "button";
  const meta = `${threadKindLabel(post.rawKind)} · ${post.messageCount ?? 0} messages`;
  button.append(el("strong", "", post.name), el("small", "", post.archived ? `${meta} · Archived` : meta));
  button.addEventListener("click", () => {
    closePop();
    host()?.openChannel(post.id);
  });
  return button;
}

function openThreadDialog(draft: ThreadDraft) {
  const channelId = draft.channelId || host()?.channelId || "";
  const parent = parentOf(channelId);
  const forum = isForumChannel(parent);
  const media = isMediaChannel(parent);
  const panel = dialog(forum ? (media ? "Create Post" : "New Post") : "Create Thread");
  const name = el("input");
  name.value = draft.name ?? "";
  name.maxLength = 100;
  name.setAttribute("aria-label", forum ? "Post title" : "Thread name");
  const body = el("textarea");
  body.value = draft.content ?? "";
  body.setAttribute("aria-label", "Post");
  const file = el("input");
  file.type = "file";
  file.accept = "image/*,video/*";
  const archive = el("select");
  for (const minutes of ARCHIVE_DURATIONS) {
    const option = el("option", "", archiveLabel(minutes));
    option.value = String(minutes);
    if (minutes === (draft.autoArchiveDuration ?? 1440)) option.selected = true;
    archive.append(option);
  }
  const tags = new Set(draft.appliedTags ?? []);
  const tagBox = el("div", "lark-f-tags");
  for (const tag of parent.availableTags ?? []) {
    const chip = el("button", tags.has(tag.id) ? "is-on" : "", tagLabel(tag));
    chip.type = "button";
    chip.addEventListener("click", () => {
      if (tags.has(tag.id)) tags.delete(tag.id);
      else tags.add(tag.id);
      chip.classList.toggle("is-on");
    });
    tagBox.append(chip);
  }
  let kind = draft.type ?? (isAnnouncementChannel(parent) ? THREAD_ANNOUNCEMENT : THREAD_PUBLIC);
  const kindRow = el("div", "lark-f-inline");
  if (!forum) {
    const choices: { label: string; value: number; show: boolean }[] = [
      { label: "Public", value: THREAD_PUBLIC, show: true },
      { label: "Private", value: THREAD_PRIVATE, show: true },
      { label: "Announcement", value: THREAD_ANNOUNCEMENT, show: isAnnouncementChannel(parent) },
    ];
    for (const choice of choices) {
      if (!choice.show) continue;
      const button = el("button", choice.value === kind ? "is-on" : "", choice.label);
      button.type = "button";
      button.addEventListener("click", () => {
        kind = choice.value;
        for (const node of kindRow.querySelectorAll("button")) node.classList.remove("is-on");
        button.classList.add("is-on");
        invite.hidden = kind !== THREAD_PRIVATE;
      });
      kindRow.append(button);
    }
  }
  const inviteInput = el("input");
  inviteInput.type = "checkbox";
  inviteInput.checked = draft.invitable !== false;
  const invite = labeled("Anyone can invite", inviteInput);
  invite.hidden = kind !== THREAD_PRIVATE;
  const submit = el("button", "primary", forum ? "Post" : "Create");
  submit.type = "button";
  submit.addEventListener("click", () => {
    void submitThread({
      channelId,
      messageId: forum ? null : draft.messageId,
      name: name.value,
      type: forum ? undefined : kind,
      autoArchiveDuration: Number(archive.value),
      invitable: inviteInput.checked,
      content: body.value,
      appliedTags: [...tags],
      hasAttachment: Boolean(file.files?.[0]),
      file: file.files?.[0] ?? null,
    });
  });
  const cancel = el("button", "", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", closeDialog);
  panel.append(labeled(forum ? "Title" : "Thread name", name));
  if (forum) {
    if (tagsRequired(parent.flags)) panel.append(el("p", "lark-f-help", "A tag is required."));
    if ((parent.availableTags ?? []).length) panel.append(tagBox);
    panel.append(labeled("Message", body), labeled(media ? "Image or video" : "Attachment", file));
  } else {
    panel.append(kindRow, invite);
  }
  panel.append(labeled("Hide after inactivity", archive));
  const row = el("div", "lark-f-inline");
  row.append(submit, cancel);
  panel.append(row);
  name.focus();
}

function tagLabel(tag: ForumTag): string {
  return tag.emojiName ? `${tag.emojiName} ${tag.name}` : tag.name;
}

async function submitThread(input: ThreadDraft & { file?: File | null }) {
  const parent = parentOf(input.channelId || "");
  const plan = startThreadFromMessage(input, parent);
  if (!plan.ok) {
    toast("Thread", plan.error);
    return;
  }
  const shell = host();
  if (!shell || shell.demo) {
    const id = localId();
    const thread: Channel = {
      id,
      name: String(plan.plan.body.name ?? "Thread"),
      kind: "thread",
      parentId: input.channelId,
      position: 0,
      rawKind: Number(plan.plan.body.type ?? THREAD_PUBLIC),
      archived: false,
      appliedTags: input.appliedTags,
      starterContent: input.content,
      messageCount: input.content ? 1 : 0,
    };
    shell?.rememberThread(thread);
    rememberPosts([{ ...channelToPost(thread), parentId: input.channelId }]);
    closeDialog();
    shell?.refresh();
    shell?.openChannel(id);
    return;
  }
  try {
    let fileName: string | undefined;
    let fileMime: string | undefined;
    let fileBase64: string | undefined;
    if (input.file) {
      const encoded = await readFile(input.file);
      fileName = encoded.name;
      fileMime = encoded.mime;
      fileBase64 = encoded.base64;
    }
    const created = await shell.invoke<ThreadIndexWire["threads"][number]>("start_thread", {
      channelId: input.channelId,
      messageId: input.messageId,
      name: plan.plan.body.name,
      kind: plan.plan.body.type,
      autoArchiveDuration: plan.plan.body.auto_archive_duration,
      invitable: plan.plan.body.invitable,
      content: input.content ?? "",
      appliedTags: input.appliedTags ?? [],
      route: plan.plan.route,
      parentKind: parent.rawKind,
      parentFlags: parent.flags ?? 0,
      fileName,
      fileMime,
      fileBase64,
    });
    applyThreadIndex({ parent: { ...parent, id: parent.id ?? input.channelId ?? "" }, threads: [{ ...created, parentId: created.parentId || input.channelId }] });
    closeDialog();
    shell.refresh();
    if (created.id) shell.openChannel(created.id);
  } catch (error) {
    toast("Thread", error instanceof Error ? error.message : "Could not create that thread.");
  }
}

async function setArchived(channel: Channel, archived: boolean) {
  const plan = archivePlan(channel.id, archived);
  if (!plan.ok) {
    toast("Thread", plan.error);
    return;
  }
  const shell = host();
  try {
    if (shell && !shell.demo) await shell.invoke("edit_thread", { threadId: channel.id, archived });
    rememberPosts([{ ...channelToPost(channel), archived, parentId: channel.parentId }]);
    shell?.rememberThread({ ...channel, archived });
    shell?.refresh();
  } catch (error) {
    toast("Thread", error instanceof Error ? error.message : "Could not update that thread.");
  }
}

async function setFollow(channel: Channel, follow: boolean) {
  const plan = followPlan(channel.id, follow);
  if (!plan.ok) {
    toast("Thread", plan.error);
    return;
  }
  const shell = host();
  try {
    if (shell && !shell.demo) {
      if (follow) {
        const join = joinThreadPlan(channel.id);
        if (join.ok) await shell.invoke("join_thread", { threadId: channel.id }).catch(() => undefined);
      }
      await shell.invoke("follow_thread", { threadId: channel.id, follow });
    }
    rememberPosts([{ ...channelToPost(channel), followed: follow, parentId: channel.parentId }]);
    shell?.rememberThread({ ...channel, followed: follow });
    shell?.refresh();
  } catch (error) {
    toast("Thread", error instanceof Error ? error.message : "Could not update notifications.");
  }
}

async function leaveThread(channel: Channel) {
  const shell = host();
  try {
    if (shell && !shell.demo) await shell.invoke("leave_thread", { threadId: channel.id });
    toast("Thread", `You left ${channel.name}.`);
  } catch (error) {
    toast("Thread", error instanceof Error ? error.message : "Could not leave that thread.");
  }
}

async function openMembers(channel: Channel) {
  const panel = pop("Thread members");
  const body = el("div", "body");
  panel.append(body);
  let members: ThreadMember[] = [];
  const shell = host();
  if (shell && !shell.demo) {
    try {
      members = await shell.invoke<ThreadMember[]>("fetch_thread_members", { threadId: channel.id });
    } catch (error) {
      body.append(el("p", "lark-f-help", error instanceof Error ? error.message : "Could not load members."));
    }
  }
  if (!members.length) body.append(el("p", "lark-f-help", "No one else is in this thread yet."));
  for (const member of members) {
    const row = el("div", "lark-f-row");
    row.append(el("strong", "", member.name || "Member"));
    if (channel.rawKind === THREAD_PRIVATE && shell) {
      const remove = el("button", "", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        const plan = memberPlan(channel.id, member.userId, false);
        if (!plan.ok) return;
        void shell.invoke("set_thread_member", { threadId: channel.id, userId: member.userId, add: false }).then(
          () => void openMembers(channel),
          (error: unknown) => toast("Thread", error instanceof Error ? error.message : "Could not remove that member."),
        );
      });
      row.append(remove);
    }
    body.append(row);
  }
  if (channel.rawKind === THREAD_PRIVATE && shell) {
    const input = el("input");
    input.placeholder = "User ID";
    input.setAttribute("aria-label", "User ID");
    const add = el("button", "primary", "Add");
    add.type = "button";
    add.addEventListener("click", () => {
      const plan = memberPlan(channel.id, input.value.trim(), true);
      if (!plan.ok) {
        toast("Thread", plan.error);
        return;
      }
      void shell.invoke("set_thread_member", { threadId: channel.id, userId: input.value.trim(), add: true }).then(
        () => void openMembers(channel),
        (error: unknown) => toast("Thread", error instanceof Error ? error.message : "Could not add that member."),
      );
    });
    const row = el("div", "lark-f-actions");
    row.append(input, add);
    panel.append(row);
  }
}

export function renderForumSurface(channelId: string): HTMLElement | null {
  const parent = parentOf(channelId);
  const channel = host()?.channel(channelId);
  if (!channel || (!isForumChannel(parent) && channel.kind !== "forum")) return null;
  if (channel.kind !== "forum" && !isMediaChannel(parent) && !isMediaChannel(channel)) return null;
  parityStyles();
  const media = isMediaChannel(parent) || isMediaChannel(channel);
  const board = el("div", media ? "forum-board lark-f-gallery-wrap" : "forum-board");
  const guidelines = guidelinesText(parent.topic);
  if (guidelines) {
    const note = el("div", "lark-f-guidelines");
    note.append(el("strong", "", "Guidelines"), el("p", "", guidelines));
    board.append(note);
  }
  const sort = sortChoice.get(channelId) ?? defaultForumSort(parent.defaultSortOrder);
  const tag = tagChoice.get(channelId) ?? null;
  const split = splitChoice.get(channelId) ?? false;
  const tools = el("div", "lark-f-actions");
  const sortSelect = el("select");
  sortSelect.setAttribute("aria-label", "Sort posts");
  for (const option of [
    ["latest", "Latest Activity"],
    ["creation", "Creation Date"],
  ] as const) {
    const node = el("option", "", option[1]);
    node.value = option[0];
    if (option[0] === sort) node.selected = true;
    sortSelect.append(node);
  }
  sortSelect.addEventListener("change", () => {
    sortChoice.set(channelId, sortSelect.value === "creation" ? "creation" : "latest");
    host()?.refresh();
  });
  const follow = el("button", followedForums.has(channelId) ? "is-on" : "", followedForums.has(channelId) ? "Following" : "Follow");
  follow.type = "button";
  follow.addEventListener("click", () => void toggleForumFollow(channelId));
  const create = el("button", "primary", media ? "Upload" : "New Post");
  create.type = "button";
  create.addEventListener("click", () => openThreadDialog({ channelId }));
  const splitButton = el("button", split ? "is-on" : "", "Split View");
  splitButton.type = "button";
  splitButton.addEventListener("click", () => {
    splitChoice.set(channelId, !split);
    host()?.refresh();
  });
  tools.append(sortSelect, follow, create, splitButton);
  board.append(tools);
  const tags = parent.availableTags ?? [];
  if (tags.length) {
    const row = el("div", "lark-f-tags");
    const all = el("button", tag ? "" : "is-on", "All");
    all.type = "button";
    all.addEventListener("click", () => {
      tagChoice.set(channelId, null);
      host()?.refresh();
    });
    row.append(all);
    for (const item of tags) {
      const chip = el("button", tag === item.id ? "is-on" : "", tagLabel(item));
      chip.type = "button";
      chip.addEventListener("click", () => {
        tagChoice.set(channelId, item.id);
        host()?.refresh();
      });
      row.append(chip);
    }
    board.append(row);
  }
  const posts = postsFor(channelId);
  const visible = media ? galleryPosts(posts, sort, tag) : partitionBoard(posts, sort, tag).active;
  if (media && !split) {
    const grid = el("div", "lark-f-gallery");
    if (!visible.length) grid.append(el("p", "lark-f-help", "No media posts yet."));
    for (const post of visible) grid.append(tile(post));
    board.append(grid);
  } else if (split) {
    const wrap = el("div", "lark-f-board is-split");
    const list = el("div", "lark-f-scroll");
    if (!visible.length) list.append(el("p", "lark-f-help", "No posts yet."));
    for (const post of visible) list.append(postButton(post, channelId, true));
    wrap.append(list, detailPane(channelId, visible));
    board.append(wrap);
  } else {
    const list = el("div", "body");
    if (!visible.length) list.append(el("p", "lark-f-help", "No active posts in this forum."));
    for (const post of visible) list.append(postButton(post, channelId, false));
    const archived = partitionBoard(posts, sort, tag).archived;
    if (archived.length) {
      list.append(el("small", "", "Archived"));
      for (const post of archived) list.append(postButton(post, channelId, false));
    }
    board.append(list);
  }
  return board;
}

function postButton(post: BoardPost, channelId: string, selecting: boolean): HTMLElement {
  const button = el("button", "lark-f-card");
  button.type = "button";
  const tags = (post.appliedTags ?? []).join(" ");
  button.append(el("strong", "", post.name), el("small", "", `${post.messageCount ?? 0} messages${tags ? ` · ${tags}` : ""}`));
  button.addEventListener("click", () => {
    if (selecting) {
      selectedPost.set(channelId, post.id);
      host()?.refresh();
      return;
    }
    host()?.openChannel(post.id);
  });
  return button;
}

function tile(post: BoardPost): HTMLElement {
  const button = el("button", "lark-f-tile");
  button.type = "button";
  if (post.imageUrl) {
    const image = el("img");
    image.src = post.imageUrl;
    image.alt = "";
    button.append(image);
  }
  button.append(el("span", "", post.name));
  button.addEventListener("click", () => host()?.openChannel(post.id));
  return button;
}

function detailPane(channelId: string, posts: BoardPost[]): HTMLElement {
  const pane = el("div", "lark-f-detail");
  const id = selectedPost.get(channelId) ?? posts[0]?.id;
  const post = posts.find((item) => item.id === id) ?? posts[0];
  if (!post) {
    pane.append(el("p", "lark-f-help", "Select a post."));
    return pane;
  }
  pane.append(el("h3", "", post.name));
  if (post.imageUrl) {
    const image = el("img");
    image.src = post.imageUrl;
    image.alt = "";
    pane.append(image);
  }
  if (post.starter) pane.append(el("p", "", post.starter));
  const open = el("button", "primary", "Open");
  open.type = "button";
  open.addEventListener("click", () => host()?.openChannel(post.id));
  pane.append(open);
  return pane;
}

async function toggleForumFollow(channelId: string) {
  const shell = host();
  const follow = !followedForums.has(channelId);
  const plan = forumFollowPlan(shell?.guildId ?? "", channelId, follow);
  if (!plan.ok) {
    toast("Forum", plan.error);
    return;
  }
  try {
    if (shell && !shell.demo) await shell.invoke("follow_forum", { guildId: shell.guildId, channelId, follow });
    if (follow) followedForums.add(channelId);
    else followedForums.delete(channelId);
    shell?.refresh();
  } catch (error) {
    toast("Forum", error instanceof Error ? error.message : "Could not follow that forum.");
  }
}

function pollSignature(poll: Poll): string {
  return `${poll.messageId}:${poll.finalized}:${poll.expiry ?? ""}:${poll.answers.map((answer) => `${answer.answerId}:${answer.count}${answer.meVoted ? "*" : ""}`).join(",")}`;
}

function rememberMessagePolls(channelId: string) {
  for (const message of host()?.messages(channelId) ?? []) {
    const poll = pollFromClient(message.poll, { messageId: message.id, channelId });
    if (poll?.messageId && poll.channelId) rememberPoll(poll);
  }
}

/** Discord draws the poll on the message. The old channel dock is not used. */
export function mountChannelPolls(container: HTMLElement | null) {
  if (!container) return;
  container.querySelector(".lark-f-polls")?.remove();
  if (container.querySelector(".friends-board, .clip-library")) return;
  const channelId = host()?.channelId;
  if (!channelId) return;
  rememberMessagePolls(channelId);
  const polls = pollsIn(channelId);
  const seen = new Set(polls.map((poll) => poll.messageId));
  for (const node of container.querySelectorAll<HTMLElement>(".lark-f-poll")) {
    if (!node.dataset.messageId || !seen.has(node.dataset.messageId)) node.remove();
  }
  for (const poll of polls) placePoll(container, poll);
  armPollExpiry();
}

function placePoll(container: HTMLElement, poll: Poll) {
  if (!poll.messageId) return;
  const sig = pollSignature(poll);
  const article = container.querySelector<HTMLElement>(`article.message[data-id="${poll.messageId}"]`);
  const body = article?.querySelector<HTMLElement>(".message-body") ?? article;
  const existing = (body ?? container).querySelector<HTMLElement>(`:scope > .lark-f-poll[data-message-id="${poll.messageId}"]`);
  if (existing?.dataset.sig === sig) return;
  existing?.remove();
  const card = pollCard(poll);
  card.dataset.sig = sig;
  if (body) {
    body.append(card);
    return;
  }
  const column = container.querySelector<HTMLElement>(":scope > .message-column");
  if (!column) return;
  const row = el("article", "message");
  row.dataset.id = poll.messageId;
  const next = el("div", "message-body");
  next.append(card);
  row.append(next);
  column.append(row);
}

let expiryTimer = 0;

function armPollExpiry() {
  if (expiryTimer || typeof window === "undefined") return;
  expiryTimer = window.setInterval(() => {
    for (const node of document.querySelectorAll<HTMLElement>(".lark-f-poll .poll-expiry")) {
      const channelId = node.dataset.channelId ?? "";
      const messageId = node.dataset.messageId ?? "";
      const poll = pollsIn(channelId).find((item) => item.messageId === messageId);
      if (!poll) continue;
      const label = pollExpiryLabel(poll);
      if (node.textContent === label) continue;
      node.textContent = label;
      if (label === "Poll closed" || label === "Final results") host()?.refresh();
    }
  }, 30_000);
}

function pollCard(poll: Poll): HTMLElement {
  const card = el("div", "lark-f-poll");
  card.dataset.messageId = poll.messageId;
  card.dataset.channelId = poll.channelId;
  card.append(el("strong", "", poll.question));
  const expiry = el("small", "poll-expiry", pollExpiryLabel(poll));
  expiry.dataset.channelId = poll.channelId;
  expiry.dataset.messageId = poll.messageId;
  if (expiry.textContent) card.append(expiry);
  const results = pollShowsResults(poll);
  const closed = poll.finalized || pollExpired(poll);
  for (const answer of poll.answers) {
    const button = el("button", `answer${answer.meVoted ? " is-mine" : ""}`);
    button.type = "button";
    const label = el("strong", "", `${answer.emojiName ? `${answer.emojiName} ` : ""}${answer.text}`);
    button.append(label);
    if (results) {
      const share = pollAnswerShare(poll, answer.count);
      const bar = el("span", "bar");
      bar.style.width = `${share}%`;
      const count = el("span", "", `${answer.count} · ${share}%`);
      button.append(bar, count);
    }
    button.disabled = !canVote(poll, answer.answerId);
    button.addEventListener("click", () => void castVote(poll, answer.answerId));
    const voters = el("button", "", "Voters");
    voters.type = "button";
    voters.addEventListener("click", (event) => {
      event.stopPropagation();
      void showVoters(poll, answer.answerId, answer.text);
    });
    card.append(button, voters);
  }
  if (!closed) {
    const end = el("button", "", "End poll");
    end.type = "button";
    end.addEventListener("click", () => void endPoll(poll));
    card.append(end);
  }
  return card;
}

function openPollDialog(draft: { channelId?: string }) {
  const panel = dialog("Create Poll");
  const question = el("input");
  question.maxLength = 300;
  question.setAttribute("aria-label", "Question");
  const answers = [el("input"), el("input")];
  for (const input of answers) {
    input.maxLength = 55;
    input.setAttribute("aria-label", "Answer");
  }
  const duration = el("select");
  for (const hours of [1, 4, 8, 24, 72, 168]) {
    const option = el("option", "", hours === 1 ? "1 hour" : hours === 168 ? "1 week" : hours === 72 ? "3 days" : `${hours} hours`);
    option.value = String(hours);
    if (hours === 24) option.selected = true;
    duration.append(option);
  }
  const multi = el("input");
  multi.type = "checkbox";
  const add = el("button", "", "Add answer");
  add.type = "button";
  const list = el("div");
  const renderAnswers = () => {
    list.replaceChildren();
    answers.forEach((input, index) => list.append(labeled(`Answer ${index + 1}`, input)));
  };
  add.addEventListener("click", () => {
    if (answers.length >= 10) return;
    const input = el("input");
    input.maxLength = 55;
    input.setAttribute("aria-label", "Answer");
    answers.push(input);
    renderAnswers();
  });
  renderAnswers();
  const submit = el("button", "primary", "Post");
  submit.type = "button";
  submit.addEventListener("click", () => {
    void submitPoll({
      channelId: draft.channelId || host()?.channelId || "",
      question: question.value,
      answers: answers.map((input) => ({ text: input.value })),
      durationHours: Number(duration.value),
      allowMultiselect: multi.checked,
    });
  });
  const cancel = el("button", "", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", closeDialog);
  panel.append(labeled("Question", question), list, add, labeled("Duration", duration), labeled("Allow multiple answers", multi));
  const row = el("div", "lark-f-inline");
  row.append(submit, cancel);
  panel.append(row);
  question.focus();
}

async function submitPoll(draft: Parameters<typeof pollPlan>[0]) {
  const plan = pollPlan(draft);
  if (!plan.ok) {
    toast("Poll", plan.error);
    return;
  }
  const shell = host();
  if (!shell || shell.demo) {
    rememberPoll({
      messageId: localId(),
      channelId: draft.channelId ?? "",
      question: String((plan.plan.body.poll as { question: { text: string } }).question.text),
      answers: ((plan.plan.body.poll as { answers: { poll_media: { text: string } }[] }).answers).map((answer, index) => ({
        answerId: index + 1,
        text: answer.poll_media.text,
        count: 0,
        meVoted: false,
      })),
      expiry: null,
      allowMultiselect: Boolean(draft.allowMultiselect),
      layoutType: 1,
      finalized: false,
    });
    closeDialog();
    shell?.refresh();
    return;
  }
  try {
    const poll = await shell.invoke<Poll>("create_poll", {
      channelId: draft.channelId,
      question: draft.question,
      answers: (draft.answers ?? []).map((answer) => ({ text: answer.text ?? "", emojiName: answer.emojiName ?? null })),
      durationHours: draft.durationHours,
      allowMultiselect: Boolean(draft.allowMultiselect),
    });
    rememberPoll(poll);
    closeDialog();
    shell.refresh();
  } catch (error) {
    toast("Poll", error instanceof Error ? error.message : "Could not post that poll.");
  }
}

async function castVote(poll: Poll, answerId: number) {
  const plan = votePlan(poll, answerId);
  if (!plan.ok) {
    toast("Poll", plan.error);
    return;
  }
  const shell = host();
  try {
    if (shell && !shell.demo) await shell.invoke("vote_poll", { channelId: poll.channelId, messageId: poll.messageId, answerId });
    rememberPoll(applyPollVote(poll, answerId, true, true));
    shell?.refresh();
  } catch (error) {
    toast("Poll", error instanceof Error ? error.message : "Could not record that vote.");
  }
}

async function endPoll(poll: Poll) {
  const plan = endPollPlan(poll);
  if (!plan.ok) {
    toast("Poll", plan.error);
    return;
  }
  const shell = host();
  try {
    const next = shell && !shell.demo ? await shell.invoke<Poll>("end_poll", { channelId: poll.channelId, messageId: poll.messageId }) : { ...poll, finalized: true };
    rememberPoll(next);
    shell?.refresh();
  } catch (error) {
    toast("Poll", error instanceof Error ? error.message : "Could not end that poll.");
  }
}

async function showVoters(poll: Poll, answerId: number, text: string) {
  const panel = pop(`Voters · ${text}`);
  const body = el("div", "body");
  panel.append(body);
  const shell = host();
  if (!shell || shell.demo) {
    body.append(el("p", "lark-f-help", "Voters show up once the poll is on Discord."));
    return;
  }
  try {
    const users = await shell.invoke<{ id: string; name: string }[]>("fetch_poll_voters", {
      channelId: poll.channelId,
      messageId: poll.messageId,
      answerId,
    });
    if (!users.length) body.append(el("p", "lark-f-help", "No votes on this answer yet."));
    for (const user of users) body.append(el("div", "lark-f-row", user.name));
  } catch (error) {
    body.append(el("p", "lark-f-help", error instanceof Error ? error.message : "Could not load voters."));
  }
}

function openEventList(guildId?: string) {
  const id = guildId || host()?.guildId || "";
  const panel = pop("Events");
  const actions = el("div", "lark-f-actions");
  const create = el("button", "primary", "Create Event");
  create.type = "button";
  create.addEventListener("click", () => openEventWizard(id));
  actions.append(create);
  const body = el("div", "body");
  panel.append(actions, body);
  const paint = (events: ScheduledEvent[]) => {
    body.replaceChildren();
    if (!events.length) body.append(el("p", "lark-f-help", "No upcoming events."));
    for (const event of events) body.append(eventRow(event));
  };
  paint(eventsIn(id));
  const shell = host();
  if (shell && !shell.demo && id) {
    void shell.invoke<ScheduledEvent[]>("fetch_events", { guildId: id }).then(
      (events) => {
        for (const event of events) rememberEvent(event);
        paint(eventsIn(id));
      },
      (error: unknown) => body.append(el("p", "lark-f-help", error instanceof Error ? error.message : "Could not load events.")),
    );
  }
}

function eventRow(event: ScheduledEvent): HTMLElement {
  const row = el("div", "lark-f-card");
  const when = event.scheduledStartTime ? new Date(event.scheduledStartTime).toLocaleString() : "";
  const where = event.entityType === EVENT_EXTERNAL ? event.location || "Somewhere else" : "Voice channel";
  const status = event.status === EVENT_ACTIVE ? " · Live" : event.status === EVENT_SCHEDULED ? "" : "";
  row.append(el("strong", "", event.name), el("small", "", `${when} · ${where}${status}`));
  const interested = el("button", event.interested ? "is-on" : "", event.interested ? "Interested" : "RSVP");
  interested.type = "button";
  interested.addEventListener("click", () => void setRsvp(event, !event.interested));
  row.append(interested);
  if (canStartEvent(event)) {
    const start = el("button", "primary", "Start");
    start.type = "button";
    start.addEventListener("click", () => void startEvent(event));
    row.append(start);
  }
  return row;
}

function openEventWizard(guildId?: string) {
  const id = guildId || host()?.guildId || "";
  const panel = dialog("Create Event");
  const topic = el("input");
  topic.maxLength = 100;
  topic.setAttribute("aria-label", "Event topic");
  const description = el("textarea");
  description.maxLength = 1000;
  description.setAttribute("aria-label", "Description");
  let location: EventDraft["location"] = "voice";
  const channel = el("select");
  channel.setAttribute("aria-label", "Channel");
  const channels = (host()?.channels() ?? []).filter((item) => item.kind === "voice" || (item.kind as string) === "stage" || item.rawKind === 13);
  for (const item of channels) {
    const option = el("option", "", item.name);
    option.value = item.id;
    channel.append(option);
  }
  const elsewhere = el("input");
  elsewhere.maxLength = 100;
  elsewhere.placeholder = "The lobby";
  elsewhere.setAttribute("aria-label", "Location");
  const start = el("input");
  start.type = "datetime-local";
  start.value = localValue(Date.now() + 60 * 60 * 1000);
  const end = el("input");
  end.type = "datetime-local";
  end.value = localValue(Date.now() + 2 * 60 * 60 * 1000);
  const frequency = el("select");
  for (const option of [
    ["none", "Does not repeat"],
    ["daily", "Daily"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
    ["yearly", "Yearly"],
  ] as const) {
    const node = el("option", "", option[1]);
    node.value = option[0];
    frequency.append(node);
  }
  const cover = el("input");
  cover.type = "file";
  cover.accept = "image/*";
  const locationRow = el("div", "lark-f-inline");
  for (const choice of [
    ["voice", "Voice channel"],
    ["stage", "Stage channel"],
    ["external", "Somewhere else"],
  ] as const) {
    const button = el("button", choice[0] === location ? "is-on" : "", choice[1]);
    button.type = "button";
    button.addEventListener("click", () => {
      location = choice[0];
      for (const node of locationRow.querySelectorAll("button")) node.classList.remove("is-on");
      button.classList.add("is-on");
      channel.closest("label")?.toggleAttribute("hidden", location === "external");
      elsewhere.closest("label")?.toggleAttribute("hidden", location !== "external");
    });
    locationRow.append(button);
  }
  const channelLabel = labeled("Channel", channel);
  const elsewhereLabel = labeled("Location", elsewhere);
  elsewhereLabel.hidden = true;
  const submit = el("button", "primary", "Create Event");
  submit.type = "button";
  submit.addEventListener("click", () => {
    void submitEvent({
      guildId: id,
      topic: topic.value,
      description: description.value,
      location,
      channelId: channel.value,
      elsewhere: elsewhere.value,
      start: fromLocal(start.value),
      end: fromLocal(end.value),
      frequency: frequency.value as EventDraft["frequency"],
      cover,
    });
  });
  const back = el("button", "", "All events");
  back.type = "button";
  back.addEventListener("click", () => openEventList(id));
  panel.append(labeled("Topic", topic), locationRow, channelLabel, elsewhereLabel, labeled("Start", start), labeled("End", end), labeled("Frequency", frequency), labeled("Description", description), labeled("Cover", cover));
  const row = el("div", "lark-f-inline");
  row.append(submit, back);
  panel.append(row);
  topic.focus();
}

function localValue(time: number): string {
  const date = new Date(time);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

async function submitEvent(draft: EventDraft & { cover?: HTMLInputElement }) {
  let coverDataUrl: string | null = null;
  const file = draft.cover?.files?.[0];
  if (file) {
    coverDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read that cover."));
      reader.readAsDataURL(file);
    });
  }
  const picked = host()?.channel(draft.channelId ?? "");
  const location = draft.location === "stage" || picked?.rawKind === 13 || (picked?.kind as string) === "stage" ? "stage" : draft.location;
  const plan = eventPlan({ ...draft, location, coverDataUrl });
  if (!plan.ok) {
    toast("Event", plan.error);
    return;
  }
  const shell = host();
  if (!shell || shell.demo) {
    rememberEvent({
      id: localId(),
      guildId: draft.guildId ?? "",
      name: String(plan.plan.body.name),
      description: String(plan.plan.body.description ?? ""),
      channelId: (plan.plan.body.channel_id as string | null) ?? null,
      scheduledStartTime: String(plan.plan.body.scheduled_start_time),
      scheduledEndTime: (plan.plan.body.scheduled_end_time as string | undefined) ?? null,
      privacyLevel: 2,
      status: EVENT_SCHEDULED,
      entityType: Number(plan.plan.body.entity_type),
      location: (plan.plan.body.entity_metadata as { location?: string } | undefined)?.location ?? null,
      interested: false,
    });
    closeDialog();
    openEventList(draft.guildId);
    return;
  }
  try {
    const created = await shell.invoke<ScheduledEvent>("create_scheduled_event", { guildId: draft.guildId, body: plan.plan.body });
    rememberEvent(created);
    closeDialog();
    openEventList(draft.guildId);
  } catch (error) {
    toast("Event", error instanceof Error ? error.message : "Could not create that event.");
  }
}

async function setRsvp(event: ScheduledEvent, interested: boolean) {
  const plan = rsvpPlan(event, interested);
  if (!plan.ok) {
    toast("Event", plan.error);
    return;
  }
  const shell = host();
  try {
    if (shell && !shell.demo) await shell.invoke("rsvp_event", { guildId: event.guildId, eventId: event.id, interested });
    rememberEvent({ ...event, interested, userCount: Math.max(0, (event.userCount ?? 0) + (interested ? 1 : -1)) });
    openEventList(event.guildId);
  } catch (error) {
    toast("Event", error instanceof Error ? error.message : "Could not update your RSVP.");
  }
}

async function startEvent(event: ScheduledEvent) {
  const plan = startEventPlan(event);
  if (!plan.ok) {
    toast("Event", plan.error);
    return;
  }
  const shell = host();
  try {
    const next = shell && !shell.demo
      ? await shell.invoke<ScheduledEvent>("start_scheduled_event", { guildId: event.guildId, eventId: event.id })
      : { ...event, status: EVENT_ACTIVE };
    rememberEvent(next);
    if (next.channelId) shell?.openChannel(next.channelId);
    else openEventList(event.guildId);
  } catch (error) {
    toast("Event", error instanceof Error ? error.message : "Could not start that event.");
  }
}

function ensureGateway() {
  if (gatewayWired || typeof window === "undefined") return;
  gatewayWired = true;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen("discord", (event) => onGateway(event.payload)))
    .catch(() => undefined);
}

function onGateway(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const event = payload as {
    kind?: string;
    id?: string;
    channelId?: string;
    messageId?: string;
    answerId?: number;
    added?: boolean;
    userId?: string;
    removed?: boolean;
    event?: ScheduledEvent;
  };
  const shell = host();
  if (event.kind === "threadDelete" && event.id) {
    forgetPost(event.id);
    shell?.refresh();
  } else if (event.kind === "pollVote" && event.channelId && event.messageId && event.answerId) {
    const poll = pollsIn(event.channelId).find((item) => item.messageId === event.messageId);
    if (poll) {
      rememberPoll(applyPollVote(poll, event.answerId, Boolean(event.added), event.userId === shell?.meId));
      shell?.refresh();
    }
  } else if (event.kind === "scheduledEvent" && event.event) {
    if (event.removed) forgetEvent(event.event.id);
    else rememberEvent(event.event);
    shell?.refresh();
  }
}

registerThreadOpener((draft) => openThreadDialog(draft));
registerPollOpener((draft) => openPollDialog(draft));
registerEventOpener((guildId) => openEventWizard(guildId));
registerEventsListOpener((guildId) => openEventList(guildId));
