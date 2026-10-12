// @lark name: YouTube Picture-in-Picture
// @lark description: Pop a YouTube embed into a floating mini player.

function onMessage(message, api) {
  api.effect(message, "youtube-pip");
  return message;
}

function describe() {
  return { youtubePip: true };
}
