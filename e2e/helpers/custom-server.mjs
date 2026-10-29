// A server for one spec file when useApp() does not fit: an explicit auth mode, provider
// environment (sources), a LAN host or TLS.
//
//   const app = useCustomApp({
//     seed: async (store, app) => ({ project: await store.createProject({ title: "Demo" }) }),
//     server: (store, app) => ({ auth: new Auth(store, "local", "George") }),
//     host: "127.0.0.1",
//   });
//
// Like useApp, it starts one server and temporary vault per worker for the file, merges the
// seed's result into `app`, and cleans up afterwards. Put any extra temporary directories the
// seed creates in `app.cleanup` so they are removed too.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "../fixtures.mjs";
import { Store } from "../../server/store.js";
import { createServer } from "../../server/index.js";

export async function startCustomApp(name, { seed = async () => ({}), server: options = () => ({}), host = "127.0.0.1" } = {}) {
  process.env.AUTH_MODE ||= "single-user";
  process.env.LOCAL_USER_NAME ||= "George";
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `pencils-${name}-`));
  const store = new Store(root);
  await store.init();
  const app = { store, root, cleanup: [] };
  Object.assign(app, await seed(store, app));
  const settings = await options(store, app);
  const server = createServer(store, settings);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return Object.assign(app, {
    server,
    host,
    port: server.address().port,
    base: `${settings.tls ? "https" : "http"}://${host}:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await store.queue;
      await store.close?.();
      for (const dir of [root, ...app.cleanup]) await fs.rm(dir, { recursive: true, force: true });
    },
  });
}

export function useCustomApp(settings = {}) {
  const app = {};
  test.beforeAll(async ({}, testInfo) => {
    Object.assign(app, await startCustomApp(path.basename(testInfo.file, ".spec.mjs"), typeof settings === "function" ? await settings() : settings));
  });
  test.afterAll(async () => app.close?.());
  return app;
}
