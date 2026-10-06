export interface Token {
  kind: "plain" | "keyword" | "string" | "comment" | "number";
  text: string;
}

const KEYWORDS: Record<string, string[]> = {
  css: ["color", "display", "grid", "flex", "margin", "padding", "font", "background"],
  js: ["const", "let", "function", "return", "if", "else", "import", "from", "export"],
  ts: ["const", "let", "function", "return", "if", "else", "import", "from", "export", "type", "interface"],
  rust: ["fn", "let", "mut", "pub", "struct", "enum", "impl", "return", "if", "else", "use"],
  json: ["true", "false", "null"],
};

export function highlightCode(lang: string | null, source: string): Token[] {
  const words = new Set(KEYWORDS[(lang ?? "").toLowerCase()] ?? []);
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("//") || rest.startsWith("#")) {
      const end = source.indexOf("\n", i);
      const stop = end < 0 ? source.length : end;
      tokens.push({ kind: "comment", text: source.slice(i, stop) });
      i = stop;
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      tokens.push({ kind: "string", text: source.slice(i, Math.min(source.length, j + 1)) });
      i = Math.min(source.length, j + 1);
      continue;
    }
    const number = /^\d[\d_]*/.exec(rest);
    if (number && (i === 0 || !/[A-Za-z_]/.test(source[i - 1] ?? ""))) {
      tokens.push({ kind: "number", text: number[0] });
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][\w-]*/.exec(rest);
    if (word) {
      tokens.push({ kind: words.has(word[0]) ? "keyword" : "plain", text: word[0] });
      i += word[0].length;
      continue;
    }
    tokens.push({ kind: "plain", text: source[i] });
    i += 1;
  }
  return tokens;
}

export function highlightPlain(source: string): string {
  return highlightCode(null, source).map((token) => token.text).join("");
}

export function inlineLang(source: string): string | null {
  if (/\b(fn|mut|struct|impl|enum)\b/.test(source)) return "rust";
  if (/\b(interface|type|const|function|return)\b/.test(source)) return "ts";
  if (/\b(display|margin|padding|color)\b/.test(source) || source.includes(":")) return "css";
  return null;
}
