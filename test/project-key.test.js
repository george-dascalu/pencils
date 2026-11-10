// Owner request (F0.22-93): a project key that's taken names the project using it, as you type
// (GET /api/project-key) and when you create or rename, unless you can't open that project.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

test("a taken project key names the project you can open, and only that", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-key-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  const hidden = await store.createOrganisation({ title: "Hidden" });
  const recipes = await store.createProject({ title: "Recipes", key: "REC" });
  await store.createProject({ title: "Secret plans", key: "SEC", organisation: hidden.id });
  const renamed = await store.createProject({ title: "Garden", key: "OLD" });
  await store.updateProject(renamed.id, { key: "GDN", revision: (await store.read(store.file(renamed.id, "project"))).revision });
  const gone = await store.createProject({ title: "Old chores", key: "TRS" });
  await store.removeRecord(gone.id, "project", null, (await store.read(store.file(gone.id, "project"))).revision);
  await auth.save({ username: "editor", password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "editor", password: "test-password-long" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const check = async (query) => (await fetch(`${base}/api/project-key?${query}`, { headers: { Cookie: cookie } })).json();
  const write = (method, url, body) => fetch(base + url, { method, headers: { Cookie: cookie, "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) });

  assert.deepEqual(await check("key=rec"), { key: "REC", available: false, error: "REC is used by Recipes." });
  assert.deepEqual(await check("key=SEC"), { key: "SEC", available: false, error: "SEC is used by a project you can’t open." });
  assert.deepEqual(await check("key=OLD"), { key: "OLD", available: false, error: "OLD was Garden’s earlier key, so its old card IDs still lead there." });
  assert.deepEqual(await check("key=TRS"), { key: "TRS", available: false, error: "TRS is used by Old chores, in Trash." });
  assert.deepEqual(await check("key=1A"), { key: "1A", available: false, error: "Use 2–12 letters or digits, starting with a letter." });
  assert.deepEqual(await check("key=FREE"), { key: "FREE", available: true });
  assert.deepEqual(await check(`key=REC&project=${recipes.id}`), { key: "REC", available: true }, "a project's own key is free for it");

  const created = await write("POST", "/api/projects", { title: "Another", key: "REC", organisation: "o-default" });
  assert.equal(created.status, 409);
  assert.equal((await created.json()).error, "REC is used by Recipes.");
  const secret = await write("POST", "/api/projects", { title: "Another", key: "SEC", organisation: "o-default" });
  assert.equal((await secret.json()).error, "SEC is used by a project you can’t open.");
  const current = await store.read(store.file(renamed.id, "project"));
  const rename = await write("PATCH", `/api/projects/${renamed.id}`, { key: "REC", revision: current.revision });
  assert.equal(rename.status, 409);
  assert.equal((await rename.json()).error, "REC is used by Recipes.");
});
