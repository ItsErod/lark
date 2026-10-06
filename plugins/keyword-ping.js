// @lark name: Keyword ping
// @lark description: Highlight words, and ping on a mentions-only channel when one appears. Mute still wins.

function onMessage(message, api) {
  var words = api.setting("words");
  if (!words) return message;
  var hay = message.content.toLowerCase();
  var list = words.split(",");
  for (var i = 0; i < list.length; i += 1) {
    var word = list[i].trim().toLowerCase();
    if (word.length > 1 && hay.indexOf(word) !== -1) {
      api.highlight(message, "keyword");
      api.badge(message, "keyword");
      break;
    }
  }
  return message;
}

function describe() {
  return { keywords: true, channelRules: true };
}
