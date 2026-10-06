// @lark name: Inline syntax
// @lark description: Color inline code the same way fenced blocks are colored.

function onMessage(message, api) {
  api.effect(message, "inline-code");
  return message;
}
