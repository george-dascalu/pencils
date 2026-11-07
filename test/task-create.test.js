import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";

// A new card reads only its own chain of parents and the cards its request already made, not every
// card of the project (F0.22-51). These keep the checks the whole list gave.
async function vault(t, watch = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-create-"));
  const store = new Store(root);
  await store.init();
  if (watch) store.watch();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const p = await store.createProject({ title: "Create checks" });
  // Edits a card's file the way another app would.
  const edit = async (card, change) => {
    const file = path.join(root, card.file);
    await fs.writeFile(file, change(await fs.readFile(file, "utf8")));
  };
  return { root, store, p, edit };
}

test("a new card's parent and every ancestor must be cards of the project, without a loop", async (t) => {
  const { store, p, edit } = await vault(t);
  const make = (title, parent) => store.createTask(p.id, { title, ...(parent ? { parent } : {}) });
  await assert.rejects(() => make("Orphan", "t-missing1"), /parent card does not exist/);
  await assert.rejects(() => make("Odd", "../escape"), /Invalid identifier/);
  const top = await make("Top"), middle = await make("Middle", top.id);
  assert.equal((await make("Child", middle.id)).parent, middle.id, "a whole chain is fine");
  // An ancestor removed outside Pencils breaks the chain.
  await edit(middle, (text) => text.replace(`parent: ${top.id}`, "parent: t-gone0000"));
  await assert.rejects(() => make("Under a broken chain", middle.id), /parent card does not exist/);
  // Two cards made each other's parent.
  await edit(top, (text) => text.replace("parent: null", `parent: ${middle.id}`));
  await edit(middle, (text) => text.replace("parent: t-gone0000", `parent: ${top.id}`));
  await assert.rejects(() => make("Under a loop", middle.id), /cannot be its own ancestor/);
  // A file whose ID doesn't match its name isn't a card the list would show.
  await edit(top, (text) => text.replace(`id: ${top.id}`, "id: t-renamed0"));
  const other = await make("Other");
  await edit(other, (text) => text.replace(`id: ${other.id}`, "id: t-renamed1"));
  await assert.rejects(() => make("Under a stray file", other.id), /parent card does not exist/);
  // Cards the list leaves out can't be in the chain either: an unknown status, a parent that isn't an ID.
  const odd = await make("Odd status");
  await edit(odd, (text) => text.replace(/^status: .*$/m, "status: bogus"));
  await assert.rejects(() => make("Under an odd card", odd.id), /parent card does not exist/);
  const stray = await make("Stray parent");
  await edit(stray, (text) => text.replace("parent: null", "parent: ../escape"));
  await assert.rejects(() => make("Under a stray parent", stray.id), /parent card does not exist/);
});

test("a repeated create request returns its card after the card list lapses, after a restart, and not once deleted", async (t) => {
  const { root, store, p } = await vault(t);
  const count = async (s = store) => (await s.snapshot(p.id)).tasks.length;
  const first = await store.createTask(p.id, { title: "Once", creation_request: "req-1" });
  store.childrenCache.clear();
  assert.equal((await store.createTask(p.id, { title: "Twice", creation_request: "req-1" })).id, first.id);
  const board = await store.createTask(p.id, { title: "From a board", canvas_source: "canvas:b-1:n-1" });
  store.childrenCache.clear();
  assert.equal((await store.createTask(p.id, { title: "Again", canvas_source: "canvas:b-1:n-1" })).id, board.id);
  assert.equal(await count(), 2);
  // A fresh server finds them from the files.
  const restarted = new Store(root);
  await restarted.init();
  t.after(() => restarted.close());
  assert.equal((await restarted.createTask(p.id, { title: "After restart", creation_request: "req-1" })).id, first.id);
  assert.equal((await restarted.createTask(p.id, { title: "After restart", canvas_source: "canvas:b-1:n-1" })).id, board.id);
  // A deleted card's request makes a new card.
  await store.deleteTask(p.id, first.id, (await store.snapshot(p.id)).tasks.find((c) => c.id === first.id).revision);
  const remade = await store.createTask(p.id, { title: "Remade", creation_request: "req-1" });
  assert.notEqual(remade.id, first.id);
  assert.equal(await count(), 2);
  // A card whose request was removed outside Pencils no longer answers for it.
  const file = path.join(root, remade.file);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace(/^creation_request: .*\n/m, ""));
  assert.notEqual((await store.createTask(p.id, { title: "Third", creation_request: "req-1" })).id, remade.id);
});

test("a request repeated after its card comes back from the Trash returns that card", async (t) => {
  const { root, store, p } = await vault(t);
  const card = await store.createTask(p.id, { title: "Kept", creation_request: "req-trash" });
  const other = await store.createTask(p.id, { title: "Other" });
  await store.deleteTask(p.id, card.id, card.revision);
  // A release restarts the server between the delete and the restore.
  const restarted = new Store(root);
  await restarted.init();
  restarted.watch();
  t.after(() => restarted.close());
  await restarted.restoreTask(p.id, card.id);
  // An edit meanwhile doesn't read the whole list again.
  await restarted.updateTask(p.id, other.id, { revision: other.revision, title: "Edited meanwhile" });
  assert.equal((await restarted.createTask(p.id, { title: "Retry", creation_request: "req-trash" })).id, card.id);
  assert.equal((await restarted.snapshot(p.id)).tasks.length, 2);
});

test("without a watcher, a request written into a card outside Pencils is still found", async (t) => {
  const { store, p, edit } = await vault(t, false);
  const card = await store.createTask(p.id, { title: "Once", creation_request: "req-a" });
  await edit(card, (text) => text.replace("creation_request: req-a", "creation_request: req-b"));
  assert.equal((await store.createTask(p.id, { title: "Again", creation_request: "req-b" })).id, card.id);
});

test("completing a recurring card made in the app makes its next one", async (t) => {
  const { store, p } = await vault(t);
  const card = await store.createTask(p.id, { title: "Weekly", creation_request: "req-weekly", due: "2026-11-09", recurrence: { unit: "week", interval: 1 } });
  const done = await store.updateTask(p.id, card.id, { revision: card.revision, status: "done" });
  assert.notEqual(done.recurrence_next, card.id, "the card isn't its own next one");
  const next = (await store.snapshot(p.id)).tasks.find((c) => c.id === done.recurrence_next);
  assert.equal(next?.due, "2026-11-16");
  assert.equal(next.creation_request, undefined, "the next card answers no request of its own");
});
