import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange, calendarDateChange, calendarWeeks, agendaGroups } from "../public/calendar-model.js";

test("calendar moves preserve duration across DST and month/year boundaries", () => {
  assert.deepEqual(calendarDateChange({ start: "2026-10-24", due: "2026-10-27" }, "2026-10-25", "2026-11-02"), { start: "2026-11-01", due: "2026-11-04" });
  assert.deepEqual(calendarDateChange({ start: "2026-12-30", due: "2027-01-03" }, "2026-12-31", "2027-01-02"), { start: "2027-01-01", due: "2027-01-05" });
  assert.deepEqual(calendarDateChange({ due: "2026-10-16" }, "2026-10-16", "2026-10-19"), { due: "2026-10-19" });
  assert.deepEqual(calendarDateChange({ start: "2026-10-16" }, "2026-10-16", "2026-10-19"), { start: "2026-10-19" });
  assert.deepEqual(calendarDateChange({}, null, "2026-10-19"), { due: "2026-10-19" });
});
test("resize handles anchor the opposite date and never invert a range", () => {
  const task = { start: "2026-10-12", due: "2026-10-15" };
  assert.deepEqual(calendarDateChange(task, null, "2026-10-20", "start"), { start: "2026-10-15" });
  assert.deepEqual(calendarDateChange(task, null, "2026-10-01", "due"), { due: "2026-10-12" });
  assert.deepEqual(calendarDateChange({ due: "2026-10-15" }, null, "2026-10-17", "due"), { start: "2026-10-15", due: "2026-10-17" });
  assert.deepEqual(calendarDateChange({ start: "2026-10-15" }, null, "2026-10-12", "start"), { start: "2026-10-12", due: "2026-10-15" });
});
test("month segments pack without overlaps and expose only two resize ends", () => {
  const tasks = [{ id: "span", start: "2026-09-29", due: "2026-10-07" }, { id: "overlap", due: "2026-10-02" }, { id: "weekend", start: "2026-10-03", due: "2026-10-04" }, { id: "start", start: "2026-10-06" }];
  for (const weekends of [true, false]) {
    const weeks = calendarWeeks(tasks, "2026-10-01", weekends);
    assert.equal(weeks.length, 6);
    assert.equal(weeks[0].days.length, weekends ? 7 : 5);
    const segments = weeks.flatMap(w => w.segments);
    assert.equal(segments.filter(s => s.task.id === "span" && s.resizeStart).length, 1);
    assert.equal(segments.filter(s => s.task.id === "span" && s.resizeEnd).length, 1);
    assert.equal(segments.some(s => s.task.id === "weekend"), weekends);
    for (const week of weeks) for (const a of week.segments) for (const b of week.segments)
      if (a !== b && a.lane === b.lane) assert.ok(a.to < b.from || b.to < a.from);
  }
});
test("agenda includes ongoing and start-only cards without duplicating them", () => {
  const tasks = [{ id: "ongoing", start: "2026-09-20", due: "2026-11-01" }, { id: "start", start: "2026-10-20" }, { id: "weekend", due: "2026-10-24" }, { id: "unscheduled" }];
  assert.deepEqual(agendaGroups(tasks, "2026-10-19", "2026-10-25", false).flatMap(([, tasks]) => tasks.map(t => t.id)), ["ongoing", "start"]);
  assert.equal(calendarRange(tasks[3]), null);
  assert.deepEqual(agendaGroups(tasks, "2026-10-24", "2026-10-25", false), []);
});

// Owner request, 30 October 2026: a Week layout shows the anchor's week alone.
test("the week layout holds the anchor's week, with the part of a longer card inside it", () => {
  const tasks = [{ id: "span", start: "2026-10-23", due: "2026-10-28" }, { id: "in", due: "2026-10-30" }, { id: "out", due: "2026-11-03" }];
  const weeks = calendarWeeks(tasks, "2026-10-28", true, { week: true });
  assert.equal(weeks.length, 1);
  assert.deepEqual(weeks[0].days, ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(weeks[0].segments.map((s) => [s.task.id, s.from, s.to]), [["span", 0, 2], ["in", 4, 4]]);
});
