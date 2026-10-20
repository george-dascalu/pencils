import test from "node:test";
import assert from "node:assert/strict";
import {
  taskRelationships,
  relationshipChanges,
  compareRelationshipTasks,
} from "../public/task-relationship-model.js";
const config = { types: ["epic", "task"] };
test("Relationship sorting uses assignee names, highest priority first and configured status order", () => {
  const rows = [
    { id: "g", title: "George", assignee: "George", priority: "high", status: "working" },
    { id: "a", title: "Alice", assignee: "Alice", priority: "urgent", status: "complete" },
    { id: "u", title: "Unassigned", assignee: "", priority: "none", status: "queued" },
  ];
  const schema = { statuses: ["queued", "working", "complete"] };
  const ordered = (field, dir = 1) => [...rows].sort((a, b) => compareRelationshipTasks(a, b, field, dir, schema)).map(t => t.id);
  assert.deepEqual(ordered("assignee"), ["a", "g", "u"]);
  assert.deepEqual(ordered("assignee", -1), ["g", "a", "u"]);
  assert.deepEqual(ordered("priority"), ["a", "g", "u"]);
  assert.deepEqual(ordered("priority", -1), ["u", "g", "a"]);
  assert.deepEqual(ordered("status"), ["u", "g", "a"]);
  assert.deepEqual(ordered(""), ["g", "a", "u"]);
});
const tasks = [
  { id: "a", title: "Plan", type: "epic", related_records: ["c"] },
  { id: "b", title: "Build", type: "task", parent: "a", dependencies: ["a"] },
  {
    id: "c",
    title: "Ship",
    type: "task",
    dependencies: ["b"],
    related_records: ["a"],
  },
];
test("Relationships expose both directions without duplicating related links", () => {
  assert.deepEqual(taskRelationships(tasks, "a"), [
    { kind: "child", target: "b" },
    { kind: "blocks", target: "b" },
    { kind: "related", target: "c" },
  ]);
  assert.deepEqual(taskRelationships(tasks, "b"), [
    { kind: "parent", target: "a" },
    { kind: "blocked-by", target: "a" },
    { kind: "blocks", target: "c" },
  ]);
});
test("Inverse actions update canonical hierarchy and blocker fields", () => {
  assert.deepEqual(relationshipChanges(tasks, config, "a", "child", "c"), [
    { id: "c", changes: { parent: "a" } },
  ]);
  assert.deepEqual(relationshipChanges(tasks, config, "a", "blocks", "c"), [
    { id: "c", changes: { dependencies: ["b", "a"] } },
  ]);
  assert.deepEqual(
    relationshipChanges(tasks, config, "b", "blocked-by", "a", true),
    [{ id: "b", changes: { dependencies: [] } }],
  );
  assert.deepEqual(
    relationshipChanges(tasks, config, "a", "child", "b", true),
    [{ id: "b", changes: { parent: null } }],
  );
  assert.deepEqual(
    relationshipChanges(tasks, config, "a", "related", "c", true),
    [
      { id: "a", changes: { related_records: [] } },
      { id: "c", changes: { related_records: [] } },
    ],
  );
});
test("Cycles, self-links, missing targets and enforced hierarchy are rejected", () => {
  assert.throws(
    () => relationshipChanges(tasks, config, "a", "parent", "b"),
    /parent\/child cycle/,
  );
  assert.throws(
    () => relationshipChanges(tasks, config, "b", "child", "a"),
    /parent\/child cycle/,
  );
  assert.throws(
    () => relationshipChanges(tasks, config, "a", "blocked-by", "c"),
    /blocking cycle/,
  );
  assert.throws(
    () => relationshipChanges(tasks, config, "c", "blocks", "a"),
    /blocking cycle/,
  );
  assert.throws(
    () => relationshipChanges(tasks, config, "a", "related", "a"),
    /itself/,
  );
  assert.throws(
    () => relationshipChanges(tasks, config, "a", "blocks", "missing"),
    /no longer available/,
  );
  const enforced = {
    ...config,
    hierarchy: {
      mode: "enforced",
      roots: ["epic"],
      children: { epic: ["task"], task: [] },
    },
  };
  assert.throws(
    () => relationshipChanges(tasks, enforced, "b", "parent", "c"),
    /cannot parent/,
  );
  assert.throws(
    () => relationshipChanges(tasks, enforced, "a", "child", "b", true),
    /requires an allowed parent/,
  );
});
