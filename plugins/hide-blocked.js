// @lark name: Hide Blocked Messages
// @lark description: Fully hide messages from blocked people instead of a blocked-message row.

function onMessage(message, api) {
  if (api.blocked(message.authorId)) return null;
  return message;
}

function describe() {
  return { hideBlocked: true };
}
