import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
import { itemKey, ordered, placed } from "../public/search-items.js";

// Owner request, 3 November 2026: Search's Bookmarks and Commands keep each person's own order, and
// items removed from Search are kept so Settings can bring them back.
test("Search keeps each person's order and removed items, and refuses anything but item keys", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-search-items-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  for (const username of ["alice", "bob"])
    await auth.save({ username, password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
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
  const empty = { bookmarks: [], commands: [], hidden: [] };
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const doc = await store.createDocument(project.id, { title: "Planting plan" });
  const card = await store.createTask(project.id, { title: "Plant bulbs" });
  for (const [kind, id] of [["doc", doc.id], ["card", card.id]]) assert.equal((await alice("/api/bookmarks", "POST", { kind, project: project.id, id })).status, 200);
  const docKey = `doc:${project.id}:${doc.id}`, cardKey = `card:${project.id}:${card.id}`;

  assert.equal((await fetch(base + "/api/search-items")).status, 401);
  assert.deepEqual(await (await alice("/api/search-items")).json(), empty, "nothing saved to start with");
  const mine = { bookmarks: [docKey, cardKey], commands: ["command:today", "command:new-task", "command:today"], hidden: ["command:import", cardKey] };
  assert.equal((await alice("/api/search-items", "PATCH", mine)).status, 200);
  assert.deepEqual(await (await alice("/api/search-items")).json(), { ...mine, commands: ["command:today", "command:new-task"] }, "kept, each item once");
  // Items that aren't (or are no longer) bookmarks, and keys in the wrong list, drop out, so the lists never fill up.
  assert.equal((await alice("/api/bookmarks", "DELETE", { kind: "card", project: project.id, id: card.id })).status, 200);
  assert.equal((await alice("/api/search-items", "PATCH", { bookmarks: [docKey, cardKey, "board:p-1:b-1", "command:today"], commands: ["command:today", docKey], hidden: ["command:import", cardKey] })).status, 200);
  assert.deepEqual(await (await alice("/api/search-items")).json(), { bookmarks: [docKey], commands: ["command:today"], hidden: ["command:import"] });
  assert.deepEqual(await (await bob("/api/search-items")).json(), empty, "each person's own");
  for (const bad of [{ ...mine, hidden: "command:today" }, { ...mine, commands: ["today"] }, { ...mine, bookmarks: ["task:p-1:t-1"] }, { bookmarks: [], commands: [] }, { ...mine, hidden: Array.from({ length: 501 }, (_, i) => `command:c${i}`) }])
    assert.equal((await alice("/api/search-items", "PATCH", bad)).status, 400, JSON.stringify(bad).slice(0, 80));
  assert.deepEqual((await (await alice("/api/search-items")).json()).hidden, ["command:import"], "a refused change keeps the saved one");
});

test("Search lists follow the saved order, and a drag in a narrowed list moves only what it shows", () => {
  const items = [{ id: "today" }, { id: "new-task" }, { kind: "doc", project: "p-1", id: "d-1" }, { id: "import" }];
  assert.deepEqual(items.map(itemKey), ["command:today", "command:new-task", "doc:p-1:d-1", "command:import"]);
  assert.deepEqual(ordered(items, ["command:import", "command:today", "command:gone"]).map(itemKey), ["command:import", "command:today", "command:new-task", "doc:p-1:d-1"], "saved order first, then the rest in their usual order");
  assert.deepEqual(placed(["a", "b", "c", "d"], ["d", "b"]), ["a", "d", "c", "b"], "b and d trade places; a and c stay");
  assert.deepEqual(placed(["a", "b"], ["c", "a"]), ["c", "b", "a"], "a new item joins where it was shown");
});
