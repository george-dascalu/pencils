import test from "node:test";
import assert from "node:assert/strict";
import { pageOf, treePage, localDate } from "../public/task-visibility.js";
test("paging clamps stale and invalid pages", () => {
  assert.equal(pageOf([1, 2], 50).page, 0);
  assert.equal(pageOf([], -1).pages, 1);
  assert.deepEqual(
    pageOf(
      Array.from({ length: 205 }, (_, i) => i),
      2,
    ).items,
    [200, 201, 202, 203, 204],
  );
});
test("filtered hierarchy retains ancestors and pages complete subtrees", () => {
  const tasks = [
    { id: "p", title: "Parent" },
    ...Array.from({ length: 205 }, (_, i) => ({ id: `c${i}`, parent: "p" })),
    { id: "other" },
  ];
  const result = treePage(
    tasks.filter((t) => t.id.startsWith("c")),
    tasks,
    0,
    1,
  );
  assert.equal(result.items.length, 206);
  assert.equal(result.pages, 1);
  assert.equal(result.context, 1);
  assert.equal(result.items[0].id, "p");
  assert.equal(result.items[0].contextOnly, true);
});
test("malformed cycles and missing parents remain reachable", () => {
  const tasks = [
    { id: "a", parent: "b" },
    { id: "b", parent: "a" },
    { id: "c", parent: "missing" },
  ];
  assert.equal(new Set(treePage(tasks, tasks).items.map((t) => t.id)).size, 3);
});
test("dates use local calendar components", () => {
  assert.equal(localDate(new Date(2026, 9, 17, 0, 1)), "2026-10-17");
});
