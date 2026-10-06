// @lark name: Hide joins
// @lark description: Drop member join and other system lines.

function onMessage(message) {
  if (message.kind === "join" || message.kind === "system") return null;
  return message;
}
