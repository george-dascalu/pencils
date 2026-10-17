import { test } from "node:test";
import assert from "node:assert/strict";
import { smoothInk } from "../public/ink-smoothing.js";
import { makeStroke } from "../public/pen-model.js";
test("adaptive ink keeps settled samples stable and preserves original pressure/time/tilt", () => {
  const points = [
    { x: 0, y: 0, time: 1, pressure: 0.2, tiltX: 20 },
    { x: 1, y: 1, time: 10, pressure: 0.4 },
    { x: 2, y: 0, time: 20, pressure: 0.8 },
  ];
  const before = structuredClone(smoothInk(points));
  points.push({ x: 100, y: 0, time: 21, pressure: 0.9 });
  const after = smoothInk(points);
  assert.deepEqual(after.slice(0, 3), before);
  assert.ok(after[3].x > 99);
  const stroke = makeStroke(points, {}, "ink");
  assert.equal(stroke.rawPoints.length, 4);
  assert.deepEqual(stroke.pressures, [0.2, 0.4, 0.8, 0.9]);
  assert.deepEqual(stroke.sampleTimes, [0, 9, 19, 20]);
  assert.deepEqual(stroke.tilts[0], [20, 0]);
  assert.notDeepEqual(stroke.points, stroke.rawPoints);
  assert.equal(smoothInk(points, 0), points);
});
