import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { Sources } from "../server/sources.js";

test("a paused provider fetch does not block task saves, and commit uses the latest local notes", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-slow-source-"));
  const notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-source-notes-"));
  const store = new Store(root);
  await store.init();
  const sources = new Sources(store, new Auth(store, true), { env: { OBSIDIAN_ROOT: notes } });
  t.after(async () => { sources.close(); store.close(); await fs.rm(root, { recursive: true, force: true }); await fs.rm(notes, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Concurrent edits" });
  await fs.writeFile(path.join(notes, "source.md"), "---\nid: abc\ntitle: Remote task\n---\nRemote notes");
  const source = await sources.configure(project.id, { username: "owner", admin: true, organisations: {} }, { provider: "obsidian", scope: { folder: "." } });
  await sources.sync(project.id, source.id);
  const task = (await store.children(project.id, "tasks")).items[0];
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const fetching = new Promise(resolve => { started = resolve; });
  const read = sources.read.bind(sources);
  sources.read = async value => { started(); await gate; return read(value); };
  const pending = sources.run(project.id, () => sources.sync(project.id, source.id));
  await fetching;
  try {
    const saved = await Promise.race([
      store.mutate(() => store.updateTask(project.id, task.id, { revision: task.revision, body: "Notes saved during provider fetch" })),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Save was blocked by provider I/O")), 1500); timer.unref(); }),
    ]);
    assert.equal(saved.body, "Notes saved during provider fetch");
  } finally { release(); }
  await pending;
  assert.equal((await store.children(project.id, "tasks")).items[0].body, "Notes saved during provider fetch");
});

test("cached project rows refresh from external Markdown and never bypass file revisions", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-watched-cache-"));
  const store = new Store(root); await store.init(); store.watch();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Watched notes" });
  const task = await store.createTask(project.id, { title: "Original title" });
  await store.children(project.id, "tasks");
  const file = store.file(project.id, "tasks", task.id);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("Original title", "External title"));
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if ((await store.children(project.id, "tasks")).items[0].title === "External title") break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal((await store.children(project.id, "tasks")).items[0].title, "External title", "External changes must invalidate cached rows.");
  await assert.rejects(
    store.mutate(() => store.updateTask(project.id, task.id, { revision: task.revision, title: "Stale overwrite" })),
    error => error.status === 409,
  );
});
