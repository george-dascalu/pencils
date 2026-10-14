import test from "node:test";
import assert from "node:assert/strict";
import {
  makeStroke,
  strokeMarkup,
  hitsStroke,
  setStrokeWidth,
} from "../public/pen-model.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
test("Increasing ink thickness preserves world points and pads the stroke bounds", () => {
  const n = makeStroke(
    [
      { x: 100, y: 100 },
      { x: 150, y: 120 },
    ],
    { strokeWidth: 1 },
    "ink",
  );
  const world = () => n.points.map(([x, y]) => [x + n.x, y + n.y]);
  const before = world();
  setStrokeWidth(n, 32);
  assert.deepEqual(world(), before);
  assert.equal(n.strokeWidth, 32);
  for (const [x, y] of n.points) {
    assert.ok(x >= 23 && y >= 23);
    assert.ok(n.w - x >= 23 && n.h - y >= 23);
  }
});
test("Pen strokes retain pressure and bounds with dot support and smooth paths", () => {
  const n = makeStroke(
    [
      { x: 100, y: 100, pressure: 0.1 },
      { x: 130, y: 120, pressure: 0.8 },
      { x: 160, y: 110, pressure: 0.5 },
    ],
    { color: "#b64087", strokeWidth: 8, pressure: true },
    "ink",
  );
  assert.deepEqual(n.pressures, [0.1, 0.8, 0.5]);
  assert.ok(n.x < 100 && n.y < 100);
  assert.ok(n.x + n.w > 160);
  const svg = strokeMarkup(n);
  assert.match(svg, / Q/);
  assert.match(svg, /stroke-width="3.52"/);
  assert.match(svg, /stroke-width="8.56"/);
  const dot = makeStroke([{ x: 5, y: 7 }], { strokeWidth: 3 }, "dot");
  assert.match(strokeMarkup(dot), /<circle/);
});
test("Highlighter uses a single opacity layer and preserves style in Canvas files", () => {
  const n = makeStroke(
    [
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 90, y: 10 },
    ],
    { brush: "highlighter", strokeWidth: 18, opacity: 0.32, color: "#f4cb48" },
    "ink",
  );
  const svg = strokeMarkup(n);
  assert.equal((svg.match(/opacity=/g) || []).length, 1);
  assert.match(svg, /opacity="0.32"/);
  assert.equal((svg.match(/<path/g) || []).length, 1);
  const decoded = decodeCanvas(
    encodeCanvas({ project: "p-test", nodes: [n], edges: [] }),
  ).nodes[0];
  for (const k of [
    "points",
    "pressures",
    "strokeWidth",
    "brush",
    "opacity",
    "pressure",
  ])
    assert.deepEqual(decoded[k], n[k]);
});
test("Eraser hits strokes crossed between samples, not empty bounds or locked objects", () => {
  const n = makeStroke(
    [
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ],
    { strokeWidth: 3 },
    "ink",
  );
  assert.ok(hitsStroke(n, { x: 150, y: 250 }, { x: 250, y: 150 }, 5));
  assert.equal(hitsStroke(n, { x: 100, y: 290 }, { x: 110, y: 290 }, 5), false);
  assert.equal(
    hitsStroke(
      { ...n, locked: true },
      { x: 100, y: 100 },
      { x: 300, y: 300 },
      5,
    ),
    false,
  );
  assert.equal(
    hitsStroke(
      { ...n, type: "sticky" },
      { x: 100, y: 100 },
      { x: 300, y: 300 },
      5,
    ),
    false,
  );
  const dot = makeStroke([{ x: 20, y: 20 }], {}, "dot");
  assert.ok(hitsStroke(dot, { x: 10, y: 20 }, { x: 30, y: 20 }, 2));
});
