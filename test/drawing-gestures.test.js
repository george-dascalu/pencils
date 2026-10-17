import test from "node:test";
import assert from "node:assert/strict";
import {
  gestureDefaults,
  normaliseGestures,
  tapGestures,
} from "../public/drawing-gestures.js";
const e = (id, time, x = 100, y = 100) => ({
  pointerId: id,
  timeStamp: time,
  clientX: x,
  clientY: y,
});
test("drawing gesture preferences reject unknown actions and retain valid choices", () => {
  assert.deepEqual(normaliseGestures(null), gestureDefaults);
  assert.deepEqual(
    normaliseGestures({
      doubleTap: "bad",
      twoFingerTap: "redo",
      penButton: "none",
    }),
    { ...gestureDefaults, twoFingerTap: "redo", penButton: "none" },
  );
});
test("double tap requires two short taps near the same target", () => {
  const g = tapGestures();
  g.down(e(1, 0), "note");
  assert.equal(g.up(e(1, 50)), null);
  g.down(e(2, 150, 104), "note");
  assert.equal(g.up(e(2, 200, 104)), "doubleTap");
  g.down(e(3, 250));
  assert.equal(g.up(e(3, 300)), null);
  g.down(e(4, 400), "note");
  assert.equal(g.up(e(4, 450)), null);
});
test("two-finger tap fires once after both contacts lift in either order", () => {
  for (const order of [
    [1, 2],
    [2, 1],
  ]) {
    const g = tapGestures();
    g.down(e(1, 0));
    g.down(e(2, 30));
    assert.equal(g.up(e(order[0], 70)), null);
    assert.equal(g.up(e(order[1], 100)), "twoFingerTap");
    assert.equal(g.up(e(order[1], 110)), null);
  }
});
test("panning, pinching, long presses, third fingers and cancellations never fire shortcuts", () => {
  for (const invalidate of [
    (g) => g.move(e(1, 50, 120)),
    (g) => {
      g.move(e(1, 50, 120));
      g.move(e(1, 70));
    },
    (g) => {
      g.down(e(3, 40));
      g.up(e(3, 70));
    },
    (g) => g.up(e(1, 60), true),
  ]) {
    const g = tapGestures();
    g.down(e(1, 0));
    g.down(e(2, 20));
    invalidate(g);
    assert.equal(g.up(e(1, 100)), null);
    assert.equal(g.up(e(2, 120)), null);
  }
  const g = tapGestures();
  g.down(e(1, 0));
  g.down(e(2, 20));
  assert.equal(g.up(e(1, 400)), null);
  assert.equal(g.up(e(2, 450)), null);
});
test("reset and late second contacts cannot become accidental taps", () => {
  const g = tapGestures();
  g.down(e(1, 0));
  g.up(e(1, 20));
  g.reset();
  g.down(e(2, 100));
  assert.equal(g.up(e(2, 120)), null);
  g.down(e(3, 200));
  g.down(e(4, 400));
  assert.equal(g.up(e(3, 420)), null);
  assert.equal(g.up(e(4, 450)), null);
});
