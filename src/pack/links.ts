const TRACKING = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "igshid",
  "igsh",
  "si",
  "yclid",
  "srsltid",
  "scid",
  "epik",
  "_ga",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "spm",
]);

const URL_IN_TEXT = /https?:\/\/[^\s<>()]+/gi;

export function isTrackingParam(key: string): boolean {
  const name = key.trim().toLowerCase();
  if (!name) return false;
  if (name.startsWith("utm_")) return true;
  return TRACKING.has(name);
}

/** Drop tracking query keys. Anything that is not an http(s) URL is returned unchanged. */
export function stripTrackingUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return raw;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return raw;
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) url.searchParams.delete(key);
  }
  url.hash = url.hash.replace(/#(?:utm_[^\s&]*|fbclid=[^\s&]*)/gi, "");
  const next = url.toString();
  return next.endsWith("?") ? next.slice(0, -1) : next;
}

export function stripTrackingText(text: string): string {
  return text.replace(URL_IN_TEXT, (match) => {
    const trail = /[),.!?]+$/.exec(match)?.[0] ?? "";
    const core = trail ? match.slice(0, -trail.length) : match;
    return stripTrackingUrl(core) + trail;
  });
}
