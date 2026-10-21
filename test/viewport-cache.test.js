import test from "node:test";
import assert from "node:assert/strict";
import { detailLevel, viewportCache } from "../public/viewport-cache.js";
const node = (id, x, y = 0) => ({ id, x, y, w: 80, h: 80 });
const options = (overrides = {}) => ({
  key: "a",
  camera: { x: 0, y: 0, z: 1 },
  width: 800,
  height: 600,
  now: 0,
  ...overrides,
});
test("zoom detail does not thrash at the bitmap boundary and resets per board", () => {
  const level = detailLevel();
  assert.equal(level("a", 0.1), 0);
  for (const z of [0.115, 0.125, 0.119, 0.13]) assert.equal(level("a", z), 0);
  assert.equal(level("a", 0.14), 1);
  for (const z of [0.24, 0.125, 0.115, 0.13]) assert.equal(level("a", z), 1);
  assert.equal(level("a", 0.10), 0);
  assert.equal(level("b", 0.125), 1);
  assert.equal(level("b", 0.42), 2);
  assert.equal(level("b", 0.39), 2);
  assert.equal(level("b", 0.35), 1);
  assert.equal(level("b", 0.5), 2);
  assert.equal(level("b", 0.001), 0);
});
test("viewport preloads neighbours beyond the screen", () => {
  const cache = viewportCache();
  assert.deepEqual(
    cache
      .choose([node("near", 1100), node("far", 2500)], options())
      .map((n) => n.id),
    ["near"],
  );
});
test("recent cards survive fast reversals, then expire when far away", () => {
  const cache = viewportCache(),
    nodes = [node("a", 0), node("b", 4000)];
  cache.choose(nodes, options());
  assert.deepEqual(
    cache
      .choose(nodes, options({ camera: { x: -4000, y: 0, z: 1 }, now: 100 }))
      .map((n) => n.id),
    ["a", "b"],
  );
  assert.deepEqual(
    cache
      .choose(nodes, options({ camera: { x: -4000, y: 0, z: 1 }, now: 1400 }))
      .map((n) => n.id),
    ["b"],
  );
});
test("detail remains bounded and stable across the old density cutoff", () => {
  const cache = viewportCache(),
    nodes = Array.from({ length: 701 }, (_, i) =>
      node(String(i), (i % 25) * 20, Math.floor(i / 25) * 15),
    );
  const first = cache.choose(nodes.slice(0, 699), options());
  const next = cache.choose(nodes, options({ now: 30 }));
  assert.equal(first.length, 650);
  assert.deepEqual(
    next.map((n) => n.id),
    first.map((n) => n.id),
  );
  const selected = cache.choose(
    nodes,
    options({ now: 60, selected: new Set(["700"]) }),
  );
  assert.ok(selected.some((n) => n.id === "700"));
  assert.equal(selected.length, 650);
});
test("hidden, deleted and other-board objects never linger", () => {
  const cache = viewportCache();
  const nodes = [node("a", 0), node("b", 8000)];
  cache.choose(nodes, options());
  assert.equal(
    cache.choose(nodes, options({ now: 1, hidden: new Set(["a"]) })).length,
    0,
  );
  cache.choose(nodes, options());
  assert.equal(cache.choose(nodes.slice(1), options({ now: 2 })).length, 0);
  cache.choose(nodes, options());
  assert.deepEqual(
    cache
      .choose(
        nodes,
        options({ key: "b", camera: { x: -8000, y: 0, z: 1 }, now: 3 }),
      )
      .map((n) => n.id),
    ["b"],
  );
});
