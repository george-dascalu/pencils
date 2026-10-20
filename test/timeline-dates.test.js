import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY,
  timelineAxis,
  timelineHeader,
  weekTitle,
  weekStart,
  isWeekend,
  validTimelineRange,
  timelineBarBounds,
} from "../public/timeline-dates.js";

test("Timeline weekdays compress weekends, retain inclusive ends and invert positions across DST and year boundaries", () => {
  for (const origin of ["2026-10-19", "2024-02-26", "2026-12-28"]) {
    const axis = timelineAxis(origin, 42, false);
    let visible = 0;
    for (let days = 0; days < 42; days++) {
      const date = new Date(Date.parse(origin) + days * DAY)
        .toISOString()
        .slice(0, 10);
      assert.equal(axis.x(date), visible * 42);
      if (!isWeekend(date)) {
        assert.equal(axis.dateAt(visible * 42 + 20), date);
        visible++;
      }
      assert.equal(axis.end(date), visible * 42);
    }
  }
  const axis = timelineAxis("2026-10-19", 42, false);
  assert.equal(axis.end("2026-10-25") - axis.x("2026-10-24"), 0);
  assert.equal(timelineAxis("2026-10-19", 42, true).end("2026-10-25"), 294);
});

test("Custom timeline ranges use inclusive bounds, clip bars and preserve Monday week labels", () => {
  assert.ok(validTimelineRange({ start: "2026-10-20", end: "2026-10-20" }));
  for (const range of [null, { start: "2026-02-30", end: "2026-03-01" }, { start: "2026-10-22", end: "2026-10-20" }, { start: "2026-01-01", end: "2040-01-01" }]) assert.equal(validTimelineRange(range), false);
  const range = { start: "2026-10-20", end: "2026-10-27" }, axis = timelineAxis(range.start, 40, true);
  assert.deepEqual(timelineBarBounds(axis, "2026-10-19", "2026-10-22", 320, range), { left: 0, width: 120, outside: false, clippedStart: true, clippedEnd: false });
  assert.equal(timelineBarBounds(axis, "2026-10-28", "2026-10-30", 320, range).outside, true);
  assert.equal(timelineBarBounds(axis, "2026-10-23", "2026-10-30", 320, range).width, 200);
  const header = timelineHeader(range.start, 40, true, "week", 320, range.end);
  assert.deepEqual(header.ticks.map(t => t.date), ["2026-10-19", "2026-10-26"]);
  assert.equal(header.ticks[0].left, 0);
  assert.equal(header.ticks[0].width, 240);
  assert.ok(header.ticks.every(t => t.left + t.width <= 320));
});
test("Visible-day movements skip weekends in both directions and leave zero movements untouched", () => {
  const axis = timelineAxis("2026-10-19", 42, false);
  assert.equal(axis.shift("2026-10-23", 1), "2026-10-26");
  assert.equal(axis.shift("2026-10-26", -1), "2026-10-23");
  assert.equal(axis.shift("2026-10-24", 1), "2026-10-26");
  assert.equal(axis.shift("2026-10-25", -1), "2026-10-23");
  assert.equal(axis.shift("2026-10-25", 0), "2026-10-25");
  assert.equal(axis.shift("2026-10-23", 6), "2026-11-02");
});
test("Month bands follow actual boundaries, weekly labels use Mondays and ISO week ranges", () => {
  const origin = weekStart("2026-09-23");
  for (const show of [true, false]) {
    const axis = timelineAxis(origin, 16, show);
    const header = timelineHeader(origin, 16, show, "week", 1500);
    assert.equal(header.months[0].label, "Sept");
    assert.equal(header.months[1].left, axis.x("2026-10-01"));
    assert.equal(
      header.months[1].width,
      axis.x("2026-11-01") - axis.x("2026-10-01"),
    );
    assert.ok(header.ticks.every((t) => new Date(t.date).getUTCDay() === 1));
    assert.equal(
      header.ticks.find((t) => t.date === "2026-10-05").title,
      "Week 41 05/10/2026 to 11/10/2026",
    );
  }
  assert.equal(weekTitle("2027-01-01"), "Week 53 28/12/2026 to 03/01/2027");
  assert.equal(weekTitle("2027-01-04"), "Week 1 04/01/2027 to 10/01/2027");
});
test("Day headers omit weekends while keeping exact dates and month headers use real weeks", () => {
  const hidden = timelineHeader(
    Date.parse("2026-10-19"),
    42,
    false,
    "day",
    500,
  );
  assert.deepEqual(
    hidden.ticks.slice(0, 6).map((t) => t.date),
    [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-26",
    ],
  );
  assert.ok(hidden.ticks.every((t) => !isWeekend(t.date)));
  const month = timelineHeader(Date.parse("2026-12-28"), 4, true, "month", 500);
  assert.ok(month.months.some((m) => m.label === "Jan 2027"));
  assert.ok(month.ticks.every((t) => new Date(t.date).getUTCDay() === 1));
});
