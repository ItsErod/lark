// @lark name: Voice Message Downloader
// @lark description: A download button on voice messages and, if you want, every attachment.

function onMessage(message, api) {
  api.effect(message, "voice-download");
  return message;
}

function describe() {
  return { voiceDownload: true };
}
