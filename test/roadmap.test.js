// The Roadmap page's short times and durations (owner request T29, 31 October 2026): a date with a
// time shows as "31 Oct 20:05", a bare date as "31 Oct", and an item's "Took" is the time from
// started to done in the shortest useful unit, shown only when both carry a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roadmap, shortWhen, took, recordedTime, fullWhen } from "../public/roadmap.js";

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

test('recorded timestamps show London time and durations use the actual instants', () => {
  assert.equal(shortWhen('2026-11-03T16:37:39.240Z'), '3 Nov 16:37');
  assert.equal(shortWhen('2026-07-01T23:30:00Z'), '2 Jul 00:30');
  assert.equal(shortWhen('2026-11-03T19:37:00+03:00'), '3 Nov 16:37');
  assert.match(fullWhen('2026-11-03T16:37:39.240Z'), /3 November 2026.*16:37:39.*GMT/);
  assert.match(fullWhen('2026-10-31'), /time not recorded/i);
  assert.equal(took('2026-11-03T16:37:39Z', '2026-11-03T16:51:59Z'), '14m');
  assert.equal(took('2026-11-03T16:37:39Z', '2026-11-03T16:38:00Z'), '<1m');
  assert.equal(took('2026-11-03T16:37:39Z', '2026-11-03T16:37:39Z'), '<1m');
  assert.equal(took('2026-11-03T16:37:39Z', '2026-11-03T16:38:39Z'), '1m');
  assert.equal(took('2026-10-25T01:30:00+01:00', '2026-10-25T01:30:00Z'), '1h');
  for (const invalid of ['nonsense', '2026-13-01T12:30', '2026-02-30T12:30', '2026-11-03T25:00', '2026-11-03T24:00', '2026-11-03T16:60', '2026-11-03T16:37:60']) {
    assert.equal(recordedTime(invalid), null);
    assert.equal(shortWhen(invalid), '');
    assert.equal(took(invalid, '2026-11-03T16:00'), '');
  }
  assert.equal(recordedTime('2026-11-03'), null, 'a date is not a recorded midnight timestamp');
  assert.equal(took('2026-11-03T17:00', '2026-11-03T16:00'), '', 'invalid order is not zero work');
});

test('numbered feature history has recovered timestamps, durations and primary model settings', () => {
  for (const item of roadmap.filter(i => i.id.startsWith('F0.21-'))) {
    // Queued work is listed when requested; started and done follow as it progresses.
    if (item.status !== 'done') { assert.notEqual(recordedTime(item.requested), null, `${item.id} requested`); continue; }
    for (const key of ['requested', 'started', 'done']) assert.notEqual(recordedTime(item[key]), null, `${item.id} ${key}`);
    assert.ok(took(item.started, item.done), `${item.id} elapsed time`);
    assert.ok(item.model && item.effort, `${item.id} primary model and effort`);
    assert.ok(recordedTime(item.requested) <= recordedTime(item.started), `${item.id} requested before started`);
    assert.ok(recordedTime(item.started) <= recordedTime(item.done), `${item.id} started before done`);
  }
});

test('older backfills use actual coding responses, leaving models unknown across missing session logs', () => {
  for (let n = 101; n <= 113; n++) {
    const item = roadmap.find(i => i.id === `T${n}`);
    assert.notEqual(recordedTime(item.requested), null, `${item.id} request or discovered follow-up`);
    assert.notEqual(recordedTime(item.started), null, `${item.id} recorded response`);
    assert.ok(took(item.started, item.done), `${item.id} elapsed time`);
    assert.ok(item.model && item.effort, `${item.id} primary model settings`);
    assert.equal(item.modelBasis, 'recorded coding response');
  }
  for (const item of roadmap.filter(i => /^T\d+$/.test(i.id) && +i.id.slice(1) < 101)) {
    assert.equal(item.model, undefined, `${item.id}: an old setting before a logging gap does not establish the coding model`);
    assert.equal(item.effort, undefined, `${item.id}: keep unrecorded effort unknown`);
  }
});

test("every roadmap entry has a valid id, status and dates, and done entries name their release", () => {
  const when = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  const ids = new Set();
  for (const item of roadmap) {
    assert.ok(!ids.has(item.id), `duplicate feature ${item.id}`);
    ids.add(item.id);
    const feature = item.id.match(/^F(\d+)\.(\d+)-([1-9]\d?|100)$/);
    if (feature) {
      const [, major, minor, number] = feature.map(Number);
      // Its own number's release, or a later one that shipped it with others in one run (F0.21-94).
      const own = `${major}.${minor + Math.floor(number / 100)}.${number % 100}`;
      if (item.version && item.version !== own) {
        assert.ok(item.version.localeCompare(own, undefined, { numeric: true }) > 0, `${item.id}: ${item.version} is before its own ${own}`);
        const [vMajor, vMinor, vPatch] = item.version.split(".").map(Number);
        const numbered = vPatch === 0 ? `F${vMajor}.${vMinor - 1}-100` : `F${vMajor}.${vMinor}-${vPatch}`;
        assert.ok(roadmap.some((other) => other.id === numbered && other.version === item.version), `${item.id}: ${item.version} ships ${numbered} too`);
      }
    } else {
      assert.match(item.id, /^T\d+$/, item.id);
      assert.ok(item.version && item.version.localeCompare("0.21.0", undefined, { numeric: true }) <= 0, `${item.id}: new features use F<major>.<minor>-<1..100>`);
    }
    assert.ok(["requested", "in progress", "done"].includes(item.status), item.id);
    for (const key of ["requested", "started", "done"]) if (item[key]) assert.match(item[key], when, `${item.id} ${key}`);
    if (item.status === "done") assert.ok(item.version && item.done, `${item.id} release`);
  }
});
