// Native HTTPS: the server serves TLS itself when TLS_CERT_FILE and TLS_KEY_FILE are set,
// requires sign-in, and marks the session cookie Secure with HSTS.
// Generate a temporary self-signed pair with OpenSSL unless both TLS_CERT_FILE and
// TLS_KEY_FILE are supplied. The fixture removes its vault and generated keys afterwards.
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { Auth } from "../../server/auth.js";

const { TLS_CERT_FILE, TLS_KEY_FILE } = process.env;
const run = promisify(execFile);

const app = useCustomApp(async () => ({
  server: async (store, app) => {
    if (!!TLS_CERT_FILE !== !!TLS_KEY_FILE) throw Error('Supply both TLS_CERT_FILE and TLS_KEY_FILE, or neither for temporary test certificates.');
    const certFile = TLS_CERT_FILE || path.join(app.root, 'test-cert.pem');
    const keyFile = TLS_KEY_FILE || path.join(app.root, 'test-key.pem');
    if (!TLS_CERT_FILE) await run('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-keyout', keyFile, '-out', certFile,
    ]);
    const auth = new Auth(store, true);
    await auth.save({ username: "tls-test", password: "temporary-test-password", admin: true, organisations: {} });
    return { auth, tls: { cert: await fs.readFile(certFile), key: await fs.readFile(keyFile) } };
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
