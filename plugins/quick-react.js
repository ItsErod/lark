// @lark name: Quick reactions
// @lark description: A short emoji bar on hover. One click is one reaction, same as the picker.

function onMessage(message, api) {
  api.effect(message, "quick-react");
  return message;
}

function describe() {
  return { quickReactions: ["👍", "❤️", "😂", "🎉", "👀"] };
}
