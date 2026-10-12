// @lark name: View Original Image
// @lark description: Open the full image and download it in one click.

function onMessage(message, api) {
  api.effect(message, "original-image");
  return message;
}

function describe() {
  return { originalImage: true };
}
