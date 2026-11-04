import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
// F0.22-8: a save outside a transaction (a read that assigns card numbers, a test's direct write)
// is not the transaction's to undo: a failure there rolled it back too, losing a new card.
test("a write made outside a failing transaction is kept", async (t) => {
  const { store, project } = await fixture(t),
    task = await store.createTask(project.id, { title: "Original" }),
    ledger = path.join(store.projectDir(project.id), "identity.md"), numbers = await fs.readFile(ledger, "utf8");
  let release, inside;
  const gate = new Promise((resolve) => (release = resolve)), started = new Promise((resolve) => (inside = resolve));
  const failing = store.mutate(async () => {
    await store.createTask(project.id, { title: "Temporary" });
    inside();
    await gate;
    throw Error("Injected failure");
  });
  await started;
  await store.updateTask(project.id, task.id, { revision: task.revision, title: "Edited outside" });
  release();
  await assert.rejects(failing, /Injected/);
  // The transaction's own writes, the card number taken through the identity queue too, still roll back.
  assert.equal(await fs.readFile(ledger, "utf8"), numbers);
  assert.deepEqual((await store.snapshot(project.id)).tasks.map((t) => t.title), ["Edited outside"]);
});
test("a write made while a transaction starts is kept when it fails", async (t) => {
  const { store, project } = await fixture(t),
    task = await store.createTask(project.id, { title: "Original" }),
    persist = store.journal.persist.bind(store.journal);
  let release, starting;
  const gate = new Promise((resolve) => (release = resolve)), started = new Promise((resolve) => (starting = resolve));
  // Hold the transaction's first record, written while it starts.
  store.journal.persist = async () => { store.journal.persist = persist; starting(); await gate; return persist(); };
  const failing = store.mutate(async () => { throw Error("Injected failure"); });
  await started;
  await store.updateTask(project.id, task.id, { revision: task.revision, title: "Edited outside" });
  release();
  await assert.rejects(failing, /Injected/);
  assert.deepEqual((await store.snapshot(project.id)).tasks.map((t) => t.title), ["Edited outside"]);
});
// T35: a write that starts while its transaction is closing goes unjournaled, and does not bring
// back the record its commit removed.
test("a write that starts while the transaction closes leaves no record behind", async (t) => {
  const { store } = await fixture(t),
    file = path.join(store.root, "closing.md");
  await fs.writeFile(file, "before");
  await store.journal.start();
  const id = store.journal.active.id, finishing = store.journal.finish(true);
  const staged = store.journal.stage(file, "after");
  await finishing;
  await assert.doesNotReject(staged);
  await assert.rejects(fs.stat(path.join(store.journal.root, id)), /ENOENT/, "the committed record stays gone");
});
// T35: writes staged at once in one transaction keep their own backups.
test("files staged at once keep their own backups", async (t) => {
  const { store } = await fixture(t),
    files = ["one.md", "two.md", "three.md"].map((name) => path.join(store.root, name));
  for (const [i, file] of files.entries()) await fs.writeFile(file, `before ${i}`);
  await store.journal.start();
  await Promise.all(files.map((file) => store.journal.stage(file, "after")));
  const backups = store.journal.active.files.map((f) => f.backup);
  assert.equal(new Set(backups).size, files.length, backups.join(", "));
  await store.journal.finish(false);
  for (const [i, file] of files.entries()) assert.equal(await fs.readFile(file, "utf8"), `before ${i}`);
});
// The writer lock, rollback of moves and created files, and recovery's identity check had no test
// that failed with them broken (npm run test:mutants).
test("the writer lock refuses a live writer, another host and a half-made lock, and takes over a dead writer's", async (t) => {
  const { store } = await fixture(t),
    lock = path.join(store.root, ".pencils", "writer.lock"),
    owner = async (data) => {
      await fs.mkdir(lock, { recursive: true });
      await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify(data));
    };
  // Above the largest process ID Linux and macOS assign, so no process can hold it.
  const host = os.hostname(), dead = 2 ** 22 + 1;
  // Simulate an installation that has not adopted the kernel lock yet.
  await fs.rm(path.join(store.root, ".pencils", "writer.guard"), { force: true });
  await owner({ pid: process.pid, host });
  await assert.rejects(store.journal.acquire(), { status: 423, message: /Another Pencils process/ });
  await assert.rejects(store.journal.start(), { status: 423 }, "a transaction takes the lock");
  await assert.rejects(store.journal.recover(), { status: 423 }, "so does recovery");
  await owner({ pid: process.pid, host: `${host}-elsewhere` });
  await assert.rejects(store.journal.acquire(), { status: 423, message: /Another host/ });
  await fs.rm(path.join(lock, "owner.json"));
  await assert.rejects(store.journal.acquire(), { status: 423, message: /incomplete/ });
  await owner({ pid: dead, host });
  await store.journal.acquire();
  assert.equal(JSON.parse(await fs.readFile(path.join(lock, "owner.json"), "utf8")).pid, process.pid, "the lock is ours now");
  await store.journal.release();
  await assert.rejects(fs.stat(lock), /ENOENT/);
});
test("a failed write moves files back and removes files it created, and no write leaves a record", async (t) => {
  const { store } = await fixture(t),
    [source, target, created] = ["from.md", "to.md", "new.md"].map((name) => path.join(store.root, name));
  await fs.writeFile(source, "moved");
  await assert.rejects(
    store.mutate(async () => {
      await store.journal.move(source, target);
      await store.journal.stage(created, "new");
      await fs.writeFile(created, "new");
      throw Error("Injected failure");
    }),
    /Injected/,
  );
  assert.equal(await fs.readFile(source, "utf8"), "moved");
  await assert.rejects(fs.stat(target), /ENOENT/);
  await assert.rejects(fs.stat(created), /ENOENT/);
  assert.deepEqual(await fs.readdir(store.journal.root), []);
  await store.mutate(() => store.journal.move(source, target));
  assert.equal(await fs.readFile(target, "utf8"), "moved");
  assert.deepEqual(await fs.readdir(store.journal.root), [], "a commit removes its record");
});
test("a moved folder changed before the rollback stays where it is, as a conflict", async (t) => {
  const { store } = await fixture(t),
    folder = path.join(store.root, "folder"),
    moved = path.join(store.root, "moved");
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, "note.md"), "before");
  await assert.rejects(
    store.mutate(async () => {
      await store.journal.move(folder, moved);
      await fs.writeFile(path.join(moved, "note.md"), "changed meanwhile");
      throw Error("Injected failure");
    }),
    /Injected/,
  );
  assert.equal(await fs.readFile(path.join(moved, "note.md"), "utf8"), "changed meanwhile");
  assert.deepEqual((await store.journal.issues()).map((issue) => issue.files), [["folder"]]);
});
test("recovery stops at a journal record whose identity doesn't match its folder", async (t) => {
  const { store } = await fixture(t),
    folder = path.join(store.journal.root, randomUUID());
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "transaction.json"), JSON.stringify({ id: randomUUID(), phase: "active", files: [], moves: [] }));
  await assert.rejects(store.journal.recover(), { status: 409, message: /Invalid journal identity/ });
});
test("a journaled move refuses a folder holding a symlink, which a rollback would follow", async (t) => {
  const { store } = await fixture(t),
    folder = path.join(store.root, "folder");
  await fs.mkdir(folder);
  await fs.symlink(os.tmpdir(), path.join(folder, "elsewhere"));
  await assert.rejects(store.mutate(() => store.journal.move(folder, path.join(store.root, "moved"))), { status: 400, message: /cannot follow symlinks/ });
});
