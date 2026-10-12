// @lark name: Translate
// @lark description: Local glossary only. No network, no token.

var LINES = {
  "the rail is four pixels tighter": "el riel está cuatro píxeles más ajustado",
};

function onMessage(message) {
  if (!message.content.startsWith("tr:")) return message;
  var line = message.content.slice(3).trim().toLowerCase();
  var translated = LINES[line];
  if (translated) message.content = translated;
  return message;
}
