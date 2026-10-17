import { test } from "node:test";
import assert from "node:assert/strict";
import { preparePaste } from "../public/table-paste.js";
import { DEFAULT_SCHEMA } from "../server/model.js";
const tasks = [
  {
    id: "t-a",
    title: "A",
    type: "task",
    status: "todo",
    priority: "none",
    fields: {},
  },
  {
    id: "t-b",
    title: "B",
    type: "task",
    status: "todo",
    priority: "none",
    fields: {},
  },
];
test("paste validates the complete mapped range without changing tasks", () => {
  const result = preparePaste(
    "New A\t4\nNew B\t5",
    tasks,
    ["title", "estimate"],
    DEFAULT_SCHEMA,
    tasks,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.patches.get("t-b").estimate, 5);
  assert.equal(tasks[0].title, "A");
  const invalid = preparePaste(
    "\t-2\t2026-02-30",
    tasks,
    ["title", "estimate", "due"],
    DEFAULT_SCHEMA,
    tasks,
  );
  assert.equal(invalid.errors.length, 3);
});
test("paste rejects joint hierarchy cycles and duplicate mappings", () => {
  assert.match(
    preparePaste(
      "t-b\nt-a",
      tasks,
      ["parent"],
      DEFAULT_SCHEMA,
      tasks,
    ).errors.join(" "),
    /cycle/,
  );
  assert.match(
    preparePaste(
      "A\tB",
      tasks,
      ["title", "title"],
      DEFAULT_SCHEMA,
      tasks,
    ).errors.join(" "),
    /mapped once/,
  );
});
