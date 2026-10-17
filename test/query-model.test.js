import test from "node:test";
import assert from "node:assert/strict";
import { validQuery, matchesQuery } from "../public/query-model.js";
const fields = [
  { key: "due", type: "date" },
  { key: "assignee", type: "options" },
  { key: "status", type: "options" },
  { key: "estimate", type: "number" },
];
test("AND and OR groups combine with relative dates and current user", () => {
  const q = {
    match: "all",
    rules: [
      { field: "assignee", op: "me" },
      {
        match: "any",
        rules: [
          { field: "due", op: "today" },
          { field: "status", op: "eq", value: "todo" },
        ],
      },
    ],
  };
  assert.equal(
    matchesQuery(
      { assignee: "George", due: "2026-10-17", status: "doing" },
      q,
      fields,
      { today: "2026-10-17", me: "George" },
    ),
    true,
  );
  assert.equal(
    matchesQuery({ assignee: "Other", status: "todo" }, q, fields, {
      me: "George",
    }),
    false,
  );
  assert.equal(
    matchesQuery(
      { due: "2026-10-16", status: "done" },
      { field: "due", op: "overdue" },
      fields,
      { today: "2026-10-17", done: ["done"] },
    ),
    false,
  );
});
test("malformed, oversized and unknown-field queries fail closed", () => {
  assert.equal(
    validQuery({
      match: "all",
      rules: Array(41).fill({ field: "status", op: "empty" }),
    }),
    false,
  );
  assert.equal(
    matchesQuery(
      { status: "todo" },
      { field: "fields.removed", op: "empty" },
      fields,
    ),
    false,
  );
  assert.equal(validQuery({ field: "__proto__", op: "eq" }), false);
});
