// @lark name: Collapse long messages
// @lark description: Fold messages longer than 280 characters.

function onMessage(message, api) {
  if (message.content.length > 280) api.collapse(message);
  return message;
}
