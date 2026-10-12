// @lark name: Edit log
// @lark description: Badge a message after it is edited.

function onMessage(message, api) {
  if (message.edited) api.badge(message, "edited");
  return message;
}
