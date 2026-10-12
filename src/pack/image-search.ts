/** Build a reverse-image search link. The host opens it. The plugin script does not. */

export type ImageEngine = "lens" | "tineye" | "yandex";

const ENGINES: ImageEngine[] = ["lens", "tineye", "yandex"];

export function httpsImage(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

export function enabledEngines(flags: { lens: boolean; tineye: boolean; yandex: boolean }): ImageEngine[] {
  return ENGINES.filter((engine) => flags[engine]);
}

export function engineLabel(engine: ImageEngine): string {
  if (engine === "lens") return "Google Lens";
  if (engine === "tineye") return "TinEye";
  return "Yandex";
}

export function searchHref(engine: ImageEngine, imageUrl: string): string | null {
  const clean = httpsImage(imageUrl);
  if (!clean || !ENGINES.includes(engine)) return null;
  const encoded = encodeURIComponent(clean);
  if (engine === "lens") return `https://lens.google.com/uploadbyurl?url=${encoded}`;
  if (engine === "tineye") return `https://tineye.com/search?url=${encoded}`;
  return `https://yandex.com/images/search?rpt=imageview&url=${encoded}`;
}
