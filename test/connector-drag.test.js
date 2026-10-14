import test from "node:test";
import assert from "node:assert/strict";
import { connectorTarget, connectorPreview } from "../public/connector-drag.js";
import { routeEdge } from "../public/canvas-geometry.js";
const source = { id: "a", x: 0, y: 0, w: 200, h: 200 };
const target = { id: "b", x: 400, y: 0, w: 200, h: 200 };
test("nearby ports and magnet radius use screen pixels at every zoom", () => {
  for (const zoom of [0.15, 0.5, 1, 3]) {
    const hit = (distance) =>
      connectorTarget({ x: 400 - distance / zoom, y: 100 }, [source, target], {
        from: "a",
        zoom,
      });
    assert.equal(hit(18).target.node.id, "b");
    assert.equal(hit(18).target.side, "left");
    assert.equal(hit(30).target, null);
    assert.equal(hit(30).nearby.length, 1);
    assert.equal(hit(50).nearby.length, 0);
  }
});
test("target discovery ignores source, locked and collapsed-away objects and supports bypass", () => {
  const nodes = [
    source,
    target,
    { ...target, id: "locked", locked: true },
    { ...target, id: "hidden" },
  ];
  const options = { from: "a", hidden: new Set(["hidden"]) };
  const hit = connectorTarget({ x: 400, y: 100 }, nodes, options);
  assert.deepEqual(
    hit.nearby.map((n) => n.node.id),
    ["b"],
  );
  assert.equal(
    connectorTarget({ x: 400, y: 100 }, nodes, { ...options, bypass: true })
      .target,
    null,
  );
  assert.equal(
    connectorTarget({ x: 490, y: 10 }, nodes, options).target.side,
    "top",
  );
});
test("preview matches the saved curve and preserves direction during start reattachment", () => {
  const hit = { node: target, side: "left" };
  assert.deepEqual(
    connectorPreview(source, "right", {}, hit),
    routeEdge(
      { fromSide: "right", toSide: "left", routing: "curve" },
      source,
      target,
    ),
  );
  assert.match(connectorPreview(source, "right", { x: 300, y: 400 }).d, / C/);
  const reversed = connectorPreview(
    target,
    "left",
    {},
    { node: source, side: "right" },
    {},
    "from",
  );
  assert.deepEqual(
    reversed,
    routeEdge(
      { fromSide: "right", toSide: "left", routing: "curve" },
      source,
      target,
    ),
  );
});
