import { test } from "node:test";
import assert from "node:assert/strict";
import { compareTaskOrder, reorderTasks } from "../public/task-order-model.js";
import { treePage } from "../public/task-visibility.js";

const apply = (tasks, changes) => tasks.map(t => ({ ...t, ...changes.find(c => c.id === t.id) })).sort(compareTaskOrder);
test("manual reorder keeps hidden/archived slots and handles tied or missing ranks", () => {
  const tasks = ["a", "hidden", "b", "archived", "c"].map((id, i) => ({ id, order: i * 1024 }));
  const changes = reorderTasks(tasks, ["a", "b", "c"], "c", "a");
  assert.deepEqual(apply(tasks, changes).map(t => t.id), ["c", "hidden", "a", "archived", "b"]);
  const tied = ["a", "b", "c", "d"].map(id => ({ id }));
  assert.deepEqual(apply(tied, reorderTasks(tied, ["b", "c"], "c", "b")).map(t => t.id), ["a", "c", "b", "d"]);
  assert.deepEqual(reorderTasks(tasks, ["a", "b", "c"], "a", "b"), []);
  assert.deepEqual(reorderTasks(tasks, ["a", "b"], "a", "missing"), []);
});
test("reorder adopts the displayed sort and stays stable after repeated moves", () => {
  let tasks = ["a", "b", "c", "d"].map((id, order) => ({ id, order }));
  tasks = apply(tasks, reorderTasks(tasks, ["d", "c", "b", "a"], "a", "c"));
  assert.deepEqual(tasks.map(t => t.id), ["d", "a", "c", "b"]);
  for (let i = 0; i < 100; i++) tasks = apply(tasks, reorderTasks(tasks, tasks.map(t => t.id), tasks.at(-1).id, tasks[1].id));
  assert.ok(tasks.every(t => Number.isFinite(t.order)));
  assert.ok(tasks.every((t, i) => !i || t.order > tasks[i - 1].order));
});
test("tree manual order includes filtered ancestor context and carries whole branches", () => {
  let tasks = [{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "ac", parent: "a", order: 2 }, { id: "bc", parent: "b", order: 3 }];
  tasks = apply(tasks, reorderTasks(tasks, ["a", "b"], "b", "a"));
  const tree = treePage(tasks.filter(t => t.parent), tasks, 0, 100, compareTaskOrder);
  assert.deepEqual(tree.items.map(t => t.id), ["b", "bc", "a", "ac"]);
  assert.equal(tree.items[0].contextOnly, true);
  assert.equal(tasks.find(t => t.id === "ac").parent, "a");
});
