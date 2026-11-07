import { test } from "node:test";
import assert from "node:assert/strict";
import { compareTaskOrder, reorderTasks, orderTasks } from "../public/task-order-model.js";
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

test('no-op and missing drag endpoints never change ranks',()=>{
  const tasks=['a','b','c'].map((id,i)=>({id,order:i*1024}));
  assert.deepEqual(reorderTasks(tasks,['a','b','c'],'a','a'),[]);
  assert.deepEqual(reorderTasks(tasks,['a','b','c'],'missing','b'),[]);
  assert.deepEqual(reorderTasks(tasks,['a','b','c'],'a','missing'),[]);
});

test('normal moves leave hidden ranks untouched; tiny or imprecise intervals rebalance safely',()=>{
  const tasks=['a','b','c','d'].map((id,i)=>({id,order:i*1024}));
  const changes=reorderTasks(tasks,['a','b'],'b','a');
  assert.deepEqual(changes.map(t=>t.id).sort(),['a','b']);
  for (const orders of [[-Number.MAX_VALUE,-1,0,Number.MAX_VALUE],[0,1e-6,2e-6,3e-6]]) {
    const values=['a','b','c','z'].map((id,i)=>({id,order:orders[i]}));
    const changes=reorderTasks(values,['b','c'],'c','b');
    assert.equal(changes.length,4);
    const moved=apply(values,changes);
    assert.deepEqual(moved.map(t=>t.id),['a','c','b','z']);
    assert.ok(moved.every((t,i)=>Number.isFinite(t.order)&&(!i||t.order>moved[i-1].order)));
  }
  const edge=2**53;
  const values=['a','b','c','d','z'].map((id,i)=>({id,order:[edge-1,edge-1,edge,edge+2,edge+2][i]}));
  const moved=apply(values,reorderTasks(values,['b','c','d'],'d','b'));
  assert.ok(moved.every((t,i)=>!i||t.order>moved[i-1].order));
});
test("orderTasks puts the named tasks in the given order in their own slots, the rest staying put (F0.22-45)", () => {
  const tasks = ["a", "b", "c", "d"].map((id, i) => ({ id, order: i * 1024 }));
  const apply = (list, changes) => list.map(t => ({ ...t, ...(changes.find(c => c.id === t.id) || {}) })).sort(compareTaskOrder);
  assert.deepEqual(apply(tasks, orderTasks(tasks, ["d", "a"])).map(t => t.id), ["d", "b", "c", "a"]);
  assert.deepEqual(apply(tasks, orderTasks(tasks, ["c", "a", "b"])).map(t => t.id), ["c", "a", "b", "d"]);
  assert.deepEqual(orderTasks(tasks, ["a", "c"]), [], "already in that order");
  assert.deepEqual(orderTasks(tasks, ["a", "missing"]), []);
});
