import test from "node:test";
import assert from "node:assert/strict";
import { smoothZoom } from "../public/camera-motion.js";
function fixture(reduced = false) {
  let camera = { x: 10, y: 20, z: 1 },
    time = 0,
    callback = null,
    active = false;
  const control = smoothZoom({
    camera: () => camera,
    apply: (c) => (camera = c),
    changed: (v) => (active = v),
    reduced: () => reduced,
    now: () => time,
    request: (fn) => {
      callback = fn;
      return 1;
    },
    cancelFrame: () => (callback = null),
  });
  return {
    control,
    camera: () => camera,
    active: () => active,
    tick: () => {
      time += 16;
      const fn = callback;
      callback = null;
      fn?.(time);
    },
    finish() {
      for (let i = 0; i < 100 && active; i++) this.tick();
    },
  };
}
test("zoom eases through intermediate scales, accumulates input and preserves its pointer anchor", () => {
  const f = fixture();
  f.control.zoom(1.2, 400, 300);
  f.tick();
  assert.ok(f.camera().z > 1 && f.camera().z < 1.2);
  f.control.zoom(1.2, 400, 300);
  f.finish();
  assert.equal(f.camera().z, 1.44);
  assert.ok(Math.abs((400 - f.camera().x) / f.camera().z - 390) < 1e-8);
  assert.ok(Math.abs((300 - f.camera().y) / f.camera().z - 280) < 1e-8);
  assert.equal(f.active(), false);
});
test("zoom respects bounds, cancellation and reduced motion", () => {
  const f = fixture();
  f.control.zoom(100, 100, 100);
  f.finish();
  assert.equal(f.camera().z, 3);
  f.control.zoom(0.0001, 100, 100);
  f.finish();
  assert.equal(f.camera().z, 0.15);
  f.control.zoom(2, 100, 100);
  f.tick();
  f.control.cancel();
  const stopped = f.camera();
  f.tick();
  assert.deepEqual(f.camera(), stopped);
  const r = fixture(true);
  r.control.zoom(2, 100, 100);
  assert.equal(r.camera().z, 2);
  assert.equal(r.active(), false);
});
