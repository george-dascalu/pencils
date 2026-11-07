// The server's checks on project settings, task fields and saved views. Each case breaks one rule
// in otherwise good input, and each limit is taken exactly, so a check that stops working fails
// here (npm run test:mutants found most of them unguarded).
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCHEMA, schema, validDate, validateExtras, validateViews, progress, upgradeDefaultTaskTypes } from "../server/model.js";
import { DEFAULT_TASK_TYPES } from "../public/task-types.js";

const refuses = (check, cases) => {
  for (const [label, input, message] of cases) assert.throws(() => check(input), { status: 400, message }, label);
};
const accepts = (check, cases) => {
  for (const [label, input] of cases) assert.doesNotThrow(() => check(input), label);
};
const many = (count, make = (i) => `s${i}`) => Array.from({ length: count }, (_, i) => make(i));
const text = (length) => "x".repeat(length);
const open = Object.fromEntries(DEFAULT_SCHEMA.statuses.map((status) => [status, []]));
const rules = { mode: "free", roots: ["task"], children: Object.fromEntries(DEFAULT_TASK_TYPES.map((type) => [type, []])) };

test("project settings refuse each bad value and take each limit", () => {
  const ids = /unique short identifiers/, names = /Status names/, workflow = /Workflow rules/, hierarchy = /Card hierarchy/, fields = /unique identifier, name and supported type/;
  refuses(schema, [
    ["no completed status", { done: [] }, /at least one completed status/],
    ["statuses that aren't a list", { statuses: "todo" }, ids],
    ["no statuses", { statuses: [] }, ids],
    ["41 statuses", { statuses: many(41), done: ["s0"] }, ids],
    ["a status with a space", { statuses: ["to do", "done"] }, ids],
    ["a status that isn't text", { statuses: [5, "done"] }, ids],
    ["a 101-character status", { statuses: [text(101), "done"] }, ids],
    ["a status twice", { statuses: ["todo", "todo", "done"] }, ids],
    ["a completed status outside the workflow", { done: ["shipped"] }, /Completed statuses must be in the workflow/],
    ["status names that aren't a mapping", { status_labels: 5 }, names],
    ["status names as a list", { status_labels: [] }, names],
    ["a name for a missing status", { status_labels: { shipped: "Shipped" } }, names],
    ["a blank status name", { status_labels: { todo: " " } }, names],
    ["workflow rules that aren't a mapping", { transitions: 5 }, workflow],
    ["workflow rules as a list", { transitions: [] }, workflow],
    ["a rule for a missing status", { transitions: { ...open, shipped: [] } }, workflow],
    ["a status without a rule", { transitions: { todo: [] } }, /Each status needs/],
    ["hierarchy rules that are empty", { hierarchy: false }, hierarchy],
    ["an unknown hierarchy mode", { hierarchy: { ...rules, mode: "strict" } }, hierarchy],
    ["roots that aren't a list", { hierarchy: { ...rules, roots: "task" } }, hierarchy],
    ["no children rules", { hierarchy: { ...rules, children: null } }, hierarchy],
    ["children rules as a list", { hierarchy: { ...rules, children: Object.assign([], rules.children) } }, hierarchy],
    ["children rules that aren't a mapping", { hierarchy: { ...rules, children: Object.assign(() => {}, rules.children) } }, hierarchy],
    ["custom fields that aren't a list", { fields: {} }, /up to 40 custom fields/],
    ["41 custom fields", { fields: many(41, (i) => ({ id: `f${i}`, name: `F${i}`, type: "text" })) }, /up to 40 custom fields/],
    ["a field without an identifier", { fields: [{ id: "", name: "Cost", type: "number" }] }, fields],
    ["a field identifier starting with a digit", { fields: [{ id: "1cost", name: "Cost", type: "number" }] }, fields],
    ["a field identifier twice", { fields: [{ id: "cost", name: "Cost", type: "number" }, { id: "cost", name: "Price", type: "number" }] }, fields],
    ["a blank field name", { fields: [{ id: "cost", name: "  ", type: "number" }] }, fields],
    ["an unknown field type", { fields: [{ id: "cost", name: "Cost", type: "money" }] }, fields],
    ["a select field without options", { fields: [{ id: "size", name: "Size", type: "select" }] }, /list of options/],
    ["101 options", { fields: [{ id: "size", name: "Size", type: "select", options: many(101) }] }, /list of options/],
    ["a blank option", { fields: [{ id: "size", name: "Size", type: "select", options: [""] }] }, /list of options/],
  ]);
  accepts(schema, [
    ["40 statuses", { statuses: many(40), done: ["s0"] }],
    ["a 100-character status", { statuses: [text(100)], done: [text(100)] }],
    ["status names and workflow rules", { status_labels: { todo: "To do" }, transitions: { ...open, todo: ["done"] } }],
    ["hierarchy rules", { hierarchy: rules }],
    ["40 custom fields", { fields: many(40, (i) => ({ id: `f${i}`, name: `F${i}`, type: "text" })) }],
    ["100 options", { fields: [{ id: "size", name: "Size", type: "select", options: many(100) }] }],
  ]);
});

test("a task's dates, numbers, links, recurrence, custom values and comments are checked", () => {
  const config = schema({
    fields: [
      { id: "note", name: "Note", type: "text" },
      { id: "cost", name: "Cost", type: "number" },
      { id: "paid", name: "Paid", type: "checkbox" },
      { id: "sent", name: "Sent", type: "date" },
      { id: "size", name: "Size", type: "select", options: ["S"] },
    ],
  });
  const check = (data) => validateExtras(data, config), comment = { id: "c1", text: "Fine", author: "Ann" };
  for (const value of ["2026-02-30", "2026-1-1", "2026-13-01", 20260101]) assert.equal(validDate(value), false, String(value));
  refuses(check, [
    ["an impossible start", { start: "2026-02-30" }, /Start must be a valid date/],
    ["a start after the due date", { start: "2026-03-02", due: "2026-03-01" }, /on or before the due date/],
    ...[-1, Infinity, "3", 1e8 + 1].map((estimate) => [`estimate ${estimate}`, { estimate }, /Estimate/]),
    ["an order that isn't a number", { order: NaN }, /Order must be a number/],
    ["archived as text", { archived: "yes" }, /Archived must be true or false/],
    ...[{ col: 1 }, { col: -1, row: 0 }, { col: 1.5, row: 0 }, { col: 0, row: 1000 }, [0, 0], "0,0", { col: 0, row: 0, x: 1 }, { col: "0", row: 0 },
      { x: 8 }, { x: -8, y: 0 }, { x: 1.5, y: 0 }, { x: 0, y: 100_001 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1e9 + 1 }, { x: 0, y: 0, w: 1 }, { x: "0", y: 0 }].map((backlog) => [`backlog place ${JSON.stringify(backlog)}`, { backlog }, /An Unscheduled place is/]),
    ...[["dependencies", "t", /Dependencies/], ["related_records", "t", /Related records/], ["documents", "d", /Linked documents/]].flatMap(([key, prefix, message]) => [
      [`${key} that aren't a list`, { [key]: `${prefix}-1` }, message],
      [`201 ${key}`, { [key]: many(201, (i) => `${prefix}-${i}`) }, message],
      [`${key} that aren't text`, { [key]: [5] }, message],
      [`${key} of another kind`, { [key]: ["x-1"] }, message],
    ]),
    ...[{ unit: "year", interval: 1 }, { unit: "day", interval: 1.5 }, { unit: "day", interval: 0 }, { unit: "day", interval: 366 }].map((recurrence) => [`recurrence ${JSON.stringify(recurrence)}`, { recurrence }, /Recurrence/]),
    ["custom values as a list", { fields: [] }, /Custom values must be a mapping/],
    ["custom values over 50,000 characters", { fields: { other: text(50_001) } }, /Custom values must be a mapping/],
    ...[["note", 5], ["note", text(10_001)], ["cost", "1"], ["paid", "true"], ["sent", "2026-02-30"], ["size", "M"]].map(([id, value]) => [`${id}: ${String(value).slice(0, 12)}`, { fields: { [id]: value } }, /Invalid value for/]),
    ["comments that aren't a list", { comments: comment }, /Invalid comments/],
    ["501 comments", { comments: many(501, (i) => ({ ...comment, id: `c${i}` })) }, /Invalid comments/],
    ...[{ id: "" }, { text: 5 }, { text: text(20_001) }, { author: 5 }, { author: text(101) }].map((change) => [`a comment with ${JSON.stringify(change).slice(0, 30)}`, { comments: [{ ...comment, ...change }] }, /Invalid comments/]),
  ]);
  accepts(check, [
    ["a start on the due date", { start: "2026-03-01", due: "2026-03-01" }],
    ["an estimate of 0", { estimate: 0 }],
    ["a place on the old Unscheduled grid", { backlog: { col: 0, row: 0 } }],
    ["the last place on the old Unscheduled grid", { backlog: { row: 999, col: 999 } }],
    ["a place on the Unscheduled board", { backlog: { x: 0, y: 0 } }],
    ["the farthest place and top layer on the Unscheduled board", { backlog: { x: 100_000, y: 100_000, z: 1e9 } }],
    ["no place in the Unscheduled row", { backlog: null }],
    ["the largest estimate", { estimate: 1e8 }],
    ["200 links of each kind", { dependencies: many(200, (i) => `t-${i}`), related_records: many(200, (i) => `t-${i}`), documents: many(200, (i) => `d-${i}`) }],
    ["recurrence every day", { recurrence: { unit: "day", interval: 1 } }],
    ["recurrence every 365 months", { recurrence: { unit: "month", interval: 365 } }],
    ["custom values of each type", { fields: { note: text(10_000), cost: 3, paid: true, sent: "2026-03-01", size: "S" } }],
    ["custom values of exactly 50,000 characters", { fields: { other: text(50_000 - JSON.stringify({ other: "" }).length) } }],
    ["500 comments at their limits", { comments: many(500, (i) => ({ id: `c${i}`, text: i ? "Fine" : text(20_000), author: text(100) })) }],
  ]);
});

test("saved views refuse each bad value and take each limit", () => {
  const view = { id: "v1", name: "Mine", view: "list" }, check = (change) => validateViews([{ ...view, ...change }]);
  const column = (key, change = {}) => ({ columns: [{ key, ...change }] });
  refuses(validateViews, [
    ["views that aren't a list", view, /up to 100 saved views/],
    ["101 views", many(101, (i) => ({ ...view, id: `v${i}` })), /up to 100 saved views/],
    ["an identifier twice", [view, { ...view, name: "Again" }], /Invalid saved view\./],
  ]);
  refuses(check, [
    ["no identifier", { id: "" }, /Invalid saved view\./],
    ["a blank name", { name: " " }, /Invalid saved view\./],
    ["an unknown view", { view: "gantt" }, /Invalid saved view\./],
    ["over 50,000 characters", { search: "x", extra: text(50_000) }, /Invalid saved view\./],
    ["a search that isn't text", { search: 5 }, /Invalid saved view filter/],
    ["a 301-character search", { search: text(301) }, /Invalid saved view filter/],
    ["unknown Kanban swimlanes", { kanbanGroupBy: "colour" }, /Kanban swimlanes/],
    ["a broken Table layout", { table: "wide" }, /saved table view/],
    ["a sort direction of 2", { sortDir: 2 }, /sort direction/],
    ["filters as a list", { filters: [] }, /saved view filters/],
    ["an assignee filter that isn't text", { filters: { assignee: 5 } }, /saved view filter/],
    ["columns that aren't a list", { columns: {} }, /saved view columns/],
    ["61 columns", { columns: many(61, (i) => ({ key: `fields.f${i}` })) }, /saved view columns/],
    ["an empty column", { columns: [null] }, /saved view column\./],
    ["a column key that isn't text", column(5), /saved view column\./],
    ["an unknown column", column("colour"), /saved view column\./],
    ["a column twice", { columns: [{ key: "title" }, { key: "title" }] }, /saved view column\./],
    ...[89, 901, NaN].map((width) => [`a column ${width}px wide`, column("title", { width }), /saved view column\./]),
    ["a column shown as text", column("title", { visible: "yes" }), /saved view column\./],
  ]);
  accepts(validateViews, [["100 views", many(100, (i) => ({ ...view, id: `v${i}` }))]]);
  accepts(check, [
    ["a 300-character search", { search: text(300) }],
    ["exactly 50,000 characters", { extra: text(50_000 - JSON.stringify({ ...view, extra: "" }).length) }],
    ["60 columns at both widths", { columns: many(60, (i) => ({ key: `fields.f${i}`, width: i ? 900 : 90, visible: true })) }],
  ]);
});

test("progress counts an unestimated task as 1 and an estimated one by its estimate", () => {
  assert.equal(progress([{ id: "t-1", status: "done", estimate: 0 }, { id: "t-2", status: "todo", estimate: 2 }]).percent, 33);
});

test("the Activity type is added after Task, with Task's placement rules", () => {
  const previous = DEFAULT_TASK_TYPES.filter((type) => type !== "activity");
  const upgrade = (types, hierarchy) => upgradeDefaultTaskTypes({ ...DEFAULT_SCHEMA, types, types_version: undefined, hierarchy });
  const children = Object.fromEntries(previous.map((type) => [type, type === "epic" ? ["task"] : []]));
  const upgraded = upgrade(previous, { mode: "free", roots: ["task"], children });
  assert.deepEqual(upgraded.types, DEFAULT_TASK_TYPES);
  assert.deepEqual(upgraded.hierarchy.roots, ["task", "activity"]);
  assert.deepEqual(upgraded.hierarchy.children.epic, ["task", "activity"]);
  for (const types of [[...previous, "chore"], [...previous.slice(1), "chore"]])
    assert.deepEqual(upgrade(types).types, types, "a list someone changed stays as it is");
});
