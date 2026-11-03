// T47: project settings combine. For every set of card fields turned off (T23), alone and with
// every set of views turned off (T39), no offered field or saved Table preference names a field
// that's off, a view shows only while it's on and has a field it needs, and new cards are offered
// while a Tasks or Planning view can show them.
import test from "node:test";
import assert from "node:assert/strict";
import { schema } from "../server/model.js";
import { CARD_FIELDS, VIEW_GROUPS, viewOn, cardsOn } from "../public/card-fields.js";
import { offeredFields, tablePreferences, tableResult } from "../public/table-model.js";

const subsets = (list) => list.reduce((all, item) => [...all, ...all.map((s) => [...s, item])], [[]]);
const FIELDS = CARD_FIELDS.map(([key]) => key);
const VIEWS = VIEW_GROUPS.flatMap(([, , views]) => views);
// The fields each view needs, as AGENTS.md states them: Kanban status, Tree parent, Calendar and
// Timeline a date, Capacity the assignee.
const NEEDS = { kanban: ["status"], tree: ["parent"], calendar: ["start", "due"], timeline: ["start", "due"], capacity: ["assignee"] };
const needsMet = (off, view) => !NEEDS[view] || NEEDS[view].some((field) => !off.includes(field));
// A saved Table view uses every queryable built-in field. Notes is a rich-text
// component that can be hidden, rather than a Table column or a query operand.
const QUERY_FIELDS = FIELDS.filter(key => offeredFields(schema({})).some(field => field.key === key));
const SAVED = {
  groups: ["status", "assignee"],
  sorts: [{ field: "due", dir: 1 }, { field: "priority", dir: -1 }, { field: "title", dir: 1 }],
  filters: QUERY_FIELDS.map((field) => ({ field, op: "not-empty" })),
  query: { match: "all", rules: [{ field: "title", op: "contains", value: "a" }, ...QUERY_FIELDS.map((field) => ({ field, op: "not-empty" })), { match: "any", rules: [{ field: "tags", op: "eq", value: "x" }] }] },
};
const fieldsIn = (node) => (node.rules ? node.rules.flatMap(fieldsIn) : [node.field]);

test("every combination of card fields off keeps offered fields, saved preferences and views consistent", () => {
  for (const off of subsets(FIELDS)) {
    const label = `off: ${off.join(", ") || "none"}`, config = schema({ off: off.length ? off : undefined });
    const offered = offeredFields(config).map((f) => f.key);
    assert.deepEqual(off.filter((field) => offered.includes(field)), [], `${label}: offered`);
    const p = tablePreferences(SAVED, config);
    const used = [...p.groups, ...p.sorts.map((s) => s.field), ...p.filters.map((f) => f.field), ...fieldsIn(p.query)];
    assert.deepEqual(used.filter((field) => off.includes(field)), [], `${label}: saved preferences`);
    for (const view of VIEWS) assert.equal(viewOn(config, view), needsMet(off, view), `${label}: ${view}`);
  }
});

test("a saved query's rules on fields that are off leave the open Table, and the rest still filter", () => {
  const tasks = [{ id: "t1", key: "A-1", title: "alpha", status: "done" }, { id: "t2", key: "A-2", title: "beta", status: "todo" }];
  const saved = { groups: [], sorts: [], filters: [], query: { match: "all", rules: [{ field: "status", op: "eq", value: "done" }, { field: "title", op: "contains", value: "a" }] } };
  const titles = (config) => tableResult(tasks, tablePreferences(saved, config), config).tasks.map((t) => t.title);
  assert.deepEqual(titles(schema({})), ["alpha"], "status filters while it's on");
  assert.deepEqual(titles(schema({ off: ["status"] })).sort(), ["alpha", "beta"], "only the title rule applies while status is off");
  // A group left with no rules goes, so it can't make an "any" match every card.
  const nested = { ...saved, query: { match: "any", rules: [{ match: "all", rules: [{ field: "status", op: "eq", value: "done" }] }, { field: "title", op: "contains", value: "alp" }] } };
  const result = (config) => tableResult(tasks, tablePreferences(nested, config), config).tasks.map((t) => t.title);
  assert.deepEqual(result(schema({ off: ["status"] })), ["alpha"], "the emptied group doesn't match every card");
  // A query that is a single rule on a field that's off doesn't filter.
  const single = { ...saved, query: { field: "status", op: "eq", value: "done" } };
  assert.equal(tablePreferences(single, schema({ off: ["status"] })).query, undefined);
});

test("every combination of views off, with fields off, shows a view only while both allow it", () => {
  const fieldSets = [[], ["status"], ["start", "due"], ["parent", "assignee"], FIELDS];
  for (const viewsOff of subsets(VIEWS))
    for (const off of fieldSets) {
      const config = schema({ off: off.length ? off : undefined, views_off: viewsOff.length ? viewsOff : undefined });
      const shown = VIEWS.filter((view) => viewOn(config, view));
      assert.deepEqual(shown, VIEWS.filter((view) => !viewsOff.includes(view) && needsMet(off, view)), `views off: ${viewsOff}; fields off: ${off}`);
      assert.equal(viewOn(config, "overview"), true);
      assert.equal(cardsOn(config), shown.some((view) => !["board", "documents"].includes(view)), `cards: views off ${viewsOff}; fields off ${off}`);
    }
});
