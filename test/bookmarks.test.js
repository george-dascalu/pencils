import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

// Owner request, 30 October 2026: each person bookmarks cards, documents, boards and project views,
// and search lists the bookmarks first on every device.
test("bookmarks belong to their person, show current names and leave out what they can't open", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-bookmarks-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  for (const [username, role] of [["alice", "editor"], ["bob", "viewer"], ["constructor", "editor"]])
    await auth.save({ username, password: "test-password-long", admin: false, organisations: { "o-default": role } });
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const card = await store.createTask(project.id, { title: "Plant bulbs" });
  const doc = await store.createDocument(project.id, { title: "Planting plan" });
  const board = await store.createBoard(project.id, { title: "Beds" });
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
  const listed = async (who) => (await (await who("/api/bookmarks")).json()).bookmarks;
  const add = (who, kind, id, where = project.id) => who("/api/bookmarks", "POST", { kind, project: where, id });

  assert.equal((await fetch(base + "/api/bookmarks")).status, 401);
  for (const [kind, id] of [["card", card.id], ["doc", doc.id], ["board", board.id], ["view", "kanban"]])
    assert.equal((await add(alice, kind, id)).status, 200, kind);
  assert.equal((await add(alice, "card", card.id)).status, 200, "bookmarking twice keeps one");
  assert.deepEqual(
    (await listed(alice)).map((b) => [b.kind, b.id, b.title, b.key, b.project_title]),
    [["view", "kanban", undefined, undefined, "Garden"], ["board", board.id, "Beds", undefined, "Garden"], ["doc", doc.id, "Planting plan", undefined, "Garden"], ["card", card.id, "Plant bulbs", card.key, "Garden"]],
    "newest first, with each item's name and key",
  );
  assert.deepEqual(await listed(bob), [], "each person sees their own");
  assert.deepEqual(await listed(await session("constructor")), [], "any username, even one an object already has");
  assert.equal((await add(bob, "card", card.id)).status, 200, "viewers keep bookmarks too");

  for (const [kind, id] of [["view", "board"], ["view", "nowhere"], ["page", doc.id], [["card"], card.id], ["toString", card.id], ["card", "../x"], ["card", "t-missing"]])
    assert.notEqual((await add(alice, kind, id)).status, 200, `${kind} ${id}`);
  const { project: personal } = await (await alice("/api/personal", "POST", {})).json();
  const diary = await store.createDocument(personal.id, { title: "Diary" });
  assert.equal((await add(bob, "doc", diary.id, personal.id)).status, 404, "someone else's personal space stays closed");
  assert.equal((await add(alice, "view", "list", personal.id)).status, 404, "a personal space has only documents");
  assert.equal((await add(alice, "doc", diary.id, personal.id)).status, 200);

  // Renames show at once; deleted items and projects out of reach drop out.
  const current = await store.read(store.file(project.id, "tasks", card.id));
  await store.updateTask(project.id, card.id, { title: "Plant tulips", revision: current.revision });
  assert.equal((await listed(alice)).find((b) => b.kind === "card").title, "Plant tulips");
  await fs.rm(store.file(project.id, "documents", doc.id));
  assert.deepEqual((await listed(alice)).map((b) => b.kind), ["doc", "view", "board", "card"]);
  await auth.save({ username: "alice", admin: false, organisations: {} });
  assert.deepEqual((await listed(await session("alice"))).map((b) => b.title), ["Diary"]);

  // Removing one keeps the rest; a person has at most 200.
  await auth.save({ username: "alice", admin: false, organisations: { "o-default": "editor" } });
  const again = await session("alice");
  assert.equal((await again("/api/bookmarks", "DELETE", { kind: "view", project: project.id, id: "kanban" })).status, 200);
  assert.deepEqual((await listed(again)).map((b) => b.kind), ["doc", "board", "card"]);
  const file = path.join(root, ".pencils", "bookmarks.json");
  assert.equal((await add(again, "view", "table")).status, 200);
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.deepEqual(saved.alice.map((b) => b.kind), ["view", "doc", "board", "card"], "adding drops the deleted document, so it never counts against the limit");
  saved.alice.push(...Array.from({ length: 200 }, (_, i) => ({ kind: "view", project: project.id, id: "list", added: String(i) })));
  await fs.writeFile(file, JSON.stringify(saved));
  assert.equal((await add(again, "view", "tree")).status, 400);
});
