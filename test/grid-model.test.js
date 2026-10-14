import test from "node:test";
import assert from "node:assert/strict";
import {
  newGrid,
  validGrid,
  syncGrid,
  editGrid,
  gridTracks,
  resizeGrid,
  parseGridPaste,
  pasteGrid,
  gridCSV,
} from "../public/grid-model.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
const node = () => ({
  id: "grid",
  type: "grid",
  x: 0,
  y: 0,
  w: 540,
  h: 312,
  grid: newGrid(),
});
test("Grid row and column edits preserve content, style and dimensions", () => {
  const n = node();
  n.grid.cells[1][1] = { text: "Hello", color: "#123456", align: "right" };
  editGrid(n, "rows", "add", 0);
  assert.equal(n.grid.cells[2][1].text, "Hello");
  assert.equal(n.h, 408);
  editGrid(n, "columns", "previous", 1);
  assert.equal(n.grid.cells[2][0].color, "#123456");
  editGrid(n, "rows", "remove", 0);
  assert.equal(n.h, 312);
  assert.equal(n.grid.cells[1][0].align, "right");
  assert.equal(validGrid(n.grid), true);
  assert.deepEqual(gridTracks(n).rows, [96, 96, 96]);
});
test("Grid spreadsheet paste handles quoting, grows and rejects overflow atomically", () => {
  assert.deepEqual(parseGridPaste('"a\tb"\tc\r\n"multi\nline"\t"a""b"\r\n'), [
    ["a\tb", "c"],
    ["multi\nline", 'a"b'],
  ]);
  const n = node();
  pasteGrid(n, "a\tb\nc\td", 2, 2);
  assert.equal(n.grid.cells[3][3].text, "d");
  assert.equal(n.grid.columns.length, 4);
  const before = structuredClone(n);
  assert.throws(() => pasteGrid(n, "a\tb", 0, 29));
  assert.deepEqual(n, before);
  assert.ok(gridCSV(n.grid).includes('"c","d"'));
});
test("Grid Canvas round trip and Markdown fallback respect external edits", () => {
  const n = node();
  n.grid.cells[0][0].text = "**Plan**";
  n.grid.cells[1][0].text = "a | b\nc";
  syncGrid(n);
  const board = { project: "p-test", nodes: [n], edges: [] },
    encoded = encodeCanvas(board);
  assert.equal(encoded.nodes[0].type, "text");
  assert.match(encoded.nodes[0].text, /\\\|/);
  assert.deepEqual(decodeCanvas(encoded).nodes[0].grid, n.grid);
  encoded.nodes[0].text = "Changed in Obsidian";
  const external = decodeCanvas(encoded).nodes[0];
  assert.equal(external.type, "text");
  assert.equal(external.text, "Changed in Obsidian");
});
test("Grid validation rejects malformed and oversized metadata", () => {
  const g = newGrid();
  assert.ok(validGrid(g));
  g.cells[0][0].text = "a".repeat(6001);
  assert.equal(validGrid(g), false);
  assert.equal(validGrid({ ...newGrid(), rows: [Infinity] }), false);
  assert.equal(validGrid({ ...newGrid(), cells: [] }), false);
});

test("Grid dividers resize one track without squeezing its neighbours, including the last track", () => {
  for (const axis of ["rows", "columns"])
    for (const at of [0, 2]) {
      const original = node(),
        n = structuredClone(original),
        prior = gridTracks(original);
      resizeGrid(n, original, axis, at, 40);
      assert.equal(n.grid[axis][at], prior[axis][at] + 40);
      assert.equal(
        n[axis === "columns" ? "w" : "h"],
        original[axis === "columns" ? "w" : "h"] + 40,
      );
      for (let i = 0; i < 3; i++)
        if (i !== at) assert.equal(n.grid[axis][i], prior[axis][i]);
      resizeGrid(n, original, axis, at, 10); // original-based, no accumulated drift
      assert.equal(n.grid[axis][at], prior[axis][at] + 10);
      resizeGrid(n, original, axis, at, -10000);
      assert.equal(n.grid[axis][at], axis === "columns" ? 80 : 48);
    }
});
test("Grid outer edges scale tracks proportionally and keep the opposite edge fixed", () => {
  for (const edge of ["left", "right", "top", "bottom"]) {
    const axis = ["left", "right"].includes(edge) ? "columns" : "rows",
      original = node(),
      n = structuredClone(original),
      reverse = ["left", "top"].includes(edge);
    original.grid[axis] = [1, 2, 3];
    resizeGrid(n, original, axis, NaN, reverse ? -60 : 60, edge);
    assert.equal(n.grid[axis][1], n.grid[axis][0] * 2);
    assert.equal(n.grid[axis][2], n.grid[axis][0] * 3);
    assert.equal(
      n.x + (edge === "left" ? n.w : 0),
      original.x + (edge === "left" ? original.w : 0),
    );
    assert.equal(
      n.y + (edge === "top" ? n.h : 0),
      original.y + (edge === "top" ? original.h : 0),
    );
    assert.ok(validGrid(n.grid));
  }
});
test("Grid resize protects contained object sizes and clamps extreme drags", () => {
  const original = node(),
    n = structuredClone(original),
    children = [
      { frame: n.id, gridCell: { row: 1, column: 1 }, w: 140, h: 60 },
    ];
  resizeGrid(n, original, "columns", 1, -10000, undefined, children);
  assert.equal(n.grid.columns[1], 172);
  resizeGrid(n, original, "rows", 1, -10000, undefined, children);
  assert.equal(n.grid.rows[1], 92);
  resizeGrid(n, original, "columns", 0, -10000, "right", children);
  assert.ok(n.grid.columns[1] >= 172);
  resizeGrid(n, original, "rows", 2, 10000000);
  assert.equal(n.h, 100000);
  assert.ok(validGrid(n.grid));
});

test("Grid titles survive Canvas round trips and appear as literal Markdown headings", () => {
  const n = node();
  n.grid.title = "Planning [draft] <team> **Q4**";
  n.grid.cells[0][0].text = "Deliver";
  syncGrid(n);
  assert.ok(validGrid(n.grid));
  assert.ok(n.text.startsWith("## Planning "));
  const encoded = encodeCanvas({ project: "p-test", nodes: [n], edges: [] });
  assert.deepEqual(decodeCanvas(encoded).nodes[0].grid, n.grid);
  assert.ok(encoded.nodes[0].text.includes(String.raw`\[draft\]`));
  assert.ok(encoded.nodes[0].text.includes(String.raw`\<team\>`));
  const cells = structuredClone(n.grid.cells);
  n.grid.title = "";
  syncGrid(n);
  assert.ok(n.text.startsWith("| "));
  assert.deepEqual(n.grid.cells, cells);
  assert.equal(validGrid({ ...n.grid, title: "x".repeat(301) }), false);
  assert.equal(validGrid({ ...n.grid, title: "two\nlines" }), false);
  assert.equal(validGrid({ ...n.grid, title: 12 }), false);
});
