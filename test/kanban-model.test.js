import assert from "node:assert/strict";
import test from "node:test";
import {
  kanbanGroup,
  kanbanLanes,
  kanbanDropChanges,
  kanbanDropError,
} from "../public/kanban-model.js";
import { validateViews } from "../server/model.js";

const config = { types: ["epic", "task", "bug"], statuses: ["todo", "done"] };
test("Kanban lanes preserve task order, sort priorities and include unassigned/empty tasks", () => {
  const tasks = [
    { id: "a", assignee: "George", priority: "low" },
    { id: "b", assignee: "", priority: "urgent" },
    { id: "c", assignee: "George", priority: "low" },
  ];
  assert.deepEqual(
    kanbanLanes(tasks, "assignee", config).map(([key, items]) => [
      key,
      items.map((t) => t.id),
    ]),
    [
      ["George", ["a", "c"]],
      ["", ["b"]],
    ],
  );
  assert.deepEqual(
    kanbanLanes(tasks, "priority", config).map(([key]) => key),
    ["urgent", "low"],
  );
  assert.deepEqual(kanbanLanes([], "type", config), [["task", []]]);
  assert.equal(kanbanGroup("status"), "none");
});
test("Kanban drops change only destination fields and enforce workflow, source and hierarchy rules", () => {
  const task = {
    id: "t",
    type: "task",
    title: "Task",
    status: "todo",
    priority: "low",
    assignee: "George",
  };
  assert.deepEqual(kanbanDropChanges(task, "todo", "assignee", ""), {
    assignee: "",
  });
  assert.deepEqual(kanbanDropChanges(task, "done", "priority", "high"), {
    status: "done",
    priority: "high",
  });
  assert.equal(kanbanDropError(config, { ...task, source: {} }, {}, []), "");
  assert.match(
    kanbanDropError(config, { ...task, source: {} }, { assignee: "" }, []),
    /source/,
  );
  assert.match(
    kanbanDropError(
      { ...config, transitions: { todo: [] } },
      task,
      { status: "done" },
      [],
    ),
    /Workflow/,
  );
  const enforced = {
    ...config,
    hierarchy: {
      mode: "enforced",
      roots: ["epic"],
      children: { epic: ["task"], task: [], bug: [] },
    },
  };
  assert.match(
    kanbanDropError(enforced, { ...task, type: "epic" }, { type: "task" }, []),
    /requires/,
  );
  assert.match(
    kanbanDropError(
      {
        ...enforced,
        hierarchy: { ...enforced.hierarchy, roots: ["epic", "bug"] },
      },
      { ...task, type: "epic" },
      { type: "bug" },
      [{ ...task, id: "child", parent: "t" }],
    ),
    /cannot parent/,
  );
});
test("Saved Kanban views accept supported swimlanes only", () => {
  const view = {
    id: "v",
    name: "By assignee",
    view: "kanban",
    kanbanGroupBy: "assignee",
  };
  assert.equal(validateViews([view])[0].kanbanGroupBy, "assignee");
  assert.throws(() => validateViews([{ ...view, kanbanGroupBy: "arbitrary" }]));
});
