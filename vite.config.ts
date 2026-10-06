import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

function safeFile(url: string | undefined, exts: string[]): string | null {
  const name = decodeURIComponent((url ?? "/").split("?")[0].replace(/^\//, ""));
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!exts.some((ext) => name.endsWith(ext))) return null;
  if (name.endsWith(".json") && name !== "manifest.json") return null;
  return name;
}

function serveDir(folder: string, exts: string[]): Plugin {
  const dir = path.join(root, folder);
  const mount = `/${folder}`;
  const handler = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => {
    const name = safeFile(req.url, exts);
    if (!name) {
      next();
      return;
    }
    const file = path.join(dir, name);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      next();
      return;
    }
    const type = name.endsWith(".css") ? "text/css" : name.endsWith(".json") ? "application/json" : "text/javascript";
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store");
    res.end(readFileSync(file, "utf8"));
  };
  return {
    name: `lark-serve-${folder}`,
    configureServer(server) {
      server.middlewares.use(mount, handler);
    },
  };
}

function copyStatic(): Plugin {
  return {
    name: "lark-copy-static",
    closeBundle() {
      for (const folder of ["themes", "plugins"]) {
        const from = path.join(root, folder);
        const to = path.join(root, "dist", folder);
        mkdirSync(to, { recursive: true });
        for (const name of readdirSync(from)) {
          const src = path.join(from, name);
          if (statSync(src).isFile()) copyFileSync(src, path.join(to, name));
        }
      }
    },
  };
}

export default defineConfig({
  server: { host: "127.0.0.1", port: 47321, strictPort: true },
  preview: { host: "127.0.0.1", port: 47321, strictPort: true },
  plugins: [serveDir("themes", [".css"]), serveDir("plugins", [".js", ".json"]), copyStatic()],
  build: { target: "es2022", sourcemap: false, cssCodeSplit: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
