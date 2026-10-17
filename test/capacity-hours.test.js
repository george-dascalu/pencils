import { test } from "node:test";
import assert from "node:assert/strict";
import { capacityData } from "../public/capacity.js";
test("capacity spreads hours across working days and keeps time-off overload visible", () => {
  const person = {
    id: "u",
    name: "User",
    capacity: 40,
    working_days: [1, 2, 3, 4, 5],
    time_off: ["2026-10-20"],
  };
  const tasks = [
    {
      id: "a",
      assignee_id: "u",
      start: "2026-10-19",
      due: "2026-10-30",
      estimate: 80,
      status: "todo",
    },
    { id: "b", assignee_id: "u", due: "2026-10-21", status: "todo" },
  ];
  const row = capacityData(tasks, [person], "2026-10-19").rows[0];
  assert.equal(row.hours, 40);
  assert.deepEqual(row.hourDays, [8, 8, 8, 8, 8, 0, 0]);
  assert.equal(row.available[1], 0);
  assert.equal(
    row.available.reduce((a, b) => a + b),
    32,
  );
  assert.equal(row.unknown, 1);
});
test("cross-project completion flags take precedence over this project's workflow", () => {
  const rows = capacityData(
    [
      {
        id: "x",
        assignee: "User",
        due: "2026-10-19",
        status: "closed",
        completed: true,
      },
    ],
    [{ id: "u", name: "User" }],
    "2026-10-19",
  ).rows;
  assert.equal(rows[0].count, 0);
});
