import { trackDropIndex } from "../public/grid-reorder.js";
import { mergeGrid } from "../public/grid-merge.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  newGrid,
  cellBounds,
  moveGridTrack,
  movedTrackIndex,
  editGrid,
  resizeGrid,
} from "../public/grid-model.js";
import {
  updateFrameMembership,
  withFrameContents,
  reflowGridContents,
  adoptFrameContents,
} from "../public/frame-model.js";
import { frameParents } from "../public/canvas-geometry.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
const fixture = () => [
  { id: "g", type: "grid", x: 100, y: 100, w: 540, h: 312, grid: newGrid() },
  { id: "n", type: "sticky", x: 110, y: 130, w: 200, h: 120, text: "Keep me" },
  { id: "f", type: "frame", x: 0, y: 0, w: 1500, h: 1500 },
];
test("Dropping objects expands the cell, carries existing contents and preserves nested frame ownership", () => {
  const nodes = fixture(),
    before = structuredClone(nodes),
    [g, n, f] = nodes;
  updateFrameMembership(nodes, new Set(["n"]), before);
  assert.equal(n.frame, "g");
  assert.deepEqual(n.gridCell, { row: 0, column: 0 });
  assert.equal(g.grid.columns[0], 232);
  assert.equal(g.grid.rows[0], 152);
  const cell = cellBounds(g, 0, 0);
  assert.ok(n.x >= cell.x + 16 && n.y >= cell.y + 16);
  assert.ok(n.x + n.w <= cell.x + cell.w - 16);
  adoptFrameContents(nodes, f);
  assert.equal(g.frame, "f");
  assert.equal(n.frame, "g");
  assert.deepEqual(
    withFrameContents(nodes, [f]).map((n) => n.id),
    ["g", "n", "f"],
  );
  const decoded = decodeCanvas(
    encodeCanvas({ project: "p-test", nodes, edges: [] }),
  );
  assert.deepEqual(decoded.nodes.find((n) => n.id === "n").gridCell, {
    row: 0,
    column: 0,
  });
});
test("Reordering rows and columns keeps cell content, style and contained objects together", () => {
  const nodes = fixture(),
    [g, n] = nodes;
  updateFrameMembership(nodes, new Set(["n"]), structuredClone(nodes));
  g.grid.cells[0][0] = { text: "Hello", color: "#123456" };
  for (const axis of ["rows", "columns"]) {
    const before = structuredClone(nodes),
      coord = axis === "rows" ? "row" : "column";
    moveGridTrack(g, axis, 0, 2);
    reflowGridContents(nodes, g, before, (c) => ({
      ...c,
      [coord]: movedTrackIndex(c[coord], 0, 2),
    }));
    assert.equal(n.gridCell[coord], 2);
  }
  assert.equal(g.grid.cells[2][2].text, "Hello");
  assert.equal(g.grid.cells[2][2].color, "#123456");
  const box = cellBounds(g, 2, 2);
  assert.ok(n.x >= box.x && n.y >= box.y);
  const before = structuredClone(nodes);
  editGrid(g, "rows", "remove", 2);
  reflowGridContents(nodes, g, before, (c) => (c.row === 2 ? null : c));
  assert.equal(n.frame, undefined);
  assert.equal(n.gridCell, undefined);
  assert.equal(n.text, "Keep me");
});
test("Resizing grids retains object size and minimum cell space; dragging out detaches; cycles cannot form", () => {
  const nodes = fixture(),
    [g, n, f] = nodes;
  updateFrameMembership(nodes, new Set(["n"]), structuredClone(nodes));
  const before = structuredClone(nodes);
  g.w = 100;
  g.h = 100;
  reflowGridContents(nodes, g, before);
  assert.equal(n.w, 200);
  assert.equal(n.h, 120);
  assert.ok(cellBounds(g, 0, 0).w >= 232);
  const prior = structuredClone(nodes);
  n.x = 1000;
  n.y = 900;
  updateFrameMembership(nodes, new Set(["n"]), prior);
  assert.equal(n.frame, "f");
  assert.equal(n.gridCell, undefined);
  g.frame = "f";
  const old = structuredClone(nodes);
  f.x = 150;
  f.y = 150;
  f.w = 200;
  f.h = 150;
  updateFrameMembership(nodes, new Set(["f"]), old);
  assert.notEqual(f.frame, "g");
  const parents = frameParents(nodes);
  let p = g.id,
    seen = new Set();
  while (p) {
    assert.ok(!seen.has(p));
    seen.add(p);
    p = parents.get(p);
  }
});

test("Duplicated grids retain their copied children without nesting inside the source", () => {
  const nodes = fixture(),
    [g, n] = nodes;
  updateFrameMembership(nodes, new Set(["n"]), structuredClone(nodes));
  const before = structuredClone(nodes),
    copy = structuredClone(g),
    child = structuredClone(n);
  copy.id = "copy";
  copy.x += 40;
  copy.y += 40;
  child.id = "child-copy";
  child.frame = "copy";
  child.x += 40;
  child.y += 40;
  nodes.push(copy, child);
  updateFrameMembership(nodes, new Set(["copy", "child-copy"]), before);
  assert.notEqual(copy.frame, "g");
  assert.equal(child.frame, "copy");
  assert.equal(g.w, before[0].w);
});

test("Canvas external grid text edits detach children without losing object data", () => {
  const nodes = fixture();
  updateFrameMembership(nodes, new Set(["n"]), structuredClone(nodes));
  const encoded = encodeCanvas({ project: "p-test", nodes, edges: [] });
  encoded.nodes.find((n) => n.id === "g").text = "External edit";
  const n = decodeCanvas(encoded).nodes.find((n) => n.id === "n");
  assert.equal(n.frame, undefined);
  assert.equal(n.gridCell, undefined);
  assert.equal(n.text, "Keep me");
});

test("Server persists cell membership, rejects invalid/cyclic parents, and undoes reordered metadata and rounded geometry", async () => {
  const { Store } = await import("../server/store.js"),
    fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-cell-model-")),
    store = new Store(dir);
  try {
    await store.init();
    const p = await store.createProject({ title: "Containment" });
    let b = (await store.snapshot(p.id)).boards[0];
    const nodes = fixture();
    updateFrameMembership(nodes, new Set(["n"]), structuredClone(nodes));
    b = await store.updateBoard(p.id, b.id, {
      revision: b.revision,
      nodes,
      edges: [],
      operationId: "op-grid",
    });
    assert.equal(b.nodes.find((n) => n.id === "n").frame, "g");
    const invalid = structuredClone(b.nodes);
    invalid.find((n) => n.id === "n").gridCell.row = 90;
    await assert.rejects(
      store.updateBoard(p.id, b.id, { revision: b.revision, nodes: invalid }),
      /grid cell/,
    );
    const cycle = structuredClone(b.nodes);
    cycle[0].frame = "f";
    cycle[2].frame = "g";
    cycle[2].gridCell = { row: 0, column: 0 };
    await assert.rejects(
      store.updateBoard(p.id, b.id, { revision: b.revision, nodes: cycle }),
      /hierarchy/,
    );
    let changed = structuredClone(b.nodes);
    changed[0].x += 0.4;
    changed[1].x += 10.7;
    b = await store.updateBoard(p.id, b.id, {
      revision: b.revision,
      nodes: changed,
      operationId: "op-fraction",
    });
    b = await store.undoBoard(p.id, b.id, {
      operation: "op-fraction",
      operationId: "undo-fraction",
    });
    assert.equal(b.nodes.find((n) => n.id === "n").x, nodes[1].x);
    b = await store.undoBoard(p.id, b.id, {
      operation: "op-grid",
      operationId: "undo-grid",
    });
    assert.equal(b.nodes.length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Resizing cell borders shifts later contents and preserves child dimensions", () => {
  const nodes = fixture(),
    [g, n] = nodes;
  n.w = 120;
  n.h = 60;
  n.frame = g.id;
  n.gridCell = { row: 1, column: 1 };
  const box = cellBounds(g, 1, 1);
  n.x = box.x + 16;
  n.y = box.y + 16;
  const before = structuredClone(nodes);
  resizeGrid(g, before[0], "columns", 0, 70, undefined, before);
  reflowGridContents(nodes, g, before);
  assert.equal(n.x, before[1].x + 70);
  assert.equal(n.y, before[1].y);
  assert.equal(n.w, 120);
  assert.equal(n.h, 60);
  resizeGrid(g, before[0], "columns", 1, -500, undefined, before);
  reflowGridContents(nodes, g, before);
  assert.equal(g.grid.columns[1], 152);
  assert.equal(n.x + n.w + 16, g.x + g.grid.columns[0] + g.grid.columns[1]);
});

test("Reordering crosses track centres and preserves unequal track sizes", () => {
  const sizes = [200, 80, 140];
  assert.equal(trackDropIndex(sizes, 0, 0), 0);
  assert.equal(trackDropIndex(sizes, 0, 139), 0);
  assert.equal(trackDropIndex(sizes, 0, 140), 1);
  assert.equal(trackDropIndex(sizes, 0, 250), 2);
  assert.equal(trackDropIndex(sizes, 2, -251), 0);
  assert.equal(trackDropIndex(sizes, 1, 10000), 2);
  assert.equal(trackDropIndex(sizes, 1, -10000), 0);
});
test("A no-op track move keeps merged text and formatting intact", () => {
  const [grid] = fixture();
  grid.grid.cells[0][0] = { text: "One", color: "#abcdef" };
  grid.grid.cells[0][1] = { text: "Two" };
  mergeGrid(grid.grid, [
    [0, 0],
    [0, 1],
  ]);
  const before = structuredClone(grid);
  moveGridTrack(grid, "columns", 0, 0);
  assert.deepEqual(grid, before);
});
