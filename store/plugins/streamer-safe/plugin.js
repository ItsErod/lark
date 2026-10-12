// @lark name: Streamer Safe
// @lark description: Blur emails, phone numbers, IDs, and DMs when OBS or a stream is on.

var EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
var PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/g;
var SNOWFLAKE = /\b\d{17,20}\b/g;

function onMessage(message, api) {
  if (api.setting("active") !== "1") return message;
  if (api.setting("direct") === "1" && api.setting("dms") !== "0") {
    message.content = "Message hidden";
    return message;
  }
  var text = message.content;
  if (api.setting("emails") !== "0") text = text.replace(EMAIL, "[email hidden]");
  if (api.setting("phones") !== "0") text = text.replace(PHONE, "[phone hidden]");
  if (api.setting("ids") !== "0") text = text.replace(SNOWFLAKE, "[id hidden]");
  message.content = text;
  return message;
}

function describe() {
  return { streamerSafe: true };
}
