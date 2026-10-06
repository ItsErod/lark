// @lark name: Code badge
// @lark description: Mark messages that contain a code block.

function onMessage(message, api) {
  if (message.content.includes("```")) api.badge(message, "code");
  return message;
}
