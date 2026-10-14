import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeSelection } from "../public/selection-arrange.js";
const fixture = () => ({
  nodes: [
    { id: "a", x: 0, y: 10, w: 100, h: 50 },
    { id: "b", x: 200, y: 100, w: 60, h: 100 },
    { id: "c", x: 500, y: 500, w: 100, h: 50 },
  ],
});
test("alignment respects unequal dimensions and locked anchors", () => {
  for (const [action, value] of [
    ["align-left", (n) => n.x],
    ["align-center", (n) => n.x + n.w / 2],
    ["align-right", (n) => n.x + n.w],
    ["align-top", (n) => n.y],
    ["align-middle", (n) => n.y + n.h / 2],
    ["align-bottom", (n) => n.y + n.h],
  ]) {
    const b = fixture();
    arrangeSelection(b, b.nodes, action);
    assert.ok(
      b.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    );
    assert.equal(new Set(b.nodes.map(value)).size, 1, action);
  }
  const b = fixture();
  b.nodes[0].locked = true;
  arrangeSelection(b, b.nodes, "align-bottom");
  assert.equal(b.nodes[0].y, 10);
  assert.equal(b.nodes[1].y + b.nodes[1].h, 550);
});
test("distribution uses equal gaps and preserves outer bounds on both axes", () => {
  for (const [action, axis, size] of [
    ["distribute", "x", "w"],
    ["distribute-vertical", "y", "h"],
  ]) {
    const b = fixture();
    const start = b.nodes[0][axis],
      end = b.nodes[2][axis] + b.nodes[2][size];
    arrangeSelection(b, b.nodes, action);
    assert.equal(b.nodes[0][axis], start);
    assert.equal(b.nodes[2][axis] + b.nodes[2][size], end);
    assert.equal(
      b.nodes[1][axis] - b.nodes[0][axis] - b.nodes[0][size],
      b.nodes[2][axis] - b.nodes[1][axis] - b.nodes[1][size],
    );
  }
});
test("arranged frames carry nested contents while locked objects and layer ordering remain intact", () => {
  const b = {
    nodes: [
      { id: "f", type: "frame", x: 0, y: 0, w: 100, h: 100 },
      { id: "nested", type: "frame", frame: "f", x: 10, y: 10, w: 60, h: 60 },
      { id: "child", frame: "nested", x: 20, y: 20, w: 20, h: 20 },
      { id: "locked", frame: "f", locked: true, x: 40, y: 40, w: 10, h: 10 },
      { id: "other", x: 500, y: 200, w: 100, h: 100 },
    ],
  };
  arrangeSelection(b, [b.nodes[0], b.nodes[4]], "align-right");
  assert.equal(b.nodes[1].x, 510);
  assert.equal(b.nodes[2].x, 520);
  assert.equal(b.nodes[3].x, 40);
  arrangeSelection(b, [b.nodes[0], b.nodes[1]], "bring-front");
  assert.deepEqual(
    b.nodes.map((n) => n.id),
    ["child", "locked", "other", "f", "nested"],
  );
  arrangeSelection(b, [b.nodes[3], b.nodes[4]], "send-back");
  assert.deepEqual(
    b.nodes.map((n) => n.id),
    ["f", "nested", "child", "locked", "other"],
  );
});
