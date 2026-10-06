// @lark name: Quiet media
// @lark description: Hide link previews and shrink images. The link text stays.

function onMessage(message, api) {
  if (api.setting("previews") !== "show") api.effect(message, "hide-previews");
  if (api.setting("compact") !== "off") api.effect(message, "compact-media");
  return message;
}
