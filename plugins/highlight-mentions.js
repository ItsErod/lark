// @lark name: Highlight mentions
// @lark description: Wash messages that mention you.

function onMessage(message, api) {
  if (message.mentionsMe) api.highlight(message, "mention");
  return message;
}
