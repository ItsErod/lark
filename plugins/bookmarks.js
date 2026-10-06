// @lark name: Bookmarks
// @lark description: Save messages on this device. Nothing is pinned on Discord.

function onMessage(message, api) {
  api.effect(message, "bookmark");
  return message;
}

function describe() {
  return { bookmarks: true };
}
