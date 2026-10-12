import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: { host: "127.0.0.1", port: 47321, strictPort: true },
  preview: { host: "127.0.0.1", port: 47321, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        overlay: path.resolve(root, "overlay.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: process.env.LARK_BENCH ? ["src/bench/harness.bench.ts"] : ["src/**/*.test.ts"],
  },
});
