/**
 * Discord inbox: Mentions, Unreads, Bookmarks, Reminders, friend requests, message requests, Mark All Read.
 * Bookmarks and reminders are Stream A's lists. The badge prefers Stream C's pending count.
 */
import { el } from "./dom";
import type { Bookmark } from "../pack/bookmarks";
import * as bookmarkApi from "../pack/bookmarks";
import type { Reminder } from "../reminders";
import * as reminderApi from "../reminders";
import * as socialApi from "../social";
import { blockedIds, decideFriendRequest } from "../social";
import type { FriendRequest } from "../types";
import {
  ackAllStates,
  ackBulkBody,
  bookmarkRows,
  chunkAck,
  currentParityHost,
  inboxFriendBadge,
  readPendingFriendCount,
  reminderRows,
  type InboxTab,
  type ParityHost,
} from "../threads";
import {
  heldRequestIds,
  localMessageRequests,
  mergeMessageRequests,
  messageRequestGroups,
  messageRequestsFromPayload,
  releaseHeldRequest,
  replaceHeldRequests,
  type MessageRequest,
} from "../message-requests";

let open = false;
let requests: FriendRequest[] = [];
let asked = false;
let messageRequests: MessageRequest[] = [];
let messagesAsked = false;
let messagesSettled = false;
let messagesAttemptAt = 0;
let tab: InboxTab = "mentions";

function shell(): ParityHost | null {
  return currentParityHost();
}

function pendingCount(): number | null {
  const published = readPendingFriendCount(socialApi, (globalThis as { __larkPendingFriends?: unknown }).__larkPendingFriends);
  if (published != null) return published;
  return shell()?.pendingFriendCount ?? null;
}

export function paintInboxButton(button: HTMLButtonElement) {
  const friends = inboxFriendBadge(pendingCount(), asked ? requests : []);
  const waiting = messageRequests.length;
  const badge = friends + waiting;
  button.replaceChildren(document.createTextNode("Inbox"));
  const parts = ["Inbox"];
  if (friends > 0) parts.push(`${friends} friend ${friends === 1 ? "request" : "requests"}`);
  if (waiting > 0) parts.push(`${waiting} message ${waiting === 1 ? "request" : "requests"}`);
  button.setAttribute("aria-label", parts.join(", "));
  if (badge > 0) button.append(el("span", "inbox-count", String(badge)));
  if (!asked) {
    asked = true;
    void loadRequests().then(() => {
      if (button.isConnected) paintInboxButton(button);
    });
  }
  if (!messagesSettled) void loadMessageRequests();
}

/** Relationship index finished. Retry the local fallback if Discord's route was missing. */
export function noteRelationshipIndex() {
  if (messagesSettled) return;
  messagesAsked = false;
  messagesAttemptAt = 0;
  void loadMessageRequests();
}

export function toggleInbox() {
  if (open) {
    open = false;
    document.getElementById("lark-f-inbox")?.remove();
    return;
  }
  openInbox();
}

export function openInbox() {
  open = true;
  document.getElementById("lark-f-popout")?.remove();
  document.getElementById("lark-f-inbox")?.remove();
  const panel = el("section", "lark-f-pop");
  panel.id = "lark-f-inbox";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Inbox");
  const head = el("header");
  head.append(el("strong", "", "Inbox"));
  const read = el("button", "", "Mark All Read");
  read.type = "button";
  read.addEventListener("click", () => void markAllRead());
  const close = el("button", "lark-f-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => toggleInbox());
  head.append(read, close);
  const tabs = el("div", "lark-f-tags");
  for (const item of [
    ["mentions", "Mentions"],
    ["unreads", "Unreads"],
    ["bookmarks", "Bookmarks"],
    ["reminders", "Reminders"],
    ["requests", "Friend Requests"],
    ["messages", "Message Requests"],
  ] as const) {
    const button = el("button", tab === item[0] ? "is-on" : "", item[1]);
    button.type = "button";
    button.addEventListener("click", () => {
      tab = item[0];
      openInbox();
    });
    tabs.append(button);
  }
  const body = el("div", "body");
  panel.append(head, tabs, body);
  document.body.append(panel);
  if (tab === "mentions") void paintMentions(body);
  else if (tab === "unreads") paintUnreads(body);
  else if (tab === "bookmarks") paintBookmarks(body);
  else if (tab === "reminders") paintReminders(body);
  else if (tab === "messages") paintMessageRequests(body);
  else void paintRequests(body);
}

async function loadRequests() {
  const host = shell();
  if (!host || host.demo) return;
  try {
    requests = await host.invoke<FriendRequest[]>("fetch_friend_requests");
  } catch {
    requests = [];
  }
}

function savedList(): readonly Bookmark[] {
  const mod = bookmarkApi as { savedMessages?: () => Bookmark[]; listBookmarks?: () => Bookmark[] };
  for (const read of [mod.savedMessages, mod.listBookmarks]) {
    if (typeof read !== "function") continue;
    try {
      const list = read();
      if (Array.isArray(list)) return bookmarkRows(list);
    } catch {
      /* Stream A's list is not ready. */
    }
  }
  return bookmarkRows(shell()?.bookmarks ?? []);
}

function laterList(): readonly Reminder[] {
  const mod = reminderApi as { listReminders?: () => Reminder[]; savedReminders?: () => Reminder[] };
  for (const read of [mod.listReminders, mod.savedReminders]) {
    if (typeof read !== "function") continue;
    try {
      const list = read();
      if (Array.isArray(list)) return reminderRows(list);
    } catch {
      /* Stream A's list is not ready. */
    }
  }
  return reminderRows(shell()?.reminders ?? []);
}

async function paintMentions(body: HTMLElement) {
  const host = shell();
  if (!host || host.demo) {
    body.append(el("p", "lark-f-help", "Mentions from Discord show up here."));
    return;
  }
  try {
    const messages = await host.invoke<{ id: string; channelId: string; authorName: string; content: string }[]>("fetch_mentions");
    if (!messages.length) body.append(el("p", "lark-f-help", "No mentions yet. You'll see them here."));
    for (const message of messages) {
      const row = el("button", "lark-f-row");
      row.type = "button";
      row.append(el("strong", "", host.mask(message.authorName || "Someone")), el("small", "", host.mask(message.content || "Empty message")));
      row.addEventListener("click", () => {
        toggleInbox();
        host.jump(message.channelId, message.id);
      });
      body.append(row);
    }
  } catch (error) {
    body.append(el("p", "lark-f-help", error instanceof Error ? error.message : "Could not load mentions."));
  }
}

function paintUnreads(body: HTMLElement) {
  const host = shell();
  const rows = host?.unreads() ?? [];
  if (!rows.length) {
    body.append(el("p", "lark-f-help", "You're all caught up."));
    return;
  }
  for (const channel of rows) {
    const row = el("button", "lark-f-row");
    row.type = "button";
    const count = (channel.mentions ?? 0) > 0 ? `${channel.mentions} mentions` : `${channel.unread ?? 0} unread`;
    row.append(el("strong", "", channel.name), el("small", "", count));
    row.addEventListener("click", () => {
      toggleInbox();
      host?.openChannel(channel.id);
    });
    body.append(row);
  }
}

function paintBookmarks(body: HTMLElement) {
  const list = savedList();
  const host = shell();
  if (!list.length) {
    body.append(el("p", "lark-f-help", "No bookmarks yet. Save a message and it stays with your account."));
    return;
  }
  for (const bookmark of list) {
    const row = el("button", "lark-f-row");
    row.type = "button";
    row.append(el("strong", "", host?.mask(bookmark.authorName) ?? bookmark.authorName), el("small", "", host?.mask(bookmark.excerpt) ?? bookmark.excerpt));
    row.addEventListener("click", () => {
      toggleInbox();
      host?.jump(bookmark.channelId, bookmark.messageId);
    });
    body.append(row);
  }
}

function paintReminders(body: HTMLElement) {
  const list = laterList();
  const host = shell();
  if (!list.length) {
    body.append(el("p", "lark-f-help", "No reminders yet."));
    return;
  }
  for (const reminder of list) {
    const row = el("button", "lark-f-row");
    row.type = "button";
    const when = new Date(reminder.remindAt).toLocaleString();
    row.append(el("strong", "", host?.mask(reminder.authorName) ?? reminder.authorName), el("small", "", `${when} · ${host?.mask(reminder.excerpt) ?? reminder.excerpt}`));
    row.addEventListener("click", () => {
      toggleInbox();
      host?.jump(reminder.channelId, reminder.messageId);
    });
    body.append(row);
  }
}

async function paintRequests(body: HTMLElement) {
  await loadRequests();
  const badge = inboxFriendBadge(pendingCount(), requests);
  if (!requests.length && badge === 0) {
    body.append(el("p", "lark-f-help", "No pending friend requests."));
    return;
  }
  if (!requests.length) {
    body.append(el("p", "lark-f-help", `${badge} pending friend ${badge === 1 ? "request" : "requests"}.`));
    return;
  }
  for (const request of requests) {
    const row = el("div", "lark-f-row");
    row.append(el("strong", "", request.name), el("small", "", request.incoming ? "Incoming friend request" : "Outgoing friend request"));
    if (request.incoming) {
      const actions = el("div", "lark-f-actions");
      const accept = el("button", "primary", "Accept");
      accept.type = "button";
      accept.addEventListener("click", () => void decideRequest(request, "accept"));
      const ignore = el("button", "", "Ignore");
      ignore.type = "button";
      ignore.addEventListener("click", () => void decideRequest(request, "ignore"));
      actions.append(accept, ignore);
      row.append(actions);
    }
    body.append(row);
  }
}

async function loadMessageRequests() {
  if (messagesSettled || messagesAsked) return;
  const now = Date.now();
  if (now - messagesAttemptAt < 5000) return;
  messagesAsked = true;
  messagesAttemptAt = now;
  const host = shell();
  if (!host) {
    messagesAsked = false;
    return;
  }
  if (!host.demo) {
    try {
      const regular = await host.invoke<unknown>("fetch_message_requests", { spam: false });
      let spamPayload: unknown = [];
      try {
        spamPayload = await host.invoke<unknown>("fetch_message_requests", { spam: true });
      } catch {
        spamPayload = [];
      }
      commitMessageRequests(mergeMessageRequests([
        ...messageRequestsFromPayload(regular, false),
        ...messageRequestsFromPayload(spamPayload, true),
      ]));
      return;
    } catch {
      /* The client route is missing. Classify local non-friend DMs. */
    }
  }
  if (!host.dms || !host.friendIds) {
    messagesAsked = false;
    return;
  }
  const friends = host.friendIds();
  if (friends == null) {
    messagesAsked = false;
    return;
  }
  commitMessageRequests(localMessageRequests({
    dms: host.dms(),
    friendIds: friends,
    blockedIds: blockedIds(),
    meId: host.meId,
    spamFilter: host.spamFilter,
  }));
}

function commitMessageRequests(rows: MessageRequest[]) {
  const prior = new Set(heldRequestIds());
  const next = rows.map((row) => row.id);
  const changed = prior.size !== next.length || next.some((id) => !prior.has(id));
  messageRequests = rows;
  replaceHeldRequests(next);
  messagesSettled = true;
  messagesAsked = true;
  if (changed) shell()?.refresh();
  if (open && tab === "messages") openInbox();
}

function paintMessageRequests(body: HTMLElement) {
  const groups = messageRequestGroups(messageRequests);
  paintMessageGroup(body, "Message requests", groups.requests, "No message requests.");
  paintMessageGroup(body, "Spam", groups.spam, "Nothing in spam.");
}

function paintMessageGroup(body: HTMLElement, title: string, rows: MessageRequest[], empty: string) {
  body.append(el("p", "lark-f-help", title));
  if (!rows.length) {
    body.append(el("p", "lark-f-help", empty));
    return;
  }
  for (const request of rows) body.append(messageRow(request));
}

function messageRow(request: MessageRequest): HTMLElement {
  const row = el("div");
  const openRow = el("button", "lark-f-row");
  openRow.type = "button";
  openRow.append(el("strong", "", request.name), el("small", "", request.preview || "Direct message"));
  openRow.addEventListener("click", () => {
    const host = shell();
    toggleInbox();
    host?.openChannel(request.id);
  });
  const actions = el("div", "lark-f-actions");
  const accept = el("button", "primary", "Accept");
  accept.type = "button";
  accept.addEventListener("click", () => void decideMessage(request, "accept"));
  const ignore = el("button", "", "Ignore");
  ignore.type = "button";
  ignore.addEventListener("click", () => void decideMessage(request, "ignore"));
  actions.append(accept, ignore);
  row.append(openRow, actions);
  return row;
}

async function decideMessage(request: MessageRequest, action: "accept" | "ignore") {
  const host = shell();
  if (!host) return;
  if (host.demo) {
    releaseHeldRequest(request.id);
    messageRequests = messageRequests.filter((item) => item.id !== request.id);
    host.toast("Message Requests", action === "accept" ? "Accepted. The conversation stays in your DMs." : "Ignored.");
    host.refresh();
    if (open) openInbox();
    return;
  }
  try {
    if (action === "accept") {
      let accepted = false;
      try {
        await host.invoke("accept_message_request", { channelId: request.id });
        accepted = true;
      } catch {
        accepted = false;
      }
      releaseHeldRequest(request.id);
      messageRequests = messageRequests.filter((item) => item.id !== request.id);
      host.toast(
        "Message Requests",
        accepted ? "Accepted. The conversation stays in your DMs." : "Discord has no message-request route. The conversation stays in your DMs.",
      );
    } else {
      try {
        await host.invoke("ignore_message_request", { channelId: request.id });
      } catch {
        try {
          await host.invoke("close_dm", { channelId: request.id });
        } catch (error) {
          host.toast("Message Requests", error instanceof Error ? error.message : "Discord refused that.");
          return;
        }
      }
      releaseHeldRequest(request.id);
      messageRequests = messageRequests.filter((item) => item.id !== request.id);
      host.toast("Message Requests", "Ignored.");
    }
    host.refresh();
    if (open) openInbox();
  } catch (error) {
    host.toast("Message Requests", error instanceof Error ? error.message : "Discord refused that.");
  }
}

async function decideRequest(request: FriendRequest, action: "accept" | "ignore") {
  const host = shell();
  if (!host || host.demo) {
    host?.toast("Friends", "Demo relationships stay on this device.");
    return;
  }
  try {
    if (action === "accept") await host.invoke("add_relationship", { userId: request.id });
    else await host.invoke("ignore_user", { userId: request.id });
    decideFriendRequest(request.id, action);
    requests = requests.filter((item) => item.id !== request.id);
    host.toast("Friends", action === "accept" ? "Friend request accepted." : "Ignored.");
    host.refresh();
    if (open) openInbox();
  } catch (error) {
    host.toast("Friends", error instanceof Error ? error.message : "Discord refused that.");
  }
}

async function markAllRead() {
  const host = shell();
  if (!host) return;
  const states = ackAllStates(host.unreads());
  if (!states.length) {
    host.toast("Inbox", "Nothing is unread.");
    return;
  }
  try {
    if (!host.demo) {
      for (const chunk of chunkAck(states)) {
        const body = ackBulkBody(chunk);
        await host.invoke("ack_bulk", { states: body.read_states.map((item) => ({ channelId: item.channel_id, messageId: item.message_id })) });
      }
    }
    host.markAllRead(states);
    host.toast("Inbox", "Marked all as read.");
    if (open && tab === "unreads") openInbox();
  } catch (error) {
    host.toast("Inbox", error instanceof Error ? error.message : "Could not mark everything read.");
  }
}
