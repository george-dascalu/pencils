import test from "node:test";
import assert from "node:assert/strict";
import {
  tableResult,
  tablePreferences,
  validTablePreferences,
  tableFields,
} from "../public/table-model.js";
test("default outline upgrades old preferences, keeps families in their own group and retains counts",()=>{
  const tasks=[{id:"c",title:"Child",parent:"p",status:"todo"},{id:"p",title:"Parent",status:"todo"},{id:"other",title:"Other child",parent:"p",status:"done"}];
  const prefs=tablePreferences({groups:["status"],sorts:[],filters:[],outline:false},{fields:[]});
  const result=tableResult(tasks,prefs,{statuses:["todo","done"],types:["task"],done:["done"],fields:[]});
  assert.deepEqual(result.tasks.map(t=>t.id),["p","c","other"]);
  assert.equal(result.depths.get("c"),1);assert.equal(result.depths.get("other"),0);
  assert.equal(result.counts.get('["todo"]'),2);
  assert.equal(tablePreferences(prefs,{fields:[]}).outline,true);
});
const config = {
  statuses: ["todo", "doing", "done"],
  types: ["task", "bug"],
  fields: [
    { id: "points", name: "Points", type: "number" },
    { id: "approved", name: "Approved", type: "checkbox" },
  ],
};
const rows = [
  {
    id: "a",
    title: "Item 10",
    status: "todo",
    priority: "urgent",
    assignee: "Alice",
    due: "2026-10-20",
    fields: { points: 10, approved: false },
  },
  {
    id: "b",
    title: "Item 2",
    status: "done",
    priority: "low",
    assignee: "Bob",
    due: null,
    fields: { points: 2, approved: true },
  },
  {
    id: "c",
    title: "Item 3",
    status: "doing",
    priority: "high",
    assignee: "Alice",
    due: "2026-10-18",
    fields: { points: 0 },
  },
  {
    id: "d",
    title: "Item 1",
    status: "todo",
    priority: "none",
    assignee: null,
    fields: {},
  },
];
const prefs = (p = {}) => ({ groups: [], sorts: [], filters: [], ...p });
const ids = (r) => r.tasks.map((t) => t.id);
test("Description participates in saved table filters, sorting and advanced queries", () => {
  const tasks = [{ id: "a", body: "Beta\n\nDetails" }, { id: "b", body: "Alpha" }, { id: "c", body: "" }];
  const p = prefs({ sorts: [{ field: "body", dir: 1 }] });
  assert.ok(validTablePreferences(p));
  assert.equal(tableFields(config).find(f => f.key === "body").name, "Description");
  assert.deepEqual(ids(tableResult(tasks, p, config)), ["b", "a", "c"]);
  p.filters = [{ field: "body", op: "contains", value: "details" }];
  assert.deepEqual(ids(tableResult(tasks, p, config)), ["a"]);
  p.filters = [];
  p.query = { match: "all", rules: [{ field: "body", op: "contains", value: "Alpha" }] };
  assert.ok(validTablePreferences(p));
  assert.deepEqual(ids(tableResult(tasks, p, config)), ["b"]);
});
test("table sorts numeric custom fields, workflow order, priority and natural text with empty values last", () => {
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({ sorts: [{ field: "fields.points", dir: -1 }] }),
        config,
      ),
    ),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({ sorts: [{ field: "fields.points", dir: 1 }] }),
        config,
      ),
    ),
    ["c", "b", "a", "d"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({
          sorts: [
            { field: "status", dir: 1 },
            { field: "title", dir: 1 },
          ],
        }),
        config,
      ),
    ),
    ["d", "a", "c", "b"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({ sorts: [{ field: "priority", dir: -1 }] }),
        config,
      ),
    ),
    ["a", "c", "b", "d"],
  );
  assert.deepEqual(
    ids(
      tableResult(rows, prefs({ sorts: [{ field: "title", dir: 1 }] }), config),
    ),
    ["d", "b", "c", "a"],
  );
});
test("column filters combine with AND, options with OR, and preserve zero and false", () => {
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({
          filters: [
            { field: "assignee", op: "values", values: ["Alice", "Bob"] },
            { field: "fields.points", op: "range", min: "0", max: "2" },
          ],
        }),
        config,
      ),
    ),
    ["b", "c"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({
          filters: [
            { field: "fields.approved", op: "values", values: ["false"] },
          ],
        }),
        config,
      ),
    ),
    ["a"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({ filters: [{ field: "due", op: "empty" }] }),
        config,
      ),
    ),
    ["b", "d"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({
          filters: [
            { field: "due", op: "range", min: "2026-10-19", max: "2026-10-21" },
          ],
        }),
        config,
      ),
    ),
    ["a"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({
          filters: [{ field: "title", op: "not-contains", value: "ITEM 1" }],
        }),
        config,
      ),
    ),
    ["b", "c"],
  );
  assert.deepEqual(
    ids(
      tableResult(
        rows,
        prefs({ filters: [{ field: "assignee", op: "values", values: [] }] }),
        config,
      ),
    ),
    ["a", "b", "c", "d"],
  );
});
test("nested groups count all matches, remain contiguous and never mutate source tasks", () => {
  const copy = structuredClone(rows),
    p = prefs({
      groups: ["assignee", "status"],
      sorts: [{ field: "priority", dir: -1 }],
    });
  const result = tableResult(rows, p, config);
  assert.deepEqual(ids(result), ["a", "c", "b", "d"]);
  assert.equal(result.counts.get('["Alice"]'), 2);
  assert.equal(result.counts.get('["Alice","todo"]'), 1);
  assert.deepEqual(rows, copy);
  const variants = [
    { assignee: "alice", id: 1 },
    { assignee: "Alice", id: 2 },
    { assignee: "alice", id: 3 },
  ];
  const grouped = tableResult(
    variants,
    prefs({ groups: ["assignee"] }),
    config,
  ).tasks;
  assert.equal(
    new Set(
      grouped
        .map((x) => x.assignee)
        .filter((x, i, a) => i === 0 || x !== a[i - 1]),
    ).size,
    2,
  );
  assert.ok(
    grouped[0].assignee === grouped[1].assignee ||
      grouped[1].assignee === grouped[2].assignee,
  );
});
test("saved table preferences reject malformed rules and drop removed fields", () => {
  assert.equal(
    validTablePreferences(prefs({ sorts: [{ field: "title", dir: 0 }] })),
    false,
  );
  assert.equal(
    validTablePreferences(prefs({ groups: ["title", "title"] })),
    false,
  );
  assert.equal(
    validTablePreferences(
      prefs({ filters: [{ field: "__proto__", op: "empty" }] }),
    ),
    false,
  );
  assert.deepEqual(
    tablePreferences(prefs({ groups: ["fields.removed"] }), config).groups,
    [],
  );
  assert.deepEqual(tablePreferences(null, config), prefs({ outline: true }));
  assert.equal(tablePreferences(prefs(), config).outline, true);
});
