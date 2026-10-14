import test from "node:test";
import assert from "node:assert/strict";
import { nodeMinimum, resizedNode } from "../public/node-layout.js";
test("resizing respects content minima and clamps only the selected axis", () => {
  const task = { type: "task", w: 333, h: 277 };
  assert.deepEqual(resizedNode(task, task, -1000, -1000), nodeMinimum(task));
  assert.deepEqual(
    resizedNode(task, task, 47, 300, { axis: "x", snap: true }),
    { w: 380, h: 277 },
  );
  assert.deepEqual(
    resizedNode(task, task, 300, 43, { axis: "y", snap: true }),
    { w: 333, h: 320 },
  );
  const note = { type: "sticky", w: 220, h: 180 };
  assert.deepEqual(resizedNode(note, note, 19, 23), { w: 239, h: 203 });
});

test("task notes use note resize limits without changing the underlying type", () => {
  const note = { type: "task", displayAs: "note", w: 300, h: 250 };
  assert.deepEqual(nodeMinimum(note), nodeMinimum({ type: "sticky" }));
  assert.deepEqual(resizedNode(note, note, -1000, -1000), { w: 120, h: 100 });
  assert.equal(note.type, "task");
});
