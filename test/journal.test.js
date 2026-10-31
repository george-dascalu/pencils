import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-journal-")),
    store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const project = await store.createProject({ title: "Journal" });
  return { root, store, project };
}
test("failed related mutations roll back their files together", async (t) => {
  const { store, project } = await fixture(t),
    task = await store.createTask(project.id, { title: "Original" });
  await assert.rejects(
    store.mutate(async () => {
      await store.updateTask(project.id, task.id, {
        revision: task.revision,
        title: "Temporary",
      });
      await store.createTask(project.id, { title: "Also temporary" });
      throw Error("Injected failure");
    }),
    /Injected/,
  );
  const result = await store.snapshot(project.id);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].title, "Original");
});
test("interrupted writes recover while external changes are retained as journal conflicts", async (t) => {
  const { store, project } = await fixture(t),
    task = await store.createTask(project.id, { title: "Original" }),
    file = store.file(project.id, "tasks", task.id);
  await store.journal.start();
  await store.updateTask(project.id, task.id, {
    revision: task.revision,
    title: "Uncommitted",
  });
  store.journal.active = null;
  await store.journal.release();
  await store.journal.recover();
  assert.equal((await store.snapshot(project.id)).tasks[0].title, "Original");
  const restored = (await store.snapshot(project.id)).tasks[0];
  await store.journal.start();
  await store.updateTask(project.id, task.id, {
    revision: restored.revision,
    title: "Uncommitted again",
  });
  await fs.appendFile(file, "External edit\n");
  store.journal.active = null;
  await store.journal.release();
  await store.journal.recover();
  assert.match(await fs.readFile(file, "utf8"), /External edit/);
  assert.equal((await store.journal.issues()).length, 1);
});
test("related writes publish one notification only after commit", async (t) => {
  const { store, project } = await fixture(t),
    events = [];
  store.events.on("change", (...event) => events.push(event));
  await store.mutate(async () => {
    await store.createTask(project.id, { title: "One" });
    await store.createTask(project.id, { title: "Two" });
    assert.equal(events.length, 0);
  });
  assert.equal(events.length, 1);
  assert.equal(events[0][1].project, project.id);
});
// A save that ends its transaction while another write waits to stage (T30, seen as a crash in
// a release run): the waiting write goes unjournaled, as with no transaction, instead of failing.
test("a write staged while its transaction ends does not crash", async (t) => {
  const { store } = await fixture(t),
    file = path.join(store.root, "late.md"),
    moved = path.join(store.root, "moved.md"),
    safe = store.safe.bind(store);
  await fs.writeFile(file, "before");
  await store.journal.start();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  store.safe = async (target) => { await gate; return safe(target); };
  const staged = store.journal.stage(file, "after"), move = store.journal.move(file, moved);
  store.safe = safe;
  await store.journal.finish(true);
  release();
  await assert.doesNotReject(staged);
  await assert.doesNotReject(move);
  assert.equal(store.journal.active, null);
  assert.equal(await fs.readFile(moved, "utf8"), "before", "the move still happens");
});
