// Native HTTPS: the server serves TLS itself when TLS_CERT_FILE and TLS_KEY_FILE are set,
// requires sign-in, and marks the session cookie Secure with HSTS.
// Run with a temporary pair, for example:
//   openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -keyout key.pem -out cert.pem
//   TLS_CERT_FILE=cert.pem TLS_KEY_FILE=key.pem npx playwright test e2e/platform/tls.spec.mjs
// The vault is always temporary.
import fs from "node:fs/promises";
import https from "node:https";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { Auth } from "../../server/auth.js";

const { TLS_CERT_FILE, TLS_KEY_FILE } = process.env;
test.skip(!TLS_CERT_FILE || !TLS_KEY_FILE, "Native HTTPS needs TLS_CERT_FILE and TLS_KEY_FILE (a self-signed pair is enough).");

const app = useCustomApp(async () => ({
  server: async (store) => {
    const auth = new Auth(store, true);
    await auth.save({ username: "tls-test", password: "temporary-test-password", admin: true, organisations: {} });
    return { auth, tls: { cert: await fs.readFile(TLS_CERT_FILE), key: await fs.readFile(TLS_KEY_FILE) } };
  },
}));

const request = (pathname, body) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "127.0.0.1", port: app.port, path: pathname, method: body ? "POST" : "GET", rejectUnauthorized: false, headers: { "Content-Type": "application/json" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });

test("HTTPS serves health openly, requires sign-in and sets a Secure session cookie with HSTS", async () => {
  expect(app.base).toMatch(/^https:/);
  expect((await request("/api/health")).status).toBe(200);
  expect((await request("/api/projects")).status).toBe(401);
  const login = await request("/api/session", { username: "tls-test", password: "temporary-test-password" });
  expect(login.status).toBe(200);
  expect(login.headers["set-cookie"][0]).toMatch(/; Secure/);
  expect(login.headers["strict-transport-security"]).toBeTruthy();
});
