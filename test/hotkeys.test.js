import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

test("hotkeys stay private, survive reload and reject unsafe or conflicting bindings atomically", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-hotkeys-"));
  const store = new Store(root); await store.init();
  const auth = new Auth(store, true);
  for (const username of ["alice", "bob", "constructor"]) await auth.save({ username, password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const doc = await store.createDocument(project.id, { title: "Plan" });
  const server = createServer(store, { auth });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { store.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = async username => {
    const r = await fetch(base + "/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) });
    const cookie = r.headers.get("set-cookie").split(";")[0];
    return (method = "GET", items) => fetch(base + "/api/hotkeys", { method, headers: { cookie, "content-type": "application/json" }, body: items === undefined ? undefined : JSON.stringify({ items }) });
  };
  const alice = await session("alice"), bob = await session("bob"), prototype = await session("constructor");
  assert.equal((await fetch(base + "/api/hotkeys")).status, 401);
  const items = [{ type: "command", id: "view-kanban", chord: "Mod+Alt+K" }, { type: "item", kind: "doc", project: project.id, id: doc.id, chord: "Mod+Alt+D" }];
  assert.deepEqual(await (await alice("PATCH", items)).json(), { ok: true });
  assert.deepEqual((await (await alice()).json()).items.map(({ chord }) => chord), items.map(i => i.chord));
  assert.deepEqual((await (await bob()).json()).items, []);
  assert.deepEqual((await (await prototype()).json()).items, []);
  for (const bad of [null, "bad", [null], [{...items[0], chord:"Mod+W"}], [items[0], {...items[1], chord:items[0].chord}], [items[0], {...items[0], chord:"Mod+Alt+J"}], [{...items[1], kind:"constructor"}], [{...items[0], id:["new-task"]}], [{...items[1], id:[doc.id]}], [{...items[0], id:"Bad command!"}], [{...items[1], project:[project.id]}], [{...items[1], type:"link"}], [{...items[1], kind:"view", id:"unknown"}], Array(201).fill(items[0])]) assert.equal((await alice("PATCH", bad)).status, 400, JSON.stringify(bad));
  assert.equal((await alice("PATCH", [{...items[1], project:"../outside"}])).status, 404);

  assert.equal((await (await alice()).json()).items.length, 2, "refused changes preserve the previous bindings");
  assert.equal(JSON.parse(await fs.readFile(path.join(root, '.pencils/hotkeys.json'))).alice[0].chord, 'Mod+Alt+K');
  await auth.save({ username: "alice", password: "test-password-long", admin: false, organisations: {} });
  const signedInAgain = await session("alice");
  assert.equal((await (await signedInAgain()).json()).items.length, 1, "inaccessible bookmarks disappear");
  assert.equal((await signedInAgain("PATCH", [items[1]])).status, 404);
  assert.equal((await bob("PATCH", [items[0]])).status, 200);
  assert.equal((await bob("PATCH", [])).status, 200);
  assert.deepEqual((await (await bob()).json()).items, []);
  assert.equal((await (await signedInAgain()).json()).items.length, 1, "another person resetting shortcuts preserves mine");
});
