// @lark name: Word counter
// @lark description: Count words in the composer, and badge a long message.

function onMessage(message, api) {
  const min = Number(api.setting("min"));
  if (!min) return message;
  const text = message.content.trim();
  if (!text) return message;
  const words = text.split(/\s+/).length;
  if (words >= min) api.badge(message, words === 1 ? "1 word" : words + " words");
  return message;
}

function describe() {
  return { wordCount: true };
}
