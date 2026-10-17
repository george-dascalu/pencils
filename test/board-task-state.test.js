import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { boardTaskState } from "../public/board-task-state.js";
test("board task availability distinguishes archive, deletion, missing files and restore", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-card-state-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Card states" });
  const task = await store.createTask(project.id, {
    title: "Keep its identity",
  });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "card", type: "task", task: task.id, x: 0, y: 0, w: 340, h: 240 },
      {
        id: "missing",
        type: "task",
        task: "t-missing",
        x: 400,
        y: 0,
        w: 340,
        h: 240,
      },
    ],
    edges: [],
  });
  const archived = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    archived: true,
  });
  let snapshot = await store.snapshot(project.id);
  assert.equal(
    boardTaskState(
      snapshot.boards[0].nodes[0],
      snapshot.tasks[0],
      snapshot.taskAvailability,
    ).status,
    "archived",
  );
  assert.equal(snapshot.taskAvailability["t-missing"].status, "unavailable");
  await store.deleteTask(project.id, task.id, archived.revision);
  snapshot = await store.snapshot(project.id);
  assert.equal(snapshot.tasks.length, 0);
  assert.deepEqual(snapshot.taskAvailability[task.id], {
    status: "deleted",
    title: task.title,
    key: task.key,
  });
  assert.equal(
    snapshot.boards[0].nodes.length,
    2,
    "Board placement remains intact",
  );
  const other = await store.createProject({ title: "Other project" });
  await assert.rejects(store.restoreTask(other.id, task.id), { status: 404 });
  await store.restoreTask(project.id, task.id);
  snapshot = await store.snapshot(project.id);
  assert.equal(snapshot.taskAvailability[task.id], undefined);
  assert.equal(snapshot.tasks[0].title, task.title);
  assert.equal(snapshot.tasks[0].archived, true);
  assert.equal(snapshot.tasks[0].key, task.key);
  await store.deleteTask(project.id, task.id, snapshot.tasks[0].revision);
  await fs.writeFile(
    store.file(project.id, "tasks", task.id),
    "---\ninvalid: [\n---\n",
  );
  await assert.rejects(store.restoreTask(project.id, task.id), { status: 409 });
  assert.equal(
    await fs.readFile(store.file(project.id, "tasks", task.id), "utf8"),
    "---\ninvalid: [\n---\n",
  );
  snapshot = await store.snapshot(project.id);
  assert.equal(
    snapshot.taskAvailability[task.id].status,
    "unavailable",
    "Unreadable existing files are not called deleted",
  );
});
