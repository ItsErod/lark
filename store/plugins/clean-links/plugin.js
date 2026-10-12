// @lark name: Clean Links
// @lark description: Strip utm, si, fbclid, and other tracking parameters from links you send and open.

var TRACKING = {
  fbclid: 1, gclid: 1, gclsrc: 1, dclid: 1, gbraid: 1, wbraid: 1, msclkid: 1,
  twclid: 1, ttclid: 1, li_fat_id: 1, mc_cid: 1, mc_eid: 1, igshid: 1, igsh: 1,
  si: 1, yclid: 1, srsltid: 1, scid: 1, epik: 1, _ga: 1, vero_id: 1, vero_conv: 1,
  oly_anon_id: 1, oly_enc_id: 1, rb_clickid: 1, spm: 1,
};

function tracking(key) {
  var name = String(key || "").toLowerCase();
  return name.indexOf("utm_") === 0 || TRACKING[name] === 1;
}

function cleanUrl(raw) {
  try {
    var url = new URL(raw);
  } catch (err) {
    return raw;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return raw;
  var keys = [];
  url.searchParams.forEach(function (_value, key) { keys.push(key); });
  keys.forEach(function (key) {
    if (tracking(key)) url.searchParams.delete(key);
  });
  return url.toString();
}

function onMessage(message, api) {
  if (api.setting("receive") === "0") return message;
  message.content = String(message.content || "").replace(/https?:\/\/[^\s<>()]+/gi, function (match) {
    var trail = /[),.!?]+$/.exec(match);
    var end = trail ? trail[0] : "";
    var core = end ? match.slice(0, -end.length) : match;
    return cleanUrl(core) + end;
  });
  return message;
}

function describe() {
  return { cleanLinks: true };
}
