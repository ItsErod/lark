// @lark name: Message translator
// @lark description: Click Translate for a local phrase book. No network and no token.

function onMessage(message, api) {
  api.effect(message, "translate");
  return message;
}
