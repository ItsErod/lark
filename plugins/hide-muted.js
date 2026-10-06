// @lark name: Hide muted people
// @lark description: Drop messages from people you hide locally. This does not block them on Discord.

function onMessage(message, api) {
  if (api.hidden(message.authorId)) return null;
  return message;
}

function describe() {
  return { hideUsers: true };
}
