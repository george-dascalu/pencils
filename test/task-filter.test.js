import test from "node:test";
import assert from "node:assert/strict";
import { filterTasks, byText, sortGroups, sortNames } from "../public/task-filter.js";

const statuses = ["todo", "doing", "done"];
const card = (id, fields = {}) => ({ id, title: id, status: "todo", type: "task", ...fields });
const ids = (list) => list.map((t) => t.id);

test("the search finds cards by title, text, ID, key, alias, assignee and tag, unless those fields are off", () => {
  const tasks = [card("a", { title: "Plan launch" }), card("b", { body: "see the launch notes" }), card("c", { key: "PEN-7" }), card("d", { aliases: ["Kick-off"] }), card("e", { assignee: "Ann" }), card("f", { tags: ["urgent"] }), card("q9")];
  const find = (search, config = {}) => ids(filterTasks(tasks, { search, statuses, config }));
  assert.deepEqual(find(" LAUNCH "), ["a", "b"]);
  assert.deepEqual(find("pen-7"), ["c"]);
  assert.deepEqual(find("kick"), ["d"]);
  assert.deepEqual(find("ann"), ["e"]);
  assert.deepEqual(find("ann", { off: ["assignee"] }), []);
  assert.deepEqual(find("urgent"), ["f"]);
  assert.deepEqual(find("urgent", { off: ["tags"] }), []);
  assert.deepEqual(find("q9"), ["q9"], "the card's own ID");
});

test("status, type and the project's filters narrow the cards", () => {
  const tasks = [card("a"), card("b", { status: "done" }), card("c", { type: "bug" }), card("d", { status: "done", type: "bug" })];
  assert.deepEqual(ids(filterTasks(tasks, { status: "done", statuses })), ["b", "d"]);
  assert.deepEqual(ids(filterTasks(tasks, { type: "bug", statuses })), ["c", "d"]);
  assert.deepEqual(ids(filterTasks(tasks, { statuses, keep: (t) => t.id !== "a" })), ["b", "c", "d"]);
});

test("each sort orders the cards, reversed by the direction, with ties by ID", () => {
  const tasks = [
    card("t1", { key: "PEN-10", title: "beta", order: 2, status: "done", priority: "low", assignee: "", due: "2026-11-03", created: "2026-11-01", parent: "t3" }),
    card("t2", { key: "PEN-9", title: "alpha", order: 1, status: "todo", priority: "urgent", assignee: "Zoe", created: "2026-11-02" }),
    card("t3", { key: "PEN-2", title: "gamma", order: 3, status: "doing", priority: "medium", assignee: "Ann", due: "2026-11-01", created: "2026-11-03", parent: "t2" }),
  ];
  const sorted = (sort, sortDir = 1) => ids(filterTasks(tasks, { sort, sortDir, statuses }));
  assert.deepEqual(sorted("order"), ["t2", "t1", "t3"]);
  assert.deepEqual(sorted("key"), ["t3", "t2", "t1"], "natural order: PEN-9 before PEN-10");
  assert.deepEqual(sorted("title"), ["t2", "t1", "t3"]);
  assert.deepEqual(sorted("title", -1), ["t3", "t1", "t2"]);
  assert.deepEqual(sorted("assignee"), ["t3", "t2", "t1"], "no assignee last");
  assert.deepEqual(sorted("status"), ["t2", "t3", "t1"], "the workflow's order");
  assert.deepEqual(sorted("priority"), ["t2", "t3", "t1"], "urgent first");
  assert.deepEqual(sorted("due"), ["t3", "t1", "t2"], "no due date last");
  assert.deepEqual(sorted("created"), ["t1", "t2", "t3"]);
  assert.deepEqual(sorted("parent"), ["t1", "t3", "t2"], "by the parent's key (PEN-2, PEN-9), no parent last");
  assert.deepEqual(ids(filterTasks([card("b", { title: "Same" }), card("a", { title: "Same" })], { sort: "title", statuses })), ["a", "b"], "equal titles fall back to the ID");
});

test("text compares naturally with empty values last, and every sort has a name in the menu", () => {
  assert.ok(byText("PEN-9", "PEN-10") < 0);
  assert.ok(byText("", "a") > 0 && byText("a", null) < 0);
  assert.equal(byText(undefined, ""), 0);
  for (const [, sorts] of sortGroups) for (const sort of sorts) assert.ok(sortNames[sort], sort);
});
