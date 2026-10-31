import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";

// Boards sit in folders like documents (owner request, 31 October 2026): the project lists
// board_folders, and each board names its folder, kept in its .canvas file.
test("board folders nest, hold boards and refuse unknown or removed folders", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-board-folders-"));
  const store = new Store(root); await store.init();
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  let project = await store.createProject({ title: "Boards" });
  const folders = [{ id: "a", title: "Plans", parent: null }, { id: "b", title: "Retros", parent: "a" }];
  project = await store.updateProject(project.id, { revision: project.revision, board_folders: folders });
  assert.deepEqual(project.board_folders, folders);
  const board = await store.createBoard(project.id, { title: "Roadmap", folder: "b" });
  assert.equal(board.folder, "b");
  const moved = await store.updateBoard(project.id, board.id, { revision: board.revision, folder: "a" });
  assert.equal(moved.folder, "a");
  assert.equal((await store.updateBoard(project.id, board.id, { revision: moved.revision, folder: null })).folder, null);
  await assert.rejects(() => store.createBoard(project.id, { title: "Lost", folder: "missing" }), e => e.status === 400);
  const imported = await store.createBoard(project.id, { title: "Imported", folder: "a", canvas: { nodes: [], edges: [] } });
  assert.equal(imported.folder, "a");
  // A folder holding a board stays.
  await assert.rejects(() => store.updateProject(project.id, { revision: project.revision, board_folders: [{ ...folders[1], parent: null }] }), e => e.status === 400 && e.message === "Choose a board folder in this project.");
  await assert.rejects(() => store.updateProject(project.id, { revision: project.revision, board_folders: [{ ...folders[0], parent: "b" }, folders[1]] }), e => e.status === 400);
  // Folders survive a restart, and the board's folder is in its .canvas file.
  await store.snapshot(project.id);
  const restarted = new Store(root);
  t.after(() => restarted.close());
  const snapshot = await restarted.snapshot(project.id);
  assert.deepEqual(snapshot.project.board_folders, folders);
  assert.equal(snapshot.boards.find((b) => b.id === imported.id).folder, "a");
});
