// @lark name: Spoiler Everything
// @lark description: Blur images and embeds until you click them. Each channel can opt out.

function onMessage(message, api) {
  if (api.setting("mode") === "off") return message;
  api.effect(message, "spoiler-media");
  return message;
}

function describe() {
  return { spoilerMedia: true };
}
