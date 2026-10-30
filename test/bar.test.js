import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

// Owner request, 30 October 2026: each person adds their own buttons to the bottom bar, commands
// and bookmarked cards, documents, boards and views, in their own order, the same on every device.
test("bottom bar buttons belong to their person, keep their order and leave out what they can't open", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-bar-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  for (const username of ["alice", "bob"])
    await auth.save({ username, password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const doc = await store.createDocument(project.id, { title: "Planting plan" });
  const card = await store.createTask(project.id, { title: "Plant bulbs" });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = async (username) => {
    const login = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    return (url, method = "GET", body) => fetch(base + url, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  };
  const alice = await session("alice"), bob = await session("bob");
  const listed = async (who) => (await (await who("/api/bar")).json()).items;
  const put = (who, items) => who("/api/bar", "PATCH", { items });

  assert.equal((await fetch(base + "/api/bar")).status, 401);
  assert.deepEqual(await listed(alice), [], "none to start with");
  const items = [
    { type: "command", id: "new-task" },
    { type: "item", kind: "doc", project: project.id, id: doc.id },
    { type: "command", id: "view-kanban" },
    { type: "item", kind: "card", project: project.id, id: card.id },
  ];
  assert.equal((await put(alice, items)).status, 200);
  assert.deepEqual(
    (await listed(alice)).map((i) => [i.type, i.id, i.title]),
    [["command", "new-task", undefined], ["item", doc.id, "Planting plan"], ["command", "view-kanban", undefined], ["item", card.id, "Plant bulbs"]],
    "in the person's order, items with their names",
  );
  assert.deepEqual(await listed(bob), [], "each person has their own");
  assert.equal((await put(alice, [items[0], items[0], items[1]])).status, 200);
  assert.deepEqual((await listed(alice)).map((i) => i.id), ["new-task", doc.id], "a button appears once");

  for (const bad of ["nope", [{ type: "command", id: "Bad id!" }], [{ type: "command", id: ["new-task"] }], [{ type: "command", id: true }], [{ type: "item", kind: "view", project: project.id, id: "nowhere" }], [{ type: "link", id: "x" }], [{ type: "item", kind: "page", project: project.id, id: doc.id }], [{ type: "item", kind: "card", project: project.id, id: "t-missing" }]])
    assert.notEqual((await put(alice, bad)).status, 200, JSON.stringify(bad));
  assert.equal((await put(alice, Array.from({ length: 13 }, (_, i) => ({ type: "command", id: `c-${i}` })))).status, 400, "at most 12");
  assert.deepEqual((await listed(alice)).map((i) => i.id), ["new-task", doc.id], "a refused change leaves the bar as it was");

  // Deleted items drop out.
  await fs.rm(store.file(project.id, "documents", doc.id));
  assert.deepEqual((await listed(alice)).map((i) => i.id), ["new-task"]);
});
