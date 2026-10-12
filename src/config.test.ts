import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";

describe("save_config payload", () => {
  it("keeps the Rust round-trip fixture equal to the frontend default config", () => {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "../crates/lark-core/tests/frontend-default-config.json",
    );
    expect(defaultConfig()).toEqual(JSON.parse(readFileSync(path, "utf8")));
  });
});
