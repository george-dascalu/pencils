import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.js";
import { RecordIndex } from "../server/record-index.js";
test("rebuildable index searches only its project and refreshes after edits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-index-")),
    store = new Store(root),
    index = new RecordIndex(store);
  await store.init();
  t.after(async () => {
    index.close();
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const p = await store.createProject({ title: "A" }),
    other = await store.createProject({ title: "B" }),
    task = await store.createTask(p.id, {
      title: "Unique pencil",
      body: "Searchable notes",
    });
  await store.createTask(other.id, { title: "Secret pencil" });
  assert.equal((await index.search(p.id, "pencil")).length, 1);
  assert.equal((await index.search(p.id, "Secret")).length, 0);
  await store.updateTask(p.id, task.id, {
    revision: task.revision,
    title: "Changed notebook",
    body: "",
  });
  assert.equal((await index.search(p.id, "Searchable")).length, 0);
  assert.equal((await index.search(p.id, "noteb")).length, 1);
  assert.equal(
    (await index.query(p.id, { limit: 1 }, { username: "owner" })).total,
    1,
  );
  index.close();
  await fs.rm(path.join(root, ".pencils", "index.sqlite"));
  assert.equal((await index.search(p.id, "Changed")).length, 1);
});
test("project deltas include changed records without unrelated project content", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-deltas-")),
    store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const p = await store.createProject({ title: "One" }),
    q = await store.createProject({ title: "Two" }),
    version = store.version;
  await store.createTask(p.id, { title: "Public update" });
  await store.createTask(q.id, { title: "Unrelated update" });
  const delta = await store.delta(p.id, version);
  assert.equal(delta.full, false);
  assert.ok(delta.records.some((r) => r.value.title === "Public update"));
  assert.ok(!JSON.stringify(delta).includes("Unrelated update"));
  store.changed();
  assert.equal((await store.delta(p.id, version)).full, true);
});
