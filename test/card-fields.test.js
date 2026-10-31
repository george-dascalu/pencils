import test from "node:test";
import assert from "node:assert/strict";
import { schema } from "../server/model.js";
import { CARD_FIELDS, VIEW_GROUPS, fieldOn, viewOn, cardsOn } from "../public/card-fields.js";
import { tablePreferences } from "../public/table-model.js";
import { canParent } from "../public/hierarchy-model.js";

// Owner request (T23): a project can turn off any built-in card field; cards keep ID and title.
test("a project can turn off built-in card fields, and only those", () => {
  assert.deepEqual(CARD_FIELDS.map(([key]) => key), ["type", "assignee", "status", "priority", "start", "due", "estimate", "tags", "parent"]);
  assert.deepEqual(schema({ off: ["status", "parent"] }).off, ["status", "parent"]);
  assert.equal(schema({}).off, undefined, "nothing is off by default");
  for (const off of [["title"], ["key"], ["status", "status"], "status", [1]])
    assert.throws(() => schema({ off }), /built-in card fields/, JSON.stringify(off));
});

test("saved Table groups, sorts and filters on a field that is off wait until it is back", () => {
  const saved = { groups: ["status"], sorts: [{ field: "status", dir: 1 }, { field: "title", dir: 1 }], filters: [] };
  const p = tablePreferences(saved, { off: ["status"], fields: [] });
  assert.deepEqual([p.groups, p.sorts.map((s) => s.field)], [[], ["title"]]);
  assert.deepEqual(tablePreferences(saved, { fields: [] }).groups, ["status"]);
});

test("views that need a field that is off leave the tabs", () => {
  const off = (...fields) => ({ off: fields });
  assert.equal(fieldOn(off("tags"), "tags"), false);
  assert.equal(fieldOn(off("tags"), "title"), true);
  assert.equal(fieldOn(null, "status"), true);
  assert.equal(viewOn(off("status"), "kanban"), false);
  assert.equal(viewOn(off("parent"), "tree"), false);
  assert.equal(viewOn(off("assignee"), "capacity"), false);
  assert.equal(viewOn(off("due"), "calendar"), true, "the start date still places cards");
  assert.equal(viewOn(off("start", "due"), "calendar"), false);
  assert.equal(viewOn(off("start", "due"), "timeline"), false);
  for (const view of ["overview", "documents", "list", "table", "board"])
    assert.equal(viewOn(off(...CARD_FIELDS.map(([key]) => key)), view), true, view);
});

// T38: without the Parent field, strict placement rules can't be met, so they don't apply.
test("placement rules wait while Parent is off", () => {
  const config = { types: ["epic", "task"], hierarchy: { mode: "enforced", roots: ["epic"], children: { epic: ["task"], task: [] } } };
  assert.equal(canParent(config, "task", null), false);
  assert.equal(canParent({ ...config, off: ["parent"] }, "task", null), true);
});

// Owner request (T39): a project chooses its views and components; Overview always stays.
test("a project can turn off views, and Overview stays", () => {
  assert.deepEqual(VIEW_GROUPS.map(([, name, views]) => [name, views]), [
    ["Tasks", ["list", "tree", "table", "kanban"]],
    ["Planning", ["calendar", "timeline", "capacity"]],
    ["Boards", ["board"]],
    ["Documents", ["documents"]],
  ]);
  assert.deepEqual(schema({ views_off: ["board", "calendar"] }).views_off, ["board", "calendar"]);
  assert.equal(schema({}).views_off, undefined, "every view is on by default");
  for (const views_off of [["overview"], ["settings"], ["board", "board"], "board", [1]])
    assert.throws(() => schema({ views_off }), /views/, JSON.stringify(views_off));
  const config = { views_off: ["board", "list", "tree", "table", "kanban"] };
  assert.equal(viewOn(config, "board"), false);
  assert.equal(viewOn(config, "list"), false);
  assert.equal(viewOn(config, "overview"), true);
  assert.equal(viewOn(config, "calendar"), true);
  assert.equal(cardsOn(config), true, "Planning still shows cards");
  assert.equal(cardsOn({ views_off: ["list", "tree", "table", "kanban", "calendar", "timeline", "capacity"] }), false);
});
