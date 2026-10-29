import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.js";
import { RecordIndex } from "../server/record-index.js";
// Search now spans projects (index.search(projects, text)); these checks look at one.
const find = async (index, project, text) => (await index.search([{ id: project }], text)).results;
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
  assert.equal((await find(index, p.id, "pencil")).length, 1);
  assert.equal((await find(index, p.id, "Secret")).length, 0);
  await store.updateTask(p.id, task.id, {
    revision: task.revision,
    title: "Changed notebook",
    body: "",
  });
  assert.equal((await find(index, p.id, "Searchable")).length, 0);
  assert.equal((await find(index, p.id, "noteb")).length, 1);
  assert.equal(
    (await index.query(p.id, { limit: 1 }, { username: "owner" })).total,
    1,
  );
  index.close();
  await fs.rm(path.join(root, ".pencils", "index.sqlite"));
  assert.equal((await find(index, p.id, "Changed")).length, 1);
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

test("incremental search isolates unrelated changes and removes deleted tasks", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-index-delta-"));
  const store = new Store(root), index = new RecordIndex(store);
  await store.init();
  t.after(async () => { await index.close(); store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Indexed" });
  const other = await store.createProject({ title: "Other" });
  let task = await store.createTask(project.id, { title: "Initial searchable" });
  await find(index, project.id, "Initial");
  const initial = index.lastRebuild;
  await store.createDocument(project.id, { title: "Document change" });
  await store.createTask(other.id, { title: "Unrelated searchable" });
  assert.equal((await find(index, project.id, "searchable")).length, 1);
  assert.equal(index.lastRebuild, initial, "unrelated changes must not rebuild this project's task index");
  task = await store.updateTask(project.id, task.id, { revision: task.revision, title: "Updated searchable" });
  assert.equal((await find(index, project.id, "Updated"))[0].id, task.id);
  assert.equal(index.lastRebuild.incremental, true);
  assert.equal(index.lastRebuild.tasks, 1);
  await store.mutate(() => store.deleteTask(project.id, task.id, task.revision));
  assert.equal((await find(index, project.id, "Updated")).length, 0);
  assert.equal(index.lastRebuild.deleted, 1);
  // Watcher/fallback invalidation still discovers external Markdown changes.
  const next = await store.createTask(project.id, { title: "External original" });
  await find(index, project.id, "original");
  const file = store.file(project.id, "tasks", next.id);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("External original", "External revised"));
  store.changed(file);
  assert.equal((await find(index, project.id, "revised"))[0].id, next.id);
  store.changed();
  assert.equal((await find(index, project.id, "revised"))[0].id, next.id);
  assert.equal(index.lastRebuild.incremental, false);
});
