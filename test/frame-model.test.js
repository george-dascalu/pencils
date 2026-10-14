import test from "node:test";
import assert from "node:assert/strict";
import {
  withFrameContents,
  frameContents,
  fitFrame,
  adoptFrameContents,
  updateFrameMembership,
  frameSlides,
  reorderFrame,
  framePaintOrder,
} from "../public/frame-model.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
const fixture = () => [
  { id: "outer", type: "frame", x: 0, y: 0, w: 800, h: 600, text: "Outer" },
  {
    id: "inner",
    type: "frame",
    frame: "outer",
    x: 100,
    y: 100,
    w: 400,
    h: 300,
    text: "Inner",
  },
  {
    id: "note",
    type: "sticky",
    frame: "inner",
    x: 120,
    y: 160,
    w: 180,
    h: 100,
    text: "Idea",
  },
  { id: "other", type: "frame", x: 900, y: 0, w: 700, h: 600, text: "Other" },
];
test("frame selection includes nested contents exactly once, including locked items", () => {
  const nodes = fixture();
  nodes[2].locked = true;
  assert.deepEqual(
    withFrameContents(nodes, [nodes[0], nodes[1]]).map((n) => n.id),
    ["outer", "inner", "note"],
  );
  assert.deepEqual(
    frameContents(nodes, nodes[1]).map((n) => n.id),
    ["note"],
  );
});
test("drawing and resizing adopt contents without flattening nested frames", () => {
  const nodes = fixture();
  const f = { id: "new", type: "frame", x: 50, y: 50, w: 500, h: 400 };
  nodes.push(f);
  adoptFrameContents(nodes, f);
  assert.equal(nodes[1].frame, "new");
  assert.equal(nodes[2].frame, "inner");
  f.w = 200;
  adoptFrameContents(nodes, f);
  assert.equal(nodes[1].frame, undefined);
});
test("dragging into, between and out of frames updates membership; carried children stay attached", () => {
  const nodes = fixture(),
    before = structuredClone(nodes);
  nodes[2].x = 950;
  updateFrameMembership(nodes, new Set(["note"]), before);
  assert.equal(nodes[2].frame, "other");
  const next = structuredClone(nodes);
  nodes[2].x = 1800;
  updateFrameMembership(nodes, new Set(["note"]), next);
  assert.equal(nodes[2].frame, undefined);
  const carried = fixture(),
    original = structuredClone(carried);
  carried.slice(0, 3).forEach((n) => (n.x += 30));
  updateFrameMembership(carried, new Set(["outer", "inner", "note"]), original);
  assert.equal(carried[1].frame, "outer");
  assert.equal(carried[2].frame, "inner");
});
test("fit changes only the frame bounds; presentation order excludes nested frames", () => {
  const nodes = fixture(),
    before = structuredClone(nodes.slice(1)),
    board = { nodes, presentation: ["inner", "other", "outer", "missing"] };
  assert.ok(fitFrame(nodes, nodes[0]));
  assert.deepEqual(nodes.slice(1), before);
  assert.deepEqual(frameSlides(board), ["other", "outer"]);
  assert.ok(reorderFrame(board, "outer", "other"));
  assert.deepEqual(board.presentation, ["outer", "other"]);
  assert.equal(reorderFrame(board, "inner", "outer"), false);
  assert.deepEqual(
    framePaintOrder([nodes[2], nodes[1], nodes[0]]).map((n) => n.id),
    ["outer", "inner", "note"],
  );
});
test("native Canvas roundtrip retains frames, nesting, dimensions, colours and slide order", () => {
  const board = {
    id: "board",
    project: "project",
    title: "Frames",
    nodes: fixture(),
    edges: [],
    presentation: ["other", "outer"],
  };
  board.nodes[0].color = "#f1a9a0";
  board.nodes[0].collapsed = true;
  const restored = decodeCanvas(encodeCanvas(board), "project");
  for (const n of board.nodes) {
    const actual = restored.nodes.find((x) => x.id === n.id);
    for (const key of [
      "type",
      "frame",
      "x",
      "y",
      "w",
      "h",
      "text",
      "color",
      "collapsed",
    ])
      assert.equal(actual[key], n[key]);
  }
  assert.deepEqual(restored.presentation, board.presentation);
});
