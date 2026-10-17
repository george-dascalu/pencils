import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulePreview } from "../public/schedule-model.js";
test("schedule proposals cascade without mutating tasks and retain durations", () => {
  const tasks = [
    { id: "a", due: "2026-10-20" },
    { id: "b", start: "2026-10-18", due: "2026-10-20", dependencies: ["a"] },
    { id: "c", due: "2026-10-21", dependencies: ["b"] },
  ];
  const p = schedulePreview(tasks);
  assert.equal(p.cycle, false);
  assert.equal(p.moves.length, 2);
  assert.deepEqual(p.moves[0].after, {
    start: "2026-10-21",
    due: "2026-10-23",
  });
  assert.equal(p.moves[1].after.due, "2026-10-24");
  assert.equal(tasks[1].due, "2026-10-20");
});
test("schedule reports cycles and missing dates instead of inventing a complete plan", () => {
  assert.equal(
    schedulePreview([
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["a"] },
    ]).cycle,
    true,
  );
  const p = schedulePreview([
    { id: "a" },
    { id: "b", dependencies: ["a"], due: "2026-10-20" },
  ]);
  assert.equal(p.moves.length, 0);
  assert.ok(p.warnings.length);
});
