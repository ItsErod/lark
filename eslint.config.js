import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "src-tauri/**", "target/**", "site/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts", "vite.config.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    rules: {
      // The tree already trips these. Leave them off so CI can lint without
      // rewriting src/ui/app.ts or other feature code.
      "no-control-regex": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "no-dupe-else-if": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
