import { createServer as createNetServer } from "node:net";
import { createServer, type ViteDevServer } from "vite";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (!address || typeof address === "string") reject(new Error("Dev server did not bind a port"));
        else resolve(address.port);
      });
    });
  });
}

/** Bind Vite on a free port so parallel UI tests do not collide. */
export async function listenDevServer(): Promise<{ server: ViteDevServer; port: number }> {
  let last: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const port = await freePort();
    try {
      const server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true } });
      await server.listen();
      return { server, port };
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already in use")) throw error;
    }
  }
  throw last instanceof Error ? last : new Error("Dev server did not bind a port");
}
