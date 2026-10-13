import { describe, expect, it } from "vitest";
import { listenDevServer } from "./dev-listen.dev";

describe("dev server ports", () => {
  it("binds two servers at once", async () => {
    const first = await listenDevServer();
    const second = await listenDevServer();
    try {
      expect(first.port).toBeGreaterThan(0);
      expect(second.port).toBeGreaterThan(0);
      expect(first.port).not.toBe(second.port);
    } finally {
      await first.server.close();
      await second.server.close();
    }
  });
});
