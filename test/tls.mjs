// Run with temporary TLS_CERT_FILE/TLS_KEY_FILE and VAULT_PATH variables.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import https from "node:https";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
const store = new Store(process.env.VAULT_PATH);
await store.init();
const auth = new Auth(store, true);
await auth.save({
  username: "tls-test",
  password: "temporary-test-password",
  admin: true,
  organisations: {},
});
const server = createServer(store, {
  auth,
  tls: {
    cert: await fs.readFile(process.env.TLS_CERT_FILE),
    key: await fs.readFile(process.env.TLS_KEY_FILE),
  },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const request = (pathname, body) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path: pathname,
        method: body ? "POST" : "GET",
        rejectUnauthorized: false,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
try {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/projects")).status, 401);
  const login = await request("/api/session", {
    username: "tls-test",
    password: "temporary-test-password",
  });
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /; Secure/);
  assert.ok(login.headers["strict-transport-security"]);
  console.log(
    "PASS: native HTTPS, authenticated access and Secure session cookie.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
