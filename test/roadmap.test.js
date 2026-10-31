// The Roadmap page's short times and durations (owner request T29, 31 October 2026): a date with a
// time shows as "31 Oct 20:05", a bare date as "31 Oct", and an item's "Took" is the time from
// started to done in the shortest useful unit, shown only when both carry a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roadmap, shortWhen, took } from "../public/roadmap.js";

test("short times and durations", () => {
  assert.equal(shortWhen("2026-10-31T20:05"), "31 Oct 20:05");
  assert.equal(shortWhen("2026-10-31"), "31 Oct");
  assert.equal(shortWhen(""), "");
  assert.equal(took("2026-10-31T14:00", "2026-10-31T14:45"), "45m");
  assert.equal(took("2026-10-31T14:00", "2026-10-31T16:15"), "2h 15m");
  assert.equal(took("2026-10-30T22:00", "2026-11-01T01:30"), "1d 3h");
  assert.equal(took("2026-10-31", "2026-10-31T16:15"), "", "no time on one side");
  assert.equal(took("2026-10-31T16:15", ""), "", "not done");
});

test("every roadmap entry has a valid id, status and dates, and done entries name their release", () => {
  const when = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
  for (const item of roadmap) {
    assert.match(item.id, /^T\d+$/, item.id);
    assert.ok(["requested", "in progress", "done"].includes(item.status), item.id);
    for (const key of ["requested", "started", "done"]) if (item[key]) assert.match(item[key], when, `${item.id} ${key}`);
    if (item.status === "done") assert.ok(item.version && item.done, `${item.id} release`);
  }
});
