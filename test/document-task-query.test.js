import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskQuery, runTaskQuery } from "../public/document-task-query.js";

const today = "2026-10-29";
const config = { statuses: ["todo", "in-progress", "done"], done: ["done"], status_labels: {} };
const tasks = [
  { id: "a", key: "Q-1", title: "Alpha", status: "todo", priority: "low", due: "2026-10-28", assignee: "Sam", tags: ["ops"] },
  { id: "b", key: "Q-2", title: "Beta", status: "in-progress", priority: "urgent", due: "2026-10-29", assignee: "Ana" },
  { id: "c", key: "Q-3", title: "Gamma", status: "done", priority: "high", due: "2026-10-30" },
  { id: "d", key: "Q-4", title: "Delta", status: "todo", priority: "high", archived: true },
  { id: "e", key: "Q-5", title: "Epsilon", status: "todo", priority: "none" },
];
const run = (text, extra = {}) => runTaskQuery(tasks, parseTaskQuery(text, { today }), { config, today, ...extra }).tasks.map((t) => t.key);

test("instructions filter, sort and limit the project's cards", () => {
  assert.deepEqual(run("not done"), ["Q-1", "Q-2", "Q-5"], "archived cards never show");
  assert.deepEqual(run("not done\nsort by due"), ["Q-1", "Q-2", "Q-5"], "cards without a date sort last");
  assert.deepEqual(run("not done\nsort by due reverse"), ["Q-2", "Q-1", "Q-5"], "also in reverse");
  assert.deepEqual(run("priority is Lowest"), ["Q-5"], "a priority by its label");
  assert.deepEqual(run("done"), ["Q-3"]);
  assert.deepEqual(run("overdue"), ["Q-1"]);
  assert.deepEqual(run("due today"), ["Q-2"]);
  assert.deepEqual(run("due before tomorrow\nsort by due reverse"), ["Q-2", "Q-1"]);
  assert.deepEqual(run("status is In progress"), ["Q-2"], "a status by its label");
  assert.deepEqual(run("assignee is me", { me: "Sam" }), ["Q-1"]);
  assert.deepEqual(run("no due date"), ["Q-5"]);
  assert.deepEqual(run("tag includes #ops"), ["Q-1"]);
  assert.deepEqual(run("title includes amm"), ["Q-3"]);
  assert.deepEqual(run("sort by priority\nlimit 2"), ["Q-2", "Q-3"], "highest priority first");
  assert.equal(runTaskQuery(tasks, parseTaskQuery("limit 1", { today }), { config, today }).total, 4);
});

test("unknown lines are reported and notes are ignored", () => {
  const query = parseTaskQuery("# My work\nnot done\ndue someday\nsort by colour\nlimit 999", { today });
  assert.deepEqual(query.errors, ["due someday", "sort by colour", "limit 999"]);
  assert.equal(query.done, false);
  assert.match(parseTaskQuery(Array(41).fill("overdue").join("\n"), { today }).errors[0], /first 39 filters/);
  assert.deepEqual(parseTaskQuery(`title includes ${"x".repeat(501)}`, { today }).errors, ["title value is too long"]);
});
