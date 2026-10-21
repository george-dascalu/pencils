import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { createServer } from "./http/application.js";
export { createServer } from "./http/application.js";

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = new Store(process.env.VAULT_PATH || path.resolve("vault"));
  await store.init();
  const tls =
    process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE
      ? {
          cert: await fs.readFile(process.env.TLS_CERT_FILE),
          key: await fs.readFile(process.env.TLS_KEY_FILE),
        }
      : undefined;
  const server = createServer(store, { tls });
  const port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () =>
    console.log(
      `Pencils is ready at ${tls ? "https" : "http"}://localhost:${port}\nVault: ${store.root}\nListening on ${host}`,
    ),
  );
  const shutdown = () => {
    server.close(() => process.exit(0));
    // End persistent SSE connections; pending disk transactions still drain first.
    store.queue.finally(() => server.closeAllConnections());
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
