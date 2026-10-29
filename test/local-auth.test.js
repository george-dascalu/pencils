import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { Sources } from "../server/sources.js";
import { createServer } from "../server/index.js";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-local-auth-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await store.queue;
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, store, auth: new Auth(store, "local", "George") };
}
const requestFrom = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test("local administrator is automatic only for local socket peers", async (t) => {
  const { store, auth } = await fixture(t);
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "192.168.1.25", "172.18.0.1", "10.0.0.10", "fd12::1", "fe80::1"]) {
    const user = await auth.user(requestFrom(ip));
    assert.equal(user.username, "George", ip);
    assert.equal(user.admin, true);
    assert.equal(user.automatic, true);
  }
  for (const ip of ["203.0.113.5", "172.32.0.1", "192.0.2.1", "2001:db8::1", "invalid", undefined])
    assert.equal(await auth.user(requestFrom(ip, { host: "localhost", "x-forwarded-for": "127.0.0.1", "x-real-ip": "192.168.1.1" })), null, String(ip));
  assert.equal(await new Auth(store, true).user(requestFrom("127.0.0.1")), null, "Required mode still needs a password");
  assert.equal((await new Auth(store, false).user(requestFrom("127.0.0.1"))).username, "Shared workspace");
  assert.throws(() => new Auth(store, "typo"), /AUTH_MODE/);
  assert.throws(() => new Auth(store, "local", "<invalid>"), /LOCAL_USER_NAME/);
});

test("local identity preserves password accounts and cannot be used as a remote password login", async (t) => {
  const { root, store, auth } = await fixture(t);
  const required = new Auth(store, true);
  await required.save({ username: "admin", password: "fixture-admin-password", admin: true, organisations: {} });
  const file = path.join(root, ".pencils", "accounts.json");
  const before = await fs.readFile(file, "utf8");
  assert.deepEqual((await auth.accounts()).map((u) => u.username), ["admin", "George"]);
  await assert.rejects(auth.login({ username: "George", password: "fixture-admin-password" }, "remote"), (e) => e.status === 401);
  await assert.rejects(auth.save({ username: "George", admin: false }), /managed by server settings/);
  const login = await auth.login({ username: "admin", password: "fixture-admin-password" }, "remote");
  assert.equal((await auth.user(requestFrom("203.0.113.5", { cookie: `pencils_session=${login.token}` }))).username, "admin");
  assert.equal(await fs.readFile(file, "utf8"), before);
  const restarted = new Auth(store, "local", "George");
  assert.equal((await restarted.user(requestFrom("127.0.0.1"))).username, "George");
  assert.equal((await restarted.accounts()).find((u) => u.username === "George").admin, true);
  assert.deepEqual((await new Auth(store, true).accounts()).map((u) => u.username), ["admin"]);
});

test("single-user mode uses the same owner on every connection and can return to required authentication", async (t) => {
  const { root, store, auth: local } = await fixture(t);
  const required = new Auth(store, "required");
  await required.save({ username: "admin", password: "fixture-admin-password", admin: true, organisations: {} });
  const file = path.join(root, ".pencils", "accounts.json");
  const before = await fs.readFile(file, "utf8");
  const single = new Auth(store, "single-user", "George");
  for (const ip of ["127.0.0.1", "192.168.1.25", "100.74.164.52", "::ffff:100.74.164.52", "203.0.113.5", "2001:db8::1"]) {
    assert.deepEqual(await single.user(requestFrom(ip)), await local.user(requestFrom("127.0.0.1")));
    assert.equal(await required.user(requestFrom(ip)), null);
  }
  assert.equal(await local.user(requestFrom("100.74.164.52")), null, "Local mode's network boundary is unchanged");
  assert.equal(single.enabled, true, "Integration ownership is available");
  assert.equal((await single.accounts()).find((u) => u.username === "George").admin, true);
  await assert.rejects(single.save({ username: "George", admin: false }), /managed by server settings/);
  assert.throws(() => new Auth(store, "single-user", "<invalid>"), /LOCAL_USER_NAME/);
  assert.equal(await fs.readFile(file, "utf8"), before);
  const login = await required.login({ username: "admin", password: "fixture-admin-password" }, "remote");
  const remote = requestFrom("100.74.164.52", { cookie: `pencils_session=${login.token}` });
  assert.equal((await required.user(remote)).username, "admin");
  assert.equal((await single.user(remote)).username, "George", "Old cookies do not change the automatic owner");
});

for (const mode of ["local", "single-user"]) test(`automatic ${mode} administrator can configure Jira, complete OAuth and own background sync`, async (t) => {
  const { store } = await fixture(t);
  const auth = new Auth(store, mode, "George");
  const project = await store.createProject({ title: "Local sources" });
  const env = { APP_ORIGIN: "http://localhost:3000", JIRA_CLIENT_ID: "fixture-client", JIRA_CLIENT_SECRET: "fixture-secret" };
  const providerFetch = async (url) => {
    let body;
    if (url === "https://auth.atlassian.com/oauth/token")
      body = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 };
    else if (url.endsWith("accessible-resources"))
      body = [{ id: "fixture-site", name: "Fixture site", url: "https://example.atlassian.net" }];
    else if (url.includes("/search/jql"))
      body = { isLast: true, issues: [{ id: "1", key: "DEMO-1", fields: { summary: "Jira fixture", status: { name: "todo" }, issuetype: { name: "task" }, updated: "2026-10-17T00:00:00Z" } }] };
    else throw Error(`Unexpected provider request: ${url}`);
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  };
  const server = createServer(store, { auth, sources: { env, fetch: providerFetch } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data = {}, headers = {}) => fetch(base + url, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data),
  });
  const session = await (await fetch(base + "/api/session")).json();
  assert.equal(session.automatic, true);
  assert.equal(session.user.username, "George");
  assert.equal(session.user.admin, true);
  assert.equal((await post("/api/projects", { title: "Cross origin" }, { Origin: "https://untrusted.example" })).status, 403);
  const created = await post(`/api/projects/${project.id}/sources`, {
    name: "Jira fixture", provider: "jira", enabled: true,
    scope: { cloudId: "fixture-site", jql: "project = DEMO ORDER BY key ASC" },
  });
  assert.equal(created.status, 201);
  const source = await created.json();
  const consent = await post(`/api/projects/${project.id}/sources/${source.id}/authorize`);
  assert.equal(consent.status, 200);
  const consentURL = new URL((await consent.json()).url);
  assert.equal(consentURL.hostname, "auth.atlassian.com");
  assert.ok(consentURL.searchParams.get("scope").includes("offline_access"));
  const callback = await fetch(`${base}/api/source-callback/jira?state=${consentURL.searchParams.get("state")}&code=fixture-code`, { redirect: "manual" });
  assert.equal(callback.status, 303);
  assert.equal((await store.snapshot(project.id)).project.source_owner, "George");
  const afterRestart = new Sources(store, new Auth(store, mode, "George"), { env, fetch: providerFetch });
  await afterRestart.poll();
  const tasks = (await store.snapshot(project.id)).tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Jira fixture");
  assert.equal(tasks[0].source.provider, "jira");
});
