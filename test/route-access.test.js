// T41: every API route refuses people who may not use it. The route list is read from the
// server's registrations: a new project or organisation route is probed as such at once, and any
// other new route fails this test until it joins one of the lists below.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

// Routes anyone may call, and routes only administrators may call.
const PUBLIC = new Set(["/api/health", "/api/session", "/api/miro-callback", "/api/source-callback/:provider", "/api/capture"]);
const ADMIN = new Set(["/api/accounts", "/api/backups", "/api/backups/:backup", "/api/backups/:backup/:action", "/api/backups/upload", "/api/trash"]);
// Signed-in routes that serve each person's own data or filter by access, so a member of no
// organisation still gets an answer (checked for private content below).
const OWN = new Set(["/api/bar", "/api/hotkeys", "/api/search-items", "/api/bookmarks", "/api/home", "/api/home/embed", "/api/visits", "/api/personal", "/api/overview", "/api/search", "/api/changes", "/api/events", "/api/organisations", "/api/projects", "/api/capture-tokens", "/api/capture-tokens/:project", "/api/diagnostics", "/api/demo", "/api/history", "/api/project-key"]);

async function registered() {
  const source = await fs.readFile(new URL("../server/http/application.ts", import.meta.url), "utf8");
  const literal = [...source.matchAll(/"(\/api\/[^"]+)"/g)].map((m) => m[1]);
  const kinds = [...source.matchAll(/for \(const kind of \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((k) => k[1]));
  const templated = kinds.flatMap((kind) => [`/api/projects/:project/${kind}`, `/api/projects/:project/${kind}/:id`, `/api/projects/:project/${kind}/:id/:action`]);
  // Only the kind loop builds routes from a template; any other spelling would slip past this list.
  assert.equal((source.match(/[`']\/api\//g) || []).length, 3, "register routes as double-quoted strings or in the kind loop");
  const methods = [...source.match(/const methods: HTTPMethods\[\] = \[([^\]]+)\]/)[1].matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
  return { routes: [...new Set([...literal, ...templated])], methods };
}

test("every route refuses people without access, and the route list has no unchecked route", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-routes-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  const hidden = await store.createOrganisation({ title: "Hidden" });
  const open = await store.createProject({ title: "Open project" });
  const secret = await store.createProject({ title: "Secret project", organisation: hidden.id });
  const task = await store.createTask(secret.id, { title: "Secret task", body: "Private content" });
  await auth.save({ username: "boss", password: "test-password-long", admin: true, organisations: {} });
  await auth.save({ username: "editor", password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  await auth.save({ username: "viewer", password: "test-password-long", admin: false, organisations: { "o-default": "viewer" } });
  await auth.save({ username: "outsider", password: "test-password-long", admin: false, organisations: {} });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookies = {};
  for (const username of ["boss", "editor", "viewer", "outsider"]) {
    const login = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) });
    cookies[username] = login.headers.get("set-cookie").split(";")[0];
  }
  const call = (who, method, url, body = {}) => fetch(base + url, {
    method,
    signal: AbortSignal.timeout(5000),
    headers: { ...(who ? { Cookie: cookies[who] } : {}), ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  // The key check asks about the hidden project's key, which mustn't name it (F0.22-93).
  const fill = (route, project) => route.replace(/^\/api\/project-key$/, `/api/project-key?key=${secret.key}`).replace(":project", project).replace(":organisation", hidden.id).replace(":provider", "jira").replace(/:(id|action|backup)/g, "x");

  const { routes, methods } = await registered();
  assert.deepEqual(methods, ["GET", "POST", "PATCH", "DELETE"]);
  const unchecked = routes.filter((r) => !PUBLIC.has(r) && !ADMIN.has(r) && !OWN.has(r) && !r.startsWith("/api/projects/:project") && r !== "/api/organisations/:organisation");
  assert.deepEqual(unchecked, [], "add new routes to this test");

  // Collect every mismatch, so one run lists them all.
  const problems = [], expect = async (who, method, url, label, want) => {
    const status = (await call(who, method, url)).status;
    if (status !== want) problems.push(`${who || "signed out"}: ${label} → ${status}, not ${want}`);
  };
  for (const route of routes) {
    if (PUBLIC.has(route)) continue;
    for (const method of methods) {
      const url = fill(route, secret.id), label = `${method} ${route}`;
      await expect(null, method, url, label, 401);
      if (ADMIN.has(route))
        for (const who of ["editor", "viewer", "outsider"]) await expect(who, method, url, label, 403);
      // Another organisation's project and the organisation itself stay closed to everyone but its members.
      if (route.startsWith("/api/projects/:project") || route === "/api/organisations/:organisation")
        for (const who of ["editor", "viewer", "outsider"]) await expect(who, method, url, label, 403);
      // Events is a live stream: its status is checked above, its content by the events tests.
      if (OWN.has(route) && method === "GET" && route !== "/api/events") {
        const response = await call("outsider", method, url);
        if (/Secret|Private content|Hidden/.test(await response.text())) problems.push(`outsider: ${label} shows private content`);
      }
    }
  }
  assert.deepEqual(problems, []);
  // A viewer reads but doesn't write; presence and queries are reads.
  for (const [method, route] of [["POST", "/api/projects/:project/tasks"], ["PATCH", "/api/projects/:project"], ["DELETE", "/api/projects/:project/documents/:id"], ["POST", "/api/projects/:project/attachments"], ["POST", "/api/projects/:project/import"]])
    assert.equal((await call("viewer", method, fill(route, open.id))).status, 403, `viewer: ${method} ${route}`);
  assert.equal((await call("viewer", "GET", fill("/api/projects/:project", open.id))).status, 200);
  assert.equal((await call("viewer", "POST", fill("/api/projects/:project/query", open.id))).status, 200, "a query is a read");
  assert.notEqual((await call("editor", "POST", fill("/api/projects/:project/tasks", open.id), { title: "Mine" })).status, 403);
  // Capture tokens belong to one person (the route's :project is the token's id).
  assert.equal((await call("outsider", "POST", "/api/capture-tokens", { project: secret.id })).status, 403, "no token for a project you can't edit");
  const token = await (await call("editor", "POST", "/api/capture-tokens", { project: open.id })).json();
  assert.equal((await call("outsider", "DELETE", `/api/capture-tokens/${token.id}`)).status, 404, "someone else's token");
  assert.equal((await (await call("editor", "GET", "/api/capture-tokens")).json()).tokens.length, 1, "the token stays");
  assert.equal(task.title, "Secret task");
});

test("restoring an earlier version needs edit access to where the file lives, then and now", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-history-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  const hidden = await store.createOrganisation({ title: "Hidden" });
  const open = await store.createProject({ title: "Open project" });
  await auth.save({ username: "boss", password: "test-password-long", admin: true, organisations: {} });
  await auth.save({ username: "editor", password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  await auth.save({ username: "viewer", password: "test-password-long", admin: false, organisations: { "o-default": "viewer" } });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookies = {};
  for (const username of ["boss", "editor", "viewer"]) {
    const login = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) });
    cookies[username] = login.headers.get("set-cookie").split(";")[0];
  }
  const call = async (who, method, url, body) => {
    const response = await fetch(base + url, { method, headers: { Cookie: cookies[who], "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  const versions = async (file) => (await call("boss", "GET", `/api/history?file=${encodeURIComponent(file)}`)).data.versions;

  // A task edited once has an earlier version the editor may restore and the viewer may not.
  const task = (await call("editor", "POST", `/api/projects/${open.id}/tasks`, { title: "First" })).data;
  const edited = (await call("editor", "PATCH", `/api/projects/${open.id}/tasks/${task.id}`, { title: "Second", revision: task.revision })).data;
  const first = (await versions(edited.file)).find((v) => v.data.title === "First");
  assert.ok(first, "the first version is kept");
  const restore = (who, file, version, revision) => call(who, "POST", "/api/history", { file, version, revision });
  assert.equal((await restore("viewer", edited.file, first.revision, edited.revision)).status, 403, "a viewer can't restore");
  const restored = await restore("editor", edited.file, first.revision, edited.revision);
  assert.equal(restored.status, 200, JSON.stringify(restored.data));

  // A project that moved here from an organisation the editor can't edit can't be moved back by restoring.
  const moved = (await call("boss", "POST", "/api/projects", { title: "Moved", organisation: hidden.id })).data;
  const here = (await call("boss", "PATCH", `/api/projects/${moved.id}`, { organisation: "o-default", teams: [], revision: moved.revision })).data;
  const before = (await versions(here.file)).find((v) => v.data.organisation === hidden.id);
  assert.ok(before, "the earlier organisation is in the history");
  assert.equal((await restore("editor", here.file, before.revision, here.revision)).status, 403, "can't restore into an organisation without edit access");
  assert.equal((await restore("boss", here.file, before.revision, here.revision)).status, 200, "an administrator can");
  // Once it's back there, the editor can't touch its history at all.
  assert.equal((await call("editor", "GET", `/api/history?file=${encodeURIComponent(here.file)}`)).status, 403);
});
