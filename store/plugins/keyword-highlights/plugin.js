// @lark name: Keyword highlights
// @lark description: Highlight words or a small regex across servers, and notify when you are not already looking.

function onMessage(message, api) {
  var raw = api.setting("patterns");
  if (!raw) return message;
  var lines = raw.split("\n");
  var hay = String(message.content || "").slice(0, 2000);
  var lower = hay.toLowerCase();
  for (var i = 0; i < lines.length; i += 1) {
    var pattern = lines[i].trim();
    if (pattern.length < 2) continue;
    if (lineHits(hay, lower, pattern)) {
      api.highlight(message, "keyword");
      api.badge(message, "keyword");
      break;
    }
  }
  return message;
}

function lineHits(hay, lower, pattern) {
  if (pattern.charAt(0) !== "/") {
    return pattern.length > 1 && lower.indexOf(pattern.toLowerCase()) !== -1;
  }
  var last = pattern.lastIndexOf("/");
  if (last <= 0) return false;
  var flags = pattern.slice(last + 1);
  if (!/^[imu]{0,3}$/.test(flags)) return false;
  var source = pattern.slice(1, last);
  if (!source || source.length > 60 || /\\[1-9]/.test(source) || /\([^)]*[+*][^)]*\)[+*{]/.test(source)) return false;
  try {
    var re = new RegExp(source, flags);
    if (re.test("")) return false;
    return re.test(hay);
  } catch (err) {
    return false;
  }
}

function describe() {
  return { patternNotify: true };
}
